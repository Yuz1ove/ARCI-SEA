export type SimulationPhase =
  | 'NORMAL'
  | 'SURGE'
  | 'WAREHOUSE_OVERLOAD'
  | 'DEGRADED'
  | 'DECIDING'
  | 'REROUTING'
  | 'RECOVERING'
  | 'SECOND_FAILURE'
  | 'REPLANNING'
  | 'UPDATED_EXECUTION'
  | 'RECOVERED';

export type SourceType = 'observed' | 'public' | 'inferred' | 'simulated';

export type Provenance = {
  sourceType: SourceType;
  sourceLabel: string;
  sourceDetail: string;
  isLive: boolean;
  asOf?: string;
};

export type SourcedMetric<T> = Provenance & { value: T };

export type NodeHealth = 'healthy' | 'strained' | 'critical' | 'degraded' | 'unavailable';
export type RouteId = 'route-a' | 'route-b' | 'route-c' | 'route-d';
export const OPERATIONAL_NODE_IDS = ['warehouse-a','warehouse-b','warehouse-c','penghu','kinmen','matsu','green-island'] as const;
export type NetworkNodeId = (typeof OPERATIONAL_NODE_IDS)[number];
export type NetworkRisk = '低' | '中' | '高';

export type WarehouseState = {
  id: 'warehouse-a' | 'warehouse-b' | 'warehouse-c';
  name: string;
  region: string;
  load: number;
  capacity: number;
  queue: number;
  predictedDelay: number;
  health: NodeHealth;
  provenance: Provenance;
};

export type CarrierState = {
  id: 'carrier-a' | 'carrier-b' | 'carrier-c';
  name: string;
  available: boolean;
  delay: number;
  capacity: number;
  reliability: number;
  costScore: number;
  health: NodeHealth;
  provenance: Provenance;
};

export type NetworkNodeState = {
  id: NetworkNodeId;
  name: string;
  scope: 'main-island' | 'offshore';
  transport: string;
  orderRate: number;
  capacity: number;
  load: number;
  slaRate: number;
  predictedDelay: number;
  transportAvailability: number;
  weatherDisruption: number;
  trafficDisruption: number;
  riskScore: number;
  risk: NetworkRisk;
  constraint: string;
  health: NodeHealth;
  provenance: Provenance;
};

export type NationalNetworkKpis = {
  nodeCount: number;
  orderRate: number;
  onTimeRate: number;
  averageDelayHours: number;
  riskExposure: number;
  capacityBalance: number;
  aggregation: string;
  provenance: Provenance;
};

export type ScenarioEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  severity: 'info' | 'warning' | 'critical' | 'resolved';
  provenance: Provenance;
  operationalImpact?: {
    corridor: string;
    capacityDropPercent: number;
    estimatedDelayMinutes: number;
    affectedOrders: number;
    durationRangeMinutes: [number, number];
    confidence: number;
    updatedAt: string;
  };
};

export type DecisionTrace = {
  observed: string[];
  objective: string;
  constraints: string[];
  reason: string;
};

export type CommerceSnapshot = {
  orderRate: number;
  ordersAtRisk: number;
  inventorySyncHealth: number;
  warehouses: WarehouseState[];
  carriers: CarrierState[];
  networkNodes: NetworkNodeState[];
  networkKpis: NationalNetworkKpis;
  onTimeRate: number;
  averageDelayHours: number;
  extraCostPercent: number;
  recoveryScore: number;
  activeRoute: RouteId;
  arciStatus: string;
  headline: string;
  summary: string;
  metrics: {
    orderRate: SourcedMetric<number>;
    ordersAtRisk: SourcedMetric<number>;
    onTimeRate: SourcedMetric<number>;
    averageDelayHours: SourcedMetric<number>;
    extraCostPercent: SourcedMetric<number>;
    recoveryScore: SourcedMetric<number>;
  };
  events: ScenarioEvent[];
  trace: DecisionTrace;
};

export type CommerceSimulationState = {
  phase: SimulationPhase;
  previewRoute: RouteId | null;
  selectedRoute: RouteId | null;
  selectedNode: string | null;
  autoPlaying: boolean;
  autoPaused: boolean;
};

export type DecisionCandidate = {
  id: RouteId;
  planLabel: string;
  serviceName: string;
  serviceMode: string;
  route: string;
  reliability: number;
  delay: number;
  cost: number;
  affectedOrders: number;
  recoveryMinutes: number;
  slaRate: number;
  risk: '低' | '中' | '高';
  feasibility: number;
  executionDifficulty: '低' | '中' | '高';
  offshoreImpact: {
    slaDelta: number;
    delayDelta: number;
    capacityBuffer: number;
    risk: NetworkRisk;
    summary: string;
  };
  actions: string[];
  tags: Array<'ARCI Recommended' | 'Fallback' | 'Low Cost' | 'Fastest Recovery'>;
  evidence: string[];
  reason: string;
  recommended?: boolean;
  provenance: Provenance;
};

export interface DecisionRuntime {
  evaluate(phase: SimulationPhase): Promise<DecisionCandidate[]>;
}
