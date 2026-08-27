import { describe, expect, it } from 'vitest';
import { evaluateScenario, replayDecisionV3 } from '../engine';
import { taiwanMarket } from '../markets/taiwan';
import { decisionScenarios } from '../scenarios';
import { evaluateCalibration } from './calibration';
import { completeDecisionAuditV3 } from './audit';
import { PolicyRegistry, compareShadowPolicies, offlineEvaluatePolicyProposal, proposePolicyUpdate } from './policyRegistry';
import { attributeOutcome, validateOutcome } from './validation';
import type { CausalAttribution } from './types';

describe('ARCI Core V3 validation, bounded learning, policy registry and replay', () => {
  it('validates expected versus observed output and emits bounded attribution', () => {
    const result = evaluateScenario(decisionScenarios.compound, taiwanMarket, {samples: 24, v3: {trajectoryCount: 32}});
    const predicted = result.v3.counterfactual.selected.finalOutcome;
    const observed = {...predicted, averageDelayHours: predicted.averageDelayHours + 2, serviceLevel: Math.max(0.5, predicted.serviceLevel - 0.08), unfulfilledOrders: predicted.unfulfilledOrders + 40};
    const validation = validateOutcome(predicted, observed, {predictedFailureProbability: result.v3.risks.find((item) => item.candidateId === result.selectedPolicy.candidate.id)!.failureProbability, observedReason: 'Acceptance fixture observation.'});
    const attribution = attributeOutcome(validation, {externalEventObserved: false, evidenceConflict: false, executionCompleted: true, policyWithinBounds: true, calibrationStatus: result.v3.calibration.status, evidence: ['FIXTURE-OUTCOME']});
    expect(validation.predictionError).toBeGreaterThan(0);
    expect(validation.metrics.every((item) => item.expected !== undefined && item.actual !== undefined && item.delta !== null)).toBe(true);
    expect(attribution.boundedOperationalAttribution).toBe(true);
    expect(Object.values(attribution.contributions).reduce((total, value) => total + value, 0)).toBeCloseTo(1, 3);
  });

  it('Scenario F: creates an offline proposal without mutating ACTIVE policy', () => {
    const registry = new PolicyRegistry();
    const activeBefore = registry.active();
    const validation = validateOutcome(
      {slaBreaches: 5, averageDelayHours: 1, p90DelayHours: 2, recoveryTimeMinutes: 30, operationalCost: 8, capacityOverloadMinutes: 10, serviceLevel: 0.97, unfulfilledOrders: 5},
      {slaBreaches: 45, averageDelayHours: 5, p90DelayHours: 8, recoveryTimeMinutes: 120, operationalCost: 16, capacityOverloadMinutes: 90, serviceLevel: 0.82, unfulfilledOrders: 80},
    );
    const attribution: CausalAttribution = {attributionId: 'ATTR-MODEL', boundedOperationalAttribution: true, primaryCause: 'MODEL_ERROR', contributions: {CANDIDATE_ACTION: 0.02, EXTERNAL_EVENT: 0.03, DATA_ERROR: 0.03, MODEL_ERROR: 0.82, POLICY_ERROR: 0.08, EXECUTION_FAILURE: 0.02}, confidence: 0.8, evidence: [validation.validationId]};
    const proposal = proposePolicyUpdate(validation, attribution, activeBefore, '3.1.0');
    const offline = offlineEvaluatePolicyProposal(proposal, activeBefore, 0.08);
    expect(registry.active()).toEqual(activeBefore);
    expect(proposal.approvalStatus).toBe('PROPOSED');
    expect(offline.safetyPassed).toBe(true);
    expect(offline.proposedPolicy.status).toBe('SHADOW');
  });

  it('runs shadow-only comparison, requires evidence to promote, and rolls back', () => {
    const registry = new PolicyRegistry();
    const active = registry.active();
    const validation = validateOutcome(
      {slaBreaches: 1, averageDelayHours: 1, p90DelayHours: 2, recoveryTimeMinutes: 20, operationalCost: 6, capacityOverloadMinutes: 5, serviceLevel: 0.98, unfulfilledOrders: 1},
      {slaBreaches: 30, averageDelayHours: 4, p90DelayHours: 6, recoveryTimeMinutes: 90, operationalCost: 10, capacityOverloadMinutes: 60, serviceLevel: 0.86, unfulfilledOrders: 40},
    );
    const attribution: CausalAttribution = {attributionId: 'ATTR-POLICY', boundedOperationalAttribution: true, primaryCause: 'POLICY_ERROR', contributions: {CANDIDATE_ACTION: 0.04, EXTERNAL_EVENT: 0.04, DATA_ERROR: 0.04, MODEL_ERROR: 0.3, POLICY_ERROR: 0.55, EXECUTION_FAILURE: 0.03}, confidence: 0.75, evidence: [validation.validationId]};
    const offline = offlineEvaluatePolicyProposal(proposePolicyUpdate(validation, attribution, active, '3.1.0'), active, 0.07);
    registry.register(offline.proposedPolicy);
    const shadow = compareShadowPolicies('event-shadow', active, offline.proposedPolicy, {selectedCandidateId: 'a', expectedUtility: 0.7, tailRisk: 0.3, confidence: 0.7, governance: 'AUTONOMOUS_DECISION'}, {selectedCandidateId: 'b', expectedUtility: 0.76, tailRisk: 0.25, confidence: 0.74, governance: 'AUTONOMOUS_DECISION'}, 30);
    expect(shadow).toMatchObject({activeExecuted: true, shadowExecuted: false, selectedCandidateDifference: true});
    expect(() => registry.promote('3.1.0', 29, 'insufficient')).toThrow('SUFFICIENT_SHADOW_EVIDENCE');
    expect(registry.promote('3.1.0', 30, 'shadow gate passed').version).toBe('3.1.0');
    expect(registry.rollback('3.0.0', 'regression detected').version).toBe('3.0.0');
  });

  it('Scenario G: replays candidates, simulation, ranking, governance, decision and confidence exactly', () => {
    const original = evaluateScenario(decisionScenarios.traffic, taiwanMarket, {samples: 24, v3: {trajectoryCount: 36}});
    const replay = replayDecisionV3(original.v3.audit, taiwanMarket);
    expect(replay).toMatchObject({matched: true, sameCandidates: true, sameSimulation: true, sameRanking: true, sameGovernance: true, sameDecision: true, sameConfidence: true});
    expect(replay.actualOutputHash).toBe(original.v3.audit.authoritativeOutputHash);
  });

  it('keeps immutable audit lineage when execution, validation, attribution and feedback are appended', () => {
    const result = evaluateScenario(decisionScenarios.traffic, taiwanMarket, {samples: 16, v3: {trajectoryCount: 24}});
    const before = JSON.stringify(result.v3.audit);
    const execution = result.v3.counterfactual.selected.finalOutcome;
    const validation = validateOutcome(execution, execution);
    const attribution = attributeOutcome(validation, {externalEventObserved: false, evidenceConflict: false, executionCompleted: true, policyWithinBounds: true, calibrationStatus: 'UNCALIBRATED', evidence: []});
    const proposal = proposePolicyUpdate(validation, attribution, result.v3.audit.policy, '3.0.1');
    const complete = completeDecisionAuditV3(result.v3.audit, execution, validation, attribution, proposal);
    expect(JSON.stringify(result.v3.audit)).toBe(before);
    expect(complete).toMatchObject({executionResult: execution, validation, attribution, policyFeedback: proposal});
  });

  it('labels fixture calibration as partial and requires sufficient observed outcomes for calibrated status', () => {
    const fixture = Array.from({length: 40}, (_, index) => ({predictedProbability: (index % 10 + 0.5) / 10, observed: (index % 3 === 0 ? 1 : 0) as 0 | 1, source: 'SYNTHETIC_FIXTURE' as const}));
    const observed = Array.from({length: 200}, (_, index) => ({predictedProbability: (index % 10 + 0.5) / 10, observed: (index % 2) as 0 | 1, source: 'OBSERVED_OUTCOMES' as const}));
    expect(evaluateCalibration()).toMatchObject({status: 'UNCALIBRATED', source: 'NONE'});
    expect(evaluateCalibration(fixture)).toMatchObject({status: 'PARTIALLY_CALIBRATED', source: 'SYNTHETIC_FIXTURE'});
    expect(evaluateCalibration(observed)).toMatchObject({status: 'CALIBRATED', source: 'OBSERVED_OUTCOMES'});
  });
});
