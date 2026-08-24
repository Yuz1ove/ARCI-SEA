import { describe, expect, it } from 'vitest';
import { SimulatedDecisionRuntime } from './runtime';

describe('SimulatedDecisionRuntime',()=>{
  it('selects Route B for the first incident',async()=>{
    const candidates=await new SimulatedDecisionRuntime().evaluate('DECIDING');
    expect(candidates.find(candidate=>candidate.recommended)?.id).toBe('route-b');
  });

  it('does not reuse failed Route B after the second shock',async()=>{
    const candidates=await new SimulatedDecisionRuntime().evaluate('REPLANNING');
    expect(candidates.find(candidate=>candidate.recommended)?.id).toBe('route-c');
    expect(candidates.find(candidate=>candidate.recommended)?.route).not.toContain('Carrier B');
  });
});
