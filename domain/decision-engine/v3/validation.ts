import { clamp, mean, round, stableHash, sum } from '../math';
import type { CommerceNetworkState, ConstraintCode, SimulationMetrics } from '../types';
import type { AttributionCause, CalibrationStatus, CausalAttribution, OutcomeValidationV2, ValidationMetric } from './types';

const metricKeys = ['slaBreaches', 'averageDelayHours', 'p90DelayHours', 'recoveryTimeMinutes', 'operationalCost', 'capacityOverloadMinutes', 'serviceLevel', 'unfulfilledOrders'] as const;

const normalizedError = (expected: number, actual: number) => Math.abs(actual - expected) / Math.max(1, Math.abs(expected), Math.abs(actual));

const operationalUtility = (metrics: SimulationMetrics) => clamp(
  metrics.serviceLevel * 0.5
  + (1 - clamp(metrics.averageDelayHours / 12)) * 0.2
  + (1 - clamp(metrics.recoveryTimeMinutes / 180)) * 0.15
  + (1 - clamp(metrics.operationalCost / 50)) * 0.15,
);

function stateError(expected?: CommerceNetworkState, actual?: CommerceNetworkState) {
  if (!expected || !actual) return 0;
  const sharedNodeIds = Object.keys(expected.nodes).filter((id) => actual.nodes[id]);
  if (!sharedNodeIds.length) return 1;
  return mean(sharedNodeIds.flatMap((id) => {
    const left = expected.nodes[id], right = actual.nodes[id];
    return [
      normalizedError(left.backlog, right.backlog),
      Math.abs(left.serviceLevel - right.serviceLevel),
      Math.abs(left.availableCapacityRatio - right.availableCapacityRatio),
    ];
  }));
}

export interface ValidateOutcomeOptions {
  expectedState?: CommerceNetworkState;
  actualState?: CommerceNetworkState;
  predictedFailureProbability?: number;
  predictedConstraints?: ConstraintCode[];
  actualConstraints?: ConstraintCode[];
  observedReason?: string;
  confidence?: number;
}

export function validateOutcome(
  predicted: SimulationMetrics,
  observed: SimulationMetrics,
  options: ValidateOutcomeOptions = {},
): OutcomeValidationV2 {
  const confidence = clamp(options.confidence ?? 0.8);
  const metrics: ValidationMetric[] = metricKeys.map((metric) => ({
    metric,
    expected: predicted[metric],
    actual: observed[metric],
    delta: round(observed[metric] - predicted[metric]),
    reason: options.observedReason ?? 'Observed outcome compared with the selected trajectory distribution.',
    confidence,
  }));
  const predictionError = mean(metricKeys.map((metric) => normalizedError(predicted[metric], observed[metric])));
  const expectedUtility = operationalUtility(predicted), actualUtility = operationalUtility(observed);
  const utilityError = Math.abs(actualUtility - expectedUtility);
  const predictedConstraints = new Set(options.predictedConstraints ?? []);
  const actualConstraints = new Set(options.actualConstraints ?? []);
  const constraintMismatch = [...new Set([...predictedConstraints, ...actualConstraints])]
    .filter((code) => predictedConstraints.has(code) !== actualConstraints.has(code))
    .sort();
  const observedFailure = observed.serviceLevel < 0.95 ? 1 : 0;
  const calibrationError = Math.abs(clamp(options.predictedFailureProbability ?? 0) - observedFailure);
  const stateTransitionError = stateError(options.expectedState, options.actualState);
  const canonical = JSON.stringify({predicted, observed, options: {...options, expectedState: options.expectedState ? stableHash(JSON.stringify(options.expectedState)) : null, actualState: options.actualState ? stableHash(JSON.stringify(options.actualState)) : null}});
  return {
    validationId: `VAL-${stableHash(canonical).toUpperCase()}`,
    predictionError: round(predictionError),
    stateTransitionError: round(stateTransitionError),
    utilityError: round(utilityError),
    constraintMismatch,
    calibrationError: round(calibrationError),
    metrics,
    passed: predictionError <= 0.15 && stateTransitionError <= 0.15 && utilityError <= 0.12 && constraintMismatch.length === 0,
  };
}

export interface AttributionContext {
  externalEventObserved: boolean;
  evidenceConflict: boolean;
  executionCompleted: boolean;
  policyWithinBounds: boolean;
  calibrationStatus: CalibrationStatus;
  evidence: string[];
}

export function attributeOutcome(validation: OutcomeValidationV2, context: AttributionContext): CausalAttribution {
  const raw = {
    CANDIDATE_ACTION: validation.passed ? 0.7 : Math.max(0.05, 0.25 - validation.predictionError),
    EXTERNAL_EVENT: context.externalEventObserved ? 0.75 : 0.05,
    DATA_ERROR: context.evidenceConflict ? 0.7 : 0.05,
    MODEL_ERROR: clamp(validation.predictionError + validation.stateTransitionError + (context.calibrationStatus === 'UNCALIBRATED' ? 0.18 : 0.04)),
    POLICY_ERROR: context.policyWithinBounds ? clamp(validation.utilityError * 1.5) : 0.65,
    EXECUTION_FAILURE: context.executionCompleted ? 0.03 : 0.9,
  };
  const total = Math.max(0.0001, sum(Object.values(raw)));
  const contributions = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, round(value / total)])) as CausalAttribution['contributions'];
  const ranked = Object.entries(contributions).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])) as Array<[Exclude<AttributionCause, 'ATTRIBUTION_UNCERTAIN'>, number]>;
  const confidence = clamp(ranked[0][1] - ranked[1][1] + 0.45 - (context.calibrationStatus === 'UNCALIBRATED' ? 0.15 : 0));
  const primaryCause: AttributionCause = confidence < 0.55 ? 'ATTRIBUTION_UNCERTAIN' : ranked[0][0];
  return {
    attributionId: `ATTR-${stableHash(`${validation.validationId}:${JSON.stringify(context)}:${JSON.stringify(contributions)}`).toUpperCase()}`,
    boundedOperationalAttribution: true,
    primaryCause,
    contributions,
    confidence: round(confidence),
    evidence: [...new Set([validation.validationId, ...context.evidence])].sort(),
  };
}
