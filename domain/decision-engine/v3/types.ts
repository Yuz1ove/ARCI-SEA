import type {
  CandidatePolicy,
  CommerceNetworkState,
  ConstraintCode,
  MarketConfig,
  ObjectiveWeights,
  ScenarioDefinition,
  SimulationMetrics,
} from '../types';

export type WorldVariableKey = string;

export interface EvidenceObservation {
  evidenceId: string;
  variable: WorldVariableKey;
  value: unknown;
  confidence: number;
  observedAtMinute: number;
  sourceReliability: number;
  sourceId: string;
  sourceGroup: string;
  provenanceId: string;
}

export interface ProbabilisticValue<T> {
  value: T | null;
  confidence: number;
  uncertainty: number;
  freshnessMs: number;
  sourceReliability: number;
  observedAt: string;
  provenanceIds: string[];
  agreement: number;
  evidenceCount: number;
  status: 'OBSERVED' | 'CONFLICTED' | 'STALE' | 'LOW_CONFIDENCE' | 'UNKNOWN';
}

export interface EvidenceFusionConflict {
  variable: WorldVariableKey;
  evidenceIds: string[];
  disagreement: number;
}

export interface ProbabilisticWorldModel {
  snapshotId: string;
  values: Record<WorldVariableKey, ProbabilisticValue<number>>;
  evidenceIds: string[];
  conflicts: EvidenceFusionConflict[];
  rejectedEvidence: Array<{ evidenceId: string; reason: string }>;
  missingVariables: WorldVariableKey[];
  evidenceSufficiency: number;
  disagreement: number;
  modelReliability: number;
}

export type ForecastScenarioClass = 'OPTIMISTIC' | 'NOMINAL' | 'PESSIMISTIC' | 'TAIL_RISK';
export type HorizonName = 'IMMEDIATE' | 'STABILIZATION' | 'RECOVERY' | 'LONG_TERM_RESILIENCE';

export interface ForecastHorizon {
  name: HorizonName;
  minutes: 5 | 30 | 120 | 1440;
  utilityWeight: number;
  riskWeight: number;
  recoveryWeight: number;
}

export interface TrajectoryTransition {
  horizon: ForecastHorizon;
  fromStateId: string;
  toStateId: string;
  stateDelta: {
    backlog: number;
    averageServiceLevel: number;
    averageCapacityRatio: number;
  };
  outcome: SimulationMetrics;
}

export interface ForecastTrajectory {
  trajectoryId: string;
  seed: string;
  scenarioClass: ForecastScenarioClass;
  scenarioAssumptions: string[];
  stateTransitions: TrajectoryTransition[];
  outcome: SimulationMetrics;
  risk: number;
  utility: number;
  constraintViolations: ConstraintCode[];
}

export interface DistributionStats {
  mean: number;
  variance: number;
  p50: number;
  p90: number;
  p95: number;
  minimum: number;
  maximum: number;
}

export interface HorizonOutcomeSummary {
  horizon: ForecastHorizon;
  utility: DistributionStats;
  serviceLevel: DistributionStats;
  delayHours: DistributionStats;
  failureProbability: number;
}

export interface CandidateForecast {
  candidateId: string;
  trajectoryCount: number;
  scenarioCounts: Record<ForecastScenarioClass, number>;
  horizonOutcomes: HorizonOutcomeSummary[];
  lossDistribution: DistributionStats;
  finalOutcome: SimulationMetrics;
}

export interface RiskMetricsV3 {
  candidateId: string;
  expectedUtility: number;
  worstCaseUtility: number;
  variance: number;
  failureProbability: number;
  constraintViolationProbability: number;
  tailRiskCvar95: number;
  downsideRisk: number;
  regret: number;
  robustness: number;
  reversibility: number;
  recoveryCost: number;
  robustDecisionLoss: number;
}

export interface DecisionBoundaryVariable {
  variable: 'demandMultiplier' | 'weatherSeverity' | 'trafficSeverity' | 'networkAvailability';
  baseline: number;
  threshold: number | null;
  selectedAtThreshold: string | null;
  normalizedDistance: number;
  rankingImpact: number;
}

export interface CounterfactualV3 {
  noActionCandidateId: string;
  noAction: CandidateForecast;
  runnerUpCandidateId: string;
  runnerUp: CandidateForecast;
  selectedCandidateId: string;
  selected: CandidateForecast;
  candidateComparisons: Array<{ candidateId: string; forecast: CandidateForecast; risk: RiskMetricsV3 }>;
  decisionMargin: number;
  decisionBoundary: DecisionBoundaryVariable[];
  criticalVariables: DecisionBoundaryVariable[];
}

export interface DecisionConfidenceV3 {
  value: number;
  evidenceSufficiency: number;
  simulationAgreement: number;
  decisionMargin: number;
  uncertaintyLevel: number;
  modelReliability: number;
  policyStability: number;
}

export type RiskEnvelopeState = 'SAFE' | 'CAUTION' | 'ABSTAIN' | 'PROHIBITED';

export interface RiskEnvelopeEvaluation {
  candidateId: string;
  state: RiskEnvelopeState;
  reasons: string[];
  limits: {
    maximumFailureProbability: number;
    maximumTailRisk: number;
    minimumRobustness: number;
  };
}

export type AutonomyLevel = 'AUTONOMOUS_DECISION' | 'AUTONOMOUS_WITH_WARNING' | 'HUMAN_REVIEW_REQUIRED' | 'ABSTAIN';

export interface GovernanceV3 {
  autonomyLevel: AutonomyLevel;
  riskEnvelope: RiskEnvelopeState;
  executionAuthorized: boolean;
  reasonCodes: string[];
  vetoedCandidateIds: string[];
}

export interface ValidationMetric {
  metric: string;
  expected: number | string;
  actual: number | string;
  delta: number | null;
  reason: string;
  confidence: number;
}

export interface OutcomeValidationV2 {
  validationId: string;
  predictionError: number;
  stateTransitionError: number;
  utilityError: number;
  constraintMismatch: string[];
  calibrationError: number;
  metrics: ValidationMetric[];
  passed: boolean;
}

export type AttributionCause = 'CANDIDATE_ACTION' | 'EXTERNAL_EVENT' | 'DATA_ERROR' | 'MODEL_ERROR' | 'POLICY_ERROR' | 'EXECUTION_FAILURE' | 'ATTRIBUTION_UNCERTAIN';

export interface CausalAttribution {
  attributionId: string;
  boundedOperationalAttribution: true;
  primaryCause: AttributionCause;
  contributions: Record<Exclude<AttributionCause, 'ATTRIBUTION_UNCERTAIN'>, number>;
  confidence: number;
  evidence: string[];
}

export type PolicyStatus = 'DRAFT' | 'SHADOW' | 'ACTIVE' | 'RETIRED' | 'REJECTED';

export interface PolicyParametersV3 {
  riskWeights: {
    expectedLoss: number;
    cvar95: number;
    variance: number;
    failureProbability: number;
    constraintViolation: number;
    irreversibility: number;
    recoveryCost: number;
  };
  confidenceThresholds: {
    autonomous: number;
    humanReview: number;
  };
  riskEnvelope: {
    cautionFailureProbability: number;
    abstainFailureProbability: number;
    prohibitedConstraintProbability: number;
    cautionTailRisk: number;
    abstainTailRisk: number;
    minimumRobustness: number;
  };
  horizonWeights: Record<HorizonName, number>;
}

export interface PolicyVersionRecord {
  policyId: string;
  version: string;
  createdAt: string;
  parameters: PolicyParametersV3;
  constraints: string[];
  evaluationMetrics: Record<string, number>;
  status: PolicyStatus;
  supersedes: string | null;
  rollbackTarget: string | null;
}

export interface PolicyUpdateProposal {
  proposalId: string;
  basePolicyVersion: string;
  proposedVersion: string;
  parameterDiff: Partial<PolicyParametersV3>;
  evidence: string[];
  expectedBenefit: number;
  risk: number;
  approvalStatus: 'PROPOSED' | 'OFFLINE_PASSED' | 'SHADOW_REQUIRED' | 'APPROVED' | 'REJECTED';
  rollbackTarget: string;
  reason: string;
}

export interface ShadowEvaluation {
  shadowEvaluationId: string;
  eventId: string;
  activePolicyVersion: string;
  shadowPolicyVersion: string;
  activeExecuted: true;
  shadowExecuted: false;
  selectedCandidateDifference: boolean;
  utilityDifference: number;
  riskDifference: number;
  confidenceDifference: number;
  governanceDifference: boolean;
  evidenceCount: number;
}

export type CalibrationStatus = 'UNCALIBRATED' | 'PARTIALLY_CALIBRATED' | 'CALIBRATED';

export interface CalibrationResult {
  status: CalibrationStatus;
  sampleCount: number;
  expectedCalibrationError: number | null;
  brierScore: number | null;
  source: 'NONE' | 'SYNTHETIC_FIXTURE' | 'OBSERVED_OUTCOMES';
  bins: Array<{ lower: number; upper: number; predictedMean: number; observedFrequency: number; count: number }>;
}

export interface DecisionAuditV3 {
  auditVersion: 'ARCI_CORE_V3';
  decisionId: string;
  eventId: string;
  scenario: ScenarioDefinition;
  worldStateSnapshot: CommerceNetworkState;
  worldModelSnapshotId: string;
  evidence: EvidenceObservation[];
  policyVersion: string;
  policy: PolicyVersionRecord;
  simulationConfig: { trajectoryCount: number; baseMonteCarloSamples: number; horizons: ForecastHorizon[] };
  randomSeed: string;
  candidateSet: CandidatePolicy[];
  trajectorySummary: Array<{ candidateId: string; trajectoryCount: number; lossDistribution: DistributionStats }>;
  riskMetrics: RiskMetricsV3[];
  counterfactuals: Omit<CounterfactualV3, 'candidateComparisons'>;
  governanceResult: GovernanceV3;
  decisionConfidence: DecisionConfidenceV3;
  selectedCandidate: string;
  executionResult: SimulationMetrics | null;
  validation: OutcomeValidationV2 | null;
  attribution: CausalAttribution | null;
  policyFeedback: PolicyUpdateProposal | null;
  authoritativeInputHash: string;
  authoritativeOutputHash: string;
}

export interface ReplayResult {
  matched: boolean;
  expectedOutputHash: string;
  actualOutputHash: string;
  sameCandidates: boolean;
  sameSimulation: boolean;
  sameRanking: boolean;
  sameGovernance: boolean;
  sameDecision: boolean;
  sameConfidence: boolean;
  mismatches: string[];
}

export interface ArciCoreV3Evaluation {
  version: 'ARCI_CORE_V3';
  worldModel: ProbabilisticWorldModel;
  digitalTwin: {
    immutableSnapshot: true;
    snapshotId: string;
    seed: string;
    stateHistoryIds: string[];
  };
  forecast: {
    seed: string;
    trajectoryCount: number;
    scenarioCounts: Record<ForecastScenarioClass, number>;
    horizons: ForecastHorizon[];
    candidates: CandidateForecast[];
    selectedTrajectories: ForecastTrajectory[];
  };
  risks: RiskMetricsV3[];
  counterfactual: CounterfactualV3;
  confidence: DecisionConfidenceV3;
  riskEnvelopes: RiskEnvelopeEvaluation[];
  governance: GovernanceV3;
  policy: {
    activeVersion: string;
    shadowVersion: string | null;
  };
  calibration: CalibrationResult;
  audit: DecisionAuditV3;
  failures: string[];
}

export interface V3EvaluationOptions {
  evidence?: EvidenceObservation[];
  evidenceMode?: 'AUGMENT' | 'REPLACE';
  trajectoryCount?: number;
  maxTrajectoryWorkUnits?: number;
  policy?: PolicyVersionRecord;
  allowNonActivePolicy?: boolean;
  shadowPolicyVersion?: string | null;
  calibrationDataset?: Array<{ predictedProbability: number; observed: 0 | 1; source: 'SYNTHETIC_FIXTURE' | 'OBSERVED_OUTCOMES' }>;
}

export interface V3BuildInput {
  scenario: ScenarioDefinition;
  market: MarketConfig;
  state: CommerceNetworkState;
  stateSnapshotId: string;
  stateHistory: readonly CommerceNetworkState[];
  candidates: CandidatePolicy[];
  evaluations: import('../types').CandidateEvaluation[];
  objectiveWeights: ObjectiveWeights;
  options: V3EvaluationOptions;
}
