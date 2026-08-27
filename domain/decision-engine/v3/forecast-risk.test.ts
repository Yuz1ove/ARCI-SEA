import { describe, expect, it } from 'vitest';
import { decisionScenarios } from '../scenarios';
import { createCommerceDigitalTwin, injectDigitalTwinScenario } from '../state';
import { evaluateScenario } from '../engine';
import { taiwanMarket } from '../markets/taiwan';
import { evaluateGovernanceV3 } from './governance';
import { DEFAULT_ACTIVE_POLICY } from './policyRegistry';
import { evaluateRiskEnvelope } from './risk';

describe('ARCI Core V3 forecast, digital twin and robust risk', () => {
  it('keeps the initial twin immutable while injecting isolated scenarios', () => {
    const twin = createCommerceDigitalTwin(taiwanMarket, decisionScenarios.traffic.events, 'immutable-twin');
    const before = JSON.stringify(twin);
    const injected = injectDigitalTwinScenario(twin, {id: 'isolated-failure', atMinute: 50, type: 'NODE_FAILURE', nodeId: 'warehouse-a', remainingCapacityRatio: 0.1});
    expect(Object.isFrozen(twin)).toBe(true);
    expect(Object.isFrozen(twin.initialState)).toBe(true);
    expect(JSON.stringify(twin)).toBe(before);
    expect(injected.currentState).not.toEqual(twin.currentState);
    expect(injected.stateHistory).toHaveLength(twin.stateHistory.length + 1);
  });

  it('runs 500 seeded optimistic, nominal, pessimistic and tail-risk trajectories across four real transitions', () => {
    const first = evaluateScenario(decisionScenarios.traffic, taiwanMarket);
    const second = evaluateScenario(decisionScenarios.traffic, taiwanMarket);
    expect(first.v3.forecast.trajectoryCount).toBe(500);
    expect(Object.values(first.v3.forecast.scenarioCounts).every((count) => count > 0)).toBe(true);
    expect(first.v3.forecast.horizons.map((item) => item.minutes)).toEqual([5, 30, 120, 1440]);
    expect(first.v3.forecast.selectedTrajectories).toHaveLength(500);
    expect(first.v3.forecast.selectedTrajectories.every((trajectory) => trajectory.stateTransitions.length === 4)).toBe(true);
    expect(first.v3.audit.authoritativeOutputHash).toBe(second.v3.audit.authoritativeOutputHash);
    expect(first.v3.forecast.selectedTrajectories[0]).toEqual(second.v3.forecast.selectedTrajectories[0]);
  });

  it('calculates bounded CVaR, downside, regret, robustness and reversibility without magic pass values', () => {
    const result = evaluateScenario(decisionScenarios.compound, taiwanMarket, {samples: 48, v3: {trajectoryCount: 80}});
    for (const risk of result.v3.risks) {
      expect(risk.expectedUtility).toBeGreaterThanOrEqual(0);
      expect(risk.expectedUtility).toBeLessThanOrEqual(1);
      expect(risk.tailRiskCvar95).toBeGreaterThanOrEqual(result.v3.forecast.candidates.find((item) => item.candidateId === risk.candidateId)!.lossDistribution.mean);
      expect(risk.robustness).toBeGreaterThanOrEqual(0);
      expect(risk.reversibility).toBeLessThanOrEqual(1);
    }
    expect(result.v3.risks.map((item) => item.robustDecisionLoss)).toEqual([...result.v3.risks.map((item) => item.robustDecisionLoss)].sort((a, b) => a - b));
  });

  it('vetoes a high-expected-utility candidate with catastrophic tail risk', () => {
    const result = evaluateScenario(decisionScenarios.normal, taiwanMarket, {samples: 24, v3: {trajectoryCount: 32}});
    const evaluation = result.evaluations.find((item) => item.candidate.id === result.selectedPolicy.candidate.id)!;
    const catastrophic = {...result.v3.risks[0], candidateId: evaluation.candidate.id, expectedUtility: 0.95, tailRiskCvar95: 0.95, failureProbability: 0.55};
    const envelope = evaluateRiskEnvelope(evaluation, catastrophic, DEFAULT_ACTIVE_POLICY.parameters);
    const governance = evaluateGovernanceV3(evaluation.candidate.id, result.v3.worldModel, result.v3.confidence, [envelope], DEFAULT_ACTIVE_POLICY.parameters);
    expect(envelope.state).toBe('ABSTAIN');
    expect(governance).toMatchObject({autonomyLevel: 'ABSTAIN', executionAuthorized: false});
  });

  it('computes deterministic decision boundaries and sensitivity from the engine', () => {
    const first = evaluateScenario(decisionScenarios.secondEvent, taiwanMarket, {samples: 32, v3: {trajectoryCount: 48}});
    const second = evaluateScenario(decisionScenarios.secondEvent, taiwanMarket, {samples: 32, v3: {trajectoryCount: 48}});
    expect(first.v3.counterfactual.decisionBoundary).toEqual(second.v3.counterfactual.decisionBoundary);
    expect(first.v3.counterfactual.decisionBoundary).toHaveLength(4);
    expect(first.v3.counterfactual.decisionBoundary.some((item) => item.threshold !== null && item.selectedAtThreshold !== first.selectedPolicy.candidate.id)).toBe(true);
    expect(first.v3.counterfactual.criticalVariables[0]?.rankingImpact ?? 0).toBeGreaterThan(0);
  });
});
