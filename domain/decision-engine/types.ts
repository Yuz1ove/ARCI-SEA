export type NodeId = string;
export type EdgeId = string;
export type CarrierMode = 'road' | 'air' | 'sea';

export type DataProvenance = 'PUBLIC_FACT' | 'SIMULATION_ASSUMPTION' | 'ARCI_DERIVED';

export interface CarrierAvailability {
  road: number;
  air: number;
  sea: number;
}

export interface FulfillmentNodeConfig {
  id: NodeId;
  market: string;
  region: string;
  scope: 'main-island' | 'offshore';
  inventory: number;
  backlog: number;
  processingCapacityPerHour: number;
  availableCapacityRatio: number;
  inboundRate: number;
  outboundRate: number;
  baseSlaHours: number;
  weatherExposure: number;
  trafficExposure: number;
  carrierAvailability: CarrierAvailability;
  serviceLevel: number;
}

export interface FulfillmentEdgeConfig {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  mode: CarrierMode;
  nominalTransitMinutes: number;
  maxCapacity: number;
  currentCapacityRatio: number;
  disruptionProbability: number;
  congestionFactor: number;
  weatherSensitivity: number;
  operatingCost: number;
}

export interface MarketConfig {
  marketId: string;
  currency: string;
  timezone: string;
  nodes: FulfillmentNodeConfig[];
  edges: FulfillmentEdgeConfig[];
  slaPolicies: { minimumServiceLevel: number; maximumDelayHours: number };
  carrierModes: CarrierMode[];
  geographicConstraints: { offshoreNodeIds: NodeId[]; requiredServiceNodeIds: NodeId[] };
  objectiveDefaults: ObjectiveWeights;
}

export interface FulfillmentNodeState extends FulfillmentNodeConfig {
  currentWeatherRisk: number;
  currentTrafficRisk: number;
  failed: boolean;
}

export interface FulfillmentEdgeState extends FulfillmentEdgeConfig {
  available: boolean;
}

export interface CommerceNetworkState {
  marketId: string;
  timeMinutes: number;
  nodes: Record<NodeId, FulfillmentNodeState>;
  edges: Record<EdgeId, FulfillmentEdgeState>;
  demandMultiplier: number;
  weatherSeverity: number;
  trafficSeverity: number;
  slaPressure: number;
  seed: string;
  appliedEventIds: string[];
}

export interface CommerceDigitalTwin {
  marketId: string;
  initialState: CommerceNetworkState;
  currentState: CommerceNetworkState;
  stateSnapshotId: string;
}

export type CommerceEvent =
  | { id: string; atMinute: number; type: 'DEMAND_SURGE'; multiplier: number }
  | { id: string; atMinute: number; type: 'TRAFFIC_DISRUPTION'; severity: number; affectedEdgeIds: readonly EdgeId[] }
  | { id: string; atMinute: number; type: 'WEATHER_DISRUPTION'; severity: number; affectedNodeIds: readonly NodeId[] }
  | { id: string; atMinute: number; type: 'CARRIER_CAPACITY'; mode: CarrierMode; availabilityRatio: number; affectedNodeIds: readonly NodeId[] }
  | { id: string; atMinute: number; type: 'NODE_FAILURE'; nodeId: NodeId; remainingCapacityRatio: number }
  | { id: string; atMinute: number; type: 'RECOVERY'; capacityRestoreRatio: number; affectedNodeIds: readonly NodeId[] };

export interface ScenarioDefinition {
  id: string;
  label: string;
  marketId: string;
  seed: string;
  durationMinutes: number;
  events: CommerceEvent[];
}

export type CommerceAction =
  | { type: 'KEEP_CURRENT_POLICY' }
  | { type: 'REROUTE'; edgeIds: EdgeId[]; volume: number }
  | { type: 'INVENTORY_REBALANCE'; from: NodeId; to: NodeId; units: number }
  | { type: 'CARRIER_MODE_SWITCH'; nodeId: NodeId; fromMode: CarrierMode; toMode: CarrierMode; volume: number }
  | { type: 'CAPACITY_RESERVATION'; nodeId: NodeId; capacity: number }
  | { type: 'ORDER_PRIORITIZATION'; nodeIds: NodeId[]; highPriorityRatio: number }
  | { type: 'TEMPORARY_HOLD'; nodeIds: NodeId[]; volume: number };

export interface FlowAllocation { nodeId: NodeId; volume: number }

export interface CandidatePolicy {
  id: string;
  routeId?: 'route-a' | 'route-b' | 'route-c' | 'route-d';
  label: string;
  description: string;
  actions: CommerceAction[];
  allocations: FlowAllocation[];
  requiredEdgeIds: EdgeId[];
  servedNodeIds: NodeId[];
  switchingMagnitude: number;
  estimatedCost: number;
}

export type ConstraintCode =
  | 'CAPACITY_CONSTRAINT'
  | 'INVENTORY_CONSTRAINT'
  | 'FLOW_CONSERVATION'
  | 'ROUTE_UNAVAILABLE'
  | 'ISLAND_CONNECTIVITY_RISK'
  | 'MINIMUM_SERVICE_REQUIREMENT'
  | 'OPERATIONAL_NODE_COVERAGE';

export interface ConstraintViolation {
  code: ConstraintCode;
  subjectId: string;
  actual: number | string;
  limit: number | string;
  message: string;
}

export interface ConstraintResult { feasible: boolean; violations: ConstraintViolation[]; capacityMargin: number }

export type ObjectiveComponent = 'slaLoss' | 'cost' | 'risk' | 'recoveryTime' | 'capacityStress' | 'instability';
export type ObjectiveWeights = Record<ObjectiveComponent, number>;
export type ObjectiveBreakdown = Record<ObjectiveComponent, number>;

export interface SimulationMetrics {
  slaBreaches: number;
  averageDelayHours: number;
  p90DelayHours: number;
  recoveryTimeMinutes: number;
  operationalCost: number;
  capacityOverloadMinutes: number;
  serviceLevel: number;
  unfulfilledOrders: number;
}

export interface DistributionSummary {
  mean: number;
  p50: number;
  p90: number;
  worstCase: number;
  bestCase: number;
  probabilityOfSlaBreach: number;
}

export interface CandidateEvaluation {
  candidate: CandidatePolicy;
  constraints: ConstraintResult;
  objective: ObjectiveBreakdown;
  expectedScore: number;
  p90Score: number;
  riskAdjustedScore: number;
  uncertainty: DistributionSummary;
  metrics: SimulationMetrics;
  sampleMetrics: SimulationMetrics[];
  paretoOptimal: boolean;
}

export interface ImprovementMetric { baseline: number; arci: number; delta: number; percentageImprovement: number | null }

export interface CounterfactualResult {
  sameStartingStateId: string;
  seed: string;
  baselinePolicyId: string;
  ruleBasedPolicyId: string;
  arciPolicyId: string;
  baseline: SimulationMetrics;
  ruleBased: SimulationMetrics;
  arci: SimulationMetrics;
  improvement: Record<keyof SimulationMetrics, ImprovementMetric>;
}

export type ReasonCode =
  | 'KEEP_CURRENT_POLICY'
  | 'CAPACITY_CONSTRAINT'
  | 'SLA_RISK_HIGH'
  | 'WEATHER_DISRUPTION'
  | 'TRAFFIC_DISRUPTION'
  | 'ISLAND_CONNECTIVITY_RISK'
  | 'RECOVERY_TIME_IMPROVEMENT'
  | 'COST_INCREASE_ACCEPTABLE';

export type GovernanceMode = 'AUTONOMOUS' | 'APPROVAL_REQUIRED' | 'BLOCKED';
export interface GovernanceDecision {
  mode: GovernanceMode;
  reasonCodes: ReasonCode[];
  approvalReasons: string[];
  rollback: { eligible: boolean; triggered: boolean; reason: string | null };
}

export type AuditStage = 'OBSERVE' | 'DETECT' | 'EVALUATE' | 'DECIDE' | 'ACT' | 'VERIFY' | 'COUNTERFACTUAL' | 'REPLAN';
export interface DecisionAuditEntry { stage: AuditStage; atMinute: number; message: string; reasonCodes: ReasonCode[] }

export interface DecisionRecord {
  decisionId: string;
  timestamp: string;
  scenarioId: string;
  stateSnapshotId: string;
  candidatePolicies: string[];
  rejectedPolicies: Array<{ candidateId: string; violations: ConstraintCode[] }>;
  adaptiveWeights: ObjectiveWeights;
  selectedPolicy: string;
  objectiveBreakdown: ObjectiveBreakdown;
  uncertaintySummary: DistributionSummary;
  reasonCodes: ReasonCode[];
  topDecisionFactors: string[];
  previousPolicy: string | null;
  trigger: 'INITIAL_EVALUATION' | 'SECOND_EVENT_REPLAN';
}

export interface DecisionConfidence {
  value: number;
  selectionConsistency: number;
  scoreGap: number;
  constraintStability: number;
}

export interface ScenarioEvaluation {
  scenario: ScenarioDefinition;
  digitalTwin: CommerceDigitalTwin;
  initialState: CommerceNetworkState;
  state: CommerceNetworkState;
  stateSnapshotId: string;
  candidates: CandidatePolicy[];
  evaluations: CandidateEvaluation[];
  selectedPolicy: CandidateEvaluation;
  adaptiveWeights: ObjectiveWeights;
  confidence: DecisionConfidence;
  topDecisionFactors: string[];
  counterfactual: CounterfactualResult;
  governance: GovernanceDecision;
  audit: DecisionAuditEntry[];
  decisionRecord: DecisionRecord;
  calculationLatencyMs: number;
  provenance: {
    operationalParameters: DataProvenance;
    computedResults: DataProvenance;
    publicFacts: DataProvenance;
  };
}

export type DecisionEngineStage =
  | 'UPDATING_DIGITAL_TWIN'
  | 'GENERATING_CANDIDATES'
  | 'CHECKING_CONSTRAINTS'
  | 'RUNNING_UNCERTAINTY'
  | 'SELECTING_POLICY'
  | 'VERIFYING_GOVERNANCE';
