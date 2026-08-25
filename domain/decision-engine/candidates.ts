import { clamp, safeDivide } from './math';
import { DECISION_ENGINE_PARAMETERS } from './config';
import type { CandidatePolicy, CommerceNetworkState, MarketConfig } from './types';

const operationalDemand=(state:CommerceNetworkState)=>Object.values(state.nodes).reduce((total,node)=>total+node.inboundRate*state.demandMultiplier,0);
const reallocationVolume=(state:CommerceNetworkState)=>{
  const parameters=DECISION_ENGINE_PARAMETERS.candidate;
  const backlogHours=DECISION_ENGINE_PARAMETERS.state.backlogDrainHours;
  const nodes=Object.values(state.nodes);
  const stressed=[...nodes].sort((a,b)=>safeDivide(b.inboundRate*state.demandMultiplier+b.backlog/backlogHours,b.processingCapacityPerHour*b.availableCapacityRatio,2)-safeDivide(a.inboundRate*state.demandMultiplier+a.backlog/backlogHours,a.processingCapacityPerHour*a.availableCapacityRatio,2))[0];
  const safeCapacity=(node:typeof stressed)=>node.processingCapacityPerHour*node.availableCapacityRatio*(1-DECISION_ENGINE_PARAMETERS.minimumCapacityMargin);
  const demand=(node:typeof stressed)=>node.inboundRate*state.demandMultiplier+node.backlog/backlogHours;
  const requiredRelief=Math.max(0,demand(stressed)-safeCapacity(stressed));
  const spare=nodes.filter(node=>node.id!==stressed.id).reduce((total,node)=>total+Math.max(0,safeCapacity(node)-demand(node)),0);
  const riskBuffer=operationalDemand(state)*clamp(parameters.minimumRiskBufferShare+state.slaPressure*parameters.slaRiskBufferShare,parameters.minimumRiskBufferShare,parameters.maximumRiskBufferShare);
  return Math.max(1,Math.round(Math.min(Math.max(requiredRelief,riskBuffer),spare*parameters.maximumSpareUse)));
};

export function generateCandidatePolicies(state:CommerceNetworkState,market:MarketConfig):CandidatePolicy[]{
  const volume=reallocationVolume(state);
  const parameters=DECISION_ENGINE_PARAMETERS.candidate;
  const islandVolume=Math.round(market.geographicConstraints.offshoreNodeIds.reduce((total,id)=>total+(state.nodes[id]?.inboundRate??0),0)*state.demandMultiplier*parameters.islandModeSwitchShare);
  const all=[...market.geographicConstraints.requiredServiceNodeIds];
  const cost=(edgeIds:string[])=>edgeIds.reduce((total,id)=>total+(state.edges[id]?.operatingCost??0),0);
  const mainNodes=market.nodes.filter(node=>node.scope==='main-island');
  const nodeLoad=(id:string)=>{const node=state.nodes[id];return node?safeDivide(node.inboundRate*state.demandMultiplier+node.backlog/DECISION_ENGINE_PARAMETERS.state.backlogDrainHours,node.processingCapacityPerHour*node.availableCapacityRatio,2):0;};
  const stressedId=[...mainNodes].sort((a,b)=>nodeLoad(b.id)-nodeLoad(a.id)||a.id.localeCompare(b.id))[0]?.id??mainNodes[0]?.id;
  const recipients=mainNodes.filter(node=>node.id!==stressedId);
  const allocationNodes=recipients.length?recipients:mainNodes;
  const firstNode=allocationNodes[0]??market.nodes[0];
  const lastNode=allocationNodes.at(-1)??firstNode;
  const mainNodeIds=new Set(mainNodes.map(node=>node.id));
  const mainEdges=market.edges.filter(edge=>mainNodeIds.has(edge.from)&&mainNodeIds.has(edge.to));
  const failedNodeIds=new Set(Object.values(state.nodes).filter(node=>node.failed).map(node=>node.id));
  const directEdge=[...mainEdges].sort((a,b)=>Number(failedNodeIds.has(a.from)||failedNodeIds.has(a.to))-Number(failedNodeIds.has(b.from)||failedNodeIds.has(b.to))||b.maxCapacity-a.maxCapacity||a.id.localeCompare(b.id))[0];
  const priorityEdge=mainEdges.find(edge=>(edge.from===firstNode?.id||edge.to===firstNode?.id)&&(edge.from===stressedId||edge.to===stressedId))??directEdge;
  const keepEdges=mainEdges.slice(0,Math.min(2,mainEdges.length)).map(edge=>edge.id);
  const regionalAllocations=firstNode.id===lastNode.id?[{nodeId:firstNode.id,volume}]:[{nodeId:firstNode.id,volume:Math.round(volume/2)},{nodeId:lastNode.id,volume:volume-Math.round(volume/2)}];
  const directAllocations=firstNode.id===lastNode.id?[{nodeId:firstNode.id,volume}]:[{nodeId:lastNode.id,volume:Math.round(volume*parameters.directDestinationShare)},{nodeId:firstNode.id,volume:volume-Math.round(volume*parameters.directDestinationShare)}];
  const reservationActions=(allocations:typeof regionalAllocations)=>allocations.map(allocation=>({type:'CAPACITY_RESERVATION' as const,nodeId:allocation.nodeId,capacity:allocation.volume}));
  const offshoreIds=market.geographicConstraints.offshoreNodeIds;
  const airEdges=market.edges.filter(edge=>edge.mode==='air'&&offshoreIds.includes(edge.to));
  const airNodeIds=new Set(airEdges.map(edge=>edge.to));
  const inventoryFrom=[...mainNodes].filter(node=>node.id!==lastNode.id).sort((a,b)=>b.inventory-a.inventory||a.id.localeCompare(b.id))[0]??firstNode;
  const inventoryFlow=Math.round(volume*parameters.inventoryFlowShare);
  const directEdgeIds=directEdge?[directEdge.id]:[];
  const priorityEdgeIds=priorityEdge?[priorityEdge.id]:[];
  const directCost=cost(directEdgeIds),priorityCost=cost(priorityEdgeIds);
  return [
    {id:'keep-current',routeId:'route-a',label:'維持現行網路',description:'不新增調度，僅使用目前走廊與既有節點配置。',actions:[{type:'KEEP_CURRENT_POLICY'}],allocations:[],requiredEdgeIds:keepEdges,servedNodeIds:all,switchingMagnitude:0,estimatedCost:0},
    {id:'regional-split',routeId:'route-b',label:`${firstNode.region}／${lastNode.region} 區域分流`,description:'由可用主節點共同承接壓力流量並保留離島海空運緩衝。',actions:[{type:'REROUTE',edgeIds:directEdgeIds,volume},...reservationActions(regionalAllocations)],allocations:regionalAllocations,requiredEdgeIds:directEdgeIds,servedNodeIds:all,switchingMagnitude:clamp(safeDivide(volume,operationalDemand(state))),estimatedCost:directCost*volume},
    {id:'north-priority',routeId:'route-d',label:`${firstNode.region} 優先分流`,description:'由第一可用主節點優先承接高 SLA 訂單，再分批下放。',actions:[{type:'REROUTE',edgeIds:priorityEdgeIds,volume},{type:'CAPACITY_RESERVATION',nodeId:firstNode.id,capacity:volume},{type:'ORDER_PRIORITIZATION',nodeIds:[firstNode.id,...offshoreIds.slice(0,2)],highPriorityRatio:.7}],allocations:[{nodeId:firstNode.id,volume}],requiredEdgeIds:priorityEdgeIds,servedNodeIds:all,switchingMagnitude:clamp(safeDivide(volume,operationalDemand(state))),estimatedCost:priorityCost*volume*1.08},
    {id:'south-north-direct',routeId:'route-c',label:`${lastNode.region}／${firstNode.region} 直連＋離島保障`,description:'排除失效主節點，改用可用直連走廊並保留離島 gateway。',actions:[{type:'REROUTE',edgeIds:directEdgeIds,volume},...reservationActions(directAllocations),{type:'ORDER_PRIORITIZATION',nodeIds:offshoreIds,highPriorityRatio:.82}],allocations:directAllocations,requiredEdgeIds:directEdgeIds,servedNodeIds:all,switchingMagnitude:clamp(safeDivide(volume,operationalDemand(state))*(failedNodeIds.size?1:parameters.normalDirectSwitchingScale)),estimatedCost:directCost*volume*(failedNodeIds.size?parameters.failedDirectCostScale:parameters.normalDirectCostScale)},
    {id:'island-air-priority',label:'高 SLA 離島訂單切換航空',description:'將具航空 edge 的離島高 SLA 訂單切換航空並保留海運為 fallback。',actions:offshoreIds.filter(nodeId=>airNodeIds.has(nodeId)).map(nodeId=>({type:'CARRIER_MODE_SWITCH' as const,nodeId,fromMode:'sea' as const,toMode:'air' as const,volume:Math.max(1,Math.round(islandVolume/Math.max(1,airNodeIds.size)))})),allocations:[],requiredEdgeIds:airEdges.map(edge=>edge.id),servedNodeIds:all,switchingMagnitude:clamp(safeDivide(islandVolume,operationalDemand(state))),estimatedCost:airEdges.reduce((total,edge)=>total+edge.operatingCost,0)*islandVolume},
    {id:'inventory-rebalance',label:'跨區調撥庫存',description:'由安全庫存節點調撥至可用承接節點，並以同一走廊守恆地轉移履約流量。',actions:[{type:'INVENTORY_REBALANCE',from:inventoryFrom.id,to:lastNode.id,units:Math.round(volume*parameters.inventoryTransferShare)},{type:'REROUTE',edgeIds:directEdgeIds,volume:inventoryFlow},{type:'CAPACITY_RESERVATION',nodeId:lastNode.id,capacity:inventoryFlow}],allocations:[{nodeId:lastNode.id,volume:inventoryFlow}],requiredEdgeIds:directEdgeIds,servedNodeIds:all,switchingMagnitude:clamp(safeDivide(volume*parameters.inventoryTransferShare,operationalDemand(state))),estimatedCost:directCost*volume*.76},
    {id:'hold-low-priority',label:'延後低優先級配送',description:'暫緩部分低優先級訂單以保護高 SLA 訂單。',actions:[{type:'TEMPORARY_HOLD',nodeIds:offshoreIds,volume:Math.round(islandVolume*parameters.holdShare)},{type:'ORDER_PRIORITIZATION',nodeIds:all,highPriorityRatio:.75}],allocations:[],requiredEdgeIds:[],servedNodeIds:all,switchingMagnitude:clamp(safeDivide(islandVolume*parameters.holdShare,operationalDemand(state))),estimatedCost:operationalDemand(state)*parameters.holdCostShare},
  ];
}
