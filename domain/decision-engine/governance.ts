import { DECISION_ENGINE_PARAMETERS } from './config';
import { safeDivide } from './math';
import type { CandidateEvaluation, CommerceNetworkState, GovernanceDecision, ReasonCode, ScenarioEvaluation } from './types';

export function deriveReasonCodes(state:CommerceNetworkState,selected:CandidateEvaluation):ReasonCode[]{
  const codes:ReasonCode[]=[];
  if(selected.candidate.id==='keep-current') codes.push('KEEP_CURRENT_POLICY');
  if(state.slaPressure>.28) codes.push('SLA_RISK_HIGH');
  if(state.weatherSeverity>.3) codes.push('WEATHER_DISRUPTION');
  if(state.trafficSeverity>.3) codes.push('TRAFFIC_DISRUPTION');
  if(selected.constraints.violations.some(item=>item.code==='ISLAND_CONNECTIVITY_RISK')) codes.push('ISLAND_CONNECTIVITY_RISK');
  if(selected.metrics.recoveryTimeMinutes<75) codes.push('RECOVERY_TIME_IMPROVEMENT');
  if(selected.metrics.operationalCost<18) codes.push('COST_INCREASE_ACCEPTABLE');
  return [...new Set(codes)];
}

export function deriveTopDecisionFactors(state:CommerceNetworkState,selected:CandidateEvaluation):string[]{
  const stressed=Object.values(state.nodes).map(node=>({
    node,
    load:safeDivide(node.inboundRate*state.demandMultiplier+node.backlog/DECISION_ENGINE_PARAMETERS.state.backlogDrainHours,node.processingCapacityPerHour*node.availableCapacityRatio,2),
  })).sort((a,b)=>b.load-a.load||a.node.id.localeCompare(b.node.id))[0];
  const disruption=state.weatherSeverity>=state.trafficSeverity
    ? `Weather severity ${(state.weatherSeverity*100).toFixed(0)}%`
    : `Traffic severity ${(state.trafficSeverity*100).toFixed(0)}%`;
  return [
    `${stressed.node.id} physical load ${(stressed.load*100).toFixed(0)}%`,
    disruption,
    `Selected tail SLA-breach probability ${(selected.uncertainty.probabilityOfSlaBreach*100).toFixed(0)}%`,
  ];
}

export function evaluateGovernance(selected:CandidateEvaluation,state:CommerceNetworkState,reasonCodes:ReasonCode[],previous?:ScenarioEvaluation):GovernanceDecision{
  if(!selected.constraints.feasible) return {mode:'BLOCKED',reasonCodes:[...reasonCodes,'CAPACITY_CONSTRAINT'],approvalReasons:['Selected policy violates a hard constraint.'],rollback:{eligible:Boolean(previous),triggered:false,reason:null}};
  const approvalReasons:string[]=[];
  const baseCost=DECISION_ENGINE_PARAMETERS.simulation.baseOperationalCost;
  const costIncrease=safeDivide(selected.metrics.operationalCost-baseCost,baseCost);
  if(costIncrease>DECISION_ENGINE_PARAMETERS.governance.approvalCostIncreaseRatio) approvalReasons.push(`Prototype cost increase ${Math.round(costIncrease*100)}% exceeds configured approval threshold.`);
  if(selected.candidate.switchingMagnitude>DECISION_ENGINE_PARAMETERS.governance.approvalReallocationRatio) approvalReasons.push(`Reallocation ${Math.round(selected.candidate.switchingMagnitude*100)}% exceeds configured approval threshold.`);
  let rollbackTriggered=false,rollbackReason:string|null=null;
  if(previous){
    const prior=previous.selectedPolicy;
    if(selected.metrics.serviceLevel<prior.metrics.serviceLevel-DECISION_ENGINE_PARAMETERS.rollback.serviceLevelDrop){rollbackTriggered=true;rollbackReason='Service level deteriorated beyond rollback threshold.';}
    else if(selected.metrics.capacityOverloadMinutes>prior.metrics.capacityOverloadMinutes*(1+DECISION_ENGINE_PARAMETERS.rollback.capacityStressIncrease)){rollbackTriggered=true;rollbackReason='Capacity stress exceeded the previous policy by the configured threshold.';}
    else if(selected.objective.risk>prior.objective.risk+DECISION_ENGINE_PARAMETERS.rollback.riskIncrease){rollbackTriggered=true;rollbackReason='Normalized risk exceeded the previous policy by the configured threshold.';}
  }
  return {mode:approvalReasons.length?'APPROVAL_REQUIRED':'AUTONOMOUS',reasonCodes,approvalReasons,rollback:{eligible:Boolean(previous),triggered:rollbackTriggered,reason:rollbackReason}};
}
