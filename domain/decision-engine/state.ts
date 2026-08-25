import { clamp, safeDivide, stableHash } from './math';
import { DECISION_ENGINE_PARAMETERS } from './config';
import type { CommerceEvent, CommerceNetworkState, MarketConfig } from './types';

export function createInitialState(market:MarketConfig,seed:string):CommerceNetworkState{
  const nodes=Object.fromEntries(market.nodes.map(node=>[node.id,{...node,carrierAvailability:{...node.carrierAvailability},currentWeatherRisk:0,currentTrafficRisk:0,failed:false}]));
  const edges=Object.fromEntries(market.edges.map(edge=>[edge.id,{...edge,available:edge.currentCapacityRatio>0}]));
  return {marketId:market.marketId,timeMinutes:0,nodes,edges,demandMultiplier:1,weatherSeverity:0,trafficSeverity:0,slaPressure:0,seed,appliedEventIds:[]};
}

const cloneState=(state:CommerceNetworkState):CommerceNetworkState=>({
  ...state,nodes:Object.fromEntries(Object.entries(state.nodes).map(([id,node])=>[id,{...node,carrierAvailability:{...node.carrierAvailability}}])),edges:Object.fromEntries(Object.entries(state.edges).map(([id,edge])=>[id,{...edge}])),appliedEventIds:[...state.appliedEventIds],
});

function finalizeState(state:CommerceNetworkState):CommerceNetworkState{
  const parameters=DECISION_ENGINE_PARAMETERS.state;
  const nodes=Object.values(state.nodes);
  const demand=nodes.reduce((total,node)=>total+(node.inboundRate*state.demandMultiplier)+node.backlog/parameters.backlogDrainHours,0);
  const capacity=nodes.reduce((total,node)=>total+node.processingCapacityPerHour*node.availableCapacityRatio,0);
  const operationalRisk=nodes.reduce((total,node)=>total+Math.max(node.currentWeatherRisk,node.currentTrafficRisk),0)/Math.max(1,nodes.length);
  state.slaPressure=clamp(Math.max(0,safeDivide(demand,capacity,1)-parameters.slaPressureLoadStart)*parameters.slaPressureLoadScale+operationalRisk*parameters.slaPressureRiskWeight);
  for(const node of nodes){
    node.serviceLevel=clamp(node.serviceLevel-state.slaPressure*parameters.servicePressureImpact-node.currentWeatherRisk*parameters.serviceWeatherImpact-node.currentTrafficRisk*parameters.serviceTrafficImpact,.5,1);
    node.backlog=Math.max(0,Math.round(node.backlog+(node.inboundRate*state.demandMultiplier-node.processingCapacityPerHour*node.availableCapacityRatio)*parameters.backlogUpdateShare));
  }
  return state;
}

export function applyCommerceEvent(current:CommerceNetworkState,event:CommerceEvent):CommerceNetworkState{
  const impact=DECISION_ENGINE_PARAMETERS.eventImpact;
  const state=cloneState(current);
  state.timeMinutes=Math.max(state.timeMinutes,event.atMinute);
  state.appliedEventIds.push(event.id);
  if(event.type==='DEMAND_SURGE') state.demandMultiplier=Math.max(state.demandMultiplier,event.multiplier);
  if(event.type==='TRAFFIC_DISRUPTION'){
    state.trafficSeverity=Math.max(state.trafficSeverity,clamp(event.severity));
    for(const edgeId of event.affectedEdgeIds){
      const edge=state.edges[edgeId];
      if(!edge) continue;
      edge.currentCapacityRatio=clamp(edge.currentCapacityRatio*(1-event.severity*(impact.trafficCapacityBase+edge.congestionFactor)));
      edge.disruptionProbability=clamp(edge.disruptionProbability+event.severity*impact.trafficDisruptionIncrease);
      edge.available=edge.currentCapacityRatio>impact.edgeAvailabilityFloor;
      state.nodes[edge.from].currentTrafficRisk=Math.max(state.nodes[edge.from].currentTrafficRisk,event.severity*state.nodes[edge.from].trafficExposure);
      state.nodes[edge.to].currentTrafficRisk=Math.max(state.nodes[edge.to].currentTrafficRisk,event.severity*state.nodes[edge.to].trafficExposure);
    }
  }
  if(event.type==='WEATHER_DISRUPTION'){
    state.weatherSeverity=Math.max(state.weatherSeverity,clamp(event.severity));
    for(const nodeId of event.affectedNodeIds){
      const node=state.nodes[nodeId];
      if(!node) continue;
      node.currentWeatherRisk=Math.max(node.currentWeatherRisk,event.severity*node.weatherExposure);
      node.availableCapacityRatio=clamp(node.availableCapacityRatio*(1-node.currentWeatherRisk*impact.weatherNodeCapacityImpact));
    }
    for(const edge of Object.values(state.edges)){
      if(!event.affectedNodeIds.includes(edge.from)&&!event.affectedNodeIds.includes(edge.to)) continue;
      edge.currentCapacityRatio=clamp(edge.currentCapacityRatio*(1-event.severity*edge.weatherSensitivity*impact.weatherEdgeCapacityImpact));
      edge.disruptionProbability=clamp(edge.disruptionProbability+event.severity*edge.weatherSensitivity*impact.weatherDisruptionIncrease);
      edge.available=edge.currentCapacityRatio>impact.edgeAvailabilityFloor;
    }
  }
  if(event.type==='CARRIER_CAPACITY'){
    for(const nodeId of event.affectedNodeIds){
      const node=state.nodes[nodeId];
      if(node) node.carrierAvailability[event.mode]=clamp(event.availabilityRatio);
    }
    for(const edge of Object.values(state.edges)) if(edge.mode===event.mode&&(event.affectedNodeIds.includes(edge.from)||event.affectedNodeIds.includes(edge.to))){
      edge.currentCapacityRatio=clamp(edge.currentCapacityRatio*event.availabilityRatio);
      edge.available=edge.currentCapacityRatio>impact.edgeAvailabilityFloor&&event.availabilityRatio>impact.carrierAvailabilityFloor;
    }
  }
  if(event.type==='NODE_FAILURE'){
    const node=state.nodes[event.nodeId];
    if(node){node.availableCapacityRatio=clamp(event.remainingCapacityRatio);node.failed=node.availableCapacityRatio<impact.nodeFailureThreshold;}
    for(const edge of Object.values(state.edges)) if(edge.from===event.nodeId||edge.to===event.nodeId){edge.currentCapacityRatio=clamp(edge.currentCapacityRatio*event.remainingCapacityRatio);edge.available=edge.currentCapacityRatio>impact.edgeAvailabilityFloor;}
  }
  if(event.type==='RECOVERY') for(const nodeId of event.affectedNodeIds){
    const node=state.nodes[nodeId];
    if(node){node.availableCapacityRatio=clamp(node.availableCapacityRatio+event.capacityRestoreRatio);node.currentTrafficRisk*=impact.recoveryTrafficRetention;node.currentWeatherRisk*=impact.recoveryWeatherRetention;node.failed=false;}
  }
  return finalizeState(state);
}

export function buildScenarioState(market:MarketConfig,events:CommerceEvent[],seed:string){
  const initialState=createInitialState(market,seed);
  const state=[...events].sort((a,b)=>a.atMinute-b.atMinute).reduce(applyCommerceEvent,initialState);
  return {initialState,state,stateSnapshotId:`STATE-${stableHash(JSON.stringify(state)).toUpperCase()}`};
}

export function createCommerceDigitalTwin(market:MarketConfig,events:CommerceEvent[],seed:string){
  const {initialState,state,stateSnapshotId}=buildScenarioState(market,events,seed);
  return {marketId:market.marketId,initialState,currentState:state,stateSnapshotId};
}
