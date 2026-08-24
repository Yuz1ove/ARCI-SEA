import { describe, expect, it } from 'vitest';
import { commerceProvider, inferenceProvider, logisticsPolicyProvider, scenarioProvider, trafficProvider, weatherProvider } from './scenarioProvider';
import { phaseOrder } from '../../simulation/scenario';

describe('scenario provider fallback boundary',()=>{
  it('keeps every unavailable live adapter explicitly disclosed',()=>{
    expect(commerceProvider.status.status).toBe('unconnected');
    expect([trafficProvider,weatherProvider].every(provider=>provider.status.status==='scenario')).toBe(true);
    expect(inferenceProvider.status.status).toBe('derived');
    expect(logisticsPolicyProvider.status).toBe('official');
  });

  it('attaches provenance to every core metric in every phase',()=>{
    for(const phase of phaseOrder){
      const snapshot=scenarioProvider.getSnapshot(phase);
      expect(Object.values(snapshot.metrics).every(metric=>metric.sourceType&&metric.sourceLabel&&!metric.isLive)).toBe(true);
    }
  });

  it('never labels scenario commerce data as live Shopee data',async()=>{
    const snapshot=await commerceProvider.getOrderSnapshot('NORMAL');
    expect(snapshot.metrics.orderRate.sourceType).toBe('simulated');
    expect(snapshot.metrics.orderRate.isLive).toBe(false);
  });

  it('does not imply that public service policy contains live capacity',()=>{
    expect(logisticsPolicyProvider.description).toContain('不包含即時剩餘容量');
    expect(logisticsPolicyProvider.provenance.isLive).toBe(false);
  });
});
