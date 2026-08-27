import { describe, expect, it } from 'vitest';
import { evaluateScenario } from '../engine';
import { taiwanMarket } from '../markets/taiwan';
import { decisionScenarios } from '../scenarios';
import type { EvidenceObservation } from './types';

const observation = (id: string, value: number, confidence = 0.9): EvidenceObservation => ({
  evidenceId: id,
  variable: 'system.weatherSeverity',
  value,
  confidence,
  observedAtMinute: 22,
  sourceReliability: 0.9,
  sourceId: id,
  sourceGroup: id,
  provenanceId: `PROV-${id}`,
});

describe('ARCI Core V3 scenario acceptance governance', () => {
  it('Scenario A: autonomously decides in a complete low-uncertainty environment', () => {
    const result = evaluateScenario(decisionScenarios.normal, taiwanMarket, {samples: 32, v3: {trajectoryCount: 48}});
    expect(result.v3.worldModel.missingVariables).toHaveLength(0);
    expect(result.v3.governance).toMatchObject({autonomyLevel: 'AUTONOMOUS_DECISION', executionAuthorized: true});
  });

  it('Scenario B: lowers confidence and records conflict for contradictory telemetry', () => {
    const stable = evaluateScenario(decisionScenarios.compound, taiwanMarket, {samples: 24, v3: {trajectoryCount: 32, evidence: [observation('stable-a', 0.72), observation('stable-b', 0.74)]}});
    const conflict = evaluateScenario(decisionScenarios.compound, taiwanMarket, {samples: 24, v3: {trajectoryCount: 32, evidence: [observation('conflict-a', 0.05), observation('conflict-b', 0.98)]}});
    expect(conflict.v3.worldModel.conflicts).toEqual([expect.objectContaining({variable: 'system.weatherSeverity'})]);
    expect(conflict.v3.worldModel.values['system.weatherSeverity'].confidence).toBeLessThan(stable.v3.worldModel.values['system.weatherSeverity'].confidence);
    expect(conflict.v3.worldModel.values['system.weatherSeverity'].status).not.toBe('OBSERVED');
  });

  it('Scenario E: escalates rather than guessing when evidence is insufficient', () => {
    const result = evaluateScenario(decisionScenarios.traffic, taiwanMarket, {samples: 24, v3: {trajectoryCount: 32, evidenceMode: 'REPLACE', evidence: [observation('only-source', 0.7, 0.2)]}});
    expect(result.v3.worldModel.missingVariables.length).toBeGreaterThan(0);
    expect(['HUMAN_REVIEW_REQUIRED', 'ABSTAIN']).toContain(result.v3.governance.autonomyLevel);
    expect(result.v3.governance.executionAuthorized).toBe(false);
  });

  it('fails safe when the deterministic simulation work budget is exceeded', () => {
    const result = evaluateScenario(decisionScenarios.traffic, taiwanMarket, {samples: 16, v3: {trajectoryCount: 100, maxTrajectoryWorkUnits: 10}});
    expect(result.v3.failures).toContain('SIMULATION_TIMEOUT_FAIL_SAFE');
    expect(result.v3.governance).toMatchObject({autonomyLevel: 'ABSTAIN', executionAuthorized: false});
  });
});
