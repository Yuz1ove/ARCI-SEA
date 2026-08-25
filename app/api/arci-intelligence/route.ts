import { parseIntelligenceRequest } from '@/lib/llm/schemas';
import { runDecisionPipeline, runExplanationPipeline, runIntelligencePipeline } from '@/lib/llm/pipeline';
import { SCHOOL_LLM_ENDPOINT, SCHOOL_LLM_REQUESTED_MODEL } from '@/lib/llm/schoolLlmClient';
import type { LlmInteractionRecord } from '@/lib/llm/types';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

const auditTrail:LlmInteractionRecord[]=[];
const jsonHeaders={'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'};
const appendAudit=(records:LlmInteractionRecord[])=>{
  auditTrail.push(...records);
  if(auditTrail.length>100) auditTrail.splice(0,auditTrail.length-100);
};

export async function GET(){
  return Response.json({
    engineStatus:'ONLINE',providerConfigured:Boolean(process.env.SCHOOL_LLM_API_KEY),endpoint:SCHOOL_LLM_ENDPOINT,requestedModel:SCHOOL_LLM_REQUESTED_MODEL,recentInteractions:auditTrail.slice(-20),
  },{headers:jsonHeaders});
}

export async function POST(request:Request){
  try{
    const contentLength=Number(request.headers.get('content-length')??0);
    if(contentLength>80_000) return Response.json({error:'REQUEST_TOO_LARGE',engineStatus:'ONLINE'},{status:413,headers:jsonHeaders});
    const body=parseIntelligenceRequest(await request.json());
    if(request.headers.get('accept')?.includes('application/x-ndjson')){
      const encoder=new TextEncoder();
      const totalStarted=Date.now();
      const stream=new ReadableStream<Uint8Array>({
        async start(controller){
          try{
            const decision=await runDecisionPipeline(body);
            appendAudit(decision.interactions);
            controller.enqueue(encoder.encode(`${JSON.stringify(decision)}\n`));
            const explanation=await runExplanationPipeline(body,decision,undefined,totalStarted);
            appendAudit(explanation.interactions);
            controller.enqueue(encoder.encode(`${JSON.stringify(explanation)}\n`));
          }catch(error){
            const detail=error instanceof Error?error.message:'Unknown intelligence request failure.';
            controller.enqueue(encoder.encode(`${JSON.stringify({phase:'ERROR',error:'INTELLIGENCE_STREAM_FAILURE',detail,engineStatus:'ONLINE'})}\n`));
          }finally{controller.close()}
        },
      });
      return new Response(stream,{headers:{...jsonHeaders,'content-type':'application/x-ndjson; charset=utf-8','x-arci-stream':'decision-first-v4'}});
    }
    const result=await runIntelligencePipeline(body);
    appendAudit(result.interactions);
    return Response.json(result,{headers:jsonHeaders});
  }catch(error){
    const message=error instanceof Error?error.message:'Unknown intelligence request failure.';
    const status=message.startsWith('SCHEMA_VALIDATION')?422:400;
    return Response.json({error:status===422?'INVALID_STRUCTURED_INPUT':'INVALID_REQUEST',detail:message,engineStatus:'ONLINE'},{status,headers:jsonHeaders});
  }
}
