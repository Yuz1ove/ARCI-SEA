# ARCI Core V3 — Adaptive Intelligence & Digital Twin

## 1. Architecture

ARCI Core V3 extends the accepted V2 engine in place. The V2 event model, market-derived candidate generator, hard constraints, deterministic simulation, governance projection, audit entries, frontend contracts, and hybrid-LLM boundary remain available. V3 is composed under `domain/decision-engine/v3/` and is invoked by the existing `evaluateScenario(...)` public boundary.

The authoritative chain is:

```text
Event
→ Evidence Fusion
→ Probabilistic World Model
→ Immutable Digital Twin
→ Seeded Forecast Ensemble
→ Existing Candidate Generation
→ Multi-Horizon Counterfactual Simulation
→ Robust Risk Evaluation
→ Decision Boundary / Sensitivity
→ Risk Envelope
→ Deterministic Governance / Abstention
→ Decision Audit
→ Execution Outcome Validation
→ Bounded Operational Attribution
→ Offline Policy Proposal / Shadow / Approval / Rollback
```

LLM interpretation and explanation remain outside the authoritative decision, governance, policy-update, and replay hashes.

## 2. Data flow

`evaluateScenario(...)` still accepts the V2 `ScenarioDefinition` and `MarketConfig`. Optional `v3` inputs add evidence, evidence mode, trajectory count, deterministic work budget, active policy version, shadow-policy identity, and calibration observations. The result preserves every V2 field and adds `evaluation.v3`.

The production default is 500 trajectories. Tests and bounded probes may explicitly request a smaller count. The same scenario, market, evidence, policy, configuration, and seed produce the same authoritative output hash.

## 3. Probabilistic world model

`worldModel.ts` maps system, node, carrier, and edge state into probability-aware values with:

- fused value;
- confidence and uncertainty;
- freshness in milliseconds and deterministic scenario time;
- source reliability and source independence;
- agreement, evidence count, provenance IDs, and explicit status.

Fusion rejects malformed values, invalid confidence/reliability, invalid timestamps, missing identity, and unknown variables. `REPLACE` mode fails closed: absent values become `UNKNOWN`; it does not silently restore deterministic defaults. `AUGMENT` mode uses deterministic state evidence only for variables not supplied externally.

## 4. Digital twin

`createCommerceDigitalTwin(...)` now produces a runtime-frozen initial snapshot, current snapshot, state history, ordered transition-event IDs, deterministic seed, and state snapshot ID. `injectDigitalTwinScenario(...)` returns a new twin and never mutates the original. Each transition still uses the explicit V2 event transition functions.

Forecast trajectories operate on isolated state clones. T+5 minutes is simulated through the existing typed policy simulator; later horizons advance through the implemented deterministic horizon transition equations and feed the next state, rather than attaching labels to one terminal result.

## 5. Forecast ensemble

The ensemble contains four explicit path classes:

- `OPTIMISTIC`;
- `NOMINAL`;
- `PESSIMISTIC`;
- `TAIL_RISK`.

Every selected-policy trajectory records its ID, derived seed, assumptions, four state transitions, terminal outcome, risk, utility, and constraint violations. Every candidate retains outcome distributions and horizon summaries. The four horizons are T+5 minutes, T+30 minutes, T+2 hours, and T+24 hours.

## 6. Counterfactual engine

The V3 counterfactual output includes:

- no-action (`keep-current`) distribution;
- runner-up distribution;
- every candidate distribution and robust-risk vector;
- selected-to-runner-up decision margin;
- deterministic boundary scans for demand, weather, traffic, and network availability;
- critical variables ranked by switch proximity.

Boundary scans rerun candidate generation, hard constraints, adaptive objective weights, and seeded candidate evaluation at bounded grid points. They do not use an LLM.

## 7. Risk model

Each candidate reports expected and worst-case utility, variance, failure probability, constraint-violation probability, CVaR95 loss, downside risk, regret, robustness, reversibility, recovery cost, and the configured robust decision loss. Exact formulas and assumptions are in `docs/arci-core-v3-math.md`.

## 8. Decision confidence

Decision confidence is independent of LLM confidence. It is composed from evidence sufficiency, cross-trajectory winner agreement, decision margin, uncertainty level, model reliability, and decision-boundary stability. All components remain visible separately.

## 9. Governance and abstention

Each candidate enters `SAFE`, `CAUTION`, `ABSTAIN`, or `PROHIBITED`. Hard constraints and probable violations can veto a high-scoring candidate. The final deterministic autonomy level is one of:

- `AUTONOMOUS_DECISION`;
- `AUTONOMOUS_WITH_WARNING`;
- `HUMAN_REVIEW_REQUIRED`;
- `ABSTAIN`.

Missing evidence, high disagreement, critically low confidence, unstable ranking, catastrophic downside, all-candidate failure, and simulation work-budget exhaustion are fail-safe conditions. The legacy UI maps warning/review to approval required and abstention to blocked.

## 10. Policy learning

Policy learning is bounded. `PolicyRegistry` enforces exactly one `ACTIVE` version and supports `DRAFT`, `SHADOW`, `ACTIVE`, `RETIRED`, and `REJECTED`. A validation result can only create an immutable update proposal. Promotion requires offline safety gates, `SHADOW` status, and at least 30 shadow observations. Only the active policy executes. Rollback targets are explicit and audited.

The default runtime registry and `/api/arci-core` audit store are process-memory adapters. They prove lifecycle semantics but are not durable across serverless cold starts. A durable storage adapter is a production follow-up, not an implied capability.

## 11. Replay

The V3 audit captures event/scenario, world-state snapshot, evidence, full policy record, base Monte Carlo sample count, V3 trajectory count, horizons, seed, candidate set, trajectory summaries, risks, counterfactuals, governance, confidence, selected candidate, and post-execution fields when available.

`replayDecisionV3(...)` reconstructs the authoritative pipeline and separately compares candidates, simulation summaries, ranking, governance, decision, confidence, and the final output hash. LLM explanation text is deliberately absent.

## 12. Calibration

Calibration calculates bin-level predicted probability versus observed frequency, expected calibration error, and Brier score. No data returns `UNCALIBRATED`. Synthetic fixtures return `PARTIALLY_CALIBRATED`. `CALIBRATED` requires at least 200 observations and an all-observed dataset; fixture calibration is never presented as real-world calibration.

## 13. API and frontend observability

`/api/arci-core` provides one consistent operation boundary instead of duplicating the existing hybrid-intelligence route:

- `GET` advertises resources and engine/policy status;
- `GET ?resource=policies` returns active/shadow registry state;
- `GET ?resource=audit&decisionId=...` returns a stored audit;
- `POST operation=decision` evaluates a named scenario;
- `POST operation=replay` replays a stored audit;
- `POST operation=validation` validates observed metrics, performs bounded attribution, and creates—but does not activate—a policy proposal.

The existing Decision Lab includes a minimal Advanced Decision Inspector for world-model quality, twin/ensemble size, risk, no-action/runner-up counterfactuals, decision boundary, autonomy level, policy version, and calibration state.

## 14. Known limitations

- Inputs and outcomes in the competition demo remain `SIMULATION ASSUMPTION` or `ARCI DERIVED`; no live Shopee, Sea, SPX, TDX, or CWA data is claimed.
- The process-memory policy/audit adapter is not durable production storage.
- Operational attribution is bounded diagnostic attribution, not proof of strict causality.
- Default calibration is `UNCALIBRATED` until sufficient observed outcomes exist.
- The horizon transition model is explicit and tested but remains a prototype model whose parameters require real operational validation.
- The current failure-safe “simulation timeout” is enforced as a deterministic work budget so replay remains stable; outer infrastructure timeouts are still handled by the API runtime.
