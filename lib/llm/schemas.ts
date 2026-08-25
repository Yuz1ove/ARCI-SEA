import { ARCI_INTENTS, type ArciIntent, type GroundedExplanationPlan, type IntelligenceRequest, type ParsedIntelligenceEvent, type StructuredArciCommand } from './types';
import type { CommerceEvent, ScenarioDefinition } from '@/domain/decision-engine';

const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const hasOnly=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).every(key=>keys.includes(key));
const isFiniteNumber=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
function fail(message:string):never{throw new Error(`SCHEMA_VALIDATION: ${message}`)}
const nodeIds=['warehouse-a','warehouse-b','warehouse-c','penghu','kinmen','matsu','green-island'] as const;

export const arciCommandJsonSchema={
  name:'arci_command',
  schema:{
    type:'object',additionalProperties:false,required:['intent','events','question'],
    properties:{
      intent:{type:'string',enum:[...ARCI_INTENTS]},
      question:{type:'string',minLength:1,maxLength:600},
      events:{type:'array',maxItems:8,items:{
        anyOf:[
          {type:'object',additionalProperties:false,required:['type','severity','region'],properties:{type:{type:'string',const:'WEATHER'},severity:{type:'string',enum:['LIGHT','MODERATE','HEAVY','EXTREME']},region:{type:'string',enum:['NORTH','CENTRAL','SOUTH','OFFSHORE','ALL']}}},
          {type:'object',additionalProperties:false,required:['type','nodeId','changeRatio'],properties:{type:{type:'string',const:'NODE_CAPACITY_CHANGE'},nodeId:{type:'string',enum:[...nodeIds]},changeRatio:{type:'number',minimum:-1,maximum:1}}},
          {type:'object',additionalProperties:false,required:['type','nodeId'],properties:{type:{type:'string',const:'NODE_FAILURE'},nodeId:{type:'string',enum:[...nodeIds]}}},
          {type:'object',additionalProperties:false,required:['type','region','changeRatio'],properties:{type:{type:'string',const:'DEMAND_CHANGE'},region:{type:'string',enum:['NORTH','CENTRAL','SOUTH','OFFSHORE','ALL']},changeRatio:{type:'number',minimum:-.9,maximum:3}}},
          {type:'object',additionalProperties:false,required:['type','mode','region','changeRatio','durationHours'],properties:{type:{type:'string',const:'CARRIER_CAPACITY_CHANGE'},mode:{type:'string',enum:['road','air','sea']},region:{type:'string',enum:['NORTH','CENTRAL','SOUTH','OFFSHORE','ALL']},changeRatio:{type:'number',minimum:-1,maximum:1},durationHours:{anyOf:[{type:'number',minimum:0,maximum:168},{type:'null'}]}}},
          {type:'object',additionalProperties:false,required:['type'],properties:{type:{type:'string',const:'NO_INTERVENTION'}}},
        ],
      }},
    },
  },
} as const;

export const explanationJsonSchema={
  name:'arci_grounded_explanation',
  schema:{
    type:'object',additionalProperties:false,required:['headline','summary','factorRefs','rejectedPolicyIds','watchMetrics','sections','insufficientData'],
    properties:{
      headline:{type:'string',maxLength:180},summary:{type:'string',maxLength:1000},factorRefs:{type:'array',maxItems:6,items:{type:'string'}},rejectedPolicyIds:{type:'array',maxItems:7,items:{type:'string'}},
      watchMetrics:{type:'array',maxItems:7,items:{type:'string',enum:['SERVICE_LEVEL','P90_DELAY','SLA_BREACH_PROBABILITY','CAPACITY_MARGIN','WEATHER_RISK','TRAFFIC_RISK','GOVERNANCE']}},
      sections:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['key','text','sourceRefs'],properties:{key:{type:'string',enum:['SITUATION','DECISION','WHY','REJECTED_ALTERNATIVES','RISK','COUNTERFACTUAL','GOVERNANCE','WATCH_NEXT']},text:{type:'string',maxLength:900},sourceRefs:{type:'array',maxItems:8,items:{type:'string'}}}}},
      insufficientData:{type:'boolean'},
    },
  },
} as const;

function parseEvent(value:unknown):ParsedIntelligenceEvent{
  if(!isRecord(value)||typeof value.type!=='string') fail('event must be an object with a type');
  if(value.type==='WEATHER'){
    if(!hasOnly(value,['type','severity','region'])||!['LIGHT','MODERATE','HEAVY','EXTREME'].includes(String(value.severity))||!['NORTH','CENTRAL','SOUTH','OFFSHORE','ALL'].includes(String(value.region))) fail('invalid weather event');
    return value as unknown as ParsedIntelligenceEvent;
  }
  if(value.type==='NODE_CAPACITY_CHANGE'){
    if(!hasOnly(value,['type','nodeId','changeRatio'])||!nodeIds.includes(value.nodeId as typeof nodeIds[number])||!isFiniteNumber(value.changeRatio)||value.changeRatio< -1||value.changeRatio>1) fail('invalid node capacity event');
    return value as unknown as ParsedIntelligenceEvent;
  }
  if(value.type==='NODE_FAILURE'){
    if(!hasOnly(value,['type','nodeId'])||!nodeIds.includes(value.nodeId as typeof nodeIds[number])) fail('invalid node failure event');
    return value as unknown as ParsedIntelligenceEvent;
  }
  if(value.type==='DEMAND_CHANGE'){
    if(!hasOnly(value,['type','region','changeRatio'])||!['NORTH','CENTRAL','SOUTH','OFFSHORE','ALL'].includes(String(value.region))||!isFiniteNumber(value.changeRatio)||value.changeRatio<-.9||value.changeRatio>3) fail('invalid demand event');
    return value as unknown as ParsedIntelligenceEvent;
  }
  if(value.type==='CARRIER_CAPACITY_CHANGE'){
    if(!hasOnly(value,['type','mode','region','changeRatio','durationHours'])||!['road','air','sea'].includes(String(value.mode))||!['NORTH','CENTRAL','SOUTH','OFFSHORE','ALL'].includes(String(value.region))||!isFiniteNumber(value.changeRatio)||value.changeRatio< -1||value.changeRatio>1||(value.durationHours!==null&&(!isFiniteNumber(value.durationHours)||value.durationHours<0||value.durationHours>168))) fail('invalid carrier event');
    return value as unknown as ParsedIntelligenceEvent;
  }
  if(value.type==='NO_INTERVENTION'){
    if(!hasOnly(value,['type'])) fail('invalid no-intervention event');
    return {type:'NO_INTERVENTION'};
  }
  return fail('unsupported event type');
}

export function parseStructuredArciCommand(value:unknown):StructuredArciCommand{
  if(!isRecord(value)||!hasOnly(value,['intent','events','question'])) fail('command contains unsupported fields');
  if(!ARCI_INTENTS.includes(value.intent as ArciIntent)) fail('unsupported intent');
  if(typeof value.question!=='string'||value.question.trim().length===0||value.question.length>600) fail('invalid question');
  if(!Array.isArray(value.events)||value.events.length>8) fail('invalid events');
  return {intent:value.intent as ArciIntent,events:value.events.map(parseEvent),question:value.question.trim()};
}

export function parseGroundedExplanation(value:unknown):GroundedExplanationPlan{
  if(!isRecord(value)||!hasOnly(value,['headline','summary','factorRefs','rejectedPolicyIds','watchMetrics','sections','insufficientData'])) fail('invalid explanation fields');
  if(typeof value.headline!=='string'||typeof value.summary!=='string'||typeof value.insufficientData!=='boolean') fail('invalid explanation primitives');
  if(!Array.isArray(value.factorRefs)||!value.factorRefs.every(item=>typeof item==='string')||!Array.isArray(value.rejectedPolicyIds)||!value.rejectedPolicyIds.every(item=>typeof item==='string')) fail('invalid explanation references');
  const allowedMetrics=['SERVICE_LEVEL','P90_DELAY','SLA_BREACH_PROBABILITY','CAPACITY_MARGIN','WEATHER_RISK','TRAFFIC_RISK','GOVERNANCE'];
  if(!Array.isArray(value.watchMetrics)||!value.watchMetrics.every(item=>allowedMetrics.includes(String(item)))) fail('invalid watch metrics');
  const allowedSections=['SITUATION','DECISION','WHY','REJECTED_ALTERNATIVES','RISK','COUNTERFACTUAL','GOVERNANCE','WATCH_NEXT'];
  if(!Array.isArray(value.sections)||!value.sections.every(section=>isRecord(section)&&hasOnly(section,['key','text','sourceRefs'])&&allowedSections.includes(String(section.key))&&typeof section.text==='string'&&Array.isArray(section.sourceRefs)&&section.sourceRefs.every(ref=>typeof ref==='string'))) fail('invalid explanation sections');
  return value as unknown as GroundedExplanationPlan;
}

function isCommerceEvent(value:unknown):value is CommerceEvent{
  if(!isRecord(value)||typeof value.id!=='string'||!isFiniteNumber(value.atMinute)||typeof value.type!=='string') return false;
  if(value.type==='DEMAND_SURGE') return isFiniteNumber(value.multiplier);
  if(value.type==='TRAFFIC_DISRUPTION') return isFiniteNumber(value.severity)&&Array.isArray(value.affectedEdgeIds)&&value.affectedEdgeIds.every(item=>typeof item==='string');
  if(value.type==='WEATHER_DISRUPTION') return isFiniteNumber(value.severity)&&Array.isArray(value.affectedNodeIds)&&value.affectedNodeIds.every(item=>typeof item==='string');
  if(value.type==='CARRIER_CAPACITY') return ['road','air','sea'].includes(String(value.mode))&&isFiniteNumber(value.availabilityRatio)&&Array.isArray(value.affectedNodeIds)&&value.affectedNodeIds.every(item=>typeof item==='string');
  if(value.type==='NODE_FAILURE') return typeof value.nodeId==='string'&&isFiniteNumber(value.remainingCapacityRatio);
  if(value.type==='RECOVERY') return isFiniteNumber(value.capacityRestoreRatio)&&Array.isArray(value.affectedNodeIds)&&value.affectedNodeIds.every(item=>typeof item==='string');
  return false;
}

export function parseIntelligenceRequest(value:unknown):IntelligenceRequest{
  if(!isRecord(value)||!hasOnly(value,['question','scenario'])||typeof value.question!=='string'||value.question.trim().length===0||value.question.length>600||!isRecord(value.scenario)) fail('invalid intelligence request');
  const scenario=value.scenario;
  if(!hasOnly(scenario,['id','label','marketId','seed','durationMinutes','events'])||typeof scenario.id!=='string'||typeof scenario.label!=='string'||scenario.marketId!=='taiwan-demo'||typeof scenario.seed!=='string'||!isFiniteNumber(scenario.durationMinutes)||!Array.isArray(scenario.events)||!scenario.events.every(isCommerceEvent)) fail('invalid scenario');
  return {question:value.question.trim(),scenario:scenario as unknown as ScenarioDefinition};
}
