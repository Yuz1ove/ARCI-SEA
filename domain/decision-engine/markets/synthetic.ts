import { DEFAULT_OBJECTIVE_WEIGHTS } from '../config';
import type { MarketConfig } from '../types';

export const syntheticMarket:MarketConfig={
  marketId:'synthetic-market',currency:'TST',timezone:'UTC',
  nodes:[
    {id:'alpha',market:'SYN',region:'North',scope:'main-island',inventory:800,backlog:60,processingCapacityPerHour:320,availableCapacityRatio:.9,inboundRate:210,outboundRate:205,baseSlaHours:18,weatherExposure:.2,trafficExposure:.5,carrierAvailability:{road:.96,air:.5,sea:0},serviceLevel:.98},
    {id:'beta',market:'SYN',region:'South',scope:'main-island',inventory:720,backlog:55,processingCapacityPerHour:300,availableCapacityRatio:.9,inboundRate:190,outboundRate:184,baseSlaHours:18,weatherExposure:.3,trafficExposure:.4,carrierAvailability:{road:.95,air:.4,sea:0},serviceLevel:.98},
    {id:'gamma-island',market:'SYN',region:'Island',scope:'offshore',inventory:210,backlog:18,processingCapacityPerHour:84,availableCapacityRatio:.86,inboundRate:48,outboundRate:44,baseSlaHours:30,weatherExposure:.8,trafficExposure:0,carrierAvailability:{road:0,air:.7,sea:.88},serviceLevel:.97},
  ],
  edges:[
    {id:'alpha-beta',from:'alpha',to:'beta',mode:'road',nominalTransitMinutes:120,maxCapacity:240,currentCapacityRatio:.95,disruptionProbability:.04,congestionFactor:.08,weatherSensitivity:.2,operatingCost:1},
    {id:'beta-gamma-sea',from:'beta',to:'gamma-island',mode:'sea',nominalTransitMinutes:180,maxCapacity:58,currentCapacityRatio:.9,disruptionProbability:.08,congestionFactor:.03,weatherSensitivity:.85,operatingCost:1.7},
    {id:'alpha-gamma-air',from:'alpha',to:'gamma-island',mode:'air',nominalTransitMinutes:70,maxCapacity:42,currentCapacityRatio:.86,disruptionProbability:.06,congestionFactor:.02,weatherSensitivity:.65,operatingCost:2.8},
  ],
  slaPolicies:{minimumServiceLevel:.94,maximumDelayHours:5},carrierModes:['road','air','sea'],geographicConstraints:{offshoreNodeIds:['gamma-island'],requiredServiceNodeIds:['alpha','beta','gamma-island']},objectiveDefaults:{...DEFAULT_OBJECTIVE_WEIGHTS},
};
