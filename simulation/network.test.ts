import { describe,expect,it } from 'vitest';
import { phaseOrder,primaryCandidates,snapshots } from './scenario';

describe('seven-node national fulfillment model',()=>{
  it('aggregates the three main-island and four offshore nodes in every phase',()=>{
    const expected=['warehouse-a','warehouse-b','warehouse-c','penghu','kinmen','matsu','green-island'];
    for(const phase of phaseOrder){
      const snapshot=snapshots[phase];
      expect(snapshot.networkNodes.map(node=>node.id)).toEqual(expected);
      expect(snapshot.networkKpis.nodeCount).toBe(7);
      expect(snapshot.networkKpis.orderRate).toBe(snapshot.orderRate);
      expect(snapshot.networkNodes.reduce((sum,node)=>sum+node.orderRate,0)).toBe(snapshot.orderRate);
      expect(snapshot.networkKpis.provenance.sourceType).toBe('inferred');
    }
  });

  it('allows offshore conditions to worsen and recover with the scenario',()=>{
    const offshoreRisk=(phase:keyof typeof snapshots)=>{const offshore=snapshots[phase].networkNodes.filter(node=>node.scope==='offshore');return offshore.reduce((sum,node)=>sum+node.riskScore,0)/offshore.length;};
    expect(offshoreRisk('DEGRADED')).toBeGreaterThan(offshoreRisk('NORMAL'));
    expect(offshoreRisk('RECOVERED')).toBeLessThan(offshoreRisk('DEGRADED'));
  });

  it('models Green Island load, capacity, disruptions, execution and recovery',()=>{
    const read=(phase:keyof typeof snapshots)=>snapshots[phase].networkNodes.find(node=>node.id==='green-island')!;
    expect(read('NORMAL')).toMatchObject({name:'綠島',transport:'海運／航空',transportAvailability:96,weatherDisruption:8,trafficDisruption:6});
    expect(read('DEGRADED').weatherDisruption).toBeGreaterThan(read('NORMAL').weatherDisruption);
    expect(read('DEGRADED').slaRate).toBeLessThan(read('NORMAL').slaRate);
    expect(read('REROUTING').constraint).toContain('接管');
    expect(read('SECOND_FAILURE').trafficDisruption).toBeGreaterThan(read('RECOVERING').trafficDisruption);
    expect(read('RECOVERED').slaRate).toBeGreaterThan(read('SECOND_FAILURE').slaRate);
    expect(read('RECOVERED').capacity).toBeGreaterThan(0);
  });

  it('penalizes a mainland-only plan and selects the offshore-buffer plan',()=>{
    const selected=primaryCandidates.find(candidate=>candidate.recommended)!;
    const blocked=primaryCandidates.find(candidate=>candidate.id==='route-a')!;
    expect(selected.offshoreImpact.slaDelta).toBeGreaterThan(0);
    expect(selected.offshoreImpact.risk).toBe('低');
    expect(blocked.offshoreImpact.slaDelta).toBeLessThan(0);
    expect(blocked.reason).toContain('離島');
  });
});
