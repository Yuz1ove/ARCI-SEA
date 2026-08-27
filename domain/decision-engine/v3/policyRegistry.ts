import { finiteRecord, round, stableHash, sum } from '../math';
import { DEFAULT_V3_POLICY_PARAMETERS } from './config';
import type {
  CausalAttribution,
  OutcomeValidationV2,
  PolicyParametersV3,
  PolicyStatus,
  PolicyUpdateProposal,
  PolicyVersionRecord,
  ShadowEvaluation,
} from './types';

export const DEFAULT_ACTIVE_POLICY: PolicyVersionRecord = Object.freeze({
  policyId: 'arci-core-v3',
  version: '3.0.0',
  createdAt: 'T+0m',
  parameters: DEFAULT_V3_POLICY_PARAMETERS,
  constraints: ['HARD_CONSTRAINT_EXCLUSION', 'RISK_ENVELOPE_VETO', 'HUMAN_ESCALATION', 'ACTIVE_ONLY_EXECUTION'],
  evaluationMetrics: {},
  status: 'ACTIVE',
  supersedes: null,
  rollbackTarget: null,
});

const freezeRecord = (record: PolicyVersionRecord): PolicyVersionRecord => Object.freeze({
  ...record,
  parameters: Object.freeze({
    ...record.parameters,
    riskWeights: Object.freeze({...record.parameters.riskWeights}),
    confidenceThresholds: Object.freeze({...record.parameters.confidenceThresholds}),
    riskEnvelope: Object.freeze({...record.parameters.riskEnvelope}),
    horizonWeights: Object.freeze({...record.parameters.horizonWeights}),
  }),
  constraints: Object.freeze([...record.constraints]) as unknown as string[],
  evaluationMetrics: Object.freeze({...record.evaluationMetrics}),
});

export interface PolicyRegistryEvent {
  eventId: string;
  action: 'REGISTER' | 'STATUS_CHANGE' | 'ROLLBACK';
  version: string;
  fromStatus: PolicyStatus | null;
  toStatus: PolicyStatus;
  reason: string;
}

export class PolicyRegistry {
  private records: PolicyVersionRecord[];
  private events: PolicyRegistryEvent[] = [];

  constructor(initial: PolicyVersionRecord[] = [DEFAULT_ACTIVE_POLICY]) {
    this.records = initial.map(freezeRecord);
    this.assertInvariant();
  }

  private assertInvariant() {
    const versions = new Set<string>();
    for (const record of this.records) {
      if (versions.has(record.version)) throw new Error(`POLICY_VERSION_DUPLICATE: ${record.version}`);
      if (!finiteRecord(record.parameters)) throw new Error(`POLICY_PARAMETERS_INVALID: ${record.version}`);
      versions.add(record.version);
    }
    if (this.records.filter((record) => record.status === 'ACTIVE').length !== 1) throw new Error('POLICY_REGISTRY_REQUIRES_EXACTLY_ONE_ACTIVE_VERSION');
  }

  list() { return this.records.map((record) => freezeRecord(record)); }
  audit() { return this.events.map((event) => Object.freeze({...event})); }
  active() { return this.records.find((record) => record.status === 'ACTIVE')!; }
  shadows() { return this.records.filter((record) => record.status === 'SHADOW'); }

  productionPolicy() {
    const active = this.active();
    if (active.status !== 'ACTIVE') throw new Error('PRODUCTION_POLICY_MUST_BE_ACTIVE');
    return active;
  }

  register(record: PolicyVersionRecord, reason = 'POLICY_UPDATE_PROPOSAL') {
    if (this.records.some((item) => item.version === record.version)) throw new Error(`POLICY_VERSION_DUPLICATE: ${record.version}`);
    if (record.status === 'ACTIVE') throw new Error('NEW_POLICY_MUST_ENTER_DRAFT_OR_SHADOW');
    const frozen = freezeRecord(record);
    this.records = [...this.records, frozen];
    this.events.push({eventId: `PE-${stableHash(`${record.version}:REGISTER:${reason}`).toUpperCase()}`, action: 'REGISTER', version: record.version, fromStatus: null, toStatus: record.status, reason});
    this.assertInvariant();
    return frozen;
  }

  setStatus(version: string, status: PolicyStatus, reason: string) {
    const current = this.records.find((record) => record.version === version);
    if (!current) throw new Error(`POLICY_NOT_FOUND: ${version}`);
    if (status === 'ACTIVE') throw new Error('USE_PROMOTE_FOR_ACTIVE_STATUS');
    this.records = this.records.map((record) => record.version === version ? freezeRecord({...record, status}) : record);
    this.events.push({eventId: `PE-${stableHash(`${version}:${current.status}:${status}:${reason}`).toUpperCase()}`, action: 'STATUS_CHANGE', version, fromStatus: current.status, toStatus: status, reason});
    this.assertInvariant();
    return this.records.find((record) => record.version === version)!;
  }

  promote(version: string, shadowEvidenceCount: number, reason: string) {
    const target = this.records.find((record) => record.version === version);
    if (!target) throw new Error(`POLICY_NOT_FOUND: ${version}`);
    if (target.status !== 'SHADOW') throw new Error('POLICY_PROMOTION_REQUIRES_SHADOW_STATUS');
    if (shadowEvidenceCount < 30) throw new Error('POLICY_PROMOTION_REQUIRES_SUFFICIENT_SHADOW_EVIDENCE');
    const prior = this.active();
    this.records = this.records.map((record) => {
      if (record.version === prior.version) return freezeRecord({...record, status: 'RETIRED'});
      if (record.version === version) return freezeRecord({...record, status: 'ACTIVE', supersedes: prior.version, rollbackTarget: prior.version});
      return record;
    });
    this.events.push({eventId: `PE-${stableHash(`${version}:PROMOTE:${reason}`).toUpperCase()}`, action: 'STATUS_CHANGE', version, fromStatus: 'SHADOW', toStatus: 'ACTIVE', reason});
    this.assertInvariant();
    return this.active();
  }

  rollback(targetVersion: string, reason: string) {
    const active = this.active();
    const target = this.records.find((record) => record.version === targetVersion);
    if (!target) throw new Error(`POLICY_NOT_FOUND: ${targetVersion}`);
    if (active.rollbackTarget !== targetVersion && active.supersedes !== targetVersion) throw new Error('POLICY_ROLLBACK_TARGET_NOT_AUTHORIZED');
    this.records = this.records.map((record) => {
      if (record.version === active.version) return freezeRecord({...record, status: 'RETIRED'});
      if (record.version === targetVersion) return freezeRecord({...record, status: 'ACTIVE'});
      return record;
    });
    this.events.push({eventId: `PE-${stableHash(`${active.version}:ROLLBACK:${targetVersion}:${reason}`).toUpperCase()}`, action: 'ROLLBACK', version: targetVersion, fromStatus: target.status, toStatus: 'ACTIVE', reason});
    this.assertInvariant();
    return this.active();
  }
}

export function mergePolicyParameters(base: PolicyParametersV3, diff: Partial<PolicyParametersV3>): PolicyParametersV3 {
  return {
    riskWeights: {...base.riskWeights, ...diff.riskWeights},
    confidenceThresholds: {...base.confidenceThresholds, ...diff.confidenceThresholds},
    riskEnvelope: {...base.riskEnvelope, ...diff.riskEnvelope},
    horizonWeights: {...base.horizonWeights, ...diff.horizonWeights},
  };
}

export function proposePolicyUpdate(
  validation: OutcomeValidationV2,
  attribution: CausalAttribution,
  active: PolicyVersionRecord,
  proposedVersion: string,
): PolicyUpdateProposal {
  const modelShare = attribution.contributions.MODEL_ERROR + attribution.contributions.POLICY_ERROR;
  const executionShare = attribution.contributions.EXECUTION_FAILURE;
  const parameterDiff: Partial<PolicyParametersV3> = modelShare > 0.45 ? {
    riskWeights: {...active.parameters.riskWeights, cvar95: round(active.parameters.riskWeights.cvar95 + 0.02), expectedLoss: round(active.parameters.riskWeights.expectedLoss - 0.02)},
  } : {};
  const expectedBenefit = round(Math.min(0.2, validation.predictionError * modelShare));
  const risk = round(Math.min(1, attribution.primaryCause === 'ATTRIBUTION_UNCERTAIN' ? 0.8 : executionShare + validation.calibrationError * 0.2));
  const proposalId = `PP-${stableHash(`${validation.validationId}:${active.version}:${proposedVersion}:${JSON.stringify(parameterDiff)}`).toUpperCase()}`;
  return {
    proposalId,
    basePolicyVersion: active.version,
    proposedVersion,
    parameterDiff,
    evidence: [validation.validationId, attribution.attributionId],
    expectedBenefit,
    risk,
    approvalStatus: 'PROPOSED',
    rollbackTarget: active.version,
    reason: attribution.primaryCause === 'ATTRIBUTION_UNCERTAIN' ? 'Attribution is uncertain; proposal must remain offline.' : 'Prediction error produced a bounded offline policy proposal.',
  };
}

export function offlineEvaluatePolicyProposal(proposal: PolicyUpdateProposal, active: PolicyVersionRecord, fixtureUtilityDelta: number) {
  const parameters = mergePolicyParameters(active.parameters, proposal.parameterDiff);
  const riskTotal = sum(Object.values(parameters.riskWeights));
  const horizonTotal = sum(Object.values(parameters.horizonWeights));
  const safetyPassed = Math.abs(riskTotal - 1) < 0.0001
    && Math.abs(horizonTotal - 1) < 0.0001
    && parameters.confidenceThresholds.humanReview <= parameters.confidenceThresholds.autonomous
    && Object.values(parameters.riskWeights).every((value) => value >= 0 && value <= 1)
    && fixtureUtilityDelta > 0
    && proposal.expectedBenefit > proposal.risk * 0.1;
  return {
    proposal: {...proposal, approvalStatus: safetyPassed ? 'SHADOW_REQUIRED' as const : 'REJECTED' as const},
    proposedPolicy: freezeRecord({
      ...active,
      version: proposal.proposedVersion,
      createdAt: `AFTER-${proposal.proposalId}`,
      parameters,
      evaluationMetrics: {fixtureUtilityDelta: round(fixtureUtilityDelta)},
      status: safetyPassed ? 'SHADOW' : 'REJECTED',
      supersedes: active.version,
      rollbackTarget: active.version,
    }),
    safetyPassed,
  };
}

export interface ShadowPolicyOutcome {
  selectedCandidateId: string;
  expectedUtility: number;
  tailRisk: number;
  confidence: number;
  governance: string;
}

export function compareShadowPolicies(
  eventId: string,
  active: PolicyVersionRecord,
  shadow: PolicyVersionRecord,
  activeOutcome: ShadowPolicyOutcome,
  shadowOutcome: ShadowPolicyOutcome,
  evidenceCount: number,
): ShadowEvaluation {
  if (active.status !== 'ACTIVE') throw new Error('SHADOW_COMPARISON_REQUIRES_ACTIVE_POLICY');
  if (shadow.status !== 'SHADOW') throw new Error('SHADOW_COMPARISON_REQUIRES_SHADOW_POLICY');
  return {
    shadowEvaluationId: `SHADOW-${stableHash(`${eventId}:${active.version}:${shadow.version}:${JSON.stringify(activeOutcome)}:${JSON.stringify(shadowOutcome)}`).toUpperCase()}`,
    eventId,
    activePolicyVersion: active.version,
    shadowPolicyVersion: shadow.version,
    activeExecuted: true,
    shadowExecuted: false,
    selectedCandidateDifference: activeOutcome.selectedCandidateId !== shadowOutcome.selectedCandidateId,
    utilityDifference: round(shadowOutcome.expectedUtility - activeOutcome.expectedUtility),
    riskDifference: round(shadowOutcome.tailRisk - activeOutcome.tailRisk),
    confidenceDifference: round(shadowOutcome.confidence - activeOutcome.confidence),
    governanceDifference: shadowOutcome.governance !== activeOutcome.governance,
    evidenceCount,
  };
}
