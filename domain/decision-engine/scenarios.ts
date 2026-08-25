import type { ScenarioDefinition } from './types';

const marketId='taiwan-demo';
const surge={id:'event-demand-surge',atMinute:5,type:'DEMAND_SURGE',multiplier:1.24} as const;
const traffic={id:'event-central-traffic',atMinute:14,type:'TRAFFIC_DISRUPTION',severity:.78,affectedEdgeIds:['north-central','central-south']} as const;
const rain={id:'event-heavy-rain',atMinute:22,type:'WEATHER_DISRUPTION',severity:.76,affectedNodeIds:['warehouse-b','warehouse-c','penghu','kinmen','matsu','green-island']} as const;
const second={id:'event-central-node-failure',atMinute:40,type:'NODE_FAILURE',nodeId:'warehouse-b',remainingCapacityRatio:.18} as const;

export const decisionScenarios={
  normal:{id:'normal-operation',label:'Normal operation',marketId,seed:'scenario-normal-v2',durationMinutes:20,events:[]},
  surge:{id:'demand-surge',label:'Demand surge',marketId,seed:'scenario-surge-v2',durationMinutes:30,events:[surge]},
  traffic:{id:'traffic-disruption',label:'Traffic disruption',marketId,seed:'scenario-traffic-v2',durationMinutes:40,events:[surge,traffic]},
  compound:{id:'heavy-rain-traffic',label:'Heavy rain + traffic',marketId,seed:'scenario-traffic-rain-v2',durationMinutes:60,events:[surge,traffic,rain]},
  secondEvent:{id:'second-event-replan',label:'Second event',marketId,seed:'scenario-traffic-rain-v2',durationMinutes:75,events:[surge,traffic,rain,second]},
  islandDisruption:{id:'island-transport-disruption',label:'Island transport disruption',marketId,seed:'scenario-island-v2',durationMinutes:50,events:[surge,{id:'event-island-weather',atMinute:16,type:'WEATHER_DISRUPTION',severity:.96,affectedNodeIds:['penghu','kinmen','matsu','green-island']},{id:'event-island-air-loss',atMinute:18,type:'CARRIER_CAPACITY',mode:'air',availabilityRatio:0,affectedNodeIds:['penghu','kinmen','matsu','green-island']},{id:'event-island-sea-loss',atMinute:19,type:'CARRIER_CAPACITY',mode:'sea',availabilityRatio:0,affectedNodeIds:['penghu','kinmen','matsu','green-island']}]},
  noBenefit:{id:'no-benefit',label:'No-benefit scenario',marketId,seed:'scenario-no-benefit-v2',durationMinutes:20,events:[]},
} as const satisfies Record<string,ScenarioDefinition>;

export type DecisionScenarioKey=keyof typeof decisionScenarios;
