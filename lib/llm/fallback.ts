import { stableHash } from '@/domain/decision-engine';
import { parseGroundedExplanation, parseStructuredArciCommand } from './schemas';
import type { ArciIntent, GroundedExplanationPlan, GroundingContext, LlmInteractionRecord, LlmProvider, ParsedIntelligenceEvent, StructuredGenerationRequest, StructuredGenerationResult } from './types';

const nodeAliases:Record<string,string>={
  '桃園':'warehouse-a','taoyuan':'warehouse-a','北部倉':'warehouse-a','warehouse-a':'warehouse-a',
  '台中':'warehouse-b','臺中':'warehouse-b','taichung':'warehouse-b','中部倉':'warehouse-b','warehouse-b':'warehouse-b',
  '高雄':'warehouse-c','kaohsiung':'warehouse-c','南部倉':'warehouse-c','warehouse-c':'warehouse-c',
  '澎湖':'penghu','penghu':'penghu','金門':'kinmen','kinmen':'kinmen','馬祖':'matsu','matsu':'matsu','綠島':'green-island','green island':'green-island','green-island':'green-island',
};

const includesAny=(text:string,values:string[])=>values.some(value=>text.includes(value));
const ratioFrom=(text:string,verbs:string[])=>{
  const match=text.match(/(\d+(?:\.\d+)?)\s*%/);
  if(!match) return null;
  const ratio=Math.min(3,Number(match[1])/100);
  return includesAny(text,verbs)?ratio:null;
};

const nodeFrom=(text:string)=>Object.entries(nodeAliases).find(([alias])=>text.includes(alias))?.[1]??null;
const regionFrom=(text:string):'NORTH'|'CENTRAL'|'SOUTH'|'OFFSHORE'|'ALL'=>includesAny(text,['北部','north'])?'NORTH':includesAny(text,['中部','central'])?'CENTRAL':includesAny(text,['南部','south'])?'SOUTH':includesAny(text,['離島','offshore','澎湖','金門','馬祖','綠島'])?'OFFSHORE':'ALL';

export function deterministicInterpret(question:string){
  const text=question.trim().toLowerCase();
  const events:ParsedIntelligenceEvent[]=[];
  const nodeId=nodeFrom(text);
  const decrease=ratioFrom(text,['下降','降低','減少','少','drop','decrease','loss']);
  const increase=ratioFrom(text,['增加','成長','上升','再增','surge','increase']);
  const failure=includesAny(text,['失效','故障','停擺','完全失效','failure','offline']);
  const noIntervention=includesAny(text,['完全不介入','什麼都不做','不採取行動','no intervention','do nothing']);
  if(noIntervention) events.push({type:'NO_INTERVENTION'});
  if(nodeId&&failure) events.push({type:'NODE_FAILURE',nodeId});
  else if(nodeId&&decrease!==null&&includesAny(text,['處理能力','capacity','節點能力'])) events.push({type:'NODE_CAPACITY_CHANGE',nodeId,changeRatio:-decrease});
  if(includesAny(text,['豪雨','大雨','heavy rain','storm'])) events.push({type:'WEATHER',severity:includesAny(text,['極端','extreme'])?'EXTREME':'HEAVY',region:regionFrom(text)});
  if(increase!==null&&includesAny(text,['訂單','需求','order','demand'])) events.push({type:'DEMAND_CHANGE',region:regionFrom(text),changeRatio:increase});
  if(includesAny(text,['海運','sea','港'])&&(decrease!==null||includesAny(text,['暫停','停航','suspend']))) events.push({type:'CARRIER_CAPACITY_CHANGE',mode:'sea',region:regionFrom(text),changeRatio:includesAny(text,['暫停','停航','suspend'])?-1:-(decrease??.5),durationHours:Number(text.match(/(\d+(?:\.\d+)?)\s*(?:小時|hours?|h)/)?.[1]??0)||null});
  const intent:ArciIntent=events.some(event=>event.type!=='NO_INTERVENTION')?'WHAT_IF_SIMULATION'
    :noIntervention?'EXPLAIN_COUNTERFACTUAL'
      :includesAny(text,['why not','為什麼不用','為什麼不選'])?'WHY_NOT_POLICY'
        :includesAny(text,['淘汰','拒絕','rejected'])?'EXPLAIN_REJECTION'
          :includesAny(text,['最大','風險','p90','risk'])?'EXPLAIN_RISK'
            :includesAny(text,['比較','compare'])?'COMPARE_POLICIES'
              :includesAny(text,['brief','簡報','摘要'])?'EXECUTIVE_BRIEFING'
                :includesAny(text,['狀態','status'])?'SYSTEM_STATUS'
                  :includesAny(text,['為什麼選','why'])?'EXPLAIN_DECISION':'UNKNOWN';
  return parseStructuredArciCommand({intent,events,question:question.trim()});
}

const auditFor=<T>(request:StructuredGenerationRequest<T>,latencyMs:number):LlmInteractionRecord=>({
  interactionId:`LLM-${stableHash(`${request.input}:${request.schema.name}`).toUpperCase()}`,
  timestamp:new Date().toISOString(),decisionId:request.metadata.decisionId,stateId:request.metadata.stateId,intent:request.metadata.intent,modelRequested:'gpt-5.6-luna',modelEffective:null,inputHash:stableHash(request.input),structuredParseStatus:'PASSED',schemaValidationStatus:'PASSED',latencyMs,providerStatus:'DISABLED',failureCode:null,
});

export function deterministicExplanation(context:GroundingContext):GroundedExplanationPlan{
  const selected=context.selectedPolicy;
  const rejected=context.candidates.filter(candidate=>!candidate.feasible);
  const factorRefs=context.topDecisionFactors.map((_,index)=>`factor.${index+1}`).filter(ref=>context.evidence[ref]);
  const section=(key:GroundedExplanationPlan['sections'][number]['key'],text:string,sourceRefs:string[])=>({key,text,sourceRefs});
  return parseGroundedExplanation({
    headline:`ARCI 已由 deterministic engine 選出 ${selected.label}`,
    summary:`此解釋由 ARCI engine evidence 的 deterministic fallback 組成；它沒有改寫策略、權重、模擬或治理結果。`,
    factorRefs,
    rejectedPolicyIds:rejected.slice(0,3).map(candidate=>candidate.id),
    watchMetrics:['SERVICE_LEVEL','P90_DELAY','SLA_BREACH_PROBABILITY','GOVERNANCE'],
    sections:[
      section('SITUATION',context.evidence['state.summary'],['state.summary']),
      section('DECISION',context.evidence['decision.selected'],['decision.selected']),
      section('WHY',factorRefs.map(ref=>context.evidence[ref]).join('；')||'目前決策紀錄中沒有足夠資料支持此結論。',factorRefs.length?factorRefs:['decision.selected']),
      section('REJECTED_ALTERNATIVES',rejected.length?`共有 ${rejected.length} 個候選未通過 hard constraints；原因只讀取 candidate evaluation。`:'目前沒有被 hard constraint 淘汰的候選。',rejected.length?rejected.slice(0,3).map(candidate=>`candidate.${candidate.id}`):['decision.selected']),
      section('RISK',context.evidence['risk.summary'],['risk.summary']),
      section('COUNTERFACTUAL',context.evidence['counterfactual.summary'],['counterfactual.summary']),
      section('GOVERNANCE',context.evidence['governance.summary'],['governance.summary']),
      section('WATCH_NEXT','持續監測 service level、P90 delay、SLA breach probability 與 governance state。',['risk.summary','governance.summary']),
    ],
    insufficientData:false,
  });
}

export class DeterministicFallbackProvider implements LlmProvider{
  readonly status='DISABLED' as const;
  async generateStructured<T>(request:StructuredGenerationRequest<T>):Promise<StructuredGenerationResult<T>>{
    const started=Date.now();
    const payload=JSON.parse(request.input) as {question?:string};
    const value=request.validate(deterministicInterpret(payload.question??''));
    return {value,audit:auditFor(request,Date.now()-started)};
  }
  async generateExplanation(request:StructuredGenerationRequest<GroundedExplanationPlan>):Promise<StructuredGenerationResult<GroundedExplanationPlan>>{
    const started=Date.now();
    const payload=JSON.parse(request.input) as {context:GroundingContext};
    const value=request.validate(deterministicExplanation(payload.context));
    return {value,audit:auditFor(request,Date.now()-started)};
  }
}
