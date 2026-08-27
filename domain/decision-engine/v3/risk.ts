import { clamp, mean, quantile, round } from '../math';
import type { CandidateEvaluation } from '../types';
import type { CandidateForecastInternal } from './forecast';
import type { PolicyParametersV3, RiskEnvelopeEvaluation, RiskMetricsV3 } from './types';

const tailMean = (losses: number[], probability = 0.95) => {
  const threshold = quantile(losses, probability);
  const tail = losses.filter((loss) => loss >= threshold);
  return mean(tail.length ? tail : [threshold]);
};

function reversibility(evaluation: CandidateEvaluation) {
  const actionPenalty = evaluation.candidate.actions.reduce((penalty, action) => {
    if (action.type === 'KEEP_CURRENT_POLICY') return penalty;
    if (action.type === 'TEMPORARY_HOLD') return penalty + 0.04;
    if (action.type === 'CAPACITY_RESERVATION' || action.type === 'ORDER_PRIORITIZATION') return penalty + 0.025;
    if (action.type === 'REROUTE' || action.type === 'CARRIER_MODE_SWITCH') return penalty + 0.07;
    return penalty + 0.11;
  }, 0);
  return clamp(1 - evaluation.candidate.switchingMagnitude * 0.7 - actionPenalty);
}

export function evaluateRobustRisk(
  evaluation: CandidateEvaluation,
  internal: CandidateForecastInternal,
  policy: PolicyParametersV3,
): RiskMetricsV3 {
  const losses = internal.losses;
  const expectedLoss = mean(losses);
  const variance = mean(losses.map((loss) => (loss - expectedLoss) ** 2));
  const cvar95 = tailMean(losses);
  const failureProbability = internal.failures.filter(Boolean).length / Math.max(1, internal.failures.length);
  const constraintViolationProbability = evaluation.constraints.feasible
    ? internal.samples.filter((sample) => sample.constraintViolations.length > 0).length / Math.max(1, internal.samples.length)
    : 1;
  const downsideRisk = mean(losses.map((loss) => Math.max(0, loss - expectedLoss)));
  const reversible = reversibility(evaluation);
  const recoveryCost = mean(internal.samples.map((sample) => sample.outcome.operationalCost + sample.outcome.recoveryTimeMinutes / 60));
  const normalizedRecoveryCost = clamp(recoveryCost / 50);
  const weights = policy.riskWeights;
  const robustDecisionLoss = expectedLoss * weights.expectedLoss
    + cvar95 * weights.cvar95
    + Math.sqrt(variance) * weights.variance
    + failureProbability * weights.failureProbability
    + constraintViolationProbability * weights.constraintViolation
    + (1 - reversible) * weights.irreversibility
    + normalizedRecoveryCost * weights.recoveryCost;
  const robustness = clamp(1 - (cvar95 * 0.5 + Math.sqrt(variance) * 0.2 + failureProbability * 0.2 + constraintViolationProbability * 0.1));
  return {
    candidateId: evaluation.candidate.id,
    expectedUtility: round(clamp(1 - expectedLoss)),
    worstCaseUtility: round(clamp(1 - Math.max(...losses))),
    variance: round(variance),
    failureProbability: round(failureProbability),
    constraintViolationProbability: round(constraintViolationProbability),
    tailRiskCvar95: round(cvar95),
    downsideRisk: round(downsideRisk),
    regret: 0,
    robustness: round(robustness),
    reversibility: round(reversible),
    recoveryCost: round(recoveryCost, 2),
    robustDecisionLoss: round(robustDecisionLoss),
  };
}

export function rankRobustRisks(risks: RiskMetricsV3[]): RiskMetricsV3[] {
  const bestExpectedUtility = Math.max(...risks.map((risk) => risk.expectedUtility));
  return risks.map((risk) => {
    const regret = Math.max(0, bestExpectedUtility - risk.expectedUtility);
    return {...risk, regret: round(regret), robustDecisionLoss: round(risk.robustDecisionLoss + regret * 0.05)};
  }).sort((left, right) => left.robustDecisionLoss - right.robustDecisionLoss || left.candidateId.localeCompare(right.candidateId));
}

export function evaluateRiskEnvelope(
  evaluation: CandidateEvaluation,
  risk: RiskMetricsV3,
  policy: PolicyParametersV3,
): RiskEnvelopeEvaluation {
  const limits = {
    maximumFailureProbability: policy.riskEnvelope.abstainFailureProbability,
    maximumTailRisk: policy.riskEnvelope.abstainTailRisk,
    minimumRobustness: policy.riskEnvelope.minimumRobustness,
  };
  const reasons: string[] = [];
  let state: RiskEnvelopeEvaluation['state'] = 'SAFE';
  if (!evaluation.constraints.feasible || risk.constraintViolationProbability >= policy.riskEnvelope.prohibitedConstraintProbability) {
    state = 'PROHIBITED';
    reasons.push('HARD_CONSTRAINT_OR_PROBABLE_VIOLATION');
  } else if (risk.failureProbability >= policy.riskEnvelope.abstainFailureProbability || risk.tailRiskCvar95 >= policy.riskEnvelope.abstainTailRisk || risk.robustness < policy.riskEnvelope.minimumRobustness) {
    state = 'ABSTAIN';
    reasons.push('CATASTROPHIC_DOWNSIDE_BOUNDARY');
  } else if (risk.failureProbability >= policy.riskEnvelope.cautionFailureProbability || risk.tailRiskCvar95 >= policy.riskEnvelope.cautionTailRisk) {
    state = 'CAUTION';
    reasons.push('WARNING_REGION');
  }
  if (!reasons.length) reasons.push('WITHIN_ALLOWED_OPERATING_REGION');
  return {candidateId: evaluation.candidate.id, state, reasons, limits};
}
