import { buildAudit } from './audit';
import { generateCandidatePolicies } from './candidates';
import { DECISION_ENGINE_PARAMETERS } from './config';
import { evaluateConstraints } from './constraints';
import { buildCounterfactual } from './counterfactual';
import { deriveReasonCodes, deriveTopDecisionFactors, evaluateGovernance } from './governance';
import { finiteRecord, stableHash } from './math';
import { decisionConfidence, evaluateCandidate, markParetoOptimal } from './monteCarlo';
import { deriveAdaptiveWeights } from './objective';
import { generateDisturbances } from './random';
import { createCommerceDigitalTwin } from './state';
import type { DecisionEngineStage, MarketConfig, ScenarioDefinition, ScenarioEvaluation } from './types';

export interface EvaluateScenarioOptions { samples?:number; previousDecision?:ScenarioEvaluation; onStage?:(stage:DecisionEngineStage)=>void }

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
  const selectedPolicy=evaluations.find(item=>item.constraints.feasible)??evaluations[0];
  const confidence=decisionConfidence(evaluations,selectedPolicy,adaptiveWeights,market);
  const counterfactual=buildCounterfactual(stateSnapshotId,scenario.seed,evaluations,selectedPolicy,state);
  const reasonCodes=deriveReasonCodes(state,selectedPolicy);
  const topDecisionFactors=deriveTopDecisionFactors(state,selectedPolicy);
  options.onStage?.('VERIFYING_GOVERNANCE');
  const governance=evaluateGovernance(selectedPolicy,state,reasonCodes,options.previousDecision);
  const isReplan=Boolean(options.previousDecision)&&scenario.events.some(event=>event.type==='NODE_FAILURE');
  const audit=buildAudit(state,evaluations,selectedPolicy,reasonCodes,isReplan);
  const decisionId=`DEC-${stableHash(JSON.stringify({scenario:scenario.id,state:stateSnapshotId,selected:selectedPolicy.candidate.id,seed:scenario.seed})).toUpperCase()}`;
  const decisionRecord={decisionId,timestamp:`T+${state.timeMinutes}m`,scenarioId:scenario.id,stateSnapshotId,candidatePolicies:candidates.map(item=>item.id),rejectedPolicies:evaluations.filter(item=>!item.constraints.feasible).map(item=>({candidateId:item.candidate.id,violations:item.constraints.violations.map(violation=>violation.code)})),adaptiveWeights:{...adaptiveWeights},selectedPolicy:selectedPolicy.candidate.id,objectiveBreakdown:{...selectedPolicy.objective},uncertaintySummary:{...selectedPolicy.uncertainty},reasonCodes,topDecisionFactors,previousPolicy:options.previousDecision?.selectedPolicy.candidate.id??null,trigger:isReplan?'SECOND_EVENT_REPLAN' as const:'INITIAL_EVALUATION' as const};
  const result:ScenarioEvaluation={scenario,digitalTwin,initialState,state,stateSnapshotId,candidates,evaluations,selectedPolicy,adaptiveWeights,confidence,topDecisionFactors,counterfactual,governance,audit,decisionRecord,calculationLatencyMs:Math.max(0,Date.now()-started),provenance:{operationalParameters:'SIMULATION_ASSUMPTION',computedResults:'ARCI_DERIVED',publicFacts:'PUBLIC_FACT'}};
  if(!finiteRecord(result)) throw new Error('Decision engine produced NaN or Infinity.');
  return result;
}
