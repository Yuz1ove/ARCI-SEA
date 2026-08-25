import { decisionCandidatesFromEvaluation, engineEvaluationForPhase } from './enterpriseAdapter';
import type { DecisionCandidate, DecisionRuntime, SimulationPhase } from './types';

export class SimulatedDecisionRuntime implements DecisionRuntime {
  async evaluate(phase:SimulationPhase):Promise<DecisionCandidate[]> {
    await Promise.resolve();
    return decisionCandidatesFromEvaluation(engineEvaluationForPhase(phase));
  }
}

// Future boundary: implement DecisionRuntime here with the ARCI Core API.
export class ArciApiDecisionRuntime implements DecisionRuntime {
  async evaluate(phase:SimulationPhase):Promise<DecisionCandidate[]> {
    void phase;
    throw new Error('ARCI Core integration is intentionally not connected in this simulation.');
  }
}
