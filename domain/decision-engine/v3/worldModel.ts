import { clamp, mean, round, stableHash } from '../math';
import type { CommerceNetworkState } from '../types';
import type { EvidenceObservation, ProbabilisticValue, ProbabilisticWorldModel } from './types';

const FRESHNESS_HALF_LIFE_MS = 5 * 60 * 1000;
const STALE_AFTER_MS = 30 * 60 * 1000;

export function worldVariableKeys(state: CommerceNetworkState): string[] {
  return [
    'system.demandMultiplier',
    'system.weatherSeverity',
    'system.trafficSeverity',
    'system.slaPressure',
    ...Object.values(state.nodes).flatMap((node) => [
      `node.${node.id}.availableCapacityRatio`,
      `node.${node.id}.serviceLevel`,
      `node.${node.id}.weatherRisk`,
      `node.${node.id}.trafficRisk`,
      `node.${node.id}.carrier.road`,
      `node.${node.id}.carrier.air`,
      `node.${node.id}.carrier.sea`,
    ]),
    ...Object.values(state.edges).flatMap((edge) => [
      `edge.${edge.id}.capacityRatio`,
      `edge.${edge.id}.disruptionProbability`,
      `edge.${edge.id}.available`,
    ]),
  ];
}

function stateValue(state: CommerceNetworkState, variable: string): number | null {
  if (variable === 'system.demandMultiplier') return state.demandMultiplier;
  if (variable === 'system.weatherSeverity') return state.weatherSeverity;
  if (variable === 'system.trafficSeverity') return state.trafficSeverity;
  if (variable === 'system.slaPressure') return state.slaPressure;
  const parts = variable.split('.');
  if (parts[0] === 'node') {
    const node = state.nodes[parts[1]];
    if (!node) return null;
    if (parts[2] === 'availableCapacityRatio') return node.availableCapacityRatio;
    if (parts[2] === 'serviceLevel') return node.serviceLevel;
    if (parts[2] === 'weatherRisk') return node.currentWeatherRisk;
    if (parts[2] === 'trafficRisk') return node.currentTrafficRisk;
    if (parts[2] === 'carrier' && ['road', 'air', 'sea'].includes(parts[3])) return node.carrierAvailability[parts[3] as 'road' | 'air' | 'sea'];
  }
  if (parts[0] === 'edge') {
    const edge = state.edges[parts[1]];
    if (!edge) return null;
    if (parts[2] === 'capacityRatio') return edge.currentCapacityRatio;
    if (parts[2] === 'disruptionProbability') return edge.disruptionProbability;
    if (parts[2] === 'available') return edge.available ? 1 : 0;
  }
  return null;
}

export function evidenceFromDeterministicState(state: CommerceNetworkState): EvidenceObservation[] {
  return worldVariableKeys(state).flatMap((variable): EvidenceObservation[] => {
    const value = stateValue(state, variable);
    if (value === null) return [];
    const evidenceId = `EVD-${stableHash(`${state.seed}:${state.timeMinutes}:${variable}:${value}`).toUpperCase()}`;
    return [{
      evidenceId,
      variable,
      value,
      confidence: 0.98,
      observedAtMinute: state.timeMinutes,
      sourceReliability: 0.96,
      sourceId: 'scenario-state-engine',
      sourceGroup: 'scenario-state-engine',
      provenanceId: `PROV-${state.seed}`,
    }];
  });
}

function validEvidence(item: EvidenceObservation): string | null {
  if (!item.evidenceId || !item.sourceId || !item.sourceGroup || !item.provenanceId) return 'MISSING_IDENTITY';
  if (typeof item.value !== 'number' || !Number.isFinite(item.value)) return 'MALFORMED_VALUE';
  if (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) return 'INVALID_CONFIDENCE';
  if (!Number.isFinite(item.sourceReliability) || item.sourceReliability < 0 || item.sourceReliability > 1) return 'INVALID_SOURCE_RELIABILITY';
  if (!Number.isFinite(item.observedAtMinute) || item.observedAtMinute < 0) return 'INVALID_TIMESTAMP';
  return null;
}

function fuseVariable(variable: string, evidence: EvidenceObservation[], nowMinute: number): ProbabilisticValue<number> {
  if (!evidence.length) {
    return {value: null, confidence: 0, uncertainty: 1, freshnessMs: Number.MAX_SAFE_INTEGER, sourceReliability: 0, observedAt: 'UNKNOWN', provenanceIds: [], agreement: 0, evidenceCount: 0, status: 'UNKNOWN'};
  }
  const groupCounts = new Map<string, number>();
  for (const item of evidence) groupCounts.set(item.sourceGroup, (groupCounts.get(item.sourceGroup) ?? 0) + 1);
  const weighted = evidence.map((item) => {
    const freshnessMs = Math.max(0, nowMinute - item.observedAtMinute) * 60_000;
    const freshnessWeight = 1 / (1 + freshnessMs / FRESHNESS_HALF_LIFE_MS);
    const independenceWeight = 1 / Math.sqrt(groupCounts.get(item.sourceGroup) ?? 1);
    const weight = item.confidence * item.sourceReliability * freshnessWeight * independenceWeight;
    return {item, freshnessMs, freshnessWeight, weight};
  });
  const totalWeight = weighted.reduce((total, item) => total + item.weight, 0);
  const fused = totalWeight === 0 ? mean(evidence.map((item) => Number(item.value))) : weighted.reduce((total, item) => total + Number(item.item.value) * item.weight, 0) / totalWeight;
  const scale = Math.max(1, Math.abs(fused), ...evidence.map((item) => Math.abs(Number(item.value))));
  const disagreement = weighted.reduce((total, item) => total + Math.abs(Number(item.item.value) - fused) / scale * item.weight, 0) / Math.max(0.0001, totalWeight);
  const agreement = clamp(1 - disagreement * 2);
  const baseConfidence = weighted.reduce((total, item) => total + item.item.confidence * item.item.sourceReliability * item.freshnessWeight * item.weight, 0) / Math.max(0.0001, totalWeight);
  const uniqueSources = new Set(evidence.map((item) => item.sourceId)).size;
  const sourceCoverage = clamp(0.78 + Math.sqrt(uniqueSources) * 0.14);
  const confidence = clamp(baseConfidence * agreement * sourceCoverage);
  const freshnessMs = Math.round(weighted.reduce((total, item) => total + item.freshnessMs * item.weight, 0) / Math.max(0.0001, totalWeight));
  const reliability = weighted.reduce((total, item) => total + item.item.sourceReliability * item.weight, 0) / Math.max(0.0001, totalWeight);
  const status = disagreement > 0.25 ? 'CONFLICTED'
    : freshnessMs > STALE_AFTER_MS ? 'STALE'
      : confidence < 0.5 ? 'LOW_CONFIDENCE'
        : 'OBSERVED';
  return {
    value: round(fused, 6),
    confidence: round(confidence),
    uncertainty: round(clamp(1 - confidence + disagreement * 0.25)),
    freshnessMs,
    sourceReliability: round(reliability),
    observedAt: `T+${Math.max(...evidence.map((item) => item.observedAtMinute))}m`,
    provenanceIds: [...new Set(evidence.map((item) => item.provenanceId))].sort(),
    agreement: round(agreement),
    evidenceCount: evidence.length,
    status,
  };
}

export function fuseWorldState(
  state: CommerceNetworkState,
  suppliedEvidence: EvidenceObservation[] = [],
  mode: 'AUGMENT' | 'REPLACE' = 'AUGMENT',
): { model: ProbabilisticWorldModel; evidence: EvidenceObservation[] } {
  const requiredVariables = worldVariableKeys(state);
  const suppliedVariables = new Set(suppliedEvidence.map((item) => item.variable));
  const defaultEvidence = mode === 'REPLACE'
    ? []
    : evidenceFromDeterministicState(state).filter((item) => !suppliedVariables.has(item.variable));
  const combined = [...defaultEvidence, ...suppliedEvidence];
  const rejectedEvidence: Array<{ evidenceId: string; reason: string }> = [];
  const valid = combined.filter((item) => {
    const reason = validEvidence(item);
    if (reason) rejectedEvidence.push({evidenceId: item.evidenceId || 'UNKNOWN', reason});
    return !reason && requiredVariables.includes(item.variable);
  });
  for (const item of combined) {
    if (!requiredVariables.includes(item.variable)) rejectedEvidence.push({evidenceId: item.evidenceId || 'UNKNOWN', reason: 'UNKNOWN_VARIABLE'});
  }
  const values = Object.fromEntries(requiredVariables.map((variable) => [
    variable,
    fuseVariable(variable, valid.filter((item) => item.variable === variable), state.timeMinutes),
  ]));
  const missingVariables = requiredVariables.filter((variable) => values[variable].status === 'UNKNOWN');
  const conflicts = requiredVariables
    .filter((variable) => values[variable].status === 'CONFLICTED')
    .map((variable) => ({
      variable,
      evidenceIds: valid.filter((item) => item.variable === variable).map((item) => item.evidenceId).sort(),
      disagreement: round(1 - values[variable].agreement),
    }));
  const important = requiredVariables.filter((key) => key.startsWith('system.') || key.endsWith('.availableCapacityRatio') || key.endsWith('.capacityRatio'));
  const evidenceSufficiency = round(mean(important.map((variable) => values[variable].confidence)));
  const disagreement = round(mean(important.map((variable) => 1 - values[variable].agreement)));
  const modelReliability = round(mean(important.map((variable) => values[variable].sourceReliability * values[variable].agreement)));
  const canonical = JSON.stringify({values, conflicts, rejectedEvidence: [...rejectedEvidence].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)), missingVariables});
  return {
    evidence: valid,
    model: {
      snapshotId: `PWM-${stableHash(canonical).toUpperCase()}`,
      values,
      evidenceIds: valid.map((item) => item.evidenceId).sort(),
      conflicts,
      rejectedEvidence: [...rejectedEvidence].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)),
      missingVariables,
      evidenceSufficiency,
      disagreement,
      modelReliability,
    },
  };
}
