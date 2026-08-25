import { DECISION_ENGINE_PARAMETERS } from './config';
import { clamp, mean, quantile, round } from './math';
import { objectiveBreakdown, objectiveScore } from './objective';
import type { SimulationDisturbance } from './random';
import { simulatePolicy } from './simulation';
import type { CandidateEvaluation, CandidatePolicy, CommerceNetworkState, ConstraintResult, MarketConfig, ObjectiveWeights, SimulationMetrics } from './types';

const aggregateMetrics=(samples:SimulationMetrics[]):SimulationMetrics=>({
  slaBreaches:Math.round(mean(samples.map(item=>item.slaBreaches))),averageDelayHours:round(mean(samples.map(item=>item.averageDelayHours)),2),p90DelayHours:round(quantile(samples.map(item=>item.averageDelayHours),.9),2),recoveryTimeMinutes:Math.round(mean(samples.map(item=>item.recoveryTimeMinutes))),operationalCost:round(mean(samples.map(item=>item.operationalCost)),2),capacityOverloadMinutes:Math.round(mean(samples.map(item=>item.capacityOverloadMinutes))),serviceLevel:round(mean(samples.map(item=>item.serviceLevel)),4),unfulfilledOrders:Math.round(mean(samples.map(item=>item.unfulfilledOrders))),
});

export function evaluateCandidate(candidate:CandidatePolicy,constraints:ConstraintResult,state:CommerceNetworkState,market:MarketConfig,weights:ObjectiveWeights,disturbances:SimulationDisturbance[]):CandidateEvaluation{
  const sampleMetrics=disturbances.map(disturbance=>simulatePolicy(state,market,candidate,disturbance));
  const sampleScores=sampleMetrics.map(metrics=>objectiveScore(objectiveBreakdown(metrics,candidate.switchingMagnitude,market),weights));
  const metrics=aggregateMetrics(sampleMetrics);
  const expectedScore=mean(sampleScores),p90Score=quantile(sampleScores,.9);
  const serviceViolation=metrics.serviceLevel<market.slaPolicies.minimumServiceLevel?{
    code:'MINIMUM_SERVICE_REQUIREMENT' as const,subjectId:candidate.id,actual:metrics.serviceLevel,limit:market.slaPolicies.minimumServiceLevel,message:'Expected service level is below the configured market minimum.',
  }:null;
  const evaluatedConstraints=serviceViolation?{...constraints,feasible:false,violations:[...constraints.violations,serviceViolation]}:constraints;
  return {
    candidate,constraints:evaluatedConstraints,objective:objectiveBreakdown(metrics,candidate.switchingMagnitude,market),expectedScore:round(expectedScore),p90Score:round(p90Score),riskAdjustedScore:round(expectedScore+DECISION_ENGINE_PARAMETERS.riskTailLambda*p90Score),
    uncertainty:{mean:round(expectedScore),p50:quantile(sampleScores,.5),p90:round(p90Score),worstCase:round(Math.max(...sampleScores)),bestCase:round(Math.min(...sampleScores)),probabilityOfSlaBreach:round(sampleMetrics.filter(item=>item.serviceLevel<market.slaPolicies.minimumServiceLevel).length/Math.max(1,sampleMetrics.length))},
    metrics,sampleMetrics,paretoOptimal:false,
  };
}

export function markParetoOptimal(evaluations:CandidateEvaluation[]){
  for(const current of evaluations){
    current.paretoOptimal=current.constraints.feasible&&!evaluations.some(other=>other!==current&&other.constraints.feasible&&other.metrics.operationalCost<=current.metrics.operationalCost&&other.metrics.slaBreaches<=current.metrics.slaBreaches&&other.uncertainty.p90<=current.uncertainty.p90&&(other.metrics.operationalCost<current.metrics.operationalCost||other.metrics.slaBreaches<current.metrics.slaBreaches||other.uncertainty.p90<current.uncertainty.p90));
  }
  return evaluations.sort((a,b)=>Number(b.constraints.feasible)-Number(a.constraints.feasible)||a.riskAdjustedScore-b.riskAdjustedScore||a.candidate.id.localeCompare(b.candidate.id));
}

export function decisionConfidence(evaluations:CandidateEvaluation[],selected:CandidateEvaluation,weights:ObjectiveWeights,market:MarketConfig){
  const parameters=DECISION_ENGINE_PARAMETERS.confidence;
  const feasible=evaluations.filter(item=>item.constraints.feasible);
  const second=feasible.find(item=>item!==selected)??selected;
  const scoreGap=clamp((second.riskAdjustedScore-selected.riskAdjustedScore)/parameters.scoreGapRange);
  const sampleCount=selected.sampleMetrics.length;
  let same=0;
  for(let index=0;index<sampleCount;index++){
    const best=feasible.map(item=>({item,score:objectiveScore(objectiveBreakdown(item.sampleMetrics[index],item.candidate.switchingMagnitude,market),weights)})).sort((a,b)=>a.score-b.score||a.item.candidate.id.localeCompare(b.item.candidate.id))[0]?.item;
    if(best?.candidate.id===selected.candidate.id) same++;
  }
  const selectionConsistency=clamp(same/Math.max(1,sampleCount));
  const constraintStability=clamp(.5+selected.constraints.capacityMargin*.5);
  return {value:round(selectionConsistency*parameters.selectionWeight+scoreGap*parameters.scoreGapWeight+constraintStability*parameters.constraintWeight),selectionConsistency:round(selectionConsistency),scoreGap:round(scoreGap),constraintStability:round(constraintStability)};
}
