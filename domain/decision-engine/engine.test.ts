import { describe,expect,it } from 'vitest';
import { buildCounterfactual,decisionScenarios,deriveAdaptiveWeights,evaluateGovernance,evaluateScenario,finiteRecord,syntheticMarket,taiwanMarket } from '.';

const stableView=(result:ReturnType<typeof evaluateScenario>)=>({
  selected:result.selectedPolicy.candidate.id,weights:result.adaptiveWeights,confidence:result.confidence,counterfactual:result.counterfactual,record:result.decisionRecord,evaluations:result.evaluations.map(item=>({id:item.candidate.id,feasible:item.constraints.feasible,score:item.riskAdjustedScore,uncertainty:item.uncertainty,metrics:item.metrics})),
});

describe('ARCI enterprise decision engine',()=>{
  it('normalizes adaptive weights and keeps deterministic normal operation stable',()=>{
    const result=evaluateScenario(decisionScenarios.normal,taiwanMarket,{samples:120});
    const total=Object.values(result.adaptiveWeights).reduce((sum,value)=>sum+value,0);
    expect(total).toBeCloseTo(1,10);
    for(const value of Object.values(deriveAdaptiveWeights(result.state,taiwanMarket))){expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(1);}
    expect(result.selectedPolicy.candidate.id).toBe('keep-current');
    expect(result.governance.mode).toBe('AUTONOMOUS');
    expect(result.calculationLatencyMs).toBeLessThan(500);
  });

  it('is reproducible with the same state and seeded Monte Carlo samples',()=>{
    const first=evaluateScenario(decisionScenarios.compound,taiwanMarket,{samples:160});
    const second=evaluateScenario(decisionScenarios.compound,taiwanMarket,{samples:160});
    expect(stableView(first)).toEqual(stableView(second));
    expect(first.selectedPolicy.uncertainty.p90).toBeGreaterThanOrEqual(first.selectedPolicy.uncertainty.p50);
    expect(first.selectedPolicy.uncertainty.probabilityOfSlaBreach).toBeGreaterThanOrEqual(0);
    expect(first.selectedPolicy.uncertainty.probabilityOfSlaBreach).toBeLessThanOrEqual(1);
  });

  it('uses one starting state and seed for static, rule-based and ARCI counterfactuals',()=>{
    const result=evaluateScenario(decisionScenarios.traffic,taiwanMarket,{samples:120});
    expect(result.counterfactual.sameStartingStateId).toBe(result.stateSnapshotId);
    expect(result.counterfactual.seed).toBe(decisionScenarios.traffic.seed);
    expect(result.counterfactual.baselinePolicyId).toBe('keep-current');
    expect(result.counterfactual.arciPolicyId).toBe(result.selectedPolicy.candidate.id);
    const metric=result.counterfactual.improvement.slaBreaches;
    expect(metric.delta).toBe(metric.baseline-metric.arci);
    expect(metric.baseline===0?metric.percentageImprovement===null:metric.percentageImprovement!==null).toBe(true);
    expect(result.counterfactual.improvement.averageDelayHours.percentageImprovement).not.toBeNull();
  });

  it('keeps the rule-based benchmark independent from the ARCI winner',()=>{
    const result=evaluateScenario(decisionScenarios.compound,taiwanMarket,{samples:120});
    const alternative=result.evaluations.find(item=>item.candidate.id!==result.selectedPolicy.candidate.id)!;
    const first=buildCounterfactual(result.stateSnapshotId,result.scenario.seed,result.evaluations,result.selectedPolicy,result.state);
    const second=buildCounterfactual(result.stateSnapshotId,result.scenario.seed,result.evaluations,alternative,result.state);
    expect(first.ruleBased).toEqual(second.ruleBased);
  });

  it('recomputes the full pipeline after the second event',()=>{
    const first=evaluateScenario(decisionScenarios.compound,taiwanMarket,{samples:140});
    const replanned=evaluateScenario(decisionScenarios.secondEvent,taiwanMarket,{samples:140,previousDecision:first});
    expect(replanned.stateSnapshotId).not.toBe(first.stateSnapshotId);
    expect(replanned.decisionRecord.previousPolicy).toBe(first.selectedPolicy.candidate.id);
    expect(replanned.decisionRecord.trigger).toBe('SECOND_EVENT_REPLAN');
    expect(replanned.audit.some(item=>item.stage==='REPLAN')).toBe(true);
    expect(replanned.decisionRecord.decisionId).not.toBe(first.decisionRecord.decisionId);
    expect(replanned.selectedPolicy.candidate.id).not.toBe(first.selectedPolicy.candidate.id);
    expect(first.selectedPolicy.metrics.serviceLevel).toBeGreaterThanOrEqual(taiwanMarket.slaPolicies.minimumServiceLevel);
    expect(replanned.selectedPolicy.metrics.serviceLevel).toBeGreaterThanOrEqual(taiwanMarket.slaPolicies.minimumServiceLevel);
    expect(replanned.topDecisionFactors).toHaveLength(3);
    expect(replanned.digitalTwin.currentState).toBe(replanned.state);
  });

  it('triggers rollback when normalized risk deteriorates beyond configuration',()=>{
    const previous=evaluateScenario(decisionScenarios.normal,taiwanMarket,{samples:60});
    const selected={...previous.selectedPolicy,objective:{...previous.selectedPolicy.objective,risk:previous.selectedPolicy.objective.risk+.2}};
    const governance=evaluateGovernance(selected,previous.state,previous.decisionRecord.reasonCodes,previous);
    expect(governance.rollback.triggered).toBe(true);
    expect(governance.rollback.reason).toContain('Normalized risk');
  });

  it('runs all acceptance scenarios without NaN or Infinity',()=>{
    const normal=evaluateScenario(decisionScenarios.normal,taiwanMarket,{samples:80});
    const surge=evaluateScenario(decisionScenarios.surge,taiwanMarket,{samples:80});
    const traffic=evaluateScenario(decisionScenarios.traffic,taiwanMarket,{samples:80});
    const compound=evaluateScenario(decisionScenarios.compound,taiwanMarket,{samples:80});
    const island=evaluateScenario(decisionScenarios.islandDisruption,taiwanMarket,{samples:80});
    const noBenefit=evaluateScenario(decisionScenarios.noBenefit,taiwanMarket,{samples:80});
    expect(surge.candidates.some(candidate=>candidate.allocations.length>0)).toBe(true);
    expect(traffic.state.edges['north-central'].currentCapacityRatio).toBeLessThan(surge.state.edges['north-central'].currentCapacityRatio);
    expect(compound.state.slaPressure).toBeGreaterThanOrEqual(traffic.state.slaPressure);
    expect(island.evaluations.some(item=>item.constraints.violations.some(violation=>violation.code==='ISLAND_CONNECTIVITY_RISK'))).toBe(true);
    expect(island.governance.mode).toBe('BLOCKED');
    expect(noBenefit.selectedPolicy.candidate.id).toBe('keep-current');
    const staticCompound=compound.evaluations.find(item=>item.candidate.id==='keep-current')!;
    expect(staticCompound.metrics.serviceLevel).toBeLessThan(taiwanMarket.slaPolicies.minimumServiceLevel);
    expect(staticCompound.constraints.violations.map(item=>item.code)).toContain('MINIMUM_SERVICE_REQUIREMENT');
    for(const result of [normal,surge,traffic,compound,island,noBenefit]){
      expect(finiteRecord(result)).toBe(true);
      for(const evaluation of result.evaluations.filter(item=>item.constraints.feasible)) expect(evaluation.constraints.violations).toHaveLength(0);
      for(const node of Object.values(result.state.nodes)){expect(node.inventory).toBeGreaterThanOrEqual(0);expect(node.serviceLevel).toBeGreaterThanOrEqual(0);expect(node.serviceLevel).toBeLessThanOrEqual(1);}
    }
  });

  it('runs the same engine against the synthetic market',()=>{
    const scenario={...decisionScenarios.normal,id:'synthetic-normal',marketId:syntheticMarket.marketId,seed:'synthetic-normal-v2'};
    const result=evaluateScenario(scenario,syntheticMarket,{samples:60});
    expect(Object.keys(result.state.nodes)).toHaveLength(3);
    expect(result.candidates.length).toBeGreaterThanOrEqual(5);
    expect(result.selectedPolicy.constraints.feasible).toBe(true);
    const nodeIds=new Set(syntheticMarket.nodes.map(node=>node.id));
    const edgeIds=new Set(syntheticMarket.edges.map(edge=>edge.id));
    for(const candidate of result.candidates){
      expect(candidate.servedNodeIds.every(id=>nodeIds.has(id))).toBe(true);
      expect(candidate.allocations.every(allocation=>nodeIds.has(allocation.nodeId))).toBe(true);
      expect(candidate.requiredEdgeIds.every(id=>edgeIds.has(id))).toBe(true);
      for(const action of candidate.actions){
        if('nodeId' in action) expect(nodeIds.has(action.nodeId)).toBe(true);
        if(action.type==='INVENTORY_REBALANCE'){expect(nodeIds.has(action.from)).toBe(true);expect(nodeIds.has(action.to)).toBe(true);}
        if('nodeIds' in action) expect(action.nodeIds.every(id=>nodeIds.has(id))).toBe(true);
        if(action.type==='REROUTE') expect(action.edgeIds.every(id=>edgeIds.has(id))).toBe(true);
      }
    }
  });
});
