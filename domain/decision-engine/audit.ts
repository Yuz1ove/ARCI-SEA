import type { CandidateEvaluation, CommerceNetworkState, DecisionAuditEntry, ReasonCode } from './types';

export function buildAudit(state:CommerceNetworkState,evaluations:CandidateEvaluation[],selected:CandidateEvaluation,reasonCodes:ReasonCode[],replan:boolean):DecisionAuditEntry[]{
  const rejected=evaluations.filter(item=>!item.constraints.feasible).length;
  const base:DecisionAuditEntry[]=[
    {stage:'OBSERVE',atMinute:state.timeMinutes,message:`Observed ${Object.keys(state.nodes).length} node states and ${Object.keys(state.edges).length} edge states.`,reasonCodes:[]},
    {stage:'DETECT',atMinute:state.timeMinutes,message:`Demand ${state.demandMultiplier.toFixed(2)}x · weather ${state.weatherSeverity.toFixed(2)} · traffic ${state.trafficSeverity.toFixed(2)}.`,reasonCodes},
    {stage:'EVALUATE',atMinute:state.timeMinutes,message:`Generated ${evaluations.length} policies; rejected ${rejected} by hard constraints.`,reasonCodes:rejected?['CAPACITY_CONSTRAINT']:[]},
    {stage:'DECIDE',atMinute:state.timeMinutes,message:`Selected ${selected.candidate.id} at risk-adjusted score ${selected.riskAdjustedScore.toFixed(3)}.`,reasonCodes},
    {stage:'ACT',atMinute:state.timeMinutes,message:`Simulation applied ${selected.candidate.actions.length} typed commerce actions.`,reasonCodes},
    {stage:'VERIFY',atMinute:state.timeMinutes,message:`Expected service ${(selected.metrics.serviceLevel*100).toFixed(1)}%; P90 delay ${selected.metrics.p90DelayHours.toFixed(2)}h.`,reasonCodes},
    {stage:'COUNTERFACTUAL',atMinute:state.timeMinutes,message:'Compared static, rule-based and ARCI policies on the same state and seeded disturbances.',reasonCodes},
  ];
  if(replan) base.splice(2,0,{stage:'REPLAN',atMinute:state.timeMinutes,message:'Second event changed state; candidates, constraints, uncertainty and objective were recomputed.',reasonCodes});
  return base;
}
