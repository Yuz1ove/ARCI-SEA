import { DECISION_ENGINE_PARAMETERS } from './config';
import { clamp, safeDivide } from './math';
import type { CandidatePolicy, CommerceNetworkState, ConstraintResult, ConstraintViolation, MarketConfig } from './types';

export function evaluateConstraints(candidate:CandidatePolicy,state:CommerceNetworkState,market:MarketConfig):ConstraintResult{
  const violations:ConstraintViolation[]=[];
  const reservations=new Map<string,number>();
  for(const action of candidate.actions) if(action.type==='CAPACITY_RESERVATION') reservations.set(action.nodeId,(reservations.get(action.nodeId)??0)+action.capacity);
  const allocations=new Map<string,number>();
  for(const allocation of candidate.allocations) allocations.set(allocation.nodeId,(allocations.get(allocation.nodeId)??0)+allocation.volume);
  const rerouteVolume=candidate.actions.filter(action=>action.type==='REROUTE').reduce((total,action)=>total+action.volume,0);
  const heldByNode=new Map<string,number>();
  for(const action of candidate.actions) if(action.type==='TEMPORARY_HOLD'){
    const scopedDemand=action.nodeIds.reduce((total,nodeId)=>{const node=state.nodes[nodeId];return total+(node?node.inboundRate*state.demandMultiplier+node.backlog/DECISION_ENGINE_PARAMETERS.state.backlogDrainHours:0);},0);
    for(const nodeId of action.nodeIds){
      const node=state.nodes[nodeId];
      const demand=node?node.inboundRate*state.demandMultiplier+node.backlog/DECISION_ENGINE_PARAMETERS.state.backlogDrainHours:0;
      heldByNode.set(nodeId,(heldByNode.get(nodeId)??0)+action.volume*safeDivide(demand,scopedDemand));
    }
  }
  const stressedNodeId=Object.values(state.nodes).map(node=>({id:node.id,load:safeDivide(node.inboundRate*state.demandMultiplier+node.backlog/DECISION_ENGINE_PARAMETERS.state.backlogDrainHours,node.processingCapacityPerHour*node.availableCapacityRatio,2)})).sort((a,b)=>b.load-a.load||a.id.localeCompare(b.id))[0]?.id;
  let minimumMargin=1;
  for(const node of Object.values(state.nodes)){
    const baseDemand=node.inboundRate*state.demandMultiplier+node.backlog/DECISION_ENGINE_PARAMETERS.state.backlogDrainHours;
    const available=node.processingCapacityPerHour*node.availableCapacityRatio;
    // A reservation earmarks existing capacity; it never creates throughput.
    const incomingCommitment=Math.max(allocations.get(node.id)??0,reservations.get(node.id)??0);
    const transferredOut=node.id===stressedNodeId?rerouteVolume:0;
    const projectedDemand=Math.max(0,baseDemand-transferredOut-(heldByNode.get(node.id)??0))+incomingCommitment;
    const margin=safeDivide(available-projectedDemand,Math.max(1,available),-1);
    minimumMargin=Math.min(minimumMargin,margin);
    if(margin<DECISION_ENGINE_PARAMETERS.minimumCapacityMargin) violations.push({code:'CAPACITY_CONSTRAINT',subjectId:node.id,actual:Math.round(projectedDemand),limit:Math.round(available*(1-DECISION_ENGINE_PARAMETERS.minimumCapacityMargin)),message:`${node.id} projected demand exceeds safe physical processing capacity.`});
  }
  for(const action of candidate.actions) if(action.type==='INVENTORY_REBALANCE'){
    const available=state.nodes[action.from]?.inventory??0;
    if(action.units>available) violations.push({code:'INVENTORY_CONSTRAINT',subjectId:action.from,actual:action.units,limit:available,message:'Inventory transfer exceeds available inventory.'});
  }
  for(const allocation of candidate.allocations){
    const inventory=state.nodes[allocation.nodeId]?.inventory??0;
    if(allocation.volume>inventory) violations.push({code:'INVENTORY_CONSTRAINT',subjectId:allocation.nodeId,actual:allocation.volume,limit:inventory,message:'Allocated flow exceeds inventory available at the destination node.'});
  }
  const allocatedVolume=candidate.allocations.reduce((total,allocation)=>total+allocation.volume,0);
  if(rerouteVolume>0&&Math.abs(rerouteVolume-allocatedVolume)>.5) violations.push({code:'FLOW_CONSERVATION',subjectId:candidate.id,actual:allocatedVolume,limit:rerouteVolume,message:'Rerouted flow must equal the sum of destination allocations.'});
  for(const action of candidate.actions) if(action.type==='REROUTE'&&!action.edgeIds.length) violations.push({code:'ROUTE_UNAVAILABLE',subjectId:candidate.id,actual:'NO_EDGE',limit:'ROUTABLE_EDGE_REQUIRED',message:'Reroute action has no market corridor.'});
  const networkDemand=Object.values(state.nodes).reduce((total,node)=>total+node.inboundRate*state.demandMultiplier,0);
  for(const edgeId of candidate.requiredEdgeIds){
    const edge=state.edges[edgeId];
    const carrierAvailability=edge?Math.min(state.nodes[edge.from]?.carrierAvailability[edge.mode]??0,state.nodes[edge.to]?.carrierAvailability[edge.mode]??0):0;
    const edgeCapacity=edge?edge.maxCapacity*edge.currentCapacityRatio*carrierAvailability:0;
    let rerouteFlow=0,switchedFlow=0;
    for(const action of candidate.actions){
      if(action.type==='REROUTE'&&action.edgeIds.includes(edgeId)) rerouteFlow+=safeDivide(action.volume,action.edgeIds.length);
      if(action.type==='CARRIER_MODE_SWITCH'&&action.toMode===edge?.mode&&action.nodeId===edge.to) switchedFlow+=action.volume;
    }
    const required=rerouteFlow+switchedFlow;
    if(!edge||!edge.available||carrierAvailability<=DECISION_ENGINE_PARAMETERS.eventImpact.carrierAvailabilityFloor||required>edgeCapacity) violations.push({code:'ROUTE_UNAVAILABLE',subjectId:edgeId,actual:Math.round(edgeCapacity),limit:Math.round(required),message:'Required corridor is unavailable or lacks capacity for the candidate flow.'});
  }
  for(const islandId of market.geographicConstraints.offshoreNodeIds){
    if(!candidate.servedNodeIds.includes(islandId)) continue;
    const connections=Object.values(state.edges).filter(edge=>edge.to===islandId&&edge.available&&edge.currentCapacityRatio>DECISION_ENGINE_PARAMETERS.eventImpact.edgeAvailabilityFloor&&state.nodes[islandId].carrierAvailability[edge.mode]>DECISION_ENGINE_PARAMETERS.eventImpact.carrierAvailabilityFloor);
    if(!connections.length) violations.push({code:'ISLAND_CONNECTIVITY_RISK',subjectId:islandId,actual:'NO_AVAILABLE_MODE',limit:'AIR_OR_SEA_REQUIRED',message:`${islandId} has no feasible air or sea connection.`});
  }
  const missing=market.geographicConstraints.requiredServiceNodeIds.filter(id=>!candidate.servedNodeIds.includes(id));
  if(missing.length) violations.push({code:'OPERATIONAL_NODE_COVERAGE',subjectId:missing.join(','),actual:candidate.servedNodeIds.length,limit:market.geographicConstraints.requiredServiceNodeIds.length,message:'Candidate does not cover every operational node.'});
  const hold=candidate.actions.find(action=>action.type==='TEMPORARY_HOLD');
  const totalDemand=networkDemand;
  const heldScopeDemand=hold?hold.nodeIds.reduce((total,nodeId)=>total+(state.nodes[nodeId]?.inboundRate??0)*state.demandMultiplier,0):totalDemand;
  if(hold&&safeDivide(hold.volume,heldScopeDemand)>(1-market.slaPolicies.minimumServiceLevel)) violations.push({code:'MINIMUM_SERVICE_REQUIREMENT',subjectId:hold.nodeIds.join(','),actual:clamp(1-safeDivide(hold.volume,heldScopeDemand)),limit:market.slaPolicies.minimumServiceLevel,message:'Temporary hold would breach the minimum service requirement for affected nodes.'});
  return {feasible:violations.length===0,violations,capacityMargin:clamp(minimumMargin,-1,1)};
}
