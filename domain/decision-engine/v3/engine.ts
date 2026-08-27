import { round, stableHash } from '../math';
import type { CandidateEvaluation } from '../types';
import { buildDecisionAuditV3 } from './audit';
import { evaluateCalibration } from './calibration';
import { evaluateDecisionConfidence } from './confidence';
import { buildCounterfactualV3, analyzeDecisionBoundary } from './counterfactual';
import { DEFAULT_V3_TRAJECTORY_COUNT, FORECAST_HORIZONS } from './config';
import { SimulationBudgetExceededError, simulateCandidateForecast, simulateForecastEnsemble, type CandidateForecastInternal, distributionStats } from './forecast';
import { evaluateGovernanceV3 } from './governance';
import { DEFAULT_ACTIVE_POLICY } from './policyRegistry';
import { evaluateRiskEnvelope, evaluateRobustRisk, rankRobustRisks } from './risk';
import { fuseWorldState } from './worldModel';
import type { ArciCoreV3Evaluation, CandidateForecast, RiskMetricsV3, V3BuildInput } from './types';

const envelopeRank = {SAFE: 0, CAUTION: 1, ABSTAIN: 2, PROHIBITED: 3} as const;

function degradedForecast(evaluation: CandidateEvaluation, trajectoryCount: number): CandidateForecastInternal {
  const loss = evaluation.riskAdjustedScore;
  const stats = distributionStats([loss]);
  const forecast: CandidateForecast = {
    candidateId: evaluation.candidate.id,
    trajectoryCount: 0,
    scenarioCounts: {OPTIMISTIC: 0, NOMINAL: 0, PESSIMISTIC: 0, TAIL_RISK: 0},
    horizonOutcomes: FORECAST_HORIZONS.map((horizon) => ({
      horizon,
      utility: distributionStats([Math.max(0, 1 - loss)]),
      serviceLevel: distributionStats([evaluation.metrics.serviceLevel]),
      delayHours: distributionStats([evaluation.metrics.averageDelayHours]),
      failureProbability: evaluation.constraints.feasible ? 0 : 1,
    })),
    lossDistribution: stats,
    finalOutcome: evaluation.metrics,
  };
  void trajectoryCount;
  return {forecast, trajectories: [], samples:[{outcome:evaluation.metrics,constraintViolations:evaluation.constraints.violations.map(item=>item.code)}], losses: [loss], failures: [!evaluation.constraints.feasible]};
}

function degradedRisk(evaluation: CandidateEvaluation): RiskMetricsV3 {
  const loss = evaluation.riskAdjustedScore;
  return {
    candidateId: evaluation.candidate.id,
    expectedUtility: round(Math.max(0, 1 - loss)),
    worstCaseUtility: round(Math.max(0, 1 - evaluation.uncertainty.worstCase)),
    variance: 0,
    failureProbability: evaluation.uncertainty.probabilityOfSlaBreach,
    constraintViolationProbability: evaluation.constraints.feasible ? 0 : 1,
    tailRiskCvar95: evaluation.uncertainty.p90,
    downsideRisk: 0,
    regret: 0,
    robustness: 0,
    reversibility: 0,
    recoveryCost: evaluation.metrics.operationalCost,
    robustDecisionLoss: round(loss + (evaluation.constraints.feasible ? 0 : 1)),
  };
}

export function buildArciCoreV3(input: V3BuildInput): ArciCoreV3Evaluation {
  const policy = input.options.policy ?? DEFAULT_ACTIVE_POLICY;
  if (policy.status !== 'ACTIVE' && !input.options.allowNonActivePolicy) throw new Error('PRODUCTION_DECISION_REQUIRES_ACTIVE_POLICY');
  const trajectoryCount = Math.max(1, Math.floor(input.options.trajectoryCount ?? DEFAULT_V3_TRAJECTORY_COUNT));
  const {model: worldModel, evidence} = fuseWorldState(input.state, input.options.evidence, input.options.evidenceMode);
  const failures: string[] = [];
  let forecasts: CandidateForecastInternal[];
  let rankedRisks: RiskMetricsV3[];
  try {
    forecasts = simulateForecastEnsemble(
      input.evaluations,
      input.state,
      input.market,
      input.objectiveWeights,
      policy.parameters,
      input.scenario.seed,
      trajectoryCount,
      input.options.maxTrajectoryWorkUnits,
      input.evaluations.find(evaluation=>evaluation.constraints.feasible)?.candidate.id,
    );
    rankedRisks = rankRobustRisks(forecasts.map((forecast, index) => evaluateRobustRisk(input.evaluations[index], forecast, policy.parameters)));
  } catch (error) {
    if (!(error instanceof SimulationBudgetExceededError)) throw error;
    failures.push('SIMULATION_TIMEOUT_FAIL_SAFE');
    forecasts = input.evaluations.map((evaluation) => degradedForecast(evaluation, trajectoryCount));
    rankedRisks = input.evaluations.map(degradedRisk).sort((left, right) => left.robustDecisionLoss - right.robustDecisionLoss || left.candidateId.localeCompare(right.candidateId));
  }
  const envelopes = rankedRisks.map((risk) => evaluateRiskEnvelope(input.evaluations.find((evaluation) => evaluation.candidate.id === risk.candidateId)!, risk, policy.parameters));
  const selectedRisk = rankedRisks.find((risk) => envelopeRank[envelopes.find((item) => item.candidateId === risk.candidateId)!.state] <= envelopeRank.CAUTION) ?? rankedRisks[0];
  const selectedCandidateId = selectedRisk.candidateId;
  const boundaries = failures.length ? [] : analyzeDecisionBoundary(input.state, input.market, input.scenario.seed, selectedCandidateId, policy.parameters, input.evaluations, rankedRisks);
  const confidence = failures.length
    ? {value: 0, evidenceSufficiency: worldModel.evidenceSufficiency, simulationAgreement: 0, decisionMargin: 0, uncertaintyLevel: 1, modelReliability: worldModel.modelReliability, policyStability: 0}
    : evaluateDecisionConfidence(worldModel, selectedCandidateId, rankedRisks, forecasts, boundaries);
  const governance = evaluateGovernanceV3(selectedCandidateId, worldModel, confidence, envelopes, policy.parameters, failures);
  const counterfactual = buildCounterfactualV3(input.evaluations, forecasts, rankedRisks, boundaries, selectedCandidateId);
  const decisionId = `DEC-V3-${stableHash(JSON.stringify({scenario: input.scenario, state: input.stateSnapshotId, policy: policy.version, seed: input.scenario.seed, selectedCandidateId, trajectoryCount})).toUpperCase()}`;
  const trajectorySummary = forecasts.map((forecast) => ({candidateId: forecast.forecast.candidateId, trajectoryCount: forecast.forecast.trajectoryCount, lossDistribution: forecast.forecast.lossDistribution}));
  const audit = buildDecisionAuditV3({
    decisionId,
    scenario: input.scenario,
    state: input.state,
    worldModelSnapshotId: worldModel.snapshotId,
    evidence,
    policyVersion: policy.version,
    policy,
    baseMonteCarloSamples: input.evaluations[0]?.sampleMetrics.length ?? 0,
    trajectoryCount,
    horizons: FORECAST_HORIZONS,
    candidates: input.candidates,
    trajectorySummary,
    riskMetrics: rankedRisks,
    counterfactuals: counterfactual,
    governance,
    confidence,
    selectedCandidate: selectedCandidateId,
  });
  const selectedEvaluation=input.evaluations.find(evaluation=>evaluation.candidate.id===selectedCandidateId)??input.evaluations[0];
  const retainedForecast=forecasts.find((forecast)=>forecast.forecast.candidateId===selectedCandidateId)??forecasts[0];
  const selectedForecast=failures.length||retainedForecast.trajectories.length===trajectoryCount?retainedForecast:simulateCandidateForecast(selectedEvaluation,input.state,input.market,input.objectiveWeights,policy.parameters,input.scenario.seed,trajectoryCount,true);
  const stateHistoryIds = input.stateHistory.map((state) => `STATE-${stableHash(JSON.stringify(state)).toUpperCase()}`);
  return {
    version: 'ARCI_CORE_V3',
    worldModel,
    digitalTwin: {immutableSnapshot: true, snapshotId: input.stateSnapshotId, seed: input.scenario.seed, stateHistoryIds},
    forecast: {
      seed: input.scenario.seed,
      trajectoryCount: selectedForecast.forecast.trajectoryCount,
      scenarioCounts: selectedForecast.forecast.scenarioCounts,
      horizons: FORECAST_HORIZONS,
      candidates: forecasts.map((forecast) => forecast.forecast),
      selectedTrajectories: selectedForecast.trajectories,
    },
    risks: rankedRisks,
    counterfactual,
    confidence,
    riskEnvelopes: envelopes,
    governance,
    policy: {activeVersion: policy.version, shadowVersion: input.options.shadowPolicyVersion ?? null},
    calibration: evaluateCalibration(input.options.calibrationDataset),
    audit,
    failures,
  };
}
