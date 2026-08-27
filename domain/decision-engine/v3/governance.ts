import type { DecisionConfidenceV3, GovernanceV3, PolicyParametersV3, ProbabilisticWorldModel, RiskEnvelopeEvaluation } from './types';

const envelopeRank = {SAFE: 0, CAUTION: 1, ABSTAIN: 2, PROHIBITED: 3} as const;

export function evaluateGovernanceV3(
  selectedCandidateId: string,
  worldModel: ProbabilisticWorldModel,
  confidence: DecisionConfidenceV3,
  envelopes: RiskEnvelopeEvaluation[],
  policy: PolicyParametersV3,
  failures: string[] = [],
): GovernanceV3 {
  const selectedEnvelope = envelopes.find((item) => item.candidateId === selectedCandidateId) ?? {state: 'PROHIBITED' as const};
  const vetoedCandidateIds = envelopes.filter((item) => envelopeRank[item.state] >= envelopeRank.ABSTAIN).map((item) => item.candidateId).sort();
  const reasonCodes: string[] = [];
  let autonomyLevel: GovernanceV3['autonomyLevel'] = 'AUTONOMOUS_DECISION';
  const unknownRatio = worldModel.missingVariables.length / Math.max(1, Object.keys(worldModel.values).length);
  if (failures.length) {
    autonomyLevel = 'ABSTAIN';
    reasonCodes.push(...failures);
  } else if (envelopes.every((item) => item.state === 'PROHIBITED')) {
    autonomyLevel = 'ABSTAIN';
    reasonCodes.push('ALL_CANDIDATES_VIOLATE_CONSTRAINTS');
  } else if (selectedEnvelope.state === 'PROHIBITED' || selectedEnvelope.state === 'ABSTAIN') {
    autonomyLevel = 'ABSTAIN';
    reasonCodes.push('SELECTED_OUTSIDE_RISK_ENVELOPE');
  } else if (unknownRatio > 0.25) {
    autonomyLevel = 'HUMAN_REVIEW_REQUIRED';
    reasonCodes.push('UNKNOWN_WORLD_STATE');
  } else if (worldModel.evidenceSufficiency < 0.35) {
    autonomyLevel = 'HUMAN_REVIEW_REQUIRED';
    reasonCodes.push('EVIDENCE_INSUFFICIENT');
  } else if (worldModel.disagreement > 0.35) {
    autonomyLevel = 'HUMAN_REVIEW_REQUIRED';
    reasonCodes.push('EVIDENCE_DISAGREEMENT_HIGH');
  } else if (confidence.value < policy.confidenceThresholds.humanReview) {
    autonomyLevel = 'ABSTAIN';
    reasonCodes.push('DECISION_CONFIDENCE_CRITICALLY_LOW');
  } else if (confidence.value < policy.confidenceThresholds.autonomous || confidence.policyStability < 0.35) {
    autonomyLevel = 'HUMAN_REVIEW_REQUIRED';
    reasonCodes.push(confidence.policyStability < 0.35 ? 'UNSTABLE_POLICY_RANKING' : 'DECISION_CONFIDENCE_LOW');
  } else if (selectedEnvelope.state === 'CAUTION') {
    autonomyLevel = 'AUTONOMOUS_WITH_WARNING';
    reasonCodes.push('RISK_ENVELOPE_CAUTION');
  } else {
    reasonCodes.push('DETERMINISTIC_GOVERNANCE_PASS');
  }
  return {
    autonomyLevel,
    riskEnvelope: selectedEnvelope.state,
    executionAuthorized: autonomyLevel === 'AUTONOMOUS_DECISION' || autonomyLevel === 'AUTONOMOUS_WITH_WARNING',
    reasonCodes: [...new Set(reasonCodes)],
    vetoedCandidateIds,
  };
}
