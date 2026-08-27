import { describe, expect, it } from 'vitest';
import { runDecisionPipeline } from '@/lib/llm/pipeline';
import { evaluateScenario, replayDecisionV3 } from '../engine';
import { taiwanMarket } from '../markets/taiwan';
import { decisionScenarios } from '../scenarios';
import { applyCommerceEvent, createInitialState } from '../state';
import { evaluateGovernanceV3 } from './governance';
import { offlineEvaluatePolicyProposal, PolicyRegistry, proposePolicyUpdate } from './policyRegistry';
import { evaluateRiskEnvelope } from './risk';
import { attributeOutcome, validateOutcome } from './validation';
import { fuseWorldState } from './worldModel';
import type { CausalAttribution, EvidenceObservation } from './types';

const evidence = (id: string, value: unknown, overrides: Partial<EvidenceObservation> = {}): EvidenceObservation => ({evidenceId: id, variable: 'system.weatherSeverity', value, confidence: 0.9, observedAtMinute: 40, sourceReliability: 0.9, sourceId: id, sourceGroup: id, provenanceId: `P-${id}`, ...overrides});
const state = () => applyCommerceEvent(createInitialState(taiwanMarket, 'failure-injection'), {id: 'clock', atMinute: 40, type: 'DEMAND_SURGE', multiplier: 1});
let cached: ReturnType<typeof evaluateScenario> | null = null;
const decision = () => cached ??= evaluateScenario(decisionScenarios.traffic, taiwanMarket, {samples: 16, v3: {trajectoryCount: 24}});

describe('ARCI Core V3 failure injection', () => {
  it('1 stale telemetry stays stale', () => expect(fuseWorldState(state(), [evidence('stale', 0.5, {observedAtMinute: 0})]).model.values['system.weatherSeverity'].status).toBe('STALE'));
  it('2 contradictory evidence creates a conflict', () => expect(fuseWorldState(state(), [evidence('a', 0), evidence('b', 1)]).model.conflicts).toHaveLength(1));
  it('3 missing region becomes unknown', () => expect(fuseWorldState(state(), [], 'REPLACE').model.missingVariables).toContain('node.green-island.availableCapacityRatio'));
  it('4 corrupted payload is rejected', () => expect(fuseWorldState(state(), [evidence('bad', 'corrupt')]).model.rejectedEvidence).toEqual(expect.arrayContaining([expect.objectContaining({reason: 'MALFORMED_VALUE'})])));
  it('5 low-confidence world state requires review', () => {
    const result = evaluateScenario(decisionScenarios.traffic, taiwanMarket, {samples: 12, v3: {trajectoryCount: 16, evidenceMode: 'REPLACE', evidence: [evidence('low', 0.5, {confidence: 0.05})]}});
    expect(['HUMAN_REVIEW_REQUIRED', 'ABSTAIN']).toContain(result.v3.governance.autonomyLevel);
  });
  it('6 simulation timeout fails safe', () => {
    const result = evaluateScenario(decisionScenarios.traffic, taiwanMarket, {samples: 12, v3: {trajectoryCount: 100, maxTrajectoryWorkUnits: 1}});
    expect(result.v3.governance.autonomyLevel).toBe('ABSTAIN');
  });
  it('7 all candidates failing blocks execution', () => {
    const result = evaluateScenario(decisionScenarios.islandDisruption, taiwanMarket, {samples: 12, v3: {trajectoryCount: 16}});
    expect(result.v3.governance.executionAuthorized).toBe(false);
    expect(result.governance.mode).toBe('BLOCKED');
  });
  it('8 governance rejects a prohibited candidate', () => {
    const result = decision();
    const evaluation = result.evaluations[0];
    const risk = {...result.v3.risks[0], candidateId: evaluation.candidate.id, constraintViolationProbability: 1};
    expect(evaluateRiskEnvelope(evaluation, risk, result.v3.audit.policy.parameters).state).toBe('PROHIBITED');
  });
  it('9 catastrophic tail risk enters abstention region', () => {
    const result = decision();
    const evaluation = result.evaluations.find((item) => item.constraints.feasible)!;
    const risk = {...result.v3.risks[0], candidateId: evaluation.candidate.id, tailRiskCvar95: 0.99, failureProbability: 0.6};
    expect(evaluateRiskEnvelope(evaluation, risk, result.v3.audit.policy.parameters).state).toBe('ABSTAIN');
  });
  it('10 unstable ranking requires human review', () => {
    const result = decision();
    const confidence = {...result.v3.confidence, value: 0.6, policyStability: 0.1};
    const governance = evaluateGovernanceV3(result.selectedPolicy.candidate.id, result.v3.worldModel, confidence, result.v3.riskEnvelopes, result.v3.audit.policy.parameters);
    expect(governance.autonomyLevel).toBe('HUMAN_REVIEW_REQUIRED');
  });
  it('11 failed execution is attributed as an execution contribution', () => {
    const metrics = decision().v3.counterfactual.selected.finalOutcome;
    const validation = validateOutcome(metrics, {...metrics, serviceLevel: 0.5, unfulfilledOrders: metrics.unfulfilledOrders + 200});
    const attribution = attributeOutcome(validation, {externalEventObserved: false, evidenceConflict: false, executionCompleted: false, policyWithinBounds: true, calibrationStatus: 'PARTIALLY_CALIBRATED', evidence: []});
    expect(attribution.contributions.EXECUTION_FAILURE).toBeGreaterThan(attribution.contributions.CANDIDATE_ACTION);
  });
  it('12 unexpected external event is retained in bounded attribution', () => {
    const metrics = decision().v3.counterfactual.selected.finalOutcome;
    const attribution = attributeOutcome(validateOutcome(metrics, {...metrics, averageDelayHours: metrics.averageDelayHours + 2}), {externalEventObserved: true, evidenceConflict: false, executionCompleted: true, policyWithinBounds: true, calibrationStatus: 'PARTIALLY_CALIBRATED', evidence: ['EXTERNAL-SHOCK']});
    expect(attribution.contributions.EXTERNAL_EVENT).toBeGreaterThan(attribution.contributions.DATA_ERROR);
  });
  it('13 policy regression is rejected offline', () => {
    const registry = new PolicyRegistry();
    const metrics = decision().v3.counterfactual.selected.finalOutcome;
    const validation = validateOutcome(metrics, {...metrics, serviceLevel: 0.5});
    const attribution: CausalAttribution = {attributionId: 'A', boundedOperationalAttribution: true, primaryCause: 'POLICY_ERROR', contributions: {CANDIDATE_ACTION: 0, EXTERNAL_EVENT: 0, DATA_ERROR: 0, MODEL_ERROR: 0.2, POLICY_ERROR: 0.8, EXECUTION_FAILURE: 0}, confidence: 0.8, evidence: []};
    const proposal = proposePolicyUpdate(validation, attribution, registry.active(), '3.1.0');
    expect(offlineEvaluatePolicyProposal(proposal, registry.active(), -0.1).proposedPolicy.status).toBe('REJECTED');
  });
  it('14 replay mismatch is surfaced rather than hidden', () => {
    const result = decision();
    const replay = replayDecisionV3({...result.v3.audit, authoritativeOutputHash: 'TAMPERED'}, taiwanMarket);
    expect(replay.matched).toBe(false);
    expect(replay.mismatches).toContain('OUTPUT_HASH');
  });
  it('15 provider unavailable leaves deterministic engine online', async () => {
    const response = await runDecisionPipeline({question: '北部豪雨', scenario: decisionScenarios.traffic}, null);
    expect(response).toMatchObject({engineStatus: 'ONLINE', providerStatus: 'DISABLED'});
    expect(response.evaluation.v3.audit.authoritativeOutputHash).toBeTruthy();
  });
});
