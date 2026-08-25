import { clamp, mean, safeDivide } from './math';
import { DECISION_ENGINE_PARAMETERS } from './config';
import type { SimulationDisturbance } from './random';
import type { CandidatePolicy, CommerceNetworkState, MarketConfig, SimulationMetrics } from './types';

const neutral:SimulationDisturbance={demandMultiplier:1,transitMultiplier:1,weatherDelta:0,trafficDelta:0,carrierMultiplier:1,throughputMultiplier:1};

export function simulatePolicy(state:CommerceNetworkState,market:MarketConfig,candidate:CandidatePolicy,disturbance:SimulationDisturbance=neutral):SimulationMetrics{
  const parameters=DECISION_ENGINE_PARAMETERS.simulation;
  const backlogHours=DECISION_ENGINE_PARAMETERS.state.backlogDrainHours;
  const nodes=Object.values(state.nodes);
  const totalDemand=nodes.reduce((total,node)=>total+node.inboundRate*state.demandMultiplier*disturbance.demandMultiplier+node.backlog/backlogHours,0);
  const reservations=new Map<string,number>();
  let heldVolume=0,prioritization=0,routeIntervention=0,reroutedVolume=0,modeSwitch=0,inventoryRebalance=0;
  for(const action of candidate.actions){
    if(action.type==='CAPACITY_RESERVATION') reservations.set(action.nodeId,(reservations.get(action.nodeId)??0)+action.capacity);
    if(action.type==='TEMPORARY_HOLD') heldVolume+=action.volume;
    if(action.type==='ORDER_PRIORITIZATION') prioritization=Math.max(prioritization,action.highPriorityRatio);
    if(action.type==='REROUTE'){routeIntervention+=safeDivide(action.volume,totalDemand);reroutedVolume+=action.volume;}
    if(action.type==='CARRIER_MODE_SWITCH') modeSwitch+=safeDivide(action.volume,totalDemand);
    if(action.type==='INVENTORY_REBALANCE') inventoryRebalance+=safeDivide(action.units,totalDemand);
  }
  const allocations=new Map(candidate.allocations.map(item=>[item.nodeId,item.volume]));
  const reservationCoverage=Math.min(1,[...reservations.entries()].reduce((total,[nodeId,value])=>{
    const node=state.nodes[nodeId];
    return total+safeDivide(value,node?node.processingCapacityPerHour*node.availableCapacityRatio:0);
  },0));
  const stabilizedThroughput=1+(disturbance.throughputMultiplier-1)*(1-reservationCoverage*parameters.reservationVarianceReduction);
  const stressedNodeId=nodes.map(node=>({id:node.id,load:safeDivide(node.inboundRate*state.demandMultiplier+node.backlog/backlogHours,node.processingCapacityPerHour*node.availableCapacityRatio,2)})).sort((a,b)=>b.load-a.load)[0]?.id;
  const nodeLoads=nodes.map(node=>{
    const transferredOut=node.id===stressedNodeId?reroutedVolume:0;
    const demand=Math.max(0,node.inboundRate*state.demandMultiplier*disturbance.demandMultiplier+node.backlog/backlogHours-transferredOut)+(allocations.get(node.id)??0);
    const capacity=node.processingCapacityPerHour*node.availableCapacityRatio*stabilizedThroughput;
    return safeDivide(demand,capacity,2);
  });
  const edgeConditions=candidate.requiredEdgeIds.map(edgeId=>{
    const edge=state.edges[edgeId];
    if(!edge) return {capacity:0,flow:0,availability:0,pressure:2,risk:1,transitMinutes:240};
    const carrierAvailability=Math.min(state.nodes[edge.from]?.carrierAvailability[edge.mode]??0,state.nodes[edge.to]?.carrierAvailability[edge.mode]??0);
    const availability=clamp(edge.currentCapacityRatio*carrierAvailability*disturbance.carrierMultiplier);
    const capacity=edge.maxCapacity*availability;
    let rerouteFlow=0,switchedFlow=0;
    for(const action of candidate.actions){
      if(action.type==='REROUTE'&&action.edgeIds.includes(edgeId)) rerouteFlow+=safeDivide(action.volume,action.edgeIds.length);
      if(action.type==='CARRIER_MODE_SWITCH'&&action.toMode===edge.mode&&action.nodeId===edge.to) switchedFlow+=action.volume;
    }
    const flow=rerouteFlow+switchedFlow;
    return {capacity,flow,availability,pressure:flow?clamp(safeDivide(flow,capacity,2),0,2):0,risk:clamp(edge.disruptionProbability+(1-availability)*parameters.carrierAvailabilityRiskImpact),transitMinutes:edge.nominalTransitMinutes};
  });
  const corridorOverload=Math.max(0,...edgeConditions.map(edge=>Math.max(0,edge.pressure-1)));
  const maximumLoad=Math.max(...nodeLoads,1+corridorOverload);
  const averageLoad=mean(nodeLoads);
  const weatherRisk=clamp(state.weatherSeverity+disturbance.weatherDelta);
  const trafficRisk=clamp(state.trafficSeverity+disturbance.trafficDelta);
  const edgeRisk=edgeConditions.length?mean(edgeConditions.map(edge=>edge.risk)):mean(Object.values(state.edges).map(edge=>edge.disruptionProbability));
  const interventionBenefit=clamp(routeIntervention*parameters.routeBenefit+prioritization*parameters.priorityBenefit+inventoryRebalance*parameters.inventoryBenefit+modeSwitch*parameters.modeSwitchBenefit);
  const effectiveRisk=clamp((weatherRisk*parameters.weatherRiskWeight+trafficRisk*parameters.trafficRiskWeight+edgeRisk*parameters.edgeRiskWeight)*(1-interventionBenefit*parameters.interventionRiskReduction));
  const corridorShortage=edgeConditions.reduce((total,edge)=>total+Math.max(0,edge.flow-edge.capacity),0);
  const shortage=Math.max(0,totalDemand-heldVolume-nodes.reduce((total,node)=>total+node.processingCapacityPerHour*node.availableCapacityRatio*stabilizedThroughput,0))+corridorShortage;
  const overload=Math.max(0,maximumLoad-1);
  const routeMinutes=edgeConditions.length?mean(edgeConditions.map(edge=>edge.transitMinutes*disturbance.transitMultiplier*(1+(1-edge.availability)*parameters.corridorDelayAvailabilityImpact+Math.max(0,edge.pressure-.75)*parameters.corridorDelayPressureImpact))):90*disturbance.transitMultiplier;
  const averageDelayHours=clamp(routeMinutes/60*parameters.routeDelayShare+overload*parameters.overloadDelayHours+effectiveRisk*parameters.riskDelayHours-interventionBenefit*parameters.interventionDelayHours,.15,12);
  const unfulfilledOrders=Math.max(0,Math.round((shortage+overload*totalDemand*parameters.overloadUnfulfilledShare+heldVolume*parameters.holdUnfulfilledShare)*(1-prioritization*parameters.priorityUnfulfilledReduction)));
  const serviceLevel=clamp(1-safeDivide(unfulfilledOrders,totalDemand)*parameters.serviceUnfulfilledImpact-averageDelayHours/parameters.serviceDelayDivisor-effectiveRisk*parameters.serviceRiskImpact+interventionBenefit*parameters.serviceInterventionGain,.5,1);
  const slaBreaches=Math.max(0,Math.round(totalDemand*Math.max(0,market.slaPolicies.minimumServiceLevel-serviceLevel)*parameters.slaBreachDemandShare+unfulfilledOrders*parameters.slaBreachUnfulfilledShare));
  const recoveryTimeMinutes=Math.round(clamp(parameters.recoveryBaseMinutes+overload*parameters.recoveryOverloadMinutes+effectiveRisk*parameters.recoveryRiskMinutes+averageDelayHours*parameters.recoveryDelayMinutes-interventionBenefit*parameters.recoveryInterventionMinutes,6,180));
  const capacityOverloadMinutes=Math.round(clamp(overload*parameters.overloadNodeMinutes+Math.max(0,averageLoad-1)*parameters.overloadAverageMinutes,0,180));
  const operationalCost=parameters.baseOperationalCost+candidate.estimatedCost/Math.max(1,totalDemand)*parameters.candidateCostScale+modeSwitch*parameters.modeSwitchCost+inventoryRebalance*parameters.inventoryRebalanceCost;
  return {slaBreaches,averageDelayHours:Number(averageDelayHours.toFixed(2)),p90DelayHours:Number(averageDelayHours.toFixed(2)),recoveryTimeMinutes,operationalCost:Number(operationalCost.toFixed(2)),capacityOverloadMinutes,serviceLevel:Number(serviceLevel.toFixed(4)),unfulfilledOrders};
}
