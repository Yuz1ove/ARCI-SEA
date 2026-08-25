import type { ObjectiveWeights } from './types';

export const DECISION_ENGINE_PARAMETERS={
  monteCarloSamples:240,
  riskTailLambda:.24,
  minimumCapacityMargin:.02,
  state:{
    backlogDrainHours:6,slaPressureLoadStart:.82,slaPressureLoadScale:1.8,slaPressureRiskWeight:.35,
    servicePressureImpact:.08,serviceWeatherImpact:.05,serviceTrafficImpact:.04,backlogUpdateShare:.16,
  },
  eventImpact:{
    trafficCapacityBase:.52,trafficDisruptionIncrease:.58,weatherNodeCapacityImpact:.18,
    weatherEdgeCapacityImpact:.62,weatherDisruptionIncrease:.5,recoveryTrafficRetention:.45,recoveryWeatherRetention:.55,
    edgeAvailabilityFloor:.08,carrierAvailabilityFloor:.05,nodeFailureThreshold:.25,
  },
  candidate:{
    minimumRiskBufferShare:.035,slaRiskBufferShare:.08,maximumRiskBufferShare:.11,maximumSpareUse:.82,
    islandModeSwitchShare:.32,directDestinationShare:.62,inventoryTransferShare:.8,inventoryFlowShare:.44,
    holdShare:.7,holdCostShare:.03,normalDirectSwitchingScale:2.8,failedDirectCostScale:.88,normalDirectCostScale:2.4,
  },
  simulation:{
    reservationVarianceReduction:.5,carrierAvailabilityRiskImpact:.45,corridorDelayAvailabilityImpact:.35,corridorDelayPressureImpact:.45,
    weatherRiskWeight:.36,trafficRiskWeight:.32,edgeRiskWeight:.32,routeBenefit:.9,priorityBenefit:.08,inventoryBenefit:.42,modeSwitchBenefit:.16,
    interventionRiskReduction:.55,routeDelayShare:.22,overloadDelayHours:4.8,riskDelayHours:3.1,interventionDelayHours:1.4,
    overloadUnfulfilledShare:.12,holdUnfulfilledShare:.55,priorityUnfulfilledReduction:.18,serviceUnfulfilledImpact:.62,
    serviceDelayDivisor:120,serviceRiskImpact:.045,serviceInterventionGain:.36,slaBreachDemandShare:.18,slaBreachUnfulfilledShare:.045,
    recoveryBaseMinutes:12,recoveryOverloadMinutes:58,recoveryRiskMinutes:54,recoveryDelayMinutes:4,recoveryInterventionMinutes:42,
    overloadNodeMinutes:90,overloadAverageMinutes:36,baseOperationalCost:4,candidateCostScale:48,modeSwitchCost:18,inventoryRebalanceCost:8,
  },
  normalization:{serviceSlack:.15,cost:28,riskDelayShare:.62,riskBreachShare:.38,slaBreaches:80,recoveryMinutes:150,overloadMinutes:150,switchingMagnitude:.35},
  confidence:{scoreGapRange:.16,selectionWeight:.45,scoreGapWeight:.30,constraintWeight:.25},
  governance:{approvalCostIncreaseRatio:.08,approvalReallocationRatio:.25},
  rollback:{serviceLevelDrop:.035,capacityStressIncrease:.12,riskIncrease:.15},
  perturbation:{demand:.10,transit:.22,weather:.12,traffic:.14,carrier:.10,throughput:.08},
} as const;

export const DEFAULT_OBJECTIVE_WEIGHTS:ObjectiveWeights={slaLoss:.25,cost:.16,risk:.20,recoveryTime:.15,capacityStress:.14,instability:.10};

export const PARAMETER_PROVENANCE={
  classification:'SIMULATION_ASSUMPTION' as const,
  disclosure:'Prototype simulation assumptions; not Sea, Shopee, or SPX operational data.',
  assumptions:[
    'Node inventory, processing throughput, backlog and carrier availability are synthetic operational parameters.',
    'Edge transit time, operating cost and disruption sensitivity are prototype simulation assumptions.',
    'Monte Carlo perturbation ranges and governance thresholds are transparent prototype configuration.',
  ],
};
