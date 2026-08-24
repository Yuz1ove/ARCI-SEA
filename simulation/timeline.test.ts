import { describe, expect, it } from 'vitest';
import { serviceRecoverySeries } from './scenario';
import { getDemoProgress, interpolateSnapshot, stageDurationMs, totalDemoDurationMs } from './timeline';

describe('canonical commerce demo timeline',()=>{
  it('runs for exactly 90 seconds',()=>{
    expect(totalDemoDurationMs).toBe(90_000);
    expect(Object.values(stageDurationMs).every(duration=>duration>=6_000&&duration<=13_000)).toBe(true);
  });

  it('interpolates execution recovery without deleting the operational state',()=>{
    const quarter=interpolateSnapshot('REROUTING',.25);
    const later=interpolateSnapshot('REROUTING',.7);
    expect(later.ordersAtRisk).toBeLessThan(quarter.ordersAtRisk);
    expect(later.warehouses).toHaveLength(3);
    expect(later.onTimeRate).toBeGreaterThan(quarter.onTimeRate);
  });

  it('continues from the recovered state into a second event rather than resetting',()=>{
    const secondEventStart=interpolateSnapshot('SECOND_FAILURE',0);
    const secondEventEnd=interpolateSnapshot('SECOND_FAILURE',1);
    expect(secondEventStart.onTimeRate).toBe(97.8);
    expect(secondEventEnd.onTimeRate).toBe(93.2);
    expect(secondEventStart.activeRoute).toBe('route-b');
  });

  it('derives a monotonic global progress value from phase and local progress',()=>{
    expect(getDemoProgress('NORMAL',0)).toBe(0);
    expect(getDemoProgress('DECIDING',.5)).toBeGreaterThan(getDemoProgress('DEGRADED',1));
    expect(getDemoProgress('RECOVERED',1)).toBe(1);
  });

  it('shows both disruptions and returns above the SLA target after replan',()=>{
    const values=serviceRecoverySeries.map(point=>point.slaPercent);
    expect(values[3]).toBeLessThan(values[0]);
    expect(values[5]).toBeGreaterThan(values[3]);
    expect(values[6]).toBeLessThan(values[5]);
    expect(values.at(-1)).toBeGreaterThanOrEqual(95);
    expect(serviceRecoverySeries.map(point=>point.label)).toEqual(expect.arrayContaining(['交通中斷','首次調度','二次事件','ARCI 重規劃']));
  });

  it('gradually applies the updated route before validating the recovered outcome',()=>{
    const early=interpolateSnapshot('UPDATED_EXECUTION',.2);
    const late=interpolateSnapshot('UPDATED_EXECUTION',.8);
    expect(early.activeRoute).toBe('route-b');
    expect(late.activeRoute).toBe('route-c');
    expect(late.ordersAtRisk).toBeLessThan(early.ordersAtRisk);
    expect(late.onTimeRate).toBeGreaterThan(early.onTimeRate);
  });
});
