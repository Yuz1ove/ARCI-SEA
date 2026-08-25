import { round } from './math';
import type { CandidateEvaluation, CommerceNetworkState, CounterfactualResult, ImprovementMetric, SimulationMetrics } from './types';

const metricKeys=['slaBreaches','averageDelayHours','p90DelayHours','recoveryTimeMinutes','operationalCost','capacityOverloadMinutes','serviceLevel','unfulfilledOrders'] as const;

const improvement=(baseline:number,arci:number,higherIsBetter=false):ImprovementMetric=>{
  const delta=higherIsBetter?arci-baseline:baseline-arci;
  return {baseline,arci,delta:round(delta),percentageImprovement:baseline===0?null:round(delta/Math.abs(baseline))};
};

const fixedRulePolicyId=(state:CommerceNetworkState)=>{
  if(Object.values(state.nodes).some(node=>node.failed)) return 'south-north-direct';
  if(state.weatherSeverity>.7) return 'regional-split';
  if(state.trafficSeverity>.5) return 'north-priority';
  if(state.demandMultiplier>1.1) return 'regional-split';
  return 'keep-current';
};

export function buildCounterfactual(stateSnapshotId:string,seed:string,evaluations:CandidateEvaluation[],selected:CandidateEvaluation,state:CommerceNetworkState):CounterfactualResult{
  const feasible=evaluations.filter(item=>item.constraints.feasible);
  const baselineEvaluation=evaluations.find(item=>item.candidate.id==='keep-current')??evaluations[0];
  const rulePreferred=evaluations.find(item=>item.candidate.id===fixedRulePolicyId(state));
  const fallbackOrder=['keep-current','regional-split','north-priority','south-north-direct','inventory-rebalance','island-air-priority','hold-low-priority'];
  const ruleBasedEvaluation=(rulePreferred?.constraints.feasible?rulePreferred:fallbackOrder.map(id=>feasible.find(item=>item.candidate.id===id)).find(Boolean))??rulePreferred??baselineEvaluation;
  const baseline=baselineEvaluation.metrics,ruleBased=ruleBasedEvaluation.metrics,arci=selected.metrics;
  return {sameStartingStateId:stateSnapshotId,seed,baselinePolicyId:baselineEvaluation.candidate.id,ruleBasedPolicyId:ruleBasedEvaluation.candidate.id,arciPolicyId:selected.candidate.id,baseline,ruleBased,arci,improvement:Object.fromEntries(metricKeys.map(key=>[key,improvement(baseline[key],arci[key],key==='serviceLevel')])) as Record<keyof SimulationMetrics,ImprovementMetric>};
}
