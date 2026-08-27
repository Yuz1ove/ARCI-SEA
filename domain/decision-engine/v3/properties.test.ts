import { describe, expect, it } from 'vitest';
import { evaluateConstraints } from '../constraints';
import { evaluateScenario } from '../engine';
import { taiwanMarket } from '../markets/taiwan';
import { decisionScenarios } from '../scenarios';
import { cloneCommerceState } from '../state';

describe('ARCI Core V3 decision properties', () => {
  const result = evaluateScenario(decisionScenarios.traffic, taiwanMarket, {samples: 24, v3: {trajectoryCount: 40}});

  it('keeps every probability and confidence component inside [0,1]', () => {
    const values = [
      result.v3.confidence.value,
      result.v3.confidence.evidenceSufficiency,
      result.v3.confidence.simulationAgreement,
      result.v3.confidence.decisionMargin,
      result.v3.confidence.uncertaintyLevel,
      result.v3.confidence.modelReliability,
      result.v3.confidence.policyStability,
      ...result.v3.risks.flatMap((risk) => [risk.expectedUtility, risk.worstCaseUtility, risk.failureProbability, risk.constraintViolationProbability, risk.robustness, risk.reversibility]),
    ];
    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it('does not make an infeasible allocation feasible when capacity is reduced', () => {
    const candidate = result.candidates.find((item) => item.allocations.length > 0)!;
    const constrained = cloneCommerceState(result.state);
    for (const node of Object.values(constrained.nodes)) node.availableCapacityRatio *= 0.5;
    const baseline = evaluateConstraints(candidate, result.state, taiwanMarket);
    const reduced = evaluateConstraints(candidate, constrained, taiwanMarket);
    if (!baseline.feasible) expect(reduced.feasible).toBe(false);
    expect(reduced.capacityMargin).toBeLessThanOrEqual(baseline.capacityMargin);
  });

  it('is seed deterministic and orders robust loss monotonically', () => {
    const replay = evaluateScenario(decisionScenarios.traffic, taiwanMarket, {samples: 24, v3: {trajectoryCount: 40}});
    expect(replay.v3.audit.authoritativeOutputHash).toBe(result.v3.audit.authoritativeOutputHash);
    const losses = result.v3.risks.map((risk) => risk.robustDecisionLoss);
    expect(losses).toEqual([...losses].sort((left, right) => left - right));
  });

  it('materializes a deeply immutable authoritative audit record', () => {
    expect(Object.isFrozen(result.v3.audit)).toBe(true);
    expect(Object.isFrozen(result.v3.audit.worldStateSnapshot)).toBe(true);
    expect(Object.isFrozen(result.v3.audit.worldStateSnapshot.nodes)).toBe(true);
    expect(Object.isFrozen(result.v3.audit.candidateSet)).toBe(true);
  });
});
