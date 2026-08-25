import { describe,expect,it } from 'vitest';
import { applyCommerceEvent,createCommerceDigitalTwin,createInitialState,evaluateConstraints,generateCandidatePolicies,simulatePolicy,syntheticMarket,taiwanMarket } from '.';

describe('CommerceDigitalTwin',()=>{
  it('models all seven Taiwan nodes and executable road, air and sea edges',()=>{
    expect(taiwanMarket.nodes).toHaveLength(7);
    expect(taiwanMarket.geographicConstraints.offshoreNodeIds).toEqual(['penghu','kinmen','matsu','green-island']);
    expect(new Set(taiwanMarket.edges.map(edge=>edge.mode))).toEqual(new Set(['road','air','sea']));
    for(const node of taiwanMarket.nodes){
      expect(node.inventory).toBeGreaterThanOrEqual(0);
      expect(node.processingCapacityPerHour).toBeGreaterThan(0);
      expect(node.serviceLevel).toBeGreaterThanOrEqual(0);
      expect(node.serviceLevel).toBeLessThanOrEqual(1);
    }
  });

  it('exposes one serializable CommerceDigitalTwin boundary',()=>{
    const twin=createCommerceDigitalTwin(taiwanMarket,[],'twin-boundary');
    expect(twin.marketId).toBe(taiwanMarket.marketId);
    expect(twin.currentState).toEqual(twin.initialState);
    expect(twin.stateSnapshotId).toMatch(/^STATE-/);
  });

  it('updates node and edge state from events instead of assigning an outcome',()=>{
    const initial=createInitialState(taiwanMarket,'state-test');
    const disrupted=applyCommerceEvent(initial,{id:'traffic',atMinute:10,type:'TRAFFIC_DISRUPTION',severity:.8,affectedEdgeIds:['north-central']});
    expect(disrupted.edges['north-central'].currentCapacityRatio).toBeLessThan(initial.edges['north-central'].currentCapacityRatio);
    expect(disrupted.nodes['warehouse-b'].currentTrafficRisk).toBeGreaterThan(0);
    expect(disrupted.slaPressure).toBeGreaterThanOrEqual(0);
  });

  it('enforces capacity, inventory and island connectivity dynamically',()=>{
    const state=createInitialState(taiwanMarket,'constraints');
    const generated=generateCandidatePolicies(state,taiwanMarket);
    const impossible={...generated[1],allocations:[{nodeId:'warehouse-a',volume:99_999}],actions:[...generated[1].actions,{type:'INVENTORY_REBALANCE' as const,from:'warehouse-a',to:'warehouse-c',units:99_999}]};
    const constrained=evaluateConstraints(impossible,state,taiwanMarket);
    expect(constrained.feasible).toBe(false);
    expect(constrained.violations.map(item=>item.code)).toEqual(expect.arrayContaining(['CAPACITY_CONSTRAINT','INVENTORY_CONSTRAINT']));
    const disconnected=applyCommerceEvent(applyCommerceEvent(state,{id:'air',atMinute:1,type:'CARRIER_CAPACITY',mode:'air',availabilityRatio:0,affectedNodeIds:['penghu','kinmen','matsu','green-island']}),{id:'sea',atMinute:2,type:'CARRIER_CAPACITY',mode:'sea',availabilityRatio:0,affectedNodeIds:['penghu','kinmen','matsu','green-island']});
    expect(evaluateConstraints(generated[0],disconnected,taiwanMarket).violations.some(item=>item.code==='ISLAND_CONNECTIVITY_RISK')).toBe(true);
  });

  it('does not let a capacity reservation manufacture processing capacity',()=>{
    const state=createInitialState(taiwanMarket,'reservation-constraint');
    const candidate={
      ...generateCandidatePolicies(state,taiwanMarket)[1],
      id:'reservation-cannot-expand-capacity',
      actions:[{type:'CAPACITY_RESERVATION' as const,nodeId:'warehouse-a',capacity:2_000}],
      allocations:[{nodeId:'warehouse-a',volume:1_000}],
      requiredEdgeIds:[],
    };
    const constrained=evaluateConstraints(candidate,state,taiwanMarket);
    expect(constrained.feasible).toBe(false);
    expect(constrained.violations.map(item=>item.code)).toContain('CAPACITY_CONSTRAINT');

    const withoutReservation={...candidate,actions:[]};
    const neutral={demandMultiplier:1,transitMultiplier:1,weatherDelta:0,trafficDelta:0,carrierMultiplier:1,throughputMultiplier:1};
    expect(simulatePolicy(state,taiwanMarket,candidate,neutral)).toEqual(simulatePolicy(state,taiwanMarket,withoutReservation,neutral));
  });

  it('uses carrier-capacity uncertainty in policy simulation',()=>{
    const state=createInitialState(taiwanMarket,'carrier-uncertainty');
    const candidate=generateCandidatePolicies(state,taiwanMarket).find(item=>item.id==='island-air-priority')!;
    const neutral={demandMultiplier:1,transitMultiplier:1,weatherDelta:0,trafficDelta:0,carrierMultiplier:1,throughputMultiplier:1};
    const constrainedCarrier={...neutral,carrierMultiplier:.35};
    expect(simulatePolicy(state,taiwanMarket,candidate,constrainedCarrier)).not.toEqual(simulatePolicy(state,taiwanMarket,candidate,neutral));
  });

  it('rejects baseline overload at any served node even without a new allocation',()=>{
    const state=createInitialState(taiwanMarket,'all-node-capacity');
    state.nodes['green-island'].availableCapacityRatio=.2;
    const candidate=generateCandidatePolicies(state,taiwanMarket).find(item=>item.id==='island-air-priority')!;
    const result=evaluateConstraints(candidate,state,taiwanMarket);
    expect(result.feasible).toBe(false);
    expect(result.violations).toEqual(expect.arrayContaining([expect.objectContaining({code:'CAPACITY_CONSTRAINT',subjectId:'green-island'})]));
  });

  it('runs on a non-Taiwan synthetic market fixture',()=>{
    const state=createInitialState(syntheticMarket,'synthetic');
    expect(Object.keys(state.nodes)).toEqual(['alpha','beta','gamma-island']);
    expect(generateCandidatePolicies(state,syntheticMarket).length).toBeGreaterThanOrEqual(5);
  });
});
