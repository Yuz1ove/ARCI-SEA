import { describe, expect, it } from 'vitest';
import { applyCommerceEvent, createInitialState } from '../state';
import { taiwanMarket } from '../markets/taiwan';
import { fuseWorldState } from './worldModel';
import type { EvidenceObservation } from './types';

const evidence = (id: string, value: unknown, overrides: Partial<EvidenceObservation> = {}): EvidenceObservation => ({
  evidenceId: id,
  variable: 'system.weatherSeverity',
  value,
  confidence: 0.9,
  observedAtMinute: 40,
  sourceReliability: 0.9,
  sourceId: id,
  sourceGroup: id,
  provenanceId: `PROV-${id}`,
  ...overrides,
});

const stateAt40 = () => applyCommerceEvent(createInitialState(taiwanMarket, 'world-model'), {id: 'clock', atMinute: 40, type: 'DEMAND_SURGE', multiplier: 1});

describe('ARCI Core V3 probabilistic world model', () => {
  it('fuses agreeing independent sources deterministically', () => {
    const state = stateAt40();
    const supplied = [evidence('source-a', 0.7), evidence('source-b', 0.72)];
    const first = fuseWorldState(state, supplied);
    const second = fuseWorldState(state, supplied);
    expect(first).toEqual(second);
    expect(first.model.values['system.weatherSeverity'].value).toBeCloseTo(0.71, 2);
    expect(first.model.values['system.weatherSeverity'].status).toBe('OBSERVED');
    expect(first.model.values['system.weatherSeverity'].agreement).toBeGreaterThan(0.9);
  });

  it('records contradictory telemetry and reduces confidence', () => {
    const state = stateAt40();
    const agreed = fuseWorldState(state, [evidence('a', 0.5), evidence('b', 0.52)]).model.values['system.weatherSeverity'];
    const conflicted = fuseWorldState(state, [evidence('a', 0.05), evidence('b', 0.95)]).model;
    expect(conflicted.conflicts).toEqual([expect.objectContaining({variable: 'system.weatherSeverity'})]);
    expect(conflicted.values['system.weatherSeverity'].status).toBe('CONFLICTED');
    expect(conflicted.values['system.weatherSeverity'].confidence).toBeLessThan(agreed.confidence);
  });

  it('marks stale, low-confidence and missing values without inventing certainty', () => {
    const state = stateAt40();
    const stale = fuseWorldState(state, [evidence('stale', 0.4, {observedAtMinute: 0})]).model.values['system.weatherSeverity'];
    const low = fuseWorldState(state, [evidence('low', 0.4, {confidence: 0.1, sourceReliability: 0.2})]).model.values['system.weatherSeverity'];
    const missing = fuseWorldState(state, [], 'REPLACE').model;
    expect(stale.status).toBe('STALE');
    expect(low.status).toBe('LOW_CONFIDENCE');
    expect(missing.values['system.weatherSeverity']).toMatchObject({value: null, confidence: 0, uncertainty: 1, status: 'UNKNOWN'});
    expect(missing.missingVariables.length).toBeGreaterThan(20);
  });

  it('rejects malformed, adversarial and unknown-variable evidence', () => {
    const state = stateAt40();
    const result = fuseWorldState(state, [
      evidence('nan', Number.NaN),
      evidence('confidence', 0.4, {confidence: 9}),
      evidence('unknown', 0.4, {variable: 'node.invented.capacity'}),
    ]);
    expect(result.model.rejectedEvidence.map((item) => item.reason)).toEqual(expect.arrayContaining(['MALFORMED_VALUE', 'INVALID_CONFIDENCE', 'UNKNOWN_VARIABLE']));
    expect(result.model.values['system.weatherSeverity']).toMatchObject({value: null, status: 'UNKNOWN'});
  });
});
