import { phaseOrder, snapshots } from './scenario';
import { aggregateNetworkNodes } from './network';
import type { CommerceSnapshot, NodeHealth, SimulationPhase } from './types';

export const stageDurationMs: Record<SimulationPhase, number> = {
  NORMAL: 6_000,
  SURGE: 8_000,
  WAREHOUSE_OVERLOAD: 7_000,
  DEGRADED: 8_000,
  DECIDING: 10_000,
  REROUTING: 12_000,
  RECOVERING: 9_000,
  SECOND_FAILURE: 7_000,
  REPLANNING: 10_000,
  UPDATED_EXECUTION: 6_000,
  RECOVERED: 7_000,
};

export const totalDemoDurationMs = phaseOrder.reduce((total, phase) => total + stageDurationMs[phase], 0);

export const stageDurationLabel = (phase: SimulationPhase) => `${stageDurationMs[phase] / 1_000}s`;

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export const segmentProgress = (progress: number, start: number, end: number) =>
  smoothstep((progress - start) / (end - start));

export function getDemoProgress(phase: SimulationPhase, stageProgress: number) {
  const phaseIndex = phaseOrder.indexOf(phase);
  const elapsedBefore = phaseOrder
    .slice(0, phaseIndex)
    .reduce((total, item) => total + stageDurationMs[item], 0);
  return clamp01((elapsedBefore + stageDurationMs[phase] * clamp01(stageProgress)) / totalDemoDurationMs);
}

export function getPreviousPhase(phase: SimulationPhase): SimulationPhase {
  const index = phaseOrder.indexOf(phase);
  return phaseOrder[Math.max(0, index - 1)];
}

const interpolate = (from: number, to: number, progress: number) => from + (to - from) * smoothstep(progress);
const round = (value: number, digits = 0) => Number(value.toFixed(digits));
const transitionHealth = (from: NodeHealth, to: NodeHealth, progress: number) => progress < 0.58 ? from : to;

export function interpolateSnapshot(phase: SimulationPhase, stageProgress: number): CommerceSnapshot {
  if (phase === 'NORMAL') return snapshots.NORMAL;
  const from = snapshots[getPreviousPhase(phase)];
  const to = snapshots[phase];
  const t = clamp01(stageProgress);
  const orderRate=Math.round(interpolate(from.orderRate,to.orderRate,t));
  const networkNodes=to.networkNodes.map(node=>{
    const previous=from.networkNodes.find(item=>item.id===node.id)??node;
    return {
      ...node,
      orderRate:Math.round(interpolate(previous.orderRate,node.orderRate,t)),
      load:Math.round(interpolate(previous.load,node.load,t)),
      slaRate:round(interpolate(previous.slaRate,node.slaRate,t),1),
      predictedDelay:round(interpolate(previous.predictedDelay,node.predictedDelay,t),1),
      riskScore:Math.round(interpolate(previous.riskScore,node.riskScore,t)),
      health:transitionHealth(previous.health,node.health,t),
    };
  });
  const rateDifference=orderRate-networkNodes.reduce((sum,node)=>sum+node.orderRate,0);
  const centralIndex=networkNodes.findIndex(node=>node.id==='warehouse-b');
  if(centralIndex>=0) networkNodes[centralIndex]={...networkNodes[centralIndex],orderRate:networkNodes[centralIndex].orderRate+rateDifference};
  return {
    ...to,
    orderRate,
    ordersAtRisk: Math.round(interpolate(from.ordersAtRisk, to.ordersAtRisk, t)),
    inventorySyncHealth: round(interpolate(from.inventorySyncHealth, to.inventorySyncHealth, t), 1),
    onTimeRate: round(interpolate(from.onTimeRate, to.onTimeRate, t), 1),
    averageDelayHours: round(interpolate(from.averageDelayHours, to.averageDelayHours, t), 1),
    extraCostPercent: round(interpolate(from.extraCostPercent, to.extraCostPercent, t), 1),
    recoveryScore: Math.round(interpolate(from.recoveryScore, to.recoveryScore, t)),
    activeRoute: t < 0.48 ? from.activeRoute : to.activeRoute,
    warehouses: to.warehouses.map((warehouse, index) => {
      const previous = from.warehouses[index] ?? warehouse;
      return {
        ...warehouse,
        load: Math.round(interpolate(previous.load, warehouse.load, t)),
        queue: Math.round(interpolate(previous.queue, warehouse.queue, t)),
        predictedDelay: round(interpolate(previous.predictedDelay, warehouse.predictedDelay, t), 1),
        health: transitionHealth(previous.health, warehouse.health, t),
      };
    }),
    carriers: to.carriers.map((carrier, index) => {
      const previous = from.carriers[index] ?? carrier;
      return {
        ...carrier,
        delay: round(interpolate(previous.delay, carrier.delay, t), 1),
        capacity: Math.round(interpolate(previous.capacity, carrier.capacity, t)),
        reliability: Math.round(interpolate(previous.reliability, carrier.reliability, t)),
        costScore: Math.round(interpolate(previous.costScore, carrier.costScore, t)),
        health: transitionHealth(previous.health, carrier.health, t),
        available: t < 0.58 ? previous.available : carrier.available,
      };
    }),
    networkNodes,
    networkKpis:aggregateNetworkNodes(networkNodes,to.networkKpis.provenance),
    metrics: {
      ...to.metrics,
      orderRate: { ...to.metrics.orderRate, value: orderRate },
      ordersAtRisk: { ...to.metrics.ordersAtRisk, value: Math.round(interpolate(from.ordersAtRisk, to.ordersAtRisk, t)) },
      onTimeRate: { ...to.metrics.onTimeRate, value: round(interpolate(from.onTimeRate, to.onTimeRate, t), 1) },
      averageDelayHours: { ...to.metrics.averageDelayHours, value: round(interpolate(from.averageDelayHours, to.averageDelayHours, t), 1) },
      extraCostPercent: { ...to.metrics.extraCostPercent, value: round(interpolate(from.extraCostPercent, to.extraCostPercent, t), 1) },
      recoveryScore: { ...to.metrics.recoveryScore, value: Math.round(interpolate(from.recoveryScore, to.recoveryScore, t)) },
    },
  };
}
