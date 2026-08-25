import { DEFAULT_OBJECTIVE_WEIGHTS } from '../config';
import type { FulfillmentEdgeConfig, FulfillmentNodeConfig, MarketConfig } from '../types';

const node=(id:string,region:string,scope:FulfillmentNodeConfig['scope'],processing:number,inbound:number,inventory:number,weather:number,traffic:number,availability:FulfillmentNodeConfig['carrierAvailability']):FulfillmentNodeConfig=>({
  id,market:'TW',region,scope,inventory,backlog:Math.round(inbound*.12),processingCapacityPerHour:processing,availableCapacityRatio:.92,inboundRate:inbound,outboundRate:Math.min(inbound,processing*.82),baseSlaHours:scope==='offshore'?36:24,weatherExposure:weather,trafficExposure:traffic,carrierAvailability:availability,serviceLevel:.981,
});
const edge=(id:string,from:string,to:string,mode:FulfillmentEdgeConfig['mode'],minutes:number,capacity:number,cost:number,weather:number):FulfillmentEdgeConfig=>({id,from,to,mode,nominalTransitMinutes:minutes,maxCapacity:capacity,currentCapacityRatio:.94,disruptionProbability:.04,congestionFactor:.08,weatherSensitivity:weather,operatingCost:cost});

export const taiwanMarket:MarketConfig={
  marketId:'taiwan-demo',currency:'TWD',timezone:'Asia/Taipei',
  nodes:[
    node('warehouse-a','Northern Taiwan','main-island',2100,1040,5200,.24,.66,{road:.96,air:.84,sea:.62}),
    node('warehouse-b','Central Taiwan','main-island',1800,980,4700,.32,.84,{road:.94,air:.72,sea:.58}),
    node('warehouse-c','Southern Taiwan','main-island',1900,820,4100,.56,.52,{road:.95,air:.78,sea:.74}),
    node('penghu','Penghu','offshore',200,118,760,.82,.08,{road:0,air:.86,sea:.82}),
    node('kinmen','Kinmen','offshore',170,104,690,.64,.05,{road:0,air:.91,sea:.68}),
    node('matsu','Matsu','offshore',140,82,520,.72,.04,{road:0,air:.82,sea:.72}),
    node('green-island','Green Island','offshore',115,68,410,.88,.06,{road:0,air:.68,sea:.86}),
  ],
  edges:[
    edge('north-central','warehouse-a','warehouse-b','road',165,1080,1,.28),edge('central-south','warehouse-b','warehouse-c','road',190,980,1.1,.34),edge('north-south','warehouse-a','warehouse-c','road',310,1500,1.5,.32),
    edge('north-penghu-air','warehouse-a','penghu','air',115,150,2.7,.68),edge('south-penghu-sea','warehouse-c','penghu','sea',260,190,1.6,.82),
    edge('north-kinmen-air','warehouse-a','kinmen','air',105,138,2.9,.55),edge('central-kinmen-sea','warehouse-b','kinmen','sea',330,120,1.8,.72),
    edge('north-matsu-air','warehouse-a','matsu','air',95,112,3.1,.64),edge('north-matsu-sea','warehouse-a','matsu','sea',360,128,1.9,.76),
    edge('south-green-sea','warehouse-c','green-island','sea',145,94,1.7,.92),edge('south-green-air','warehouse-c','green-island','air',75,72,3.2,.74),
  ],
  slaPolicies:{minimumServiceLevel:.95,maximumDelayHours:6},carrierModes:['road','air','sea'],
  geographicConstraints:{offshoreNodeIds:['penghu','kinmen','matsu','green-island'],requiredServiceNodeIds:['warehouse-a','warehouse-b','warehouse-c','penghu','kinmen','matsu','green-island']},
  objectiveDefaults:{...DEFAULT_OBJECTIVE_WEIGHTS},
};
