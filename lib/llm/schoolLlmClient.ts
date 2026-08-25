import { stableHash } from '@/domain/decision-engine';
import type { GroundedExplanationPlan, LlmInteractionRecord, LlmProvider, ProviderFailureCode, StructuredGenerationRequest, StructuredGenerationResult } from './types';

export const SCHOOL_LLM_ENDPOINT='https://ai.ccsh.tn.edu.tw/v1/responses';
export const SCHOOL_LLM_REQUESTED_MODEL='gpt-5.6-luna';

type FetchLike=(input:string|URL|Request,init?:RequestInit)=>Promise<Response>;
type SchoolResponse={model?:string;output_text?:string;output?:Array<{content?:Array<{type?:string;text?:string;refusal?:string}>}>;error?:{code?:string;message?:string}};

export class SchoolLlmError extends Error{
  constructor(readonly code:ProviderFailureCode,message:string){super(message);this.name='SchoolLlmError'}
}

export function classifyProviderFailure(status:number|null,error:unknown):ProviderFailureCode{
  if(error instanceof SchoolLlmError) return error.code;
  if(error instanceof DOMException&&error.name==='AbortError') return 'PROVIDER_TIMEOUT';
  if(status===401||status===403) return 'PROVIDER_AUTH';
  if(status===429) return 'PROVIDER_RATE_LIMIT';
  if(status===402) return 'PROVIDER_QUOTA';
  const message=error instanceof Error?error.message.toLowerCase():'';
  if(message.includes('model')&&(message.includes('unavailable')||message.includes('not found'))) return 'PROVIDER_MODEL_UNAVAILABLE';
  if(message.includes('json')||message.includes('schema')||message.includes('output')) return 'PROVIDER_SCHEMA';
  if(error instanceof TypeError||message.includes('network')||message.includes('fetch')) return 'PROVIDER_NETWORK';
  return 'UNKNOWN_PROVIDER_FAILURE';
}

const extractOutputText=(body:SchoolResponse)=>body.output_text??body.output?.flatMap(item=>item.content??[]).find(item=>item.type==='output_text'&&typeof item.text==='string')?.text??null;

export class SchoolLlmProvider implements LlmProvider{
  readonly status='OK' as const;
  constructor(private readonly apiKey:string,private readonly fetcher:FetchLike=fetch,private readonly timeoutMs=45_000){}

  generateExplanation(request:StructuredGenerationRequest<GroundedExplanationPlan>){return this.generateStructured(request)}

  async generateStructured<T>(request:StructuredGenerationRequest<T>):Promise<StructuredGenerationResult<T>>{
    const started=Date.now();
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),this.timeoutMs);
    let response:Response|null=null;
    let effectiveModel:string|null=null;
    try{
      response=await this.fetcher(SCHOOL_LLM_ENDPOINT,{
        method:'POST',signal:controller.signal,
        headers:{'content-type':'application/json','authorization':`Bearer ${this.apiKey}`},
        body:JSON.stringify({
          model:SCHOOL_LLM_REQUESTED_MODEL,
          input:[{role:'system',content:[{type:'input_text',text:request.instructions}]},{role:'user',content:[{type:'input_text',text:request.input}]}],
          text:{format:{type:'json_schema',name:request.schema.name,strict:true,schema:request.schema.schema}},
          store:false,
        }),
      });
      const body=await response.json() as SchoolResponse;
      effectiveModel=body.model??null;
      if(!response.ok) throw new SchoolLlmError(classifyProviderFailure(response.status,new Error(body.error?.message??`HTTP ${response.status}`)),`School LLM returned HTTP ${response.status}.`);
      const output=extractOutputText(body);
      if(!output) throw new SchoolLlmError('PROVIDER_SCHEMA','School LLM response did not contain output_text.');
      let parsed:unknown;
      try{parsed=JSON.parse(output)}catch{throw new SchoolLlmError('PROVIDER_SCHEMA','School LLM returned invalid JSON.');}
      const value=request.validate(parsed);
      const audit:LlmInteractionRecord={interactionId:`LLM-${stableHash(`${request.input}:${started}`).toUpperCase()}`,timestamp:new Date().toISOString(),decisionId:request.metadata.decisionId,stateId:request.metadata.stateId,intent:request.metadata.intent,modelRequested:SCHOOL_LLM_REQUESTED_MODEL,modelEffective:effectiveModel,inputHash:stableHash(request.input),structuredParseStatus:'PASSED',schemaValidationStatus:'PASSED',latencyMs:Date.now()-started,providerStatus:'OK',failureCode:null};
      return {value,audit};
    }catch(error){
      if(error instanceof SchoolLlmError) throw error;
      throw new SchoolLlmError(classifyProviderFailure(response?.status??null,error),error instanceof Error?error.message:'Unknown School LLM failure.');
    }finally{clearTimeout(timeout)}
  }
}

export function schoolLlmFromEnvironment(){
  const apiKey=process.env.SCHOOL_LLM_API_KEY;
  return apiKey?new SchoolLlmProvider(apiKey):null;
}
