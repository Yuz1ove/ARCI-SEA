import { primaryCandidates, replanCandidates } from './scenario';
import type { DecisionCandidate, DecisionRuntime, SimulationPhase } from './types';

export class SimulatedDecisionRuntime implements DecisionRuntime {
  async evaluate(phase:SimulationPhase):Promise<DecisionCandidate[]> {
    await Promise.resolve();
    return phase === 'SECOND_FAILURE' || phase === 'REPLANNING' || phase === 'UPDATED_EXECUTION' || phase === 'RECOVERED' ? replanCandidates : primaryCandidates;
  }
}

// Future boundary: implement DecisionRuntime here with the ARCI Core API.
export class ArciApiDecisionRuntime implements DecisionRuntime {
  async evaluate(phase:SimulationPhase):Promise<DecisionCandidate[]> {
    void phase;
    throw new Error('ARCI Core integration is intentionally not connected in this simulation.');
  }
}
