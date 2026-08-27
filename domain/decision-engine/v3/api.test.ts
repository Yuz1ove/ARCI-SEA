import { describe, expect, it } from 'vitest';
import { GET, POST } from '@/app/api/arci-core/route';

const post=(body:unknown)=>POST(new Request('http://localhost/api/arci-core',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));

interface ApiDecisionBody {
  evaluation:{
    v3:{audit:{decisionId:string};counterfactual:{selected:{finalOutcome:Record<string,number>}}};
  };
}

describe('ARCI Core V3 API contract',()=>{
  it('advertises the consolidated resource map and active-only policy boundary',async()=>{
    const response=await GET(new Request('http://localhost/api/arci-core'));
    const body=await response.json() as {version:string;engineStatus:string;defaultTrajectoryCount:number;operations:{decision:string[]}};
    expect(response.status).toBe(200);
    expect(body).toMatchObject({version:'ARCI_CORE_V3',engineStatus:'ONLINE',defaultTrajectoryCount:500});
    expect(body.operations.decision).toEqual(expect.arrayContaining(['world-state','digital-twin','forecast','counterfactual','governance','confidence']));
  });

  it('runs decision, replay and validation without activating a proposal',async()=>{
    const decisionResponse=await post({operation:'decision',scenarioId:'traffic',trajectoryCount:16});
    const decision=await decisionResponse.json() as ApiDecisionBody;
    expect(decisionResponse.status).toBe(200);
    const decisionId=decision.evaluation.v3.audit.decisionId as string;
    const replay=await (await post({operation:'replay',decisionId})).json() as {result:{matched:boolean}};
    expect(replay.result.matched).toBe(true);
    const observed=decision.evaluation.v3.counterfactual.selected.finalOutcome;
    const validation=await (await post({operation:'validation',decisionId,observed})).json() as {activePolicyUnchanged:string;policyUpdateProposal:{approvalStatus:string}};
    expect(validation.activePolicyUnchanged).toBe('3.0.0');
    expect(validation.policyUpdateProposal.approvalStatus).toBe('PROPOSED');
  });

  it('rejects malformed and unbounded operations fail closed',async()=>{
    expect((await post({operation:'decision',scenarioId:'invented'})).status).toBe(422);
    expect((await post({operation:'decision',scenarioId:'traffic',trajectoryCount:1001})).status).toBe(422);
    expect((await post({operation:'promote-policy'})).status).toBe(422);
  });
});
