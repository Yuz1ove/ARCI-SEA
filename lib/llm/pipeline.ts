import { evaluateScenario, stableHash, taiwanMarket, type CommerceEvent, type DecisionEngineStage, type ScenarioDefinition } from '@/domain/decision-engine';
import { deterministicExplanation, DeterministicFallbackProvider } from './fallback';
import { assertExplanationGrounded, buildGroundingContext } from './grounding';
import { EXPLANATION_SYSTEM_PROMPT, INTENT_SYSTEM_PROMPT } from './prompts';
import { arciCommandJsonSchema, explanationJsonSchema, parseGroundedExplanation, parseStructuredArciCommand } from './schemas';
import { SchoolLlmError, schoolLlmFromEnvironment, SCHOOL_LLM_REQUESTED_MODEL } from './schoolLlmClient';
import type { ArciIntent, IntelligenceDecisionResponse, IntelligenceExplanationUpdate, IntelligencePipelineStage, IntelligenceRequest, IntelligenceResponse, LlmInteractionRecord, LlmProvider, ParsedIntelligenceEvent, PipelineStageRecord, ProviderFailureCode, StructuredArciCommand } from './types';

const regionNodes:Record<'NORTH'|'CENTRAL'|'SOUTH'|'OFFSHORE'|'ALL',string[]>={
  NORTH:['warehouse-a','matsu'],CENTRAL:['warehouse-b'],SOUTH:['warehouse-c','green-island'],OFFSHORE:['penghu','kinmen','matsu','green-island'],ALL:taiwanMarket.nodes.map(node=>node.id),
};
const regionRoadEdges:Record<'NORTH'|'CENTRAL'|'SOUTH'|'OFFSHORE'|'ALL',string[]>={
  NORTH:['north-central','north-south'],CENTRAL:['north-central','central-south'],SOUTH:['central-south','north-south'],OFFSHORE:[],ALL:taiwanMarket.edges.filter(edge=>edge.mode==='road').map(edge=>edge.id),
};
const severityRatio={LIGHT:.25,MODERATE:.5,HEAVY:.78,EXTREME:.96} as const;

const eventId=(event:ParsedIntelligenceEvent,index:number,question:string)=>`llm-${index}-${stableHash(`${question}:${JSON.stringify(event)}`)}`;

export function normalizeCommandEvents(command:StructuredArciCommand,baseScenario:ScenarioDefinition):CommerceEvent[]{
  const atMinute=Math.max(1,...baseScenario.events.map(event=>event.atMinute))+5;
  return command.events.flatMap((event,index):CommerceEvent[]=>{
    const id=eventId(event,index,command.question);
    if(event.type==='NO_INTERVENTION') return [];
    if(event.type==='WEATHER') return [{id,atMinute,type:'WEATHER_DISRUPTION',severity:severityRatio[event.severity],affectedNodeIds:regionNodes[event.region]}];
    if(event.type==='NODE_FAILURE') return [{id,atMinute,type:'NODE_FAILURE',nodeId:event.nodeId,remainingCapacityRatio:0}];
    if(event.type==='NODE_CAPACITY_CHANGE') return [{id,atMinute,type:'NODE_FAILURE',nodeId:event.nodeId,remainingCapacityRatio:Math.max(0,Math.min(1,1+event.changeRatio))}];
    if(event.type==='DEMAND_CHANGE') return [{id,atMinute,type:'DEMAND_SURGE',multiplier:Math.max(.1,1+event.changeRatio)}];
    if(event.type==='CARRIER_CAPACITY_CHANGE') return [{id,atMinute,type:'CARRIER_CAPACITY',mode:event.mode,availabilityRatio:Math.max(0,Math.min(1,1+event.changeRatio)),affectedNodeIds:regionNodes[event.region]}];
    return [];
  }).concat(command.events.flatMap((event,index):CommerceEvent[]=>event.type==='WEATHER'&&['NORTH','CENTRAL','SOUTH','ALL'].includes(event.region)?[{id:`${eventId(event,index,command.question)}-road`,atMinute,type:'TRAFFIC_DISRUPTION',severity:severityRatio[event.severity]*.45,affectedEdgeIds:regionRoadEdges[event.region]}]:[]));
}

function scenarioWithEvents(base:ScenarioDefinition,command:StructuredArciCommand,events:CommerceEvent[]):ScenarioDefinition{
  if(command.intent!=='WHAT_IF_SIMULATION'||events.length===0) return base;
  const suffix=stableHash(`${base.id}:${JSON.stringify(events)}`);
  return {...base,id:`${base.id}-what-if-${suffix}`,label:`${base.label} · what-if`,seed:`${base.seed}-what-if-${suffix}`,durationMinutes:Math.max(base.durationMinutes,...events.map(event=>event.atMinute+20)),events:[...base.events,...events]};
}

function failureAudit(question:string,intent:ArciIntent,decisionId:string|null,stateId:string|null,code:ProviderFailureCode,latencyMs:number):LlmInteractionRecord{
  return {interactionId:`LLM-${stableHash(`${question}:${code}:${Date.now()}`).toUpperCase()}`,timestamp:new Date().toISOString(),decisionId,stateId,intent,modelRequested:SCHOOL_LLM_REQUESTED_MODEL,modelEffective:null,inputHash:stableHash(question),structuredParseStatus:code==='PROVIDER_SCHEMA'?'FAILED':'NOT_APPLICABLE',schemaValidationStatus:code==='PROVIDER_SCHEMA'?'FAILED':'NOT_APPLICABLE',latencyMs,providerStatus:'ERROR',failureCode:code};
}

async function withFallback<T>(primary:LlmProvider|null,fallback:()=>Promise<{value:T;audit:LlmInteractionRecord}>,run:(provider:LlmProvider)=>Promise<{value:T;audit:LlmInteractionRecord}>,meta:{question:string;intent:ArciIntent;decisionId:string|null;stateId:string|null}){
  if(!primary) return {result:await fallback(),failedAudit:null};
  const started=Date.now();
  try{return {result:await run(primary),failedAudit:null}}catch(error){
    const code=error instanceof SchoolLlmError?error.code:'UNKNOWN_PROVIDER_FAILURE';
    return {result:await fallback(),failedAudit:failureAudit(meta.question,meta.intent,meta.decisionId,meta.stateId,code,Date.now()-started)};
  }
}

export async function runDecisionPipeline(request:IntelligenceRequest,provider:LlmProvider|null=schoolLlmFromEnvironment()):Promise<IntelligenceDecisionResponse>{
  const totalStarted=Date.now();
  const fallbackProvider=new DeterministicFallbackProvider();
  const interactions:LlmInteractionRecord[]=[];
  const pipeline:PipelineStageRecord[]=[];
  const stage=(name:IntelligencePipelineStage,started:number,degraded=false)=>pipeline.push({stage:name,status:degraded?'DEGRADED':'COMPLETED',durationMs:Math.max(0,Date.now()-started)});

  const baseline=evaluateScenario(request.scenario,taiwanMarket);
  const interpretStarted=Date.now();
  const interpreted=await withFallback(provider,
    ()=>fallbackProvider.generateStructured({schema:arciCommandJsonSchema,instructions:INTENT_SYSTEM_PROMPT,input:JSON.stringify({question:request.question}),validate:parseStructuredArciCommand,metadata:{decisionId:baseline.decisionRecord.decisionId,stateId:baseline.stateSnapshotId,intent:'UNKNOWN'}}),
    active=>active.generateStructured({schema:arciCommandJsonSchema,instructions:INTENT_SYSTEM_PROMPT,input:JSON.stringify({question:request.question}),validate:parseStructuredArciCommand,metadata:{decisionId:baseline.decisionRecord.decisionId,stateId:baseline.stateSnapshotId,intent:'UNKNOWN'}}),
    {question:request.question,intent:'UNKNOWN',decisionId:baseline.decisionRecord.decisionId,stateId:baseline.stateSnapshotId});
  interactions.push(...(interpreted.failedAudit?[interpreted.failedAudit]:[]),interpreted.result.audit);
  const command=interpreted.result.value;
  stage('UNDERSTANDING_REQUEST',interpretStarted,Boolean(interpreted.failedAudit));

  const normalizeStarted=Date.now();
  const normalizedEvents=normalizeCommandEvents(command,request.scenario);
  const scenario=scenarioWithEvents(request.scenario,command,normalizedEvents);
  stage('NORMALIZING_EVENT',normalizeStarted);

  const engineStages=new Map<DecisionEngineStage,number>();
  let activeEngineStage:DecisionEngineStage|null=null;
  let activeEngineStarted=Date.now();
  const evaluation=evaluateScenario(scenario,taiwanMarket,{
    previousDecision:normalizedEvents.some(event=>event.type==='NODE_FAILURE')?baseline:undefined,
    onStage:next=>{
      if(activeEngineStage) engineStages.set(activeEngineStage,Date.now()-activeEngineStarted);
      activeEngineStage=next;activeEngineStarted=Date.now();
    },
  });
  if(activeEngineStage) engineStages.set(activeEngineStage,Date.now()-activeEngineStarted);
  for(const name of ['UPDATING_DIGITAL_TWIN','GENERATING_CANDIDATES','CHECKING_CONSTRAINTS','RUNNING_UNCERTAINTY','SELECTING_POLICY','VERIFYING_GOVERNANCE'] as DecisionEngineStage[]) pipeline.push({stage:name,status:'COMPLETED',durationMs:engineStages.get(name)??0});

  const grounding=buildGroundingContext(evaluation,command.intent);
  const interpretationFailed=Boolean(interpreted.failedAudit);
  return {
    phase:'DECISION_READY',requestId:`INT-${stableHash(`${request.question}:${evaluation.decisionRecord.decisionId}`).toUpperCase()}`,command,normalizedEvents,evaluation,grounding,interactions,pipeline,
    engineLatencyMs:evaluation.calculationLatencyMs,interpretationLatencyMs:interactions.reduce((total,item)=>total+item.latencyMs,0),totalLatencyMs:Date.now()-totalStarted,
    providerStatus:interpretationFailed?'ERROR':provider?.status??'DISABLED',interpretationSource:provider&&!interpretationFailed?'SCHOOL_LLM':'DETERMINISTIC_FALLBACK',engineStatus:'ONLINE',
  };
}

export async function runExplanationPipeline(request:IntelligenceRequest,decision:IntelligenceDecisionResponse,provider:LlmProvider|null=schoolLlmFromEnvironment(),totalStarted=Date.now()):Promise<IntelligenceExplanationUpdate>{
  const fallbackProvider=new DeterministicFallbackProvider();
  const interactions:LlmInteractionRecord[]=[];
  const {command,evaluation,grounding}=decision;
  const explainStarted=Date.now();
  const explained=await withFallback(provider,
    ()=>fallbackProvider.generateExplanation({schema:explanationJsonSchema,instructions:EXPLANATION_SYSTEM_PROMPT,input:JSON.stringify({context:grounding,question:request.question}),validate:value=>assertExplanationGrounded(parseGroundedExplanation(value),grounding),metadata:{decisionId:evaluation.decisionRecord.decisionId,stateId:evaluation.stateSnapshotId,intent:command.intent}}),
    active=>active.generateExplanation({schema:explanationJsonSchema,instructions:EXPLANATION_SYSTEM_PROMPT,input:JSON.stringify({context:grounding,question:request.question}),validate:value=>assertExplanationGrounded(parseGroundedExplanation(value),grounding),metadata:{decisionId:evaluation.decisionRecord.decisionId,stateId:evaluation.stateSnapshotId,intent:command.intent}}),
    {question:request.question,intent:command.intent,decisionId:evaluation.decisionRecord.decisionId,stateId:evaluation.stateSnapshotId});
  interactions.push(...(explained.failedAudit?[explained.failedAudit]:[]),explained.result.audit);
  const providerFailed=Boolean(explained.failedAudit);
  const pipelineStage:PipelineStageRecord={stage:'GENERATING_EXPLANATION',status:providerFailed?'DEGRADED':'COMPLETED',durationMs:Math.max(0,Date.now()-explainStarted)};
  const providerLatencyMs=interactions.reduce((total,item)=>total+item.latencyMs,0);
  return {
    phase:'EXPLANATION_READY',requestId:decision.requestId,decisionId:evaluation.decisionRecord.decisionId,stateId:evaluation.stateSnapshotId,explanation:explained.result.value,interactions,pipelineStage,
    providerLatencyMs,totalLatencyMs:Date.now()-totalStarted,providerStatus:providerFailed?'ERROR':provider?.status??'DISABLED',explanationSource:provider&&!providerFailed?'SCHOOL_LLM':'DETERMINISTIC_FALLBACK',engineStatus:'ONLINE',
  };
}

export async function runIntelligencePipeline(request:IntelligenceRequest,provider:LlmProvider|null=schoolLlmFromEnvironment()):Promise<IntelligenceResponse>{
  const totalStarted=Date.now();
  const decision=await runDecisionPipeline(request,provider);
  const explanation=await runExplanationPipeline(request,decision,provider,totalStarted);
  const providerFailed=decision.providerStatus==='ERROR'||explanation.providerStatus==='ERROR';
  return {
    requestId:decision.requestId,command:decision.command,normalizedEvents:decision.normalizedEvents,evaluation:decision.evaluation,explanation:explanation.explanation,grounding:decision.grounding,
    interactions:[...decision.interactions,...explanation.interactions],pipeline:[...decision.pipeline,explanation.pipelineStage],engineLatencyMs:decision.engineLatencyMs,
    providerLatencyMs:decision.interpretationLatencyMs+explanation.providerLatencyMs,totalLatencyMs:Date.now()-totalStarted,providerStatus:providerFailed?'ERROR':provider?.status??'DISABLED',
    explanationSource:provider&&!providerFailed?'SCHOOL_LLM':'DETERMINISTIC_FALLBACK',engineStatus:'ONLINE',
  };
}

export const deterministicFallbackExplanation=deterministicExplanation;
