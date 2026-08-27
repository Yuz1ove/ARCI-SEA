import {
  PolicyRegistry,
  attributeOutcome,
  completeDecisionAuditV3,
  decisionScenarios,
  evaluateScenario,
  proposePolicyUpdate,
  replayDecisionV3,
  taiwanMarket,
  validateOutcome,
  type DecisionAuditV3,
  type SimulationMetrics,
} from '@/domain/decision-engine';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

const jsonHeaders={'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'};
const registry=new PolicyRegistry();
const auditStore=new Map<string,DecisionAuditV3>();
const scenarioKeys=Object.keys(decisionScenarios) as Array<keyof typeof decisionScenarios>;
const operations={
  decision:['world-state','digital-twin','forecast','candidates','simulate','counterfactual','decision','governance','confidence'],
  policies:['policies','policies-shadow'],
  audit:['audit'],
  replay:['replay'],
  validation:['validation','causal-attribution','policy-update-proposal'],
} as const;

const isRecord=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const numberField=(value:unknown,name:string)=>{
  if(typeof value!=='number'||!Number.isFinite(value)) throw new Error(`SCHEMA_VALIDATION: ${name} must be finite.`);
  return value;
};
const parseMetrics=(value:unknown):SimulationMetrics=>{
  if(!isRecord(value)) throw new Error('SCHEMA_VALIDATION: observed metrics are required.');
  return {
    slaBreaches:numberField(value.slaBreaches,'slaBreaches'),
    averageDelayHours:numberField(value.averageDelayHours,'averageDelayHours'),
    p90DelayHours:numberField(value.p90DelayHours,'p90DelayHours'),
    recoveryTimeMinutes:numberField(value.recoveryTimeMinutes,'recoveryTimeMinutes'),
    operationalCost:numberField(value.operationalCost,'operationalCost'),
    capacityOverloadMinutes:numberField(value.capacityOverloadMinutes,'capacityOverloadMinutes'),
    serviceLevel:numberField(value.serviceLevel,'serviceLevel'),
    unfulfilledOrders:numberField(value.unfulfilledOrders,'unfulfilledOrders'),
  };
};

export async function GET(request:Request){
  const url=new URL(request.url);
  const resource=url.searchParams.get('resource');
  if(resource==='policies') return Response.json({active:registry.active(),shadow:registry.shadows(),registryAudit:registry.audit(),persistence:'PROCESS_MEMORY_EPHEMERAL'},{headers:jsonHeaders});
  if(resource==='audit'){
    const decisionId=url.searchParams.get('decisionId');
    const audit=decisionId?auditStore.get(decisionId):null;
    if(!audit) return Response.json({error:'AUDIT_NOT_FOUND'},{status:404,headers:jsonHeaders});
    return Response.json(audit,{headers:jsonHeaders});
  }
  return Response.json({version:'ARCI_CORE_V3',engineStatus:'ONLINE',operations,defaultTrajectoryCount:500,policyVersion:registry.active().version,persistence:'PROCESS_MEMORY_EPHEMERAL',authoritativeBoundary:'LLM explanations are excluded from decisions, governance and replay.'},{headers:jsonHeaders});
}

export async function POST(request:Request){
  try{
    const contentLength=Number(request.headers.get('content-length')??0);
    if(contentLength>250_000) return Response.json({error:'REQUEST_TOO_LARGE'},{status:413,headers:jsonHeaders});
    const body=await request.json() as unknown;
    if(!isRecord(body)||typeof body.operation!=='string') throw new Error('SCHEMA_VALIDATION: operation is required.');
    if(body.operation==='decision'){
      const scenarioId=String(body.scenarioId??'compound') as keyof typeof decisionScenarios;
      if(!scenarioKeys.includes(scenarioId)) throw new Error('SCHEMA_VALIDATION: unknown scenarioId.');
      const trajectoryCount=body.trajectoryCount===undefined?500:Math.floor(numberField(body.trajectoryCount,'trajectoryCount'));
      if(trajectoryCount<10||trajectoryCount>1_000) throw new Error('SCHEMA_VALIDATION: trajectoryCount must be between 10 and 1000.');
      const evaluation=evaluateScenario(decisionScenarios[scenarioId],taiwanMarket,{v3:{trajectoryCount,policy:registry.productionPolicy()}});
      auditStore.set(evaluation.v3.audit.decisionId,evaluation.v3.audit);
      return Response.json({operation:'decision',evaluation},{headers:jsonHeaders});
    }
    if(body.operation==='replay'){
      const decisionId=String(body.decisionId??'');
      const audit=auditStore.get(decisionId);
      if(!audit) return Response.json({error:'AUDIT_NOT_FOUND'},{status:404,headers:jsonHeaders});
      return Response.json({operation:'replay',decisionId,result:replayDecisionV3(audit,taiwanMarket)},{headers:jsonHeaders});
    }
    if(body.operation==='validation'){
      const decisionId=String(body.decisionId??'');
      const audit=auditStore.get(decisionId);
      if(!audit) return Response.json({error:'AUDIT_NOT_FOUND'},{status:404,headers:jsonHeaders});
      const observed=parseMetrics(body.observed);
      const selectedRisk=audit.riskMetrics.find(item=>item.candidateId===audit.selectedCandidate)!;
      const validation=validateOutcome(audit.counterfactuals.selected.finalOutcome,observed,{predictedFailureProbability:selectedRisk.failureProbability,observedReason:'Observed metrics submitted to the ARCI Core V3 validation boundary.'});
      const attribution=attributeOutcome(validation,{externalEventObserved:body.externalEventObserved===true,evidenceConflict:body.evidenceConflict===true,executionCompleted:body.executionCompleted!==false,policyWithinBounds:true,calibrationStatus:'UNCALIBRATED',evidence:[decisionId]});
      const proposal=proposePolicyUpdate(validation,attribution,audit.policy,`${audit.policy.version}-proposal-${validation.validationId.slice(-4).toLowerCase()}`);
      const complete=completeDecisionAuditV3(audit,observed,validation,attribution,proposal);
      auditStore.set(decisionId,complete);
      return Response.json({operation:'validation',decisionId,validation,attribution,policyUpdateProposal:proposal,activePolicyUnchanged:registry.active().version},{headers:jsonHeaders});
    }
    if(body.operation==='policies') return Response.json({operation:'policies',active:registry.active(),shadow:registry.shadows(),registryAudit:registry.audit()},{headers:jsonHeaders});
    throw new Error('SCHEMA_VALIDATION: unsupported operation.');
  }catch(error){
    const detail=error instanceof Error?error.message:'Unknown ARCI Core V3 request failure.';
    const status=detail.startsWith('SCHEMA_VALIDATION')?422:400;
    return Response.json({error:status===422?'INVALID_STRUCTURED_INPUT':'ARCI_CORE_REQUEST_FAILED',detail,engineStatus:'ONLINE'},{status,headers:jsonHeaders});
  }
}
