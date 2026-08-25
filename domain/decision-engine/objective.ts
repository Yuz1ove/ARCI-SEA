import { clamp, safeDivide, sum } from './math';
import { DECISION_ENGINE_PARAMETERS } from './config';
import type { CommerceNetworkState, MarketConfig, ObjectiveBreakdown, ObjectiveWeights, SimulationMetrics } from './types';

const components=Object.keys({slaLoss:0,cost:0,risk:0,recoveryTime:0,capacityStress:0,instability:0}) as Array<keyof ObjectiveWeights>;

export function deriveAdaptiveWeights(state:CommerceNetworkState,market:MarketConfig):ObjectiveWeights{
  const stress=Math.max(...Object.values(state.nodes).map(node=>safeDivide(node.inboundRate*state.demandMultiplier+node.backlog/DECISION_ENGINE_PARAMETERS.state.backlogDrainHours,node.processingCapacityPerHour*node.availableCapacityRatio,2)));
  const islandRisk=Math.max(0,...market.geographicConstraints.offshoreNodeIds.map(id=>Math.max(state.nodes[id]?.currentWeatherRisk??0,state.nodes[id]?.currentTrafficRisk??0)));
  const base={...market.objectiveDefaults};
  const raw:ObjectiveWeights={
    slaLoss:base.slaLoss+state.slaPressure*.16,
    cost:Math.max(.05,base.cost-(state.slaPressure+state.weatherSeverity+state.trafficSeverity)*.035),
    risk:base.risk+state.weatherSeverity*.08+state.trafficSeverity*.06+islandRisk*.08,
    recoveryTime:base.recoveryTime+state.slaPressure*.07,
    capacityStress:base.capacityStress+Math.max(0,stress-.82)*.14,
    instability:base.instability+(state.appliedEventIds.length===0?.09:0),
  };
  const total=sum(components.map(component=>raw[component]));
  const normalized=Object.fromEntries(components.map(component=>[component,raw[component]/Math.max(.0001,total)])) as ObjectiveWeights;
  const residual=1-sum(components.map(component=>normalized[component]));
  normalized.slaLoss+=residual;
  return normalized;
}

export function objectiveBreakdown(metrics:SimulationMetrics,switchingMagnitude:number,market:MarketConfig):ObjectiveBreakdown{
  const scale=DECISION_ENGINE_PARAMETERS.normalization;
  return {
    slaLoss:clamp(safeDivide(1-metrics.serviceLevel,1-market.slaPolicies.minimumServiceLevel+scale.serviceSlack)),
    cost:clamp(metrics.operationalCost/scale.cost),
    risk:clamp(metrics.p90DelayHours/market.slaPolicies.maximumDelayHours*scale.riskDelayShare+safeDivide(metrics.slaBreaches,scale.slaBreaches)*scale.riskBreachShare),
    recoveryTime:clamp(metrics.recoveryTimeMinutes/scale.recoveryMinutes),
    capacityStress:clamp(metrics.capacityOverloadMinutes/scale.overloadMinutes),
    instability:clamp(switchingMagnitude/scale.switchingMagnitude),
  };
}

export function objectiveScore(breakdown:ObjectiveBreakdown,weights:ObjectiveWeights){
  return components.reduce((total,component)=>total+breakdown[component]*weights[component],0);
}
