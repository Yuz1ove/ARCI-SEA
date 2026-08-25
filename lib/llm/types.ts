import type { CommerceEvent, ScenarioDefinition, ScenarioEvaluation } from '@/domain/decision-engine';

export const ARCI_INTENTS = [
  'EXPLAIN_DECISION',
  'WHY_NOT_POLICY',
  'WHAT_IF_SIMULATION',
  'COMPARE_POLICIES',
  'EXPLAIN_REJECTION',
  'EXPLAIN_RISK',
  'EXPLAIN_COUNTERFACTUAL',
  'EXECUTIVE_BRIEFING',
  'SYSTEM_STATUS',
  'UNKNOWN',
] as const;

export type ArciIntent = (typeof ARCI_INTENTS)[number];
export type IntelligenceProvenance = 'ARCI_ENGINE' | 'LLM_INTERPRETATION' | 'USER_PROVIDED' | 'SIMULATION_ASSUMPTION' | 'PUBLIC_FACT';

export type ParsedIntelligenceEvent =
  | { type:'WEATHER'; severity:'LIGHT'|'MODERATE'|'HEAVY'|'EXTREME'; region:'NORTH'|'CENTRAL'|'SOUTH'|'OFFSHORE'|'ALL' }
  | { type:'NODE_CAPACITY_CHANGE'; nodeId:string; changeRatio:number }
  | { type:'NODE_FAILURE'; nodeId:string }
  | { type:'DEMAND_CHANGE'; region:'NORTH'|'CENTRAL'|'SOUTH'|'OFFSHORE'|'ALL'; changeRatio:number }
  | { type:'CARRIER_CAPACITY_CHANGE'; mode:'road'|'air'|'sea'; region:'NORTH'|'CENTRAL'|'SOUTH'|'OFFSHORE'|'ALL'; changeRatio:number; durationHours:number|null }
  | { type:'NO_INTERVENTION' };

export interface StructuredArciCommand {
  intent:ArciIntent;
  events:ParsedIntelligenceEvent[];
  question:string;
}

export type ExplanationSectionKey = 'SITUATION'|'DECISION'|'WHY'|'REJECTED_ALTERNATIVES'|'RISK'|'COUNTERFACTUAL'|'GOVERNANCE'|'WATCH_NEXT';

export interface GroundedExplanationPlan {
  headline:string;
  summary:string;
  factorRefs:string[];
  rejectedPolicyIds:string[];
  watchMetrics:Array<'SERVICE_LEVEL'|'P90_DELAY'|'SLA_BREACH_PROBABILITY'|'CAPACITY_MARGIN'|'WEATHER_RISK'|'TRAFFIC_RISK'|'GOVERNANCE'>;
  sections:Array<{ key:ExplanationSectionKey; text:string; sourceRefs:string[] }>;
  insufficientData:boolean;
}

export interface GroundingContext {
  decisionId:string;
  stateId:string;
  intent:ArciIntent;
  selectedPolicy:{ id:string; label:string; actions:string[]; score:number; feasible:boolean };
  candidates:Array<{
    id:string;
    label:string;
    feasible:boolean;
    reasonCodes:string[];
    score:number;
    p50:number;
    p90:number;
    slaBreachProbability:number;
  }>;
  adaptiveWeights:ScenarioEvaluation['adaptiveWeights'];
  topDecisionFactors:string[];
  risk:{ p50:number; p90:number; p90DelayHours:number; slaBreachProbability:number };
  counterfactual:ScenarioEvaluation['counterfactual'];
  governance:ScenarioEvaluation['governance'];
  evidence:Record<string,string>;
  provenance:{ engine:'ARCI_ENGINE'; interpretation:'LLM_INTERPRETATION'; assumptions:'SIMULATION_ASSUMPTION' };
}

export type ProviderFailureCode =
  | 'PROVIDER_AUTH'
  | 'PROVIDER_QUOTA'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_SCHEMA'
  | 'PROVIDER_NETWORK'
  | 'PROVIDER_MODEL_UNAVAILABLE'
  | 'UNKNOWN_PROVIDER_FAILURE';

export type ProviderStatus = 'OK'|'DISABLED'|'ERROR';

export interface LlmInteractionRecord {
  interactionId:string;
  timestamp:string;
  decisionId:string|null;
  stateId:string|null;
  intent:ArciIntent;
  modelRequested:string;
  modelEffective:string|null;
  inputHash:string;
  structuredParseStatus:'PASSED'|'FAILED'|'NOT_APPLICABLE';
  schemaValidationStatus:'PASSED'|'FAILED'|'NOT_APPLICABLE';
  latencyMs:number;
  providerStatus:ProviderStatus;
  failureCode:ProviderFailureCode|null;
}

export interface JsonSchemaDefinition { name:string; schema:Record<string,unknown> }

export interface StructuredGenerationRequest<T> {
  schema:JsonSchemaDefinition;
  instructions:string;
  input:string;
  validate:(value:unknown)=>T;
  metadata:{ decisionId:string|null; stateId:string|null; intent:ArciIntent };
}

export interface StructuredGenerationResult<T> {
  value:T;
  audit:LlmInteractionRecord;
}

export interface LlmProvider {
  readonly status:ProviderStatus;
  generateStructured<T>(request:StructuredGenerationRequest<T>):Promise<StructuredGenerationResult<T>>;
  generateExplanation(request:StructuredGenerationRequest<GroundedExplanationPlan>):Promise<StructuredGenerationResult<GroundedExplanationPlan>>;
}

export type IntelligencePipelineStage =
  | 'UNDERSTANDING_REQUEST'
  | 'NORMALIZING_EVENT'
  | 'UPDATING_DIGITAL_TWIN'
  | 'GENERATING_CANDIDATES'
  | 'CHECKING_CONSTRAINTS'
  | 'RUNNING_UNCERTAINTY'
  | 'SELECTING_POLICY'
  | 'VERIFYING_GOVERNANCE'
  | 'GENERATING_EXPLANATION';

export interface PipelineStageRecord { stage:IntelligencePipelineStage; status:'COMPLETED'|'DEGRADED'; durationMs:number }

export interface IntelligenceRequest {
  question:string;
  scenario:ScenarioDefinition;
}

export interface IntelligenceResponse {
  requestId:string;
  command:StructuredArciCommand;
  normalizedEvents:CommerceEvent[];
  evaluation:ScenarioEvaluation;
  explanation:GroundedExplanationPlan;
  grounding:GroundingContext;
  interactions:LlmInteractionRecord[];
  pipeline:PipelineStageRecord[];
  engineLatencyMs:number;
  providerLatencyMs:number;
  totalLatencyMs:number;
  providerStatus:ProviderStatus;
  explanationSource:'SCHOOL_LLM'|'DETERMINISTIC_FALLBACK';
  engineStatus:'ONLINE';
}

export interface IntelligenceDecisionResponse {
  phase:'DECISION_READY';
  requestId:string;
  command:StructuredArciCommand;
  normalizedEvents:CommerceEvent[];
  evaluation:ScenarioEvaluation;
  grounding:GroundingContext;
  interactions:LlmInteractionRecord[];
  pipeline:PipelineStageRecord[];
  engineLatencyMs:number;
  interpretationLatencyMs:number;
  totalLatencyMs:number;
  providerStatus:ProviderStatus;
  interpretationSource:'SCHOOL_LLM'|'DETERMINISTIC_FALLBACK';
  engineStatus:'ONLINE';
}

export interface IntelligenceExplanationUpdate {
  phase:'EXPLANATION_READY';
  requestId:string;
  decisionId:string;
  stateId:string;
  explanation:GroundedExplanationPlan;
  interactions:LlmInteractionRecord[];
  pipelineStage:PipelineStageRecord;
  providerLatencyMs:number;
  totalLatencyMs:number;
  providerStatus:ProviderStatus;
  explanationSource:'SCHOOL_LLM'|'DETERMINISTIC_FALLBACK';
  engineStatus:'ONLINE';
}

export type IntelligenceStreamMessage=IntelligenceDecisionResponse|IntelligenceExplanationUpdate;
