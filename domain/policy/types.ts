import type { NetworkNodeId, RouteId } from '@/simulation/types';

export type DecisionCriterion='slaProtection'|'routeFeasibility'|'capacityBalance'|'costEfficiency'|'disruptionRisk'|'recoverySpeed';
export type DecisionWeights=Record<DecisionCriterion,number>;
export type ContextSensitivity=Record<DecisionCriterion,number>;
export type CriterionFeatures=Record<DecisionCriterion,number>;
export type SignalGroup='Demand / Order'|'Fulfillment'|'Logistics'|'SLA'|'Risk'|'Offshore';
export type SignalSourceType='SCENARIO'|'ARCI ESTIMATE';

export interface ContextSignals {
  orderPressure:number;
  corridorCapacityDrop:number;
  estimatedDelayMinutes:number;
  slaRisk:number;
  nodeLoad:number;
  inventoryRisk:number;
  eventConfidence:number;
  eventPersistence:number;
  offshoreRisk:number;
  greenIslandRisk:number;
  weatherRisk:number;
  cycle:number;
}

export interface DecisionSignalInput {
  id:string;
  group:SignalGroup;
  label:string;
  current:number;
  previous:number;
  unit:string;
  min:number;
  max:number;
  lowerIsBetter?:boolean;
  sourceType:SignalSourceType;
}

export interface DecisionSignal extends DecisionSignalInput { normalized:number }

export interface WeightDelta {
  criterion:DecisionCriterion;
  before:number;
  after:number;
  delta:number;
  sensitivity:number;
  reason:string;
  sourceSignal:keyof ContextSignals;
  boundActive:boolean;
}

export interface GuardrailResult {ruleId:string;passed:boolean;description:string}

export interface PolicyCandidate {
  candidateId:string;
  routeId?:RouteId;
  label:string;
  mode:string;
  description:string;
  features:CriterionFeatures;
  hardConstraintViolations:string[];
  riskPenalty:number;
  softConstraintViolation:number;
  availableCapacity:number;
  requiredCapacity:number;
  routeAvailable:number;
  routeReliability:number;
  nodeDemand:number;
  nodeCapacity:number;
  servedNodeIds:NetworkNodeId[];
}

export interface CandidateScore {
  candidateId:string;
  routeId?:RouteId;
  totalScore:number;
  utility:number;
  weightedUtility:number;
  riskPenalty:number;
  constraintPenalty:number;
  eligible:boolean;
  criterionScores:Record<DecisionCriterion,number>;
  features:CriterionFeatures;
  hardConstraintViolations:string[];
  routeFeasibility:number;
  capacityLoad:number;
}

export type PolicyScenarioId='normal-operations'|'traffic-disruption'|'warehouse-overload';
export type ContextClassification='NORMAL_OPERATIONS'|'TRAFFIC_DISRUPTION'|'WAREHOUSE_OVERLOAD';

export interface PolicyOutcome {
  status:'retained'|'rollback-required'|'monitoring';
  expected:string;
  observed:string;
  nextEvaluation:string;
}

export interface ReasonChain {signal:string;interpretation:string;adjustment:string;criterion:DecisionCriterion}

export interface PolicyScenario {
  id:PolicyScenarioId;
  label:string;
  contextLabel:string;
  version:string;
  effectiveAt:string;
  observationTime:string;
  context:ContextSignals;
  signals:DecisionSignalInput[];
  beta:number;
  candidates:PolicyCandidate[];
  outcome:PolicyOutcome;
  priorSnapshotLabel:string;
  currentCandidateId:string;
}

export interface HardConstraintState {
  id:string;
  label:string;
  expression:string;
  active:boolean;
  rejectedCandidateIds:string[];
}

export interface SoftConstraintState {id:string;label:string;expression:string;coefficient:number}

export interface ReplanTriggerState {
  id:string;
  expression:string;
  previous:string;
  current:string;
  triggered:boolean;
  reason:string;
}

export interface DecisionTraceEntry {time:string;stage:string;message:string}

export interface PolicySnapshot {
  id:string;
  version:string;
  scenarioId:PolicyScenarioId;
  contextLabel:string;
  classification:ContextClassification;
  context:ContextSignals;
  signals:DecisionSignal[];
  baseWeights:DecisionWeights;
  sensitivities:ContextSensitivity;
  adaptiveWeights:DecisionWeights;
  beta:number;
  deltas:WeightDelta[];
  guardrails:GuardrailResult[];
  hardConstraints:HardConstraintState[];
  softConstraints:SoftConstraintState[];
  candidateRankingBefore:CandidateScore[];
  candidateRankingAfter:CandidateScore[];
  selectedCandidateId:string;
  currentCandidateId:string;
  decisionConfidence:number;
  candidateMargin:number;
  signalCompleteness:number;
  constraintCertainty:number;
  replanTriggers:ReplanTriggerState[];
  replanTriggered:boolean;
  switchThreshold:number;
  utilityDelta:number;
  switchAllowed:boolean;
  calculationLatencyMs:number;
  lastObservation:string;
  activeConstraintCount:number;
  trace:DecisionTraceEntry[];
  eventConfidence:number;
  createdAt:string;
  rollbackEligible:boolean;
  previousSnapshotId:string|null;
  outcome:PolicyOutcome;
  reasonChains:ReasonChain[];
  auditRecorded:boolean;
}
