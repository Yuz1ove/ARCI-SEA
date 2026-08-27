import { generateCandidatePolicies } from '../candidates';
import { evaluateConstraints } from '../constraints';
import { clamp, mean, round } from '../math';
import { evaluateCandidate, markParetoOptimal } from '../monteCarlo';
import { deriveAdaptiveWeights } from '../objective';
import { generateDisturbances } from '../random';
import { cloneCommerceState } from '../state';
import type { CandidateEvaluation, CommerceNetworkState, MarketConfig } from '../types';
import type { CandidateForecastInternal } from './forecast';
import type { CounterfactualV3, DecisionBoundaryVariable, PolicyParametersV3, RiskMetricsV3 } from './types';

function baselineVariable(state: CommerceNetworkState, variable: DecisionBoundaryVariable['variable']) {
  if (variable === 'demandMultiplier') return state.demandMultiplier;
  if (variable === 'weatherSeverity') return state.weatherSeverity;
  if (variable === 'trafficSeverity') return state.trafficSeverity;
  return mean(Object.values(state.edges).map((edge) => edge.currentCapacityRatio));
}

function variableRange(variable: DecisionBoundaryVariable['variable']): readonly [number, number] {
  return variable === 'demandMultiplier' ? [0.7, 1.8] : variable === 'networkAvailability' ? [0.2, 1] : [0, 1];
}

function perturbState(state: CommerceNetworkState, variable: DecisionBoundaryVariable['variable'], value: number) {
  const next = cloneCommerceState(state);
  if (variable === 'demandMultiplier') next.demandMultiplier = value;
  if (variable === 'weatherSeverity') {
    next.weatherSeverity = value;
    for (const node of Object.values(next.nodes)) node.currentWeatherRisk = clamp(value * node.weatherExposure);
  }
  if (variable === 'trafficSeverity') {
    next.trafficSeverity = value;
    for (const node of Object.values(next.nodes)) node.currentTrafficRisk = clamp(value * node.trafficExposure);
  }
  if (variable === 'networkAvailability') {
    const currentAverage = Math.max(0.001, mean(Object.values(next.edges).map((edge) => edge.currentCapacityRatio)));
    const factor = value / currentAverage;
    for (const edge of Object.values(next.edges)) {
      edge.currentCapacityRatio = clamp(edge.currentCapacityRatio * factor);
      edge.available = edge.currentCapacityRatio > 0.08;
    }
  }
  return next;
}

function selectAtState(state: CommerceNetworkState, market: MarketConfig, seed: string, baselineEvaluations: CandidateEvaluation[], baselineRisks: RiskMetricsV3[]) {
  const weights = deriveAdaptiveWeights(state, market);
  const candidates = generateCandidatePolicies(state, market);
  const disturbances = generateDisturbances(`${seed}:boundary`, 4);
  const evaluations = markParetoOptimal(candidates.map((candidate) => evaluateCandidate(candidate, evaluateConstraints(candidate, state, market), state, market, weights, disturbances)));
  const adjusted = baselineRisks.map((risk) => {
    const current = evaluations.find((item) => item.candidate.id === risk.candidateId);
    const baseline = baselineEvaluations.find((item) => item.candidate.id === risk.candidateId);
    return {
      candidateId: risk.candidateId,
      feasible: Boolean(current?.constraints.feasible),
      score: risk.robustDecisionLoss + (current?.riskAdjustedScore ?? 1) - (baseline?.riskAdjustedScore ?? 1),
    };
  }).sort((left, right) => Number(right.feasible) - Number(left.feasible) || left.score - right.score || left.candidateId.localeCompare(right.candidateId));
  return adjusted[0];
}

function grid(minimum: number, maximum: number, points = 7) {
  return Array.from({length: points}, (_, index) => round(minimum + (maximum - minimum) * index / (points - 1), 4));
}

export function analyzeDecisionBoundary(
  state: CommerceNetworkState,
  market: MarketConfig,
  seed: string,
  selectedCandidateId: string,
  policy: PolicyParametersV3,
  baselineEvaluations: CandidateEvaluation[],
  baselineRisks: RiskMetricsV3[],
): DecisionBoundaryVariable[] {
  void policy;
  const variables: DecisionBoundaryVariable['variable'][] = ['demandMultiplier', 'weatherSeverity', 'trafficSeverity', 'networkAvailability'];
  return variables.map((variable) => {
    const baseline = baselineVariable(state, variable);
    const [minimum, maximum] = variableRange(variable);
    const candidates = grid(minimum, maximum)
      .filter((value) => Math.abs(value - baseline) > 0.0001)
      .sort((left, right) => Math.abs(left - baseline) - Math.abs(right - baseline) || left - right);
    let threshold: number | null = null;
    let selectedAtThreshold: string | null = null;
    for (const value of candidates) {
      const winner = selectAtState(perturbState(state, variable, value), market, seed, baselineEvaluations, baselineRisks);
      if (winner.candidateId !== selectedCandidateId) {
        threshold = value;
        selectedAtThreshold = winner.candidateId;
        break;
      }
    }
    const normalizedDistance = threshold === null ? 1 : clamp(Math.abs(threshold - baseline) / Math.max(0.0001, maximum - minimum));
    return {
      variable,
      baseline: round(baseline),
      threshold,
      selectedAtThreshold,
      normalizedDistance: round(normalizedDistance),
      rankingImpact: round(threshold === null ? 0 : 1 - normalizedDistance),
    };
  }).sort((left, right) => right.rankingImpact - left.rankingImpact || left.variable.localeCompare(right.variable));
}

export function buildCounterfactualV3(
  evaluations: CandidateEvaluation[],
  forecasts: CandidateForecastInternal[],
  rankedRisks: RiskMetricsV3[],
  boundaries: DecisionBoundaryVariable[],
  selectedCandidateId: string,
): CounterfactualV3 {
  const selectedRisk = rankedRisks.find((item) => item.candidateId === selectedCandidateId) ?? rankedRisks[0];
  const runnerUpRisk = rankedRisks.find((item) => item.candidateId !== selectedCandidateId) ?? selectedRisk;
  const noActionRisk = rankedRisks.find((item) => item.candidateId === 'keep-current') ?? rankedRisks.at(-1)!;
  const publicForecast = (candidateId: string) => forecasts.find((item) => item.forecast.candidateId === candidateId)!.forecast;
  return {
    noActionCandidateId: noActionRisk.candidateId,
    noAction: publicForecast(noActionRisk.candidateId),
    runnerUpCandidateId: runnerUpRisk.candidateId,
    runnerUp: publicForecast(runnerUpRisk.candidateId),
    selectedCandidateId,
    selected: publicForecast(selectedCandidateId),
    candidateComparisons: evaluations.map((evaluation) => ({
      candidateId: evaluation.candidate.id,
      forecast: publicForecast(evaluation.candidate.id),
      risk: rankedRisks.find((item) => item.candidateId === evaluation.candidate.id)!,
    })),
    decisionMargin: round(Math.max(0, runnerUpRisk.robustDecisionLoss - selectedRisk.robustDecisionLoss)),
    decisionBoundary: boundaries,
    criticalVariables: boundaries.filter((item) => item.threshold !== null).slice(0, 3),
  };
}
