import type { ContextClassification, DecisionCriterion, DecisionWeights, ReasonChain } from './types';

export const criteria:DecisionCriterion[]=['slaProtection','routeFeasibility','capacityBalance','costEfficiency','disruptionRisk','recoverySpeed'];

export const criterionLabels:Record<DecisionCriterion,{zh:string;en:string;symbol:string}>={
  slaProtection:{zh:'SLA 保護',en:'SLA PROTECTION',symbol:'wSLA'},
  routeFeasibility:{zh:'路線可行性',en:'ROUTE FEASIBILITY',symbol:'wRoute'},
  capacityBalance:{zh:'容量平衡',en:'CAPACITY BALANCE',symbol:'wCapacity'},
  costEfficiency:{zh:'成本效率',en:'COST EFFICIENCY',symbol:'wCost'},
  disruptionRisk:{zh:'中斷風險',en:'DISRUPTION RISK',symbol:'wRisk'},
  recoverySpeed:{zh:'恢復速度',en:'RECOVERY SPEED',symbol:'wRecovery'},
};

export const baseWeights:DecisionWeights={slaProtection:22,routeFeasibility:18,capacityBalance:17,costEfficiency:20,disruptionRisk:14,recoverySpeed:9};
export const bounds:Record<DecisionCriterion,readonly [number,number]>={
  slaProtection:[14,32],routeFeasibility:[12,30],capacityBalance:[12,28],costEfficiency:[8,25],disruptionRisk:[8,24],recoverySpeed:[6,18],
};
export const confidenceThreshold=.75;
export const persistenceThreshold=.7;
export const maxDeltaPerCycle=12;
export const cooldownCycles=1;
export const riskLambda=.32;
export const constraintMu=.46;
export const switchThreshold=.035;

export const reasons:Record<ContextClassification,Partial<Record<DecisionCriterion,{reason:string;signal:string}>>>={
  NORMAL_OPERATIONS:{},
  TRAFFIC_DISRUPTION:{
    slaProtection:{reason:'預估延遲提高 SLA 違約風險，提升履約保護。',signal:'slaRisk'},
    routeFeasibility:{reason:'西部走廊可用運能下降，優先可實際通行的替代路徑。',signal:'corridorCapacityDrop'},
    capacityBalance:{reason:'替代節點承接流量，重新平衡區域容量。',signal:'nodeLoad'},
    costEfficiency:{reason:'事件期間以可行性與 SLA 為先，降低短期成本優先度。',signal:'estimatedDelayMinutes'},
    disruptionRisk:{reason:'交通與氣象風險同時升高，增加中斷風險抑制。',signal:'weatherRisk'},
    recoverySpeed:{reason:'需縮短服務回復時間，提升恢復速度。',signal:'eventPersistence'},
  },
  WAREHOUSE_OVERLOAD:{
    slaProtection:{reason:'節點過載推升違約風險，增加 SLA 保護。',signal:'slaRisk'},
    routeFeasibility:{reason:'排除依賴超載節點的路徑。',signal:'nodeLoad'},
    capacityBalance:{reason:'中部節點越過容量門檻，容量平衡成為最高增量。',signal:'nodeLoad'},
    costEfficiency:{reason:'復原週期先滿足容量安全，降低短期成本優先度。',signal:'inventoryRisk'},
    disruptionRisk:{reason:'二次事件維持風險抑制但不取代容量約束。',signal:'eventPersistence'},
    recoverySpeed:{reason:'原方案失配，提升可在單一週期完成的恢復速度。',signal:'eventPersistence'},
  },
};

export const reasonChains:Record<ContextClassification,ReasonChain[]>={
  NORMAL_OPERATIONS:[{signal:'全部訊號維持安全範圍',interpretation:'未形成重新規劃條件',adjustment:'維持基準權重',criterion:'costEfficiency'}],
  TRAFFIC_DISRUPTION:[
    {signal:'西部走廊可用運能下降',interpretation:'路線失效與延遲風險上升',adjustment:'提高 wRoute 與 wRisk',criterion:'routeFeasibility'},
    {signal:'SLA 違約風險越過門檻',interpretation:'現行方案無法維持最低服務',adjustment:'提高 wSLA',criterion:'slaProtection'},
    {signal:'離島海空運緩衝收緊，綠島 SLA 下降',interpretation:'候選方案需覆蓋七個營運節點',adjustment:'提高 wRisk 並納入 coverage hard constraint',criterion:'disruptionRisk'},
  ],
  WAREHOUSE_OVERLOAD:[
    {signal:'中部節點負載 96%',interpretation:'原方案容量假設失效',adjustment:'大幅提高 wCapacity',criterion:'capacityBalance'},
    {signal:'替代節點庫存風險上升',interpretation:'排除不可持續的集中調度',adjustment:'降低 wCost、提高 wRecovery',criterion:'recoverySpeed'},
  ],
};
