import { buildAudit } from './audit';
import { generateCandidatePolicies } from './candidates';
import { DECISION_ENGINE_PARAMETERS } from './config';
import { evaluateConstraints } from './constraints';
import { buildCounterfactual } from './counterfactual';
import { deriveReasonCodes, deriveTopDecisionFactors, evaluateGovernance } from './governance';
import { finiteRecord } from './math';
import { decisionConfidence, evaluateCandidate, markParetoOptimal } from './monteCarlo';
import { deriveAdaptiveWeights } from './objective';
import { generateDisturbances } from './random';
import { createCommerceDigitalTwin } from './state';
import type { DecisionEngineStage, MarketConfig, ScenarioDefinition, ScenarioEvaluation } from './types';
import { buildArciCoreV3 } from './v3/engine';
import type { DecisionAuditV3, ReplayResult, V3EvaluationOptions } from './v3/types';
import { canonicalHash, replayOutputView } from './v3/audit';

export interface EvaluateScenarioOptions { samples?:number; previousDecision?:ScenarioEvaluation; onStage?:(stage:DecisionEngineStage)=>void; v3?:V3EvaluationOptions }

export function evaluateScenario(scenario:ScenarioDefinition,market:MarketConfig,options:EvaluateScenarioOptions={}):ScenarioEvaluation{
  const started=Date.now();
  if(scenario.marketId!==market.marketId) throw new Error(`Scenario market ${scenario.marketId} does not match ${market.marketId}.`);
  options.onStage?.('UPDATING_DIGITAL_TWIN');
  const digitalTwin=createCommerceDigitalTwin(market,scenario.events,scenario.seed);
  const {initialState,currentState:state,stateSnapshotId}=digitalTwin;
  options.onStage?.('GENERATING_CANDIDATES');
  const candidates=generateCandidatePolicies(state,market);
  if(candidates.length<5||candidates.length>20) throw new Error(`Candidate generator returned ${candidates.length}; expected 5-20.`);
  const adaptiveWeights=deriveAdaptiveWeights(state,market);
  const disturbances=generateDisturbances(scenario.seed,options.samples??DECISION_ENGINE_PARAMETERS.monteCarloSamples);
  options.onStage?.('CHECKING_CONSTRAINTS');
  const constrained=candidates.map(candidate=>({candidate,constraints:evaluateConstraints(candidate,state,market)}));
  options.onStage?.('RUNNING_UNCERTAINTY');
  const evaluations=markParetoOptimal(constrained.map(({candidate,constraints})=>evaluateCandidate(candidate,constraints,state,market,adaptiveWeights,disturbances)));
  options.onStage?.('SELECTING_POLICY');
  const preliminarySelected=evaluations.find(item=>item.constraints.feasible)??evaluations[0];
  const v3=buildArciCoreV3({scenario,market,state:state as typeof initialState,stateSnapshotId,stateHistory:digitalTwin.stateHistory as typeof digitalTwin.stateHistory,candidates,evaluations,objectiveWeights:adaptiveWeights,options:options.v3??{trajectoryCount:options.samples?Math.min(64,Math.max(16,options.samples)):undefined}});
  const selectedPolicy=evaluations.find(item=>item.candidate.id===v3.counterfactual.selectedCandidateId)??preliminarySelected;
  const legacyConfidence=decisionConfidence(evaluations,selectedPolicy,adaptiveWeights,market);
  const confidence={...legacyConfidence,value:v3.confidence.value,selectionConsistency:v3.confidence.simulationAgreement,scoreGap:v3.confidence.decisionMargin,constraintStability:1-(v3.risks.find(item=>item.candidateId===selectedPolicy.candidate.id)?.constraintViolationProbability??1)};
  const counterfactual=buildCounterfactual(stateSnapshotId,scenario.seed,evaluations,selectedPolicy,state);
  const reasonCodes=deriveReasonCodes(state,selectedPolicy);
  const topDecisionFactors=deriveTopDecisionFactors(state,selectedPolicy);
  options.onStage?.('VERIFYING_GOVERNANCE');
  const baseGovernance=evaluateGovernance(selectedPolicy,state as typeof initialState,reasonCodes,options.previousDecision);
  const governance={...baseGovernance,mode:v3.governance.autonomyLevel==='ABSTAIN'?'BLOCKED' as const:v3.governance.autonomyLevel==='HUMAN_REVIEW_REQUIRED'||v3.governance.autonomyLevel==='AUTONOMOUS_WITH_WARNING'?'APPROVAL_REQUIRED' as const:'AUTONOMOUS' as const,approvalReasons:v3.governance.autonomyLevel==='AUTONOMOUS_DECISION'?baseGovernance.approvalReasons:[...baseGovernance.approvalReasons,...v3.governance.reasonCodes]};
  const isReplan=Boolean(options.previousDecision)&&scenario.events.some(event=>event.type==='NODE_FAILURE');
  const audit=buildAudit(state,evaluations,selectedPolicy,reasonCodes,isReplan);
  const decisionId=v3.audit.decisionId;
  const decisionRecord={decisionId,timestamp:`T+${state.timeMinutes}m`,scenarioId:scenario.id,stateSnapshotId,candidatePolicies:candidates.map(item=>item.id),rejectedPolicies:evaluations.filter(item=>!item.constraints.feasible).map(item=>({candidateId:item.candidate.id,violations:item.constraints.violations.map(violation=>violation.code)})),adaptiveWeights:{...adaptiveWeights},selectedPolicy:selectedPolicy.candidate.id,objectiveBreakdown:{...selectedPolicy.objective},uncertaintySummary:{...selectedPolicy.uncertainty},reasonCodes,topDecisionFactors,previousPolicy:options.previousDecision?.selectedPolicy.candidate.id??null,trigger:isReplan?'SECOND_EVENT_REPLAN' as const:'INITIAL_EVALUATION' as const};
  const result:ScenarioEvaluation={scenario,digitalTwin,initialState:initialState as typeof state,state:state as typeof initialState,stateSnapshotId,candidates,evaluations,selectedPolicy,adaptiveWeights,confidence,topDecisionFactors,counterfactual,governance,audit,decisionRecord,v3,calculationLatencyMs:Math.max(0,Date.now()-started),provenance:{operationalParameters:'SIMULATION_ASSUMPTION',computedResults:'ARCI_DERIVED',publicFacts:'PUBLIC_FACT'}};
  if(!finiteRecord(result)) throw new Error('Decision engine produced NaN or Infinity.');
  return result;
}

export function replayDecisionV3(audit:DecisionAuditV3,market:MarketConfig):ReplayResult{
  const replay=evaluateScenario(audit.scenario,market,{samples:audit.simulationConfig.baseMonteCarloSamples,v3:{evidence:audit.evidence,evidenceMode:'REPLACE',trajectoryCount:audit.simulationConfig.trajectoryCount,policy:audit.policy}});
  const actualHash=canonicalHash(replayOutputView(replay.v3));
  const expectedRanking=audit.riskMetrics.map(item=>item.candidateId);
  const actualRanking=replay.v3.risks.map(item=>item.candidateId);
  const expectedCandidates=audit.candidateSet.map(item=>item.id);
  const actualCandidates=replay.v3.audit.candidateSet.map(item=>item.id);
  const sameCandidates=JSON.stringify(expectedCandidates)===JSON.stringify(actualCandidates);
  const sameSimulation=JSON.stringify(audit.trajectorySummary)===JSON.stringify(replay.v3.audit.trajectorySummary);
  const sameRanking=JSON.stringify(expectedRanking)===JSON.stringify(actualRanking);
  const sameGovernance=JSON.stringify(audit.governanceResult)===JSON.stringify(replay.v3.governance);
  const sameDecision=audit.selectedCandidate===replay.selectedPolicy.candidate.id;
  const sameConfidence=JSON.stringify(audit.decisionConfidence)===JSON.stringify(replay.v3.confidence);
  const mismatches=[['CANDIDATES',sameCandidates],['SIMULATION',sameSimulation],['RANKING',sameRanking],['GOVERNANCE',sameGovernance],['DECISION',sameDecision],['CONFIDENCE',sameConfidence],['OUTPUT_HASH',audit.authoritativeOutputHash===actualHash]].filter(([,matched])=>!matched).map(([name])=>String(name));
  return {matched:mismatches.length===0,expectedOutputHash:audit.authoritativeOutputHash,actualOutputHash:actualHash,sameCandidates,sameSimulation,sameRanking,sameGovernance,sameDecision,sameConfidence,mismatches};
}
