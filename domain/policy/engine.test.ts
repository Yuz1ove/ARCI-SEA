import { describe,expect,it } from 'vitest';
import { baseWeights,bounds,criteria,maxDeltaPerCycle } from './config';
import { rollbackPolicy,runPolicyEngine,weightTotal } from './engine';
import { policyScenarios } from './scenarios';

describe('ARCI Decision Engine',()=>{
  it('keeps exponential adaptive weights at 100 within every policy bound',()=>{
    expect(weightTotal(baseWeights)).toBe(100);
    for(const scenario of Object.values(policyScenarios)){
      const snapshot=runPolicyEngine(scenario);
      expect(weightTotal(snapshot.adaptiveWeights)).toBe(100);
      for(const criterion of criteria){
        expect(snapshot.adaptiveWeights[criterion]).toBeGreaterThanOrEqual(bounds[criterion][0]);
        expect(snapshot.adaptiveWeights[criterion]).toBeLessThanOrEqual(bounds[criterion][1]);
        expect(Math.abs(snapshot.adaptiveWeights[criterion]-baseWeights[criterion])).toBeLessThanOrEqual(maxDeltaPerCycle);
      }
    }
  });

  it('is deterministic for identical inputs, candidates and version',()=>{
    const first=runPolicyEngine(policyScenarios['traffic-disruption']);
    const replay=runPolicyEngine(policyScenarios['traffic-disruption']);
    expect(replay).toEqual(first);
    expect(first.signals).toHaveLength(23);
    expect(first.candidateRankingAfter).toHaveLength(7);
    expect(first.calculationLatencyMs).toBe(44);
  });

  it('includes Green Island in signals, candidate coverage, adaptive risk and replan triggers',()=>{
    const snapshot=runPolicyEngine(policyScenarios['traffic-disruption']);
    expect(snapshot.signals.find(signal=>signal.id==='green-island-service')?.current).toBe(88.9);
    expect(snapshot.replanTriggers.find(trigger=>trigger.id==='GREEN_ISLAND_SERVICE')?.triggered).toBe(true);
    expect(policyScenarios['traffic-disruption'].candidates.filter(candidate=>!candidate.hardConstraintViolations.includes('OPERATIONAL_NODE_COVERAGE')).every(candidate=>candidate.servedNodeIds.includes('green-island'))).toBe(true);
    const lowRisk=runPolicyEngine({...policyScenarios['traffic-disruption'],context:{...policyScenarios['traffic-disruption'].context,greenIslandRisk:0}});
    const highRisk=runPolicyEngine({...policyScenarios['traffic-disruption'],context:{...policyScenarios['traffic-disruption'].context,greenIslandRisk:1}});
    expect(highRisk.adaptiveWeights.disruptionRisk).toBeGreaterThan(lowRisk.adaptiveWeights.disruptionRisk);
  });

  it('derives traffic sensitivities and selects the feasible resilient route',()=>{
    const snapshot=runPolicyEngine(policyScenarios['traffic-disruption']);
    expect(snapshot.sensitivities.routeFeasibility).toBe(.42);
    expect(snapshot.sensitivities.slaProtection).toBe(.31);
    expect(snapshot.adaptiveWeights.routeFeasibility).toBeGreaterThan(baseWeights.routeFeasibility);
    expect(snapshot.adaptiveWeights.slaProtection).toBeGreaterThan(baseWeights.slaProtection);
    expect(snapshot.adaptiveWeights.costEfficiency).toBeLessThan(baseWeights.costEfficiency);
    expect(snapshot.selectedCandidateId).toBe('route-b');
  });

  it('raises capacity balance from context for warehouse overload',()=>{
    const traffic=runPolicyEngine(policyScenarios['traffic-disruption']);
    const warehouse=runPolicyEngine(policyScenarios['warehouse-overload'],traffic);
    expect(warehouse.sensitivities.capacityBalance).toBe(.46);
    expect(warehouse.adaptiveWeights.capacityBalance).toBeGreaterThan(baseWeights.capacityBalance);
    expect(warehouse.adaptiveWeights.costEfficiency).toBeLessThan(baseWeights.costEfficiency);
    expect(warehouse.selectedCandidateId).toBe('route-c');
    expect(warehouse.replanTriggers.find(trigger=>trigger.id==='NODE_LOAD')?.triggered).toBe(true);
  });

  it('holds base policy when confidence is below threshold',()=>{
    const scenario={...policyScenarios['traffic-disruption'],context:{...policyScenarios['traffic-disruption'].context,eventConfidence:.62}};
    const snapshot=runPolicyEngine(scenario);
    expect(snapshot.adaptiveWeights).toEqual(baseWeights);
    expect(snapshot.deltas).toHaveLength(0);
  });

  it('excludes hard-constraint violations instead of merely deducting points',()=>{
    const snapshot=runPolicyEngine(policyScenarios['traffic-disruption']);
    const closed=snapshot.candidateRankingAfter.find(candidate=>candidate.candidateId==='route-a');
    expect(closed?.eligible).toBe(false);
    expect(closed?.hardConstraintViolations).toContain('ROUTE_UNAVAILABLE');
    expect(snapshot.candidateRankingAfter.filter(candidate=>candidate.eligible)).toHaveLength(5);
  });

  it('does not duplicate adaptation audit entries during cooldown replay',()=>{
    const first=runPolicyEngine(policyScenarios['traffic-disruption']);
    const replay=runPolicyEngine(policyScenarios['traffic-disruption'],first);
    expect(replay.auditRecorded).toBe(false);
    expect(replay.deltas).toHaveLength(0);
    expect(replay.adaptiveWeights).toEqual(first.adaptiveWeights);
  });

  it('applies risk and soft penalties and preserves formula inputs',()=>{
    const snapshot=runPolicyEngine(policyScenarios['warehouse-overload']);
    const selected=snapshot.candidateRankingAfter.find(candidate=>candidate.candidateId===snapshot.selectedCandidateId)!;
    expect(selected.utility).toBeCloseTo(selected.weightedUtility-selected.riskPenalty-selected.constraintPenalty,4);
    expect(selected.routeFeasibility).toBeGreaterThan(0);
    expect(selected.capacityLoad).toBeGreaterThan(0);
  });

  it('reports passing guardrails and can rollback a degraded outcome',()=>{
    const traffic=runPolicyEngine(policyScenarios['traffic-disruption']);
    const warehouse=runPolicyEngine(policyScenarios['warehouse-overload'],traffic);
    expect(warehouse.guardrails.every(rule=>rule.passed)).toBe(true);
    expect(warehouse.outcome.status).toBe('rollback-required');
    expect(rollbackPolicy(warehouse,traffic)).toEqual(traffic);
  });
});
