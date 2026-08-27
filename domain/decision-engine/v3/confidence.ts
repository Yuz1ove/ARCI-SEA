import { clamp, mean, round } from '../math';
import type { CandidateForecastInternal } from './forecast';
import type { DecisionBoundaryVariable, DecisionConfidenceV3, ProbabilisticWorldModel, RiskMetricsV3 } from './types';

export function evaluateDecisionConfidence(
  worldModel: ProbabilisticWorldModel,
  selectedCandidateId: string,
  rankedRisks: RiskMetricsV3[],
  forecasts: CandidateForecastInternal[],
  boundaries: DecisionBoundaryVariable[],
): DecisionConfidenceV3 {
  const selected = rankedRisks.find((risk) => risk.candidateId === selectedCandidateId) ?? rankedRisks[0];
  const runnerUp = rankedRisks.find((risk) => risk.candidateId !== selectedCandidateId) ?? selected;
  const rawMargin = Math.max(0, runnerUp.robustDecisionLoss - selected.robustDecisionLoss);
  const decisionMargin = clamp(rawMargin / 0.15);
  const selectedForecast = forecasts.find((item) => item.forecast.candidateId === selectedCandidateId) ?? forecasts[0];
  let selectedWins = 0;
  for (let index = 0; index < selectedForecast.losses.length; index++) {
    const winner = forecasts
      .map((forecast) => ({candidateId: forecast.forecast.candidateId, loss: forecast.losses[index] ?? Number.POSITIVE_INFINITY}))
      .sort((left, right) => left.loss - right.loss || left.candidateId.localeCompare(right.candidateId))[0];
    if (winner?.candidateId === selectedCandidateId) selectedWins += 1;
  }
  const simulationAgreement = clamp(selectedWins / Math.max(1, selectedForecast.losses.length));
  const importantValues = Object.entries(worldModel.values)
    .filter(([key]) => key.startsWith('system.') || key.endsWith('.availableCapacityRatio') || key.endsWith('.capacityRatio'))
    .map(([, value]) => value);
  const uncertaintyLevel = clamp(mean(importantValues.map((value) => value.uncertainty)) + Math.sqrt(selected.variance) * 0.25);
  const finiteDistances = boundaries.filter((boundary) => boundary.threshold !== null).map((boundary) => boundary.normalizedDistance);
  const policyStability = finiteDistances.length ? clamp(Math.min(...finiteDistances) * 2) : 1;
  const value = worldModel.evidenceSufficiency * 0.25
    + simulationAgreement * 0.22
    + decisionMargin * 0.18
    + (1 - uncertaintyLevel) * 0.15
    + worldModel.modelReliability * 0.10
    + policyStability * 0.10;
  return {
    value: round(clamp(value)),
    evidenceSufficiency: round(worldModel.evidenceSufficiency),
    simulationAgreement: round(simulationAgreement),
    decisionMargin: round(decisionMargin),
    uncertaintyLevel: round(uncertaintyLevel),
    modelReliability: round(worldModel.modelReliability),
    policyStability: round(policyStability),
  };
}
