import { constraintMu,criteria,riskLambda } from './config';
import type { CandidateScore, DecisionWeights, PolicyCandidate } from './types';

const round=(value:number,digits=3)=>Number(value.toFixed(digits));

export function scoreCandidates(candidates:PolicyCandidate[],weights:DecisionWeights):CandidateScore[]{
  return candidates.map(candidate=>{
    const criterionScores=Object.fromEntries(criteria.map(criterion=>[criterion,round(candidate.features[criterion]*(weights[criterion]/100),4)])) as CandidateScore['criterionScores'];
    const weightedUtility=round(criteria.reduce((total,criterion)=>total+criterionScores[criterion],0),4);
    const riskPenalty=round(riskLambda*candidate.riskPenalty,4);
    const constraintPenalty=round(constraintMu*candidate.softConstraintViolation**2,4);
    const eligible=candidate.hardConstraintViolations.length===0;
    const utility=round(weightedUtility-riskPenalty-constraintPenalty,4);
    const totalScore=round(Math.max(0,utility)*100,1);
    const routeFeasibility=round(Math.min(1,candidate.availableCapacity/candidate.requiredCapacity)*candidate.routeAvailable*candidate.routeReliability,3);
    const capacityLoad=round(candidate.nodeDemand/candidate.nodeCapacity,3);
    return {candidateId:candidate.candidateId,routeId:candidate.routeId,totalScore,utility,weightedUtility,riskPenalty,constraintPenalty,eligible,criterionScores,features:{...candidate.features},hardConstraintViolations:[...candidate.hardConstraintViolations],routeFeasibility,capacityLoad};
  }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||(b.totalScore-a.totalScore)||a.candidateId.localeCompare(b.candidateId));
}
