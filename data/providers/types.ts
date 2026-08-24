import type { CommerceSnapshot, DecisionCandidate, Provenance, ScenarioEvent, SimulationPhase } from '../../simulation/types';

export type ProviderStatus = {
  id: 'commerce' | 'traffic' | 'weather' | 'logistics' | 'scenario' | 'inference';
  name: string;
  status: 'unconnected' | 'scenario' | 'official' | 'derived' | 'live';
  displayStatus: 'UNCONNECTED' | 'SCENARIO' | 'OFFICIAL POLICY' | 'DERIVED' | 'LIVE';
  lastUpdated: string;
  description: string;
  dataTypes: string[];
  cadence: string;
  integration: string;
  href?: string;
  sourceLinks?: Array<{label:string;href:string}>;
  provenance: Provenance;
};

export interface CommerceDataProvider {
  readonly status: ProviderStatus;
  getOrderSnapshot(phase:SimulationPhase):Promise<CommerceSnapshot>;
}

export interface TrafficDataProvider {
  readonly status: ProviderStatus;
  getEvents(phase:SimulationPhase):Promise<ScenarioEvent[]>;
}

export interface WeatherDataProvider {
  readonly status: ProviderStatus;
  getEvents(phase:SimulationPhase):Promise<ScenarioEvent[]>;
}

export interface ScenarioDataProvider {
  readonly status: ProviderStatus;
  getSnapshot(phase:SimulationPhase):CommerceSnapshot;
}

export interface ARCIInferenceProvider {
  readonly status: ProviderStatus;
  evaluate(phase:SimulationPhase):Promise<DecisionCandidate[]>;
}
