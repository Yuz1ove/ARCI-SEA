import type { ForecastHorizon, PolicyParametersV3 } from './types';

export const FORECAST_HORIZONS: ForecastHorizon[] = [
  {name: 'IMMEDIATE', minutes: 5, utilityWeight: 0.45, riskWeight: 0.25, recoveryWeight: 0.10},
  {name: 'STABILIZATION', minutes: 30, utilityWeight: 0.30, riskWeight: 0.35, recoveryWeight: 0.20},
  {name: 'RECOVERY', minutes: 120, utilityWeight: 0.18, riskWeight: 0.25, recoveryWeight: 0.35},
  {name: 'LONG_TERM_RESILIENCE', minutes: 1440, utilityWeight: 0.07, riskWeight: 0.15, recoveryWeight: 0.35},
];

export const DEFAULT_V3_TRAJECTORY_COUNT = 500;

export const DEFAULT_V3_POLICY_PARAMETERS: PolicyParametersV3 = {
  riskWeights: {
    expectedLoss: 0.30,
    cvar95: 0.22,
    variance: 0.08,
    failureProbability: 0.14,
    constraintViolation: 0.12,
    irreversibility: 0.06,
    recoveryCost: 0.08,
  },
  confidenceThresholds: {autonomous: 0.52, humanReview: 0.34},
  riskEnvelope: {
    cautionFailureProbability: 0.16,
    abstainFailureProbability: 0.45,
    prohibitedConstraintProbability: 0.5,
    cautionTailRisk: 0.58,
    abstainTailRisk: 0.82,
    minimumRobustness: 0.34,
  },
  horizonWeights: {
    IMMEDIATE: 0.20,
    STABILIZATION: 0.30,
    RECOVERY: 0.30,
    LONG_TERM_RESILIENCE: 0.20,
  },
};
