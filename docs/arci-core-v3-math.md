# ARCI Core V3 — Implemented Mathematics

This document lists only formulas implemented in `domain/decision-engine/v3/`. All loss values are dimensionless after normalization unless a unit is stated.

## Evidence fusion

For evidence item `i`:

```text
freshnessWeight_i = 1 / (1 + freshnessMs_i / 300000)
independenceWeight_i = 1 / sqrt(itemsInSourceGroup_i)
weight_i = confidence_i × reliability_i × freshnessWeight_i × independenceWeight_i
fusedValue = Σ(value_i × weight_i) / Σ(weight_i)
```

Agreement uses the weighted absolute deviation from the fused value:

```text
scale = max(1, |fusedValue|, |value_1|, …)
disagreement = Σ(|value_i - fusedValue| / scale × weight_i) / Σ(weight_i)
agreement = clamp(1 - 2 × disagreement, 0, 1)
```

Confidence is the reliability/freshness-weighted source confidence multiplied by agreement and bounded source coverage. Uncertainty is `clamp(1 - confidence + 0.25 × disagreement, 0, 1)`. Missing evidence has value `null`, confidence `0`, and uncertainty `1`. Freshness is in milliseconds; scenario timestamps are in minutes.

## Forecast horizon transition

T+5 minutes uses `simulatePolicy(...)`. Later horizons use the previous outcome and the transitioned state:

```text
load = totalDemand / totalAvailableCapacity
stepScale = clamp(log(1 + deltaMinutes) / log(1441), 0.08, 1)
intervention = clamp(switchingMagnitude + 0.025 × nonNoopActionCount)
shock = clamp(0.35 × positiveDemandShock
            + 0.25 × positiveTransitShock
            + 0.40 × carrierShortfall)
```

Scenario persistence is `0.62` optimistic, `0.76` nominal, `0.90` pessimistic, and `0.97` tail risk. Service, delay, unfulfilled orders, breaches, recovery time, overload time, and cost are updated from the previous horizon with the implemented load, persistence, intervention, and shock terms. Values are clamped to their physical prototype ranges. The resulting metrics update backlog, service level, capacity ratio, weather risk, traffic risk, inventory transfers, and carrier mode in the isolated twin before the next horizon.

These coefficients are explicit prototype simulation assumptions, not measured operational parameters.

## Horizon loss

The existing V2 normalized objective loss is reused:

```text
baseLoss_h = Σ(objectiveWeight_j × normalizedLoss_j,h)
horizonLoss_h = (baseLoss_h
               + serviceFailurePenalty_h
               + recoveryPenalty_h)
               × configuredHorizonWeight_h
trajectoryLoss = Σ horizonLoss_h
trajectoryUtility = clamp(1 - trajectoryLoss, 0, 1)
```

Configured horizon weights are `0.20`, `0.30`, `0.30`, and `0.20` for 5 minutes, 30 minutes, 2 hours, and 24 hours. Their sum is one.

## Distribution and tail risk

For trajectory losses `L`:

```text
expectedLoss = mean(L)
variance = mean((L - expectedLoss)^2)
CVaR95 = mean(L where L >= quantile(L, 0.95))
downsideRisk = mean(max(0, L - expectedLoss))
failureProbability = failedTrajectoryCount / trajectoryCount
constraintViolationProbability = violatingTrajectoryCount / trajectoryCount
```

`worstCaseUtility = clamp(1 - max(L), 0, 1)`. Regret is the gap between the candidate’s expected utility and the maximum candidate expected utility.

## Reversibility and recovery cost

Reversibility starts at one and subtracts `0.7 × switchingMagnitude` plus explicit per-action penalties. Holds, reservations, and prioritization have smaller penalties than reroutes/mode switches; inventory rebalance has the largest action penalty. The result is clamped to `[0,1]`.

```text
recoveryCost = mean(terminalOperationalCost + terminalRecoveryMinutes / 60)
normalizedRecoveryCost = clamp(recoveryCost / 50, 0, 1)
```

## Robust decision loss

Lower is better:

```text
robustDecisionLoss =
    0.30 × expectedLoss
  + 0.22 × CVaR95
  + 0.08 × sqrt(variance)
  + 0.14 × failureProbability
  + 0.12 × constraintViolationProbability
  + 0.06 × (1 - reversibility)
  + 0.08 × normalizedRecoveryCost
  + 0.05 × regret
```

The weights are stored in the active policy and must sum to one before an offline policy proposal may enter shadow status.

Robustness is an independent diagnostic:

```text
robustness = clamp(1
  - (0.50 × CVaR95
   + 0.20 × sqrt(variance)
   + 0.20 × failureProbability
   + 0.10 × constraintViolationProbability), 0, 1)
```

## Decision confidence

```text
margin = clamp((runnerUpLoss - selectedLoss) / 0.15, 0, 1)
simulationAgreement = trajectoriesWhereSelectedWins / trajectoryCount
uncertaintyLevel = clamp(mean(importantWorldUncertainty) + 0.25 × sqrt(selectedVariance))
policyStability = minBoundaryDistance × 2, clamped to [0,1]

decisionConfidence =
    0.25 × evidenceSufficiency
  + 0.22 × simulationAgreement
  + 0.18 × margin
  + 0.15 × (1 - uncertaintyLevel)
  + 0.10 × modelReliability
  + 0.10 × policyStability
```

Decision confidence is not LLM confidence.

## Risk envelope

The active policy defines failure, CVaR, constraint-probability, and robustness thresholds. The deterministic order is:

1. `PROHIBITED`: hard constraint failure or constraint-violation probability at/above the prohibited boundary.
2. `ABSTAIN`: catastrophic failure probability, CVaR, or insufficient robustness.
3. `CAUTION`: warning failure probability or CVaR.
4. `SAFE`: all limits pass.

Governance additionally evaluates missing evidence, disagreement, decision confidence, policy stability, and simulation work-budget failures. A final score cannot override a prohibited envelope.

## Validation

For each predicted/observed metric pair:

```text
normalizedError = |actual - expected| / max(1, |actual|, |expected|)
predictionError = mean(normalizedError across eight outcome metrics)
calibrationError = |predictedFailureProbability - observedFailure|
```

State-transition error is the mean normalized backlog error plus absolute service/capacity errors across shared nodes. Utility error is the absolute difference between the implemented operational utility summaries. Constraint mismatch is the symmetric difference of predicted and actual constraint codes.

## Calibration

For probability bins:

```text
ECE = Σ_bin (binCount / totalCount) × |meanPredicted_bin - observedFrequency_bin|
Brier = mean((predictedProbability - observedBinaryOutcome)^2)
```

Synthetic observations can only yield `PARTIALLY_CALIBRATED`. `CALIBRATED` requires at least 200 observed outcomes.
