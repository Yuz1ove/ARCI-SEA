import { clamp, mean, quantile, round, stableHash } from '../math';
import { objectiveBreakdown, objectiveScore } from '../objective';
import { generateDisturbances, type SimulationDisturbance } from '../random';
import { simulatePolicy } from '../simulation';
import { cloneCommerceState } from '../state';
import type { CandidateEvaluation, CandidatePolicy, CommerceNetworkState, MarketConfig, ObjectiveWeights, SimulationMetrics } from '../types';
import { FORECAST_HORIZONS } from './config';
import type {
  CandidateForecast,
  DistributionStats,
  ForecastScenarioClass,
  ForecastTrajectory,
  HorizonOutcomeSummary,
  PolicyParametersV3,
  TrajectoryTransition,
} from './types';

export class SimulationBudgetExceededError extends Error {
  constructor(readonly plannedWorkUnits: number, readonly maximumWorkUnits: number) {
    super(`SIMULATION_BUDGET_EXCEEDED: planned ${plannedWorkUnits} work units exceeds ${maximumWorkUnits}.`);
    this.name = 'SimulationBudgetExceededError';
  }
}

export interface CandidateForecastInternal {
  forecast: CandidateForecast;
  trajectories: ForecastTrajectory[];
  samples: Array<{ outcome: SimulationMetrics; constraintViolations: ForecastTrajectory['constraintViolations'] }>;
  losses: number[];
  failures: boolean[];
}

const scenarioClassFor = (index: number, count: number): ForecastScenarioClass => {
  const quantilePosition = (index + 0.5) / Math.max(1, count);
  if (quantilePosition <= 0.15) return 'OPTIMISTIC';
  if (quantilePosition <= 0.80) return 'NOMINAL';
  if (quantilePosition <= 0.95) return 'PESSIMISTIC';
  return 'TAIL_RISK';
};

const scenarioAssumptions: Record<ForecastScenarioClass, string[]> = {
  OPTIMISTIC: ['Demand pressure eases within the horizon.', 'Carrier and processing availability recover faster than nominal.'],
  NOMINAL: ['Current disruption decays at the configured nominal persistence rate.', 'No unobserved external shock is injected.'],
  PESSIMISTIC: ['Demand and transit pressure remain above the nominal path.', 'Operational risks decay slowly.'],
  TAIL_RISK: ['Compound demand, transit, carrier and throughput shock persists.', 'This path is a stress scenario, not an observed forecast.'],
};

function adjustedDisturbance(base: SimulationDisturbance, scenarioClass: ForecastScenarioClass, elapsedMinutes: number): SimulationDisturbance {
  const horizonScale = Math.min(1, Math.log1p(elapsedMinutes) / Math.log(1441));
  const adjustment = scenarioClass === 'OPTIMISTIC' ? -0.055
    : scenarioClass === 'PESSIMISTIC' ? 0.085
      : scenarioClass === 'TAIL_RISK' ? 0.22
        : 0;
  const carrierAdjustment = scenarioClass === 'OPTIMISTIC' ? 0.04
    : scenarioClass === 'PESSIMISTIC' ? -0.08
      : scenarioClass === 'TAIL_RISK' ? -0.22
        : 0;
  return {
    demandMultiplier: clamp(base.demandMultiplier + adjustment * (0.65 + horizonScale * 0.35), 0.5, 1.8),
    transitMultiplier: clamp(base.transitMultiplier + adjustment * 1.25, 0.45, 2),
    weatherDelta: clamp(base.weatherDelta + Math.max(0, adjustment) * 0.85, -0.5, 0.8),
    trafficDelta: clamp(base.trafficDelta + Math.max(0, adjustment) * 0.75, -0.5, 0.8),
    carrierMultiplier: clamp(base.carrierMultiplier + carrierAdjustment, 0.25, 1.3),
    throughputMultiplier: clamp(base.throughputMultiplier - adjustment * 0.65, 0.4, 1.4),
  };
}

function averageNodeValue(state: CommerceNetworkState, read: (node: CommerceNetworkState['nodes'][string]) => number) {
  return mean(Object.values(state.nodes).map(read));
}

function transitionFutureState(
  current: CommerceNetworkState,
  candidate: CandidatePolicy,
  metrics: SimulationMetrics,
  elapsedMinutes: number,
  deltaMinutes: number,
  scenarioClass: ForecastScenarioClass,
  firstTransition: boolean,
): CommerceNetworkState {
  const next = current;
  next.timeMinutes = current.timeMinutes + deltaMinutes;
  const recoveryPersistence = scenarioClass === 'OPTIMISTIC' ? 0.52
    : scenarioClass === 'NOMINAL' ? 0.72
      : scenarioClass === 'PESSIMISTIC' ? 0.88
        : 0.97;
  const blend = clamp(deltaMinutes / Math.max(30, elapsedMinutes), 0.05, 0.75);
  const totalInbound = Object.values(next.nodes).reduce((total, node) => total + node.inboundRate, 0);
  for (const node of Object.values(next.nodes)) {
    const share = node.inboundRate / Math.max(1, totalInbound);
    const projectedBacklog = metrics.unfulfilledOrders * share + node.backlog * recoveryPersistence;
    node.backlog = Math.max(0, Math.round(node.backlog + (projectedBacklog - node.backlog) * blend));
    node.serviceLevel = round(clamp(node.serviceLevel + (metrics.serviceLevel - node.serviceLevel) * blend), 4);
    node.currentWeatherRisk = round(clamp(node.currentWeatherRisk * recoveryPersistence), 4);
    node.currentTrafficRisk = round(clamp(node.currentTrafficRisk * recoveryPersistence), 4);
    const strain = Math.max(0, 0.95 - metrics.serviceLevel);
    const recovery = scenarioClass === 'OPTIMISTIC' ? 0.035 : scenarioClass === 'NOMINAL' ? 0.018 : 0.006;
    node.availableCapacityRatio = round(clamp(node.availableCapacityRatio + recovery * blend - strain * 0.04), 4);
  }
  next.weatherSeverity = round(clamp(next.weatherSeverity * recoveryPersistence), 4);
  next.trafficSeverity = round(clamp(next.trafficSeverity * recoveryPersistence), 4);
  next.slaPressure = round(clamp(next.slaPressure * recoveryPersistence + Math.max(0, 0.95 - metrics.serviceLevel)), 4);
  if (firstTransition) {
    for (const action of candidate.actions) {
      if (action.type === 'INVENTORY_REBALANCE') {
        const from = next.nodes[action.from], to = next.nodes[action.to];
        const moved = Math.min(action.units, from?.inventory ?? 0);
        if (from && to) { from.inventory -= moved; to.inventory += moved; }
      }
      if (action.type === 'CARRIER_MODE_SWITCH') {
        const node = next.nodes[action.nodeId];
        if (node) node.carrierAvailability[action.toMode] = round(clamp(node.carrierAvailability[action.toMode] + 0.05), 4);
      }
    }
  }
  return next;
}

function advanceHorizonOutcome(
  previous:SimulationMetrics,
  state:CommerceNetworkState,
  market:MarketConfig,
  candidate:CandidatePolicy,
  disturbance:SimulationDisturbance,
  deltaMinutes:number,
  scenarioClass:ForecastScenarioClass,
):SimulationMetrics{
  const nodes=Object.values(state.nodes);
  const demand=nodes.reduce((total,node)=>total+node.inboundRate*state.demandMultiplier+node.backlog/6,0);
  const capacity=nodes.reduce((total,node)=>total+node.processingCapacityPerHour*node.availableCapacityRatio,0)*disturbance.throughputMultiplier;
  const load=demand/Math.max(1,capacity);
  const persistence=scenarioClass==='OPTIMISTIC'?0.62:scenarioClass==='NOMINAL'?0.76:scenarioClass==='PESSIMISTIC'?0.9:0.97;
  const stepScale=clamp(Math.log1p(deltaMinutes)/Math.log(1441),0.08,1);
  const intervention=clamp(candidate.switchingMagnitude+candidate.actions.filter(action=>action.type!=='KEEP_CURRENT_POLICY').length*.025);
  const shock=clamp(Math.max(0,disturbance.demandMultiplier-1)*.35+Math.max(0,disturbance.transitMultiplier-1)*.25+Math.max(0,1-disturbance.carrierMultiplier)*.4);
  const serviceLevel=clamp(previous.serviceLevel+(1-previous.serviceLevel)*(1-persistence)*stepScale+intervention*.035*stepScale-Math.max(0,load-1)*.045-shock*.025);
  const averageDelayHours=clamp(previous.averageDelayHours*persistence+Math.max(0,load-1)*2.4+shock*1.6-intervention*.45*stepScale,.15,12);
  const p90DelayHours=clamp(Math.max(averageDelayHours,previous.p90DelayHours*persistence+shock*1.9),.15,12);
  const unfulfilledOrders=Math.max(0,Math.round(previous.unfulfilledOrders*persistence+Math.max(0,load-1)*demand*.08+shock*demand*.025-intervention*demand*.015));
  const slaBreaches=Math.max(0,Math.round(previous.slaBreaches*persistence+demand*Math.max(0,market.slaPolicies.minimumServiceLevel-serviceLevel)*.18));
  const recoveryTimeMinutes=Math.round(clamp(previous.recoveryTimeMinutes*persistence+Math.max(0,load-1)*42+shock*35-intervention*24*stepScale,6,180));
  const capacityOverloadMinutes=Math.round(clamp(previous.capacityOverloadMinutes*persistence+Math.max(0,load-1)*75,0,180));
  const operationalCost=round(previous.operationalCost+candidate.estimatedCost/Math.max(1,demand)*2*stepScale,2);
  return {slaBreaches,averageDelayHours:round(averageDelayHours,2),p90DelayHours:round(p90DelayHours,2),recoveryTimeMinutes,operationalCost,capacityOverloadMinutes,serviceLevel:round(serviceLevel,4),unfulfilledOrders};
}

const stateId = (state: CommerceNetworkState) => `FSTATE-${stableHash(JSON.stringify({
  timeMinutes: state.timeMinutes,
  demandMultiplier: state.demandMultiplier,
  weatherSeverity: state.weatherSeverity,
  trafficSeverity: state.trafficSeverity,
  slaPressure: state.slaPressure,
  nodes: Object.values(state.nodes).map((node) => [node.id, node.inventory, node.backlog, node.availableCapacityRatio, node.serviceLevel, node.currentWeatherRisk, node.currentTrafficRisk, node.carrierAvailability.road, node.carrierAvailability.air, node.carrierAvailability.sea]),
  edges: Object.values(state.edges).map((edge) => [edge.id, edge.currentCapacityRatio, edge.disruptionProbability, edge.available]),
})).toUpperCase()}`;

function horizonLoss(
  horizon: TrajectoryTransition['horizon'],
  outcome: SimulationMetrics,
  candidate: CandidatePolicy,
  market: MarketConfig,
  objectiveWeights: ObjectiveWeights,
  policy: PolicyParametersV3,
) {
  const baseLoss = objectiveScore(objectiveBreakdown(outcome, candidate.switchingMagnitude, market), objectiveWeights);
  const horizonWeight = policy.horizonWeights[horizon.name];
  const riskPenalty = outcome.serviceLevel < market.slaPolicies.minimumServiceLevel ? horizon.riskWeight * 0.12 : 0;
  const recoveryPenalty = clamp(outcome.recoveryTimeMinutes / 180) * horizon.recoveryWeight * 0.08;
  return (baseLoss + riskPenalty + recoveryPenalty) * horizonWeight;
}

export function distributionStats(values: number[]): DistributionStats {
  const average = mean(values);
  return {
    mean: round(average),
    variance: round(mean(values.map((value) => (value - average) ** 2))),
    p50: quantile(values, 0.5),
    p90: quantile(values, 0.9),
    p95: quantile(values, 0.95),
    minimum: round(Math.min(...values)),
    maximum: round(Math.max(...values)),
  };
}

function aggregateMetrics(metrics: SimulationMetrics[]): SimulationMetrics {
  return {
    slaBreaches: Math.round(mean(metrics.map((item) => item.slaBreaches))),
    averageDelayHours: round(mean(metrics.map((item) => item.averageDelayHours)), 2),
    p90DelayHours: round(quantile(metrics.map((item) => item.p90DelayHours), 0.9), 2),
    recoveryTimeMinutes: Math.round(mean(metrics.map((item) => item.recoveryTimeMinutes))),
    operationalCost: round(mean(metrics.map((item) => item.operationalCost)), 2),
    capacityOverloadMinutes: Math.round(mean(metrics.map((item) => item.capacityOverloadMinutes))),
    serviceLevel: round(mean(metrics.map((item) => item.serviceLevel)), 4),
    unfulfilledOrders: Math.round(mean(metrics.map((item) => item.unfulfilledOrders))),
  };
}

export function simulateCandidateForecast(
  candidateEvaluation: CandidateEvaluation,
  state: CommerceNetworkState,
  market: MarketConfig,
  objectiveWeights: ObjectiveWeights,
  policy: PolicyParametersV3,
  seed: string,
  trajectoryCount: number,
  retainTrajectories = true,
): CandidateForecastInternal {
  const disturbances = generateDisturbances(`${seed}:forecast-v3`, trajectoryCount);
  const scenarioCounts = {OPTIMISTIC: 0, NOMINAL: 0, PESSIMISTIC: 0, TAIL_RISK: 0} satisfies Record<ForecastScenarioClass, number>;
  const trajectories: ForecastTrajectory[] = [];
  const losses: number[] = [];
  const failures: boolean[] = [];
  const samples: CandidateForecastInternal['samples'] = [];
  const outcomesByHorizon: SimulationMetrics[][] = FORECAST_HORIZONS.map(() => []);
  const utilitiesByHorizon: number[][] = FORECAST_HORIZONS.map(() => []);
  disturbances.forEach((baseDisturbance, index) => {
    const scenarioClass = scenarioClassFor(index, disturbances.length);
    scenarioCounts[scenarioClass] += 1;
    let current = cloneCommerceState(state);
    let priorMinute = 0;
    const transitions: TrajectoryTransition[] = [];
    const horizonLosses: number[] = [];
    let failed = false;
    let previousOutcome:SimulationMetrics|null=null;
    FORECAST_HORIZONS.forEach((horizon, horizonIndex) => {
      const disturbance = adjustedDisturbance(baseDisturbance, scenarioClass, horizon.minutes);
      const outcome = previousOutcome
        ? advanceHorizonOutcome(previousOutcome,current,market,candidateEvaluation.candidate,disturbance,horizon.minutes-priorMinute,scenarioClass)
        : simulatePolicy(current, market, candidateEvaluation.candidate, disturbance);
      const fromStateId = retainTrajectories ? stateId(current) : '';
      const beforeBacklog = retainTrajectories ? Object.values(current.nodes).reduce((total, node) => total + node.backlog, 0) : 0;
      current = transitionFutureState(current, candidateEvaluation.candidate, outcome, horizon.minutes, horizon.minutes - priorMinute, scenarioClass, horizonIndex === 0);
      previousOutcome=outcome;
      priorMinute = horizon.minutes;
      const loss = horizonLoss(horizon, outcome, candidateEvaluation.candidate, market, objectiveWeights, policy);
      horizonLosses.push(loss);
      outcomesByHorizon[horizonIndex].push(outcome);
      utilitiesByHorizon[horizonIndex].push(clamp(1 - loss));
      failed ||= outcome.serviceLevel < market.slaPolicies.minimumServiceLevel;
      if (retainTrajectories) transitions.push({
        horizon,
        fromStateId,
        toStateId: stateId(current),
        stateDelta: {
          backlog: Object.values(current.nodes).reduce((total, node) => total + node.backlog, 0) - beforeBacklog,
          averageServiceLevel: round(averageNodeValue(current, (node) => node.serviceLevel), 4),
          averageCapacityRatio: round(averageNodeValue(current, (node) => node.availableCapacityRatio), 4),
        },
        outcome,
      });
    });
    const loss = horizonLosses.reduce((total, value) => total + value, 0);
    const constraintViolations = candidateEvaluation.constraints.violations.map((item) => item.code);
    const finalOutcome = outcomesByHorizon.at(-1)!.at(-1)!;
    losses.push(round(loss));
    failures.push(failed);
    samples.push({outcome: finalOutcome, constraintViolations});
    if (retainTrajectories) trajectories.push({
        trajectoryId: `TRJ-${stableHash(`${seed}:${candidateEvaluation.candidate.id}:${index}`).toUpperCase()}`,
        seed: `${seed}:${index}`,
        scenarioClass,
        scenarioAssumptions: scenarioAssumptions[scenarioClass],
        stateTransitions: transitions,
        outcome: finalOutcome,
        risk: round(clamp(Math.max(...transitions.map((item) => 1 - item.outcome.serviceLevel)) + loss * 0.5)),
        utility: round(clamp(1 - loss)),
        constraintViolations,
    });
  });
  const horizonOutcomes: HorizonOutcomeSummary[] = FORECAST_HORIZONS.map((horizon, index) => {
    const outcomes = outcomesByHorizon[index];
    return {
      horizon,
      utility: distributionStats(utilitiesByHorizon[index]),
      serviceLevel: distributionStats(outcomes.map((item) => item.serviceLevel)),
      delayHours: distributionStats(outcomes.map((item) => item.averageDelayHours)),
      failureProbability: round(outcomes.filter((item) => item.serviceLevel < market.slaPolicies.minimumServiceLevel).length / Math.max(1, outcomes.length)),
    };
  });
  return {
    forecast: {
      candidateId: candidateEvaluation.candidate.id,
      trajectoryCount: disturbances.length,
      scenarioCounts,
      horizonOutcomes,
      lossDistribution: distributionStats(losses),
      finalOutcome: aggregateMetrics(samples.map((sample) => sample.outcome)),
    },
    trajectories,
    samples,
    losses,
    failures,
  };
}

export function simulateForecastEnsemble(
  evaluations: CandidateEvaluation[],
  state: CommerceNetworkState,
  market: MarketConfig,
  objectiveWeights: ObjectiveWeights,
  policy: PolicyParametersV3,
  seed: string,
  trajectoryCount: number,
  maximumWorkUnits = Number.POSITIVE_INFINITY,
  retainCandidateId?: string,
) {
  const count = Math.max(1, Math.floor(trajectoryCount));
  const plannedWorkUnits = evaluations.length * count * FORECAST_HORIZONS.length;
  if (plannedWorkUnits > maximumWorkUnits) throw new SimulationBudgetExceededError(plannedWorkUnits, maximumWorkUnits);
  return evaluations.map((evaluation) => simulateCandidateForecast(evaluation, state, market, objectiveWeights, policy, seed, count, evaluation.candidate.id===retainCandidateId));
}
