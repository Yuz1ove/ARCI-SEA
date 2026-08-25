import { stableHash } from './math';
import { DECISION_ENGINE_PARAMETERS } from './config';

export interface SimulationDisturbance {
  demandMultiplier:number;
  transitMultiplier:number;
  weatherDelta:number;
  trafficDelta:number;
  carrierMultiplier:number;
  throughputMultiplier:number;
}

const seedNumber=(seed:string)=>Number.parseInt(stableHash(seed),16)>>>0;

export function createSeededRandom(seed:string){
  let state=seedNumber(seed)||0x9e3779b9;
  return ()=>{
    state^=state<<13;state^=state>>>17;state^=state<<5;
    return (state>>>0)/4294967296;
  };
}

export function generateDisturbances(seed:string,count:number):SimulationDisturbance[]{
  const random=createSeededRandom(seed);
  const centered=(spread:number)=>(random()*2-1)*spread;
  const spread=DECISION_ENGINE_PARAMETERS.perturbation;
  return Array.from({length:Math.max(1,Math.floor(count))},()=>({
    demandMultiplier:1+centered(spread.demand),transitMultiplier:1+centered(spread.transit),weatherDelta:centered(spread.weather),trafficDelta:centered(spread.traffic),carrierMultiplier:1+centered(spread.carrier),throughputMultiplier:1+centered(spread.throughput),
  }));
}
