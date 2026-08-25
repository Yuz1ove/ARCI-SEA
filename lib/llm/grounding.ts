import type { ScenarioEvaluation } from '@/domain/decision-engine';
import type { ArciIntent, GroundedExplanationPlan, GroundingContext } from './types';

const fixed=(value:number,digits=3)=>Number(value.toFixed(digits));

export function buildGroundingContext(evaluation:ScenarioEvaluation,intent:ArciIntent):GroundingContext{
  const selected=evaluation.selectedPolicy;
  const candidates=evaluation.evaluations.map(item=>({
    id:item.candidate.id,label:item.candidate.label,feasible:item.constraints.feasible,
    reasonCodes:item.constraints.violations.map(violation=>violation.code),score:fixed(item.riskAdjustedScore),p50:fixed(item.uncertainty.p50),p90:fixed(item.uncertainty.p90),slaBreachProbability:fixed(item.uncertainty.probabilityOfSlaBreach),
  }));
  const evidence:Record<string,string>={
    'state.summary':`State ${evaluation.stateSnapshotId} contains ${Object.keys(evaluation.state.nodes).length} operational nodes, demand multiplier ${evaluation.state.demandMultiplier.toFixed(2)}, weather severity ${evaluation.state.weatherSeverity.toFixed(2)}, traffic severity ${evaluation.state.trafficSeverity.toFixed(2)} and SLA pressure ${evaluation.state.slaPressure.toFixed(3)}.`,
    'decision.selected':`ARCI engine selected ${selected.candidate.label} (${selected.candidate.id}) with risk-adjusted score ${selected.riskAdjustedScore.toFixed(3)}.`,
    'risk.summary':`The selected policy has objective P50 ${selected.uncertainty.p50.toFixed(3)}, P90 ${selected.uncertainty.p90.toFixed(3)}, P90 delay ${selected.metrics.p90DelayHours.toFixed(2)} hours and SLA breach probability ${(selected.uncertainty.probabilityOfSlaBreach*100).toFixed(1)}%.`,
    'counterfactual.summary':`On the same state and seed, static baseline records ${evaluation.counterfactual.baseline.slaBreaches} SLA breaches, rule-based baseline ${evaluation.counterfactual.ruleBased.slaBreaches}, and ARCI ${evaluation.counterfactual.arci.slaBreaches}.`,
    'governance.summary':`Governance is ${evaluation.governance.mode}; approval reasons: ${evaluation.governance.approvalReasons.join(' | ')||'none'}; rollback triggered: ${evaluation.governance.rollback.triggered?'yes':'no'}.`,
  };
  evaluation.topDecisionFactors.forEach((factor,index)=>{evidence[`factor.${index+1}`]=factor});
  evaluation.evaluations.forEach(item=>{
    evidence[`candidate.${item.candidate.id}`]=`${item.candidate.label} is ${item.constraints.feasible?'feasible':'rejected'}; reason codes: ${item.constraints.violations.map(violation=>violation.code).join(' | ')||'all hard constraints passed'}; risk-adjusted score ${item.riskAdjustedScore.toFixed(3)}.`;
  });
  return {
    decisionId:evaluation.decisionRecord.decisionId,stateId:evaluation.stateSnapshotId,intent,
    selectedPolicy:{id:selected.candidate.id,label:selected.candidate.label,actions:selected.candidate.actions.map(action=>action.type),score:fixed(selected.riskAdjustedScore),feasible:selected.constraints.feasible},
    candidates,adaptiveWeights:{...evaluation.adaptiveWeights},topDecisionFactors:[...evaluation.topDecisionFactors],
    risk:{p50:fixed(selected.uncertainty.p50),p90:fixed(selected.uncertainty.p90),p90DelayHours:fixed(selected.metrics.p90DelayHours,2),slaBreachProbability:fixed(selected.uncertainty.probabilityOfSlaBreach)},
    counterfactual:evaluation.counterfactual,governance:evaluation.governance,evidence,
    provenance:{engine:'ARCI_ENGINE',interpretation:'LLM_INTERPRETATION',assumptions:'SIMULATION_ASSUMPTION'},
  };
}

export function assertExplanationGrounded(plan:GroundedExplanationPlan,context:GroundingContext){
  const evidenceIds=new Set(Object.keys(context.evidence));
  const candidateIds=new Set(context.candidates.map(candidate=>candidate.id));
  if(plan.factorRefs.some(ref=>!evidenceIds.has(ref))) throw new Error('GROUNDING_VALIDATION: unknown factor evidence reference');
  if(plan.rejectedPolicyIds.some(id=>!candidateIds.has(id))) throw new Error('GROUNDING_VALIDATION: unknown candidate reference');
  for(const section of plan.sections){
    if(section.sourceRefs.length===0||section.sourceRefs.some(ref=>!evidenceIds.has(ref))) throw new Error('GROUNDING_VALIDATION: every section requires valid evidence references');
  }
  return plan;
}
