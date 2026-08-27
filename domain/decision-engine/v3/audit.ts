import { stableHash } from '../math';
import type { CandidatePolicy, CommerceNetworkState, ScenarioDefinition, SimulationMetrics } from '../types';
import type {
  ArciCoreV3Evaluation,
  CausalAttribution,
  CounterfactualV3,
  DecisionAuditV3,
  DecisionConfidenceV3,
  EvidenceObservation,
  ForecastHorizon,
  GovernanceV3,
  OutcomeValidationV2,
  PolicyUpdateProposal,
  PolicyVersionRecord,
  RiskMetricsV3,
} from './types';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  return value;
}

export const canonicalHash = (value: unknown) => stableHash(JSON.stringify(canonicalize(value))).toUpperCase();

function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value as Record<string,unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function authoritativeOutputView(input: {
  candidateIds: string[];
  trajectorySummary: DecisionAuditV3['trajectorySummary'];
  riskMetrics: RiskMetricsV3[];
  counterfactuals: CounterfactualV3;
  governance: GovernanceV3;
  confidence: DecisionConfidenceV3;
  selectedCandidate: string;
}) {
  return deepFreeze(structuredClone({
    candidateIds: [...input.candidateIds],
    trajectorySummary: input.trajectorySummary,
    ranking: input.riskMetrics.map((risk) => ({candidateId: risk.candidateId, robustDecisionLoss: risk.robustDecisionLoss})),
    governance: input.governance,
    confidence: input.confidence,
    selectedCandidate: input.selectedCandidate,
    counterfactual: {
      noActionCandidateId: input.counterfactuals.noActionCandidateId,
      runnerUpCandidateId: input.counterfactuals.runnerUpCandidateId,
      decisionMargin: input.counterfactuals.decisionMargin,
      decisionBoundary: input.counterfactuals.decisionBoundary,
    },
  }));
}

export interface BuildAuditInput {
  decisionId: string;
  scenario: ScenarioDefinition;
  state: CommerceNetworkState;
  worldModelSnapshotId: string;
  evidence: EvidenceObservation[];
  policyVersion: string;
  policy: PolicyVersionRecord;
  baseMonteCarloSamples: number;
  trajectoryCount: number;
  horizons: ForecastHorizon[];
  candidates: CandidatePolicy[];
  trajectorySummary: DecisionAuditV3['trajectorySummary'];
  riskMetrics: RiskMetricsV3[];
  counterfactuals: CounterfactualV3;
  governance: GovernanceV3;
  confidence: DecisionConfidenceV3;
  selectedCandidate: string;
}

export function buildDecisionAuditV3(input: BuildAuditInput): DecisionAuditV3 {
  const authoritativeInput = {
    scenario: input.scenario,
    worldStateSnapshot: input.state,
    worldModelSnapshotId: input.worldModelSnapshotId,
    evidence: input.evidence,
    policyVersion: input.policyVersion,
    policy: input.policy,
    simulationConfig: {trajectoryCount: input.trajectoryCount, baseMonteCarloSamples: input.baseMonteCarloSamples, horizons: input.horizons},
    randomSeed: input.scenario.seed,
  };
  const outputView = authoritativeOutputView({
    candidateIds: input.candidates.map((candidate) => candidate.id),
    trajectorySummary: input.trajectorySummary,
    riskMetrics: input.riskMetrics,
    counterfactuals: input.counterfactuals,
    governance: input.governance,
    confidence: input.confidence,
    selectedCandidate: input.selectedCandidate,
  });
  const counterfactualSummary:DecisionAuditV3['counterfactuals']={
    noActionCandidateId:input.counterfactuals.noActionCandidateId,
    noAction:input.counterfactuals.noAction,
    runnerUpCandidateId:input.counterfactuals.runnerUpCandidateId,
    runnerUp:input.counterfactuals.runnerUp,
    selectedCandidateId:input.counterfactuals.selectedCandidateId,
    selected:input.counterfactuals.selected,
    decisionMargin:input.counterfactuals.decisionMargin,
    decisionBoundary:input.counterfactuals.decisionBoundary,
    criticalVariables:input.counterfactuals.criticalVariables,
  };
  return deepFreeze(structuredClone({
    auditVersion: 'ARCI_CORE_V3',
    decisionId: input.decisionId,
    eventId: input.scenario.events.at(-1)?.id ?? input.scenario.id,
    scenario: input.scenario,
    worldStateSnapshot: input.state,
    worldModelSnapshotId: input.worldModelSnapshotId,
    evidence: input.evidence,
    policyVersion: input.policyVersion,
    policy: input.policy,
    simulationConfig: {trajectoryCount: input.trajectoryCount, baseMonteCarloSamples: input.baseMonteCarloSamples, horizons: input.horizons},
    randomSeed: input.scenario.seed,
    candidateSet: input.candidates,
    trajectorySummary: input.trajectorySummary,
    riskMetrics: input.riskMetrics,
    counterfactuals: counterfactualSummary,
    governanceResult: input.governance,
    decisionConfidence: input.confidence,
    selectedCandidate: input.selectedCandidate,
    executionResult: null,
    validation: null,
    attribution: null,
    policyFeedback: null,
    authoritativeInputHash: canonicalHash(authoritativeInput),
    authoritativeOutputHash: canonicalHash(outputView),
  }));
}

export function completeDecisionAuditV3(
  audit: DecisionAuditV3,
  executionResult: SimulationMetrics,
  validation: OutcomeValidationV2,
  attribution: CausalAttribution,
  policyFeedback: PolicyUpdateProposal,
): DecisionAuditV3 {
  return deepFreeze(structuredClone({...audit, executionResult, validation, attribution, policyFeedback}));
}

export function replayOutputView(evaluation: ArciCoreV3Evaluation) {
  return authoritativeOutputView({
    candidateIds: evaluation.audit.candidateSet.map((candidate) => candidate.id),
    trajectorySummary: evaluation.audit.trajectorySummary,
    riskMetrics: evaluation.risks,
    counterfactuals: evaluation.counterfactual,
    governance: evaluation.governance,
    confidence: evaluation.confidence,
    selectedCandidate: evaluation.counterfactual.selectedCandidateId,
  });
}
