import { describe, expect, it } from 'vitest';
import { SimulatedDecisionRuntime } from './runtime';

describe('SimulatedDecisionRuntime',()=>{
  it('returns one engine-selected feasible route for the first incident',async()=>{
    const candidates=await new SimulatedDecisionRuntime().evaluate('DECIDING');
    const selected=candidates.find(candidate=>candidate.recommended);
    expect(selected).toBeDefined();
    expect(selected!.feasibility).toBeGreaterThan(0);
  });

  it('reselects a different feasible route after the second shock',async()=>{
    const runtime=new SimulatedDecisionRuntime();
    const first=(await runtime.evaluate('DECIDING')).find(candidate=>candidate.recommended)!;
    const replanned=(await runtime.evaluate('REPLANNING')).find(candidate=>candidate.recommended)!;
    expect(replanned.id).not.toBe(first.id);
    expect(replanned.feasibility).toBeGreaterThan(0);
  });
});
