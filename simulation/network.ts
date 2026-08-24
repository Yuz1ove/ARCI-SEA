import type { NationalNetworkKpis, NetworkNodeState, NetworkRisk, Provenance, WarehouseState } from './types';

export type OffshoreInput = Pick<NetworkNodeState,'id'|'name'|'transport'|'orderRate'|'capacity'|'load'|'slaRate'|'predictedDelay'|'transportAvailability'|'weatherDisruption'|'trafficDisruption'|'riskScore'|'constraint'|'health'>;

const mainIslandNames:Record<WarehouseState['id'],string>={
  'warehouse-a':'北部',
  'warehouse-b':'中部',
  'warehouse-c':'南部',
};
const mainIslandShares=[.44,.34,.22];
const slaOffsets=[.6,-.9,.2];
const healthRisk:Record<WarehouseState['health'],number>={healthy:20,strained:47,critical:82,degraded:86,unavailable:96};

export const riskLabel=(score:number):NetworkRisk=>score>=70?'高':score>=40?'中':'低';
const round=(value:number,digits=1)=>Number(value.toFixed(digits));

export function buildNetworkNodes({orderRate,onTimeRate,warehouses,offshore,provenance}:{orderRate:number;onTimeRate:number;warehouses:WarehouseState[];offshore:OffshoreInput[];provenance:Provenance}):NetworkNodeState[]{
  const offshoreRate=offshore.reduce((sum,node)=>sum+node.orderRate,0);
  const mainRate=Math.max(0,orderRate-offshoreRate);
  const mainNodes=warehouses.map((warehouse,index):NetworkNodeState=>({
    id:warehouse.id,
    name:mainIslandNames[warehouse.id],
    scope:'main-island',
    transport:'陸運幹線',
    orderRate:index===warehouses.length-1?mainRate-Math.round(mainRate*mainIslandShares[0])-Math.round(mainRate*mainIslandShares[1]):Math.round(mainRate*mainIslandShares[index]),
    capacity:warehouse.capacity,
    load:warehouse.load,
    slaRate:round(onTimeRate+slaOffsets[index]),
    predictedDelay:warehouse.predictedDelay,
    transportAvailability:warehouse.health==='healthy'?96:warehouse.health==='strained'?78:42,
    weatherDisruption:warehouse.region.includes('高雄')?18:10,
    trafficDisruption:warehouse.health==='healthy'?8:warehouse.health==='strained'?46:82,
    riskScore:healthRisk[warehouse.health],
    risk:riskLabel(healthRisk[warehouse.health]),
    constraint:warehouse.health==='healthy'?'容量安全':warehouse.health==='strained'?'容量緩衝下降':'需優先分流',
    health:warehouse.health,
    provenance,
  }));
  return [...mainNodes,...offshore.map(node=>({...node,scope:'offshore' as const,risk:riskLabel(node.riskScore),provenance}))];
}

export function aggregateNetworkNodes(nodes:NetworkNodeState[],provenance:Provenance):NationalNetworkKpis{
  const orderRate=nodes.reduce((sum,node)=>sum+node.orderRate,0);
  const weighted=(read:(node:NetworkNodeState)=>number)=>orderRate===0?0:nodes.reduce((sum,node)=>sum+read(node)*node.orderRate,0)/orderRate;
  return {
    nodeCount:nodes.length,
    orderRate,
    onTimeRate:round(weighted(node=>node.slaRate)),
    averageDelayHours:round(weighted(node=>node.predictedDelay)),
    riskExposure:Math.round(weighted(node=>node.riskScore)),
    capacityBalance:Math.round(weighted(node=>100-node.load)),
    aggregation:`${nodes.length} 節點需求量加總；SLA、延遲、風險與容量依情境訂單量加權。`,
    provenance,
  };
}
