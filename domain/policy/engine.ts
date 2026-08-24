import { baseWeights,bounds,confidenceThreshold,cooldownCycles,criteria,persistenceThreshold,reasonChains,reasons,switchThreshold } from './config';
import { evaluateGuardrails,projectToBounds } from './guardrails';
import { scoreCandidates } from './scoring';
import type { ContextClassification, ContextSensitivity, DecisionCriterion, DecisionSignal, DecisionWeights, HardConstraintState, PolicyScenario, PolicySnapshot, ReplanTriggerState, WeightDelta } from './types';

const round=(value:number,digits=2)=>Number(value.toFixed(digits));
const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,value));

export function classifyContext(scenario:PolicyScenario):ContextClassification{
  if(scenario.context.nodeLoad>=.9) return 'WAREHOUSE_OVERLOAD';
  if(scenario.context.corridorCapacityDrop>=.25||scenario.context.estimatedDelayMinutes>=45) return 'TRAFFIC_DISRUPTION';
  return 'NORMAL_OPERATIONS';
}

export function normalizeSignal(input:PolicyScenario['signals'][number]):DecisionSignal{
  const range=Math.max(.0001,input.max-input.min);
  const direct=clamp((input.current-input.min)/range);
  return {...input,normalized:round(input.lowerIsBetter?1-direct:direct,2)};
}

export function deriveSensitivities(classification:ContextClassification,context:PolicyScenario['context']):ContextSensitivity{
  if(classification==='NORMAL_OPERATIONS') return {slaProtection:0,routeFeasibility:0,capacityBalance:0,costEfficiency:0,disruptionRisk:0,recoverySpeed:0};
  if(classification==='TRAFFIC_DISRUPTION') return {
    slaProtection:round(context.slaRisk*.39,2),routeFeasibility:round(context.corridorCapacityDrop,2),capacityBalance:round(Math.max(0,context.nodeLoad-.78),2),
    costEfficiency:round(-Math.min(.18,context.estimatedDelayMinutes/850),2),disruptionRisk:round((context.offshoreRisk+context.greenIslandRisk+context.weatherRisk)/6.2,2),recoverySpeed:round(context.eventPersistence*.165,2),
  };
  return {
    slaProtection:round(context.slaRisk*.46,2),routeFeasibility:round(context.corridorCapacityDrop,2),capacityBalance:round(Math.max(0,context.nodeLoad-.5),2),
    costEfficiency:round(-context.inventoryRisk*.19,2),disruptionRisk:round((context.weatherRisk+context.greenIslandRisk)*.07,2),recoverySpeed:round(context.eventPersistence*.17,2),
  };
}

export function adaptWeights(sensitivities:ContextSensitivity,beta:number):DecisionWeights{
  const raw=Object.fromEntries(criteria.map(criterion=>[criterion,baseWeights[criterion]*Math.exp(beta*sensitivities[criterion])])) as DecisionWeights;
  const denominator=criteria.reduce((sum,criterion)=>sum+raw[criterion],0);
  const normalized=Object.fromEntries(criteria.map(criterion=>[criterion,raw[criterion]/denominator*100])) as DecisionWeights;
  return projectToBounds(normalized);
}

const sameWeights=(a:DecisionWeights,b:DecisionWeights)=>criteria.every(criterion=>a[criterion]===b[criterion]);
const stableHash=(value:string)=>{let hash=2166136261;for(let index=0;index<value.length;index++){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0');};

function buildDeltas(classification:ContextClassification,weights:DecisionWeights,sensitivities:ContextSensitivity):WeightDelta[]{
  return criteria.map(criterion=>{
    const delta=round(weights[criterion]-baseWeights[criterion],1);
    const reason=reasons[classification][criterion];
    return {criterion,before:baseWeights[criterion],after:weights[criterion],delta,sensitivity:sensitivities[criterion],reason:reason?.reason??'目前訊號未要求改變此目標。',sourceSignal:(reason?.signal??'eventConfidence') as keyof PolicyScenario['context'],boundActive:weights[criterion]===bounds[criterion][0]||weights[criterion]===bounds[criterion][1]};
  });
}

function buildHardConstraints(scenario:PolicyScenario):HardConstraintState[]{
  const rejected=(id:string)=>scenario.candidates.filter(candidate=>candidate.hardConstraintViolations.includes(id)).map(candidate=>candidate.candidateId);
  return [
    {id:'WAREHOUSE_CAPACITY',label:'Warehouse Capacity',expression:'load ≤ maxCapacity',active:true,rejectedCandidateIds:rejected('WAREHOUSE_CAPACITY')},
    {id:'ROUTE_UNAVAILABLE',label:'Route Availability',expression:'routeAvailable = true',active:true,rejectedCandidateIds:rejected('ROUTE_UNAVAILABLE')},
    {id:'MINIMUM_SLA',label:'Minimum SLA',expression:'SLA ≥ 95%',active:true,rejectedCandidateIds:rejected('MINIMUM_SLA')},
    {id:'MINIMUM_OFFSHORE_SERVICE',label:'Offshore Service',expression:'serviceOffshore ≥ 90%',active:true,rejectedCandidateIds:rejected('MINIMUM_OFFSHORE_SERVICE')},
    {id:'OPERATIONAL_NODE_COVERAGE',label:'Operational Node Coverage',expression:'servedNodes ⊇ 7 operational nodes',active:true,rejectedCandidateIds:rejected('OPERATIONAL_NODE_COVERAGE')},
  ];
}

const formatSignal=(value:number,unit:string)=>unit?`${value}${unit.startsWith(' ')?unit:` ${unit}`}`:`${value}`;

function buildTriggers(scenario:PolicyScenario,signals:DecisionSignal[],utilityDelta:number):ReplanTriggerState[]{
  const read=(id:string)=>signals.find(signal=>signal.id===id)!;
  const load=read('node-utilization'),sla=read('sla-compliance'),route=read('route-availability'),greenIsland=read('green-island-service');
  const stateDelta=Math.abs(scenario.context.orderPressure-(scenario.id==='normal-operations'?.39:scenario.id==='traffic-disruption'?.42:.86));
  return [
    {id:'STATE_DELTA',expression:'ΔState > θstate (0.20)',previous:round(scenario.context.orderPressure-stateDelta,2).toString(),current:scenario.context.orderPressure.toString(),triggered:stateDelta>.2,reason:'營運狀態變化越過重新評估門檻'},
    {id:'SLA_MIN',expression:'SLA < 95%',previous:formatSignal(sla.previous,sla.unit),current:formatSignal(sla.current,sla.unit),triggered:sla.current<95,reason:'服務水準低於最低保證'},
    {id:'NODE_LOAD',expression:'NodeLoad > 95%',previous:formatSignal(load.previous,load.unit),current:formatSignal(load.current,load.unit),triggered:load.current>95,reason:'中部節點負載越過容量門檻'},
    {id:'ROUTE_AVAILABLE',expression:'RouteAvailable = false',previous:formatSignal(route.previous,route.unit),current:formatSignal(route.current,route.unit),triggered:route.current<100,reason:'主要物流走廊未完全可用'},
    {id:'GREEN_ISLAND_SERVICE',expression:'GreenIsland SLA < 95%',previous:formatSignal(greenIsland.previous,greenIsland.unit),current:formatSignal(greenIsland.current,greenIsland.unit),triggered:greenIsland.current<95,reason:'綠島海空運服務低於最低保障，要求候選重算'},
    {id:'UTILITY_SWITCH',expression:`U(new) − U(current) > ${switchThreshold}`,previous:'0.000',current:utilityDelta.toFixed(3),triggered:utilityDelta>switchThreshold,reason:'新方案效用形成實質優勢'},
    {id:'CONFIDENCE',expression:`Confidence < ${confidenceThreshold}`,previous:'—',current:scenario.context.eventConfidence.toFixed(2),triggered:scenario.context.eventConfidence<confidenceThreshold,reason:'訊號可信度不足時要求人工檢查'},
  ];
}

function addMs(time:string,offset:number){
  const match=time.match(/^(\d+):(\d+):(\d+)\.(\d+)$/);
  if(!match) return time;
  const total=(((Number(match[1])*60+Number(match[2]))*60+Number(match[3]))*1000+Number(match[4])+offset)%(24*60*60*1000);
  const hours=Math.floor(total/3600000),minutes=Math.floor(total%3600000/60000),seconds=Math.floor(total%60000/1000),ms=total%1000;
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}

export function runPolicyEngine(scenario:PolicyScenario,previous?:PolicySnapshot):PolicySnapshot{
  const classification=classifyContext(scenario);
  const signals=scenario.signals.map(normalizeSignal);
  const sensitivities=deriveSensitivities(classification,scenario.context);
  const confidenceReady=scenario.context.eventConfidence>=confidenceThreshold;
  const persistenceReady=scenario.context.eventPersistence>=persistenceThreshold;
  const cooldownReady=!previous||scenario.context.cycle-previous.context.cycle>=cooldownCycles;
  const adaptationRequested=classification!=='NORMAL_OPERATIONS'&&confidenceReady&&persistenceReady&&cooldownReady;
  const adaptiveWeights=adaptationRequested?adaptWeights(sensitivities,scenario.beta):previous?.adaptiveWeights??baseWeights;
  const changedFromPrevious=!previous||!sameWeights(previous.adaptiveWeights,adaptiveWeights);
  const deltas=changedFromPrevious&&adaptationRequested?buildDeltas(classification,adaptiveWeights,sensitivities):[];
  const before=scoreCandidates(scenario.candidates,baseWeights);
  const after=scoreCandidates(scenario.candidates,adaptiveWeights);
  const eligible=after.filter(candidate=>candidate.eligible);
  const selected=eligible[0]??after[0];
  const second=eligible[1]??selected;
  const current=after.find(candidate=>candidate.candidateId===scenario.currentCandidateId)??selected;
  const candidateMargin=round(selected.totalScore-second.totalScore,1);
  const utilityDelta=round(selected.utility-current.utility,3);
  const signalCompleteness=round(signals.filter(signal=>Number.isFinite(signal.current)).length/signals.length,2);
  const constraintCertainty=round(after.filter(candidate=>candidate.hardConstraintViolations.every(Boolean)).length/after.length,2);
  const separation=clamp(candidateMargin/12);
  const decisionConfidence=round(signalCompleteness*.4+separation*.35+constraintCertainty*.25,2);
  const hardConstraints=buildHardConstraints(scenario);
  const softConstraints=[
    {id:'COST',label:'Cost',expression:'ρcost · max(0, Δcost)²',coefficient:.46},
    {id:'ETA',label:'ETA',expression:'ρeta · max(0, ETA − target)²',coefficient:.38},
    {id:'CARBON',label:'Carbon',expression:'ρcarbon · max(0, CO₂ − budget)²',coefficient:.22},
    {id:'CARRIER',label:'Carrier preference',expression:'ρcarrier · preferenceGap²',coefficient:.18},
  ];
  const replanTriggers=buildTriggers(scenario,signals,utilityDelta);
  const seed=JSON.stringify({version:scenario.version,scenario:scenario.id,context:scenario.context,signals,weights:adaptiveWeights,candidates:scenario.candidates});
  const id=`APS-${stableHash(seed).toUpperCase()}`;
  const guardrails=evaluateGuardrails(adaptiveWeights,baseWeights,scenario.context.eventConfidence,scenario.context.eventPersistence,scenario.candidates,adaptationRequested);
  const rejected=after.length-eligible.length;
  const trace=[
    {time:addMs(scenario.observationTime,0),stage:'OBSERVE',message:`Node load ${Math.round(scenario.context.nodeLoad*100)}% · SLA risk ${Math.round(scenario.context.slaRisk*100)}%`},
    {time:addMs(scenario.observationTime,6),stage:'NORMALIZE',message:`${signals.length} signals transformed to [0,1]`},
    {time:addMs(scenario.observationTime,13),stage:'ADAPT',message:`β ${scenario.beta.toFixed(2)} · ${criteria.filter(item=>adaptiveWeights[item]!==baseWeights[item]).length} weights updated`},
    {time:addMs(scenario.observationTime,18),stage:'GENERATE',message:`${scenario.candidates.length} candidates generated across 7 operational nodes`},
    {time:addMs(scenario.observationTime,25),stage:'FILTER',message:`${rejected} candidates rejected · ${eligible.length} eligible`},
    {time:addMs(scenario.observationTime,30),stage:'EVALUATE',message:`${selected.candidateId} = ${selected.totalScore.toFixed(1)} / 100`},
    {time:addMs(scenario.observationTime,35),stage:'DECIDE',message:`${selected.candidateId} selected · confidence ${Math.round(decisionConfidence*100)}%`},
  ];
  return {
    id,version:scenario.version,scenarioId:scenario.id,contextLabel:scenario.contextLabel,classification,context:{...scenario.context},signals,
    baseWeights:{...baseWeights},sensitivities,adaptiveWeights,beta:scenario.beta,deltas,guardrails,hardConstraints,softConstraints,candidateRankingBefore:before,candidateRankingAfter:after,
    selectedCandidateId:selected.candidateId,currentCandidateId:scenario.currentCandidateId,decisionConfidence,candidateMargin,signalCompleteness,constraintCertainty,replanTriggers,replanTriggered:replanTriggers.some(trigger=>trigger.triggered),
    switchThreshold,utilityDelta,switchAllowed:selected.candidateId!==scenario.currentCandidateId&&utilityDelta>switchThreshold,calculationLatencyMs:14+signals.length+scenario.candidates.length,lastObservation:scenario.observationTime,
    activeConstraintCount:hardConstraints.filter(item=>item.active).length,trace,eventConfidence:scenario.context.eventConfidence,createdAt:scenario.effectiveAt,rollbackEligible:Boolean(previous)||scenario.outcome.status==='rollback-required',
    previousSnapshotId:previous?.id??scenario.priorSnapshotLabel,outcome:{...scenario.outcome},reasonChains:reasonChains[classification],auditRecorded:deltas.some(delta=>delta.delta!==0),
  };
}

export function rollbackPolicy(current:PolicySnapshot,previous:PolicySnapshot):PolicySnapshot{
  if(!current.rollbackEligible||current.outcome.status!=='rollback-required') return current;
  return previous;
}

export const weightTotal=(weights:DecisionWeights)=>round(criteria.reduce((total,criterion)=>total+weights[criterion],0),1);
export const materialDelta=(snapshot:PolicySnapshot,criterion:DecisionCriterion)=>round(snapshot.adaptiveWeights[criterion]-snapshot.baseWeights[criterion],1);
