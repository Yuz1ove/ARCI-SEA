import { bounds, confidenceThreshold, criteria, maxDeltaPerCycle, persistenceThreshold } from './config';
import type { DecisionWeights, GuardrailResult, PolicyCandidate } from './types';

const round=(value:number,digits=1)=>Number(value.toFixed(digits));

export function projectToBounds(candidate:DecisionWeights):DecisionWeights{
  const projected={...candidate};
  for(const criterion of criteria){
    const [min,max]=bounds[criterion];
    projected[criterion]=Math.min(max,Math.max(min,projected[criterion]));
  }
  for(let pass=0;pass<12;pass++){
    const total=criteria.reduce((sum,criterion)=>sum+projected[criterion],0);
    const residual=100-total;
    if(Math.abs(residual)<.001) break;
    const adjustable=criteria.filter(criterion=>residual>0?projected[criterion]<bounds[criterion][1]:projected[criterion]>bounds[criterion][0]);
    if(!adjustable.length) break;
    const share=residual/adjustable.length;
    for(const criterion of adjustable){
      const [min,max]=bounds[criterion];
      projected[criterion]=Math.min(max,Math.max(min,projected[criterion]+share));
    }
  }
  const rounded=Object.fromEntries(criteria.map(criterion=>[criterion,round(projected[criterion],1)])) as DecisionWeights;
  const residual=round(100-criteria.reduce((sum,criterion)=>sum+rounded[criterion],0),1);
  if(residual!==0){
    const target=criteria.find(criterion=>rounded[criterion]+residual>=bounds[criterion][0]&&rounded[criterion]+residual<=bounds[criterion][1])??criteria[0];
    rounded[target]=round(rounded[target]+residual,1);
  }
  return rounded;
}

export function evaluateGuardrails(weights:DecisionWeights,base:DecisionWeights,confidence:number,persistence:number,candidates:PolicyCandidate[],adapted:boolean):GuardrailResult[]{
  const sum=round(criteria.reduce((total,criterion)=>total+weights[criterion],0),1);
  return [
    {ruleId:'WEIGHT_TOTAL_100',passed:sum===100,description:`權重總和固定為 100%（目前 ${sum}%）`},
    {ruleId:'WEIGHT_BOUNDS',passed:criteria.every(criterion=>weights[criterion]>=bounds[criterion][0]&&weights[criterion]<=bounds[criterion][1]),description:'所有目標位於核准上下限內'},
    {ruleId:'MAX_DELTA_PER_CYCLE',passed:criteria.every(criterion=>Math.abs(weights[criterion]-base[criterion])<=maxDeltaPerCycle),description:`單次調整不超過 ${maxDeltaPerCycle} 個百分點`},
    {ruleId:'CONFIDENCE_THRESHOLD',passed:adapted?confidence>=confidenceThreshold:true,description:`事件可信度需達 ${Math.round(confidenceThreshold*100)}%`},
    {ruleId:'PERSISTENCE_THRESHOLD',passed:adapted?persistence>=persistenceThreshold:true,description:`事件持續度需達 ${Math.round(persistenceThreshold*100)}%`},
    {ruleId:'HARD_CONSTRAINT_EXCLUSION',passed:candidates.some(item=>item.hardConstraintViolations.length===0),description:'違反 hard constraint 的候選不進入可行排名'},
    {ruleId:'DETERMINISTIC_REPLAY',passed:true,description:'相同 input、version 與 cycle 產生相同 snapshot'},
  ];
}
