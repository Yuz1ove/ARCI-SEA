import { getDemoDecisionEvaluation } from '../domain/decision-engine';
import { aggregateNetworkNodes } from './network';
import type { CommerceSnapshot, DecisionCandidate, NetworkNodeState, NetworkRisk, RouteId, SimulationPhase } from './types';
import type { CandidateEvaluation, ScenarioEvaluation, SimulationMetrics } from '../domain/decision-engine';
import { DECISION_ENGINE_PARAMETERS } from '../domain/decision-engine';

export type PolicyDemoScenarioId='normal-operations'|'traffic-disruption'|'warehouse-overload';
export const decisionScenarioForPhase=(phase:SimulationPhase):PolicyDemoScenarioId=>{
  if(phase==='NORMAL'||phase==='SURGE') return 'normal-operations';
  if(['SECOND_FAILURE','REPLANNING','UPDATED_EXECUTION','RECOVERED'].includes(phase)) return 'warehouse-overload';
  return 'traffic-disruption';
};

export const engineEvaluationForPhase=(phase:SimulationPhase)=>{
  if(phase==='NORMAL') return getDemoDecisionEvaluation('normal-operations');
  if(phase==='SURGE') return getDemoDecisionEvaluation('demand-surge');
  if(phase==='WAREHOUSE_OVERLOAD') return getDemoDecisionEvaluation('traffic-only');
  return getDemoDecisionEvaluation(decisionScenarioForPhase(phase));
};

const riskLabel=(value:number):NetworkRisk=>value>.66?'高':value>.36?'中':'低';
const routeId=(evaluation:CandidateEvaluation):RouteId=>evaluation.candidate.routeId??'route-a';
const percent=(value:number)=>Number((value*100).toFixed(1));

export function decisionCandidatesFromEvaluation(result:ScenarioEvaluation):DecisionCandidate[]{
  return result.evaluations.filter(item=>item.candidate.routeId).map(item=>{
    const service=percent(item.metrics.serviceLevel),costIndex=item.metrics.operationalCost;
    const selected=item.candidate.id===result.selectedPolicy.candidate.id;
    return {
      id:routeId(item),planLabel:item.candidate.label,serviceName:'ARCI Prototype',serviceMode:item.candidate.actions.map(action=>action.type.replaceAll('_',' ')).slice(0,2).join(' + '),route:item.candidate.description,
      reliability:Math.round((1-item.uncertainty.probabilityOfSlaBreach)*100),delay:item.metrics.averageDelayHours,cost:Number(costIndex.toFixed(1)),affectedOrders:item.metrics.slaBreaches,recoveryMinutes:item.metrics.recoveryTimeMinutes,slaRate:service,
      risk:riskLabel(item.objective.risk),feasibility:item.constraints.feasible?Math.round((.5+item.constraints.capacityMargin*.5)*100):0,executionDifficulty:item.candidate.switchingMagnitude>.2?'高':item.candidate.switchingMagnitude>.1?'中':'低',
      offshoreImpact:{slaDelta:Number((service-95).toFixed(1)),delayDelta:Number((item.metrics.averageDelayHours-result.counterfactual.baseline.averageDelayHours).toFixed(1)),capacityBuffer:Math.round(item.constraints.capacityMargin*100),risk:riskLabel(item.objective.risk),summary:item.constraints.violations.find(violation=>violation.code==='ISLAND_CONNECTIVITY_RISK')?.message??'四組離島由同一 Digital Twin、edge 與 hard constraint 評估。'},
      actions:item.candidate.actions.map(action=>action.type.replaceAll('_',' ')),tags:selected?['ARCI Recommended',...(item.metrics.recoveryTimeMinutes<=result.counterfactual.ruleBased.recoveryTimeMinutes?['Fastest Recovery' as const]:[])]:item.constraints.feasible?['Fallback']:['Low Cost'],
      evidence:['SIMULATION ASSUMPTION','ARCI DERIVED','SEE DECISION AUDIT'],reason:selected?result.decisionRecord.reasonCodes.join(' · '):item.constraints.violations.map(violation=>violation.code).join(' · ')||`Risk-adjusted objective ${item.riskAdjustedScore.toFixed(3)}`,recommended:selected,provenance:{sourceType:'inferred',sourceLabel:'ARCI Enterprise Decision Engine V2',sourceDetail:'Digital Twin + constraints + seeded Monte Carlo · 非即時營運資料',isLive:false},
    };
  });
}

const blendedMetrics=(from:SimulationMetrics,to:SimulationMetrics,progress:number):SimulationMetrics=>Object.fromEntries(Object.keys(from).map(key=>{
  const metric=key as keyof SimulationMetrics;
  return [metric,from[metric]+(to[metric]-from[metric])*progress];
})) as unknown as SimulationMetrics;

export function projectEngineSnapshot(snapshot:CommerceSnapshot,result:ScenarioEvaluation,phase:SimulationPhase,progress:number):CommerceSnapshot{
  const before=result.counterfactual.baseline,after=result.counterfactual.arci;
  const executing=phase==='REROUTING'||phase==='UPDATED_EXECUTION';
  const recovered=phase==='RECOVERING'||phase==='RECOVERED';
  const metrics=recovered?after:executing?blendedMetrics(before,after,progress):before;
  const engineNodes=result.state.nodes;
  const networkNodes=snapshot.networkNodes.map((node):NetworkNodeState=>{
    const engine=engineNodes[node.id];
    if(!engine) return node;
    const load=Math.min(100,Math.round((engine.inboundRate*result.state.demandMultiplier+engine.backlog/DECISION_ENGINE_PARAMETERS.state.backlogDrainHours)/(engine.processingCapacityPerHour*engine.availableCapacityRatio)*100));
    const risk=Math.max(engine.currentWeatherRisk,engine.currentTrafficRisk,result.state.slaPressure*.7);
    const health:NetworkNodeState['health']=engine.failed?'unavailable':load>=95?'critical':load>=82?'strained':'healthy';
    return {...node,orderRate:Math.round(engine.inboundRate*result.state.demandMultiplier),capacity:Math.round(engine.processingCapacityPerHour*engine.availableCapacityRatio),load,slaRate:percent(engine.serviceLevel),predictedDelay:Number((metrics.averageDelayHours*(.72+risk*.55)).toFixed(1)),transportAvailability:Math.round(Math.max(engine.carrierAvailability.road,engine.carrierAvailability.air,engine.carrierAvailability.sea)*100),weatherDisruption:Math.round(engine.currentWeatherRisk*100),trafficDisruption:Math.round(engine.currentTrafficRisk*100),riskScore:Math.round(risk*100),risk:riskLabel(risk),constraint:engine.failed?'NODE CAPACITY BLOCKED':load>=95?'CAPACITY CONSTRAINT':engine.scope==='offshore'?'AIR / SEA CONNECTIVITY':'CAPACITY SAFE',health};
  });
  const warehouses=snapshot.warehouses.map(warehouse=>{
    const node=networkNodes.find(item=>item.id===warehouse.id)!;
    return {...warehouse,load:node.load,capacity:node.capacity,queue:Math.round(engineNodes[warehouse.id].backlog),predictedDelay:node.predictedDelay,health:node.health};
  });
  const selectedRoute=result.selectedPolicy.candidate.routeId??snapshot.activeRoute;
  const orderRate=networkNodes.reduce((total,node)=>total+node.orderRate,0);
  const baseCost=DECISION_ENGINE_PARAMETERS.simulation.baseOperationalCost;
  const costIncrease=Math.max(0,(metrics.operationalCost-baseCost)/baseCost*100);
  const ordersAtRisk=Math.round(metrics.slaBreaches);
  const onTimeRate=percent(metrics.serviceLevel),averageDelayHours=Number(metrics.averageDelayHours.toFixed(1));
  const eventResult=snapshot.events.map((event,index)=>index||!event.operationalImpact?event:{...event,operationalImpact:{...event.operationalImpact,capacityDropPercent:Math.round((1-result.state.edges['north-central'].currentCapacityRatio)*100),estimatedDelayMinutes:Math.round(metrics.p90DelayHours*60),affectedOrders:ordersAtRisk,confidence:result.confidence.value}});
  const summary=(phase==='DEGRADED'||phase==='DECIDING')?`Constraint engine 預估 ${ordersAtRisk} 筆訂單可能超過 SLA；P90 延遲 ${metrics.p90DelayHours.toFixed(1)} 小時。`:snapshot.summary;
  const headline=phase==='DECIDING'?`ARCI 正在比較 ${result.candidates.length} 個候選策略`:phase==='REPLANNING'?`ARCI 依新限制重算 ${result.candidates.length} 個候選策略`:snapshot.headline;
  return {...snapshot,orderRate,ordersAtRisk,onTimeRate,averageDelayHours,extraCostPercent:Number(costIncrease.toFixed(1)),recoveryScore:Math.round(onTimeRate),activeRoute:selectedRoute,headline,summary,warehouses,networkNodes,networkKpis:aggregateNetworkNodes(networkNodes,snapshot.networkKpis.provenance),events:eventResult,metrics:{...snapshot.metrics,orderRate:{...snapshot.metrics.orderRate,value:orderRate},ordersAtRisk:{...snapshot.metrics.ordersAtRisk,value:ordersAtRisk},onTimeRate:{...snapshot.metrics.onTimeRate,value:onTimeRate},averageDelayHours:{...snapshot.metrics.averageDelayHours,value:averageDelayHours},extraCostPercent:{...snapshot.metrics.extraCostPercent,value:Number(costIncrease.toFixed(1))},recoveryScore:{...snapshot.metrics.recoveryScore,value:Math.round(onTimeRate)}},trace:{...snapshot.trace,observed:[`State ${result.stateSnapshotId}`,`P50 ${result.selectedPolicy.uncertainty.p50.toFixed(3)} · P90 ${result.selectedPolicy.uncertainty.p90.toFixed(3)}`],objective:'Minimize normalized SLA, cost, risk, recovery, capacity stress and instability losses.',constraints:result.selectedPolicy.constraints.violations.map(item=>item.code),reason:result.topDecisionFactors.join(' · ')}};
}
