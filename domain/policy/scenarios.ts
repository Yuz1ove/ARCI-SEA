import type { CriterionFeatures, DecisionSignalInput, PolicyCandidate, PolicyScenario, PolicyScenarioId } from './types';
import { OPERATIONAL_NODE_IDS } from '../../simulation/types';

const features=(slaProtection:number,routeFeasibility:number,capacityBalance:number,costEfficiency:number,disruptionRisk:number,recoverySpeed:number):CriterionFeatures=>({slaProtection,routeFeasibility,capacityBalance,costEfficiency,disruptionRisk,recoverySpeed});
const candidate=(candidateId:string,routeId:PolicyCandidate['routeId'],label:string,mode:string,description:string,values:CriterionFeatures,options:Partial<Omit<PolicyCandidate,'candidateId'|'routeId'|'label'|'mode'|'description'|'features'>>={}):PolicyCandidate=>{
  const created:PolicyCandidate={
    candidateId,routeId,label,mode,description,features:values,hardConstraintViolations:[],riskPenalty:.05,softConstraintViolation:.04,
    availableCapacity:4600,requiredCapacity:4300,routeAvailable:1,routeReliability:.94,nodeDemand:4210,nodeCapacity:4380,servedNodeIds:[...OPERATIONAL_NODE_IDS],...options,
  };
  if(!OPERATIONAL_NODE_IDS.every(id=>created.servedNodeIds.includes(id))&&!created.hardConstraintViolations.includes('OPERATIONAL_NODE_COVERAGE')) created.hardConstraintViolations.push('OPERATIONAL_NODE_COVERAGE');
  return created;
};

type SignalValues={orderPressure:number;orderRate:number;backlog:number;growth:number;warehouseCapacity:number;nodeLoad:number;picking:number;inventory:number;routeAvailability:number;eta:number;congestion:number;traffic:number;carrierCapacity:number;sla:number;delayed:number;breach:number;routeRisk:number;nodeFailure:number;uncertainty:number;penghu:number;kinmen:number;matsu:number;greenIsland:number};
const source='SCENARIO' as const;
const estimate='ARCI ESTIMATE' as const;
const signal=(id:string,group:DecisionSignalInput['group'],label:string,current:number,previous:number,unit:string,min:number,max:number,sourceType:DecisionSignalInput['sourceType'],lowerIsBetter=false):DecisionSignalInput=>({id,group,label,current,previous,unit,min,max,sourceType,lowerIsBetter});
const signals=(current:SignalValues,previous:SignalValues):DecisionSignalInput[]=>[
  signal('order-pressure','Demand / Order','訂單壓力',current.orderPressure,previous.orderPressure,'%',0,100,estimate),
  signal('order-rate','Demand / Order','每分鐘訂單量',current.orderRate,previous.orderRate,' orders/min',2000,7000,source),
  signal('regional-backlog','Demand / Order','區域 backlog',current.backlog,previous.backlog,' orders',0,4200,source),
  signal('order-growth','Demand / Order','訂單成長率',current.growth,previous.growth,'%',-10,90,estimate),
  signal('warehouse-capacity','Fulfillment','倉庫容量',current.warehouseCapacity,previous.warehouseCapacity,' orders/min',3000,6000,source),
  signal('node-utilization','Fulfillment','節點利用率',current.nodeLoad,previous.nodeLoad,'%',50,100,source),
  signal('picking-throughput','Fulfillment','揀貨吞吐量',current.picking,previous.picking,' orders/min',2400,5200,source),
  signal('inventory-availability','Fulfillment','Inventory availability',current.inventory,previous.inventory,'%',60,100,source),
  signal('route-availability','Logistics','Route availability',current.routeAvailability,previous.routeAvailability,'%',0,100,source),
  signal('eta','Logistics','ETA',current.eta,previous.eta,' min',20,180,estimate,true),
  signal('congestion','Logistics','Congestion',current.congestion,previous.congestion,'%',0,100,source),
  signal('traffic-disruption','Logistics','Traffic disruption',current.traffic,previous.traffic,'%',0,100,source),
  signal('carrier-capacity','Logistics','Carrier capacity',current.carrierCapacity,previous.carrierCapacity,'%',0,100,source),
  signal('sla-compliance','SLA','SLA compliance',current.sla,previous.sla,'%',80,100,source),
  signal('delayed-orders','SLA','Delayed orders',current.delayed,previous.delayed,' orders',0,3000,source,true),
  signal('breach-probability','SLA','Breach probability',current.breach,previous.breach,'',0,1,estimate,true),
  signal('route-risk','Risk','Route disruption risk',current.routeRisk,previous.routeRisk,'',0,1,estimate,true),
  signal('node-failure','Risk','Node failure probability',current.nodeFailure,previous.nodeFailure,'',0,1,estimate,true),
  signal('recovery-uncertainty','Risk','Recovery uncertainty',current.uncertainty,previous.uncertainty,'',0,1,estimate,true),
  signal('penghu-service','Offshore','澎湖配送狀態',current.penghu,previous.penghu,'% SLA',80,100,source),
  signal('kinmen-service','Offshore','金門配送狀態',current.kinmen,previous.kinmen,'% SLA',80,100,source),
  signal('matsu-service','Offshore','馬祖配送狀態',current.matsu,previous.matsu,'% SLA',80,100,source),
  signal('green-island-service','Offshore','綠島配送狀態',current.greenIsland,previous.greenIsland,'% SLA',80,100,source),
];

const normal:SignalValues={orderPressure:42,orderRate:3180,backlog:420,growth:8,warehouseCapacity:5100,nodeLoad:57,picking:4620,inventory:96,routeAvailability:100,eta:34,congestion:18,traffic:4,carrierCapacity:91,sla:98.4,delayed:86,breach:.08,routeRisk:.12,nodeFailure:.05,uncertainty:.10,penghu:97.1,kinmen:96.8,matsu:95.9,greenIsland:97.1};
const traffic:SignalValues={orderPressure:86,orderRate:5680,backlog:2760,growth:68,warehouseCapacity:4780,nodeLoad:86,picking:3890,inventory:88,routeAvailability:58,eta:102,congestion:81,traffic:76,carrierCapacity:64,sla:91.8,delayed:1680,breach:.79,routeRisk:.82,nodeFailure:.31,uncertainty:.38,penghu:92.4,kinmen:91.8,matsu:89.9,greenIsland:88.9};
const overload:SignalValues={orderPressure:74,orderRate:5240,backlog:2140,growth:41,warehouseCapacity:4380,nodeLoad:96,picking:4210,inventory:74,routeAvailability:92,eta:71,congestion:42,traffic:18,carrierCapacity:72,sla:93.3,delayed:1260,breach:.41,routeRisk:.36,nodeFailure:.68,uncertainty:.46,penghu:94.1,kinmen:92.8,matsu:91.6,greenIsland:92.9};

const normalCandidates:PolicyCandidate[]=[
  candidate('route-a','route-a','南北直送＋離島保障','WESTERN TRUNK + SEA / AIR','維持西部幹線並保留離島最低服務。',features(.96,.94,.90,.92,.91,.86),{riskPenalty:.025,softConstraintViolation:.015,availableCapacity:4920,requiredCapacity:4210,routeReliability:.97}),
  candidate('route-d','route-d','北部分流＋中部節流','REGIONAL BALANCE','將北部增量分流並維持中部容量緩衝。',features(.94,.91,.93,.88,.89,.82),{riskPenalty:.03,softConstraintViolation:.02}),
  candidate('route-b','route-b','高雄增援＋北部吸收','CROSS-REGION RELIEF','由南北節點共同承接尖峰。',features(.95,.92,.91,.76,.90,.90),{riskPenalty:.035,softConstraintViolation:.03}),
  candidate('route-c','route-c','跨區再平衡','NORTH–SOUTH REBALANCE','跨區重排庫存與履約容量。',features(.93,.90,.94,.71,.88,.92),{riskPenalty:.04,softConstraintViolation:.035}),
  candidate('candidate-e',undefined,'區域暫緩履約','CONTROLLED DEFERMENT','暫緩非關鍵訂單以保護核心 SLA。',features(.82,.98,.96,.95,.86,.74),{hardConstraintViolations:['MINIMUM_SLA'],riskPenalty:.02,servedNodeIds:OPERATIONAL_NODE_IDS.filter(id=>id!=='green-island')}),
  candidate('candidate-f',undefined,'離島保底＋本島降載','OFFSHORE GUARANTEE','鎖定澎金馬與綠島服務並降低本島非關鍵負載。',features(.91,.88,.89,.72,.94,.84),{riskPenalty:.03,softConstraintViolation:.05}),
  candidate('candidate-g',undefined,'多承運人彈性池','MULTI-CARRIER POOL','以多承運人容量池降低單點依賴。',features(.92,.93,.87,.68,.95,.88),{riskPenalty:.025,softConstraintViolation:.06}),
];

const trafficCandidates:PolicyCandidate[]=normalCandidates.map(item=>({...item,features:{...item.features}})).map(item=>{
  if(item.candidateId==='route-a') return {...item,hardConstraintViolations:['ROUTE_UNAVAILABLE'],routeAvailable:0,features:{...item.features,routeFeasibility:.18,disruptionRisk:.31}};
  if(item.candidateId==='route-b') return {...item,features:features(.97,.94,.89,.72,.91,.86),riskPenalty:.035,softConstraintViolation:.025,availableCapacity:4760,requiredCapacity:4300};
  if(item.candidateId==='route-d') return {...item,features:features(.90,.84,.86,.86,.78,.80),riskPenalty:.07};
  if(item.candidateId==='candidate-e') return {...item,hardConstraintViolations:['MINIMUM_SLA','OPERATIONAL_NODE_COVERAGE']};
  if(item.candidateId==='candidate-g') return {...item,features:features(.94,.92,.84,.62,.93,.91),riskPenalty:.03};
  return item;
});

const overloadCandidates:PolicyCandidate[]=normalCandidates.map(item=>({...item,features:{...item.features},hardConstraintViolations:[...item.hardConstraintViolations]})).map(item=>{
  if(item.candidateId==='route-a') return {...item,hardConstraintViolations:['MINIMUM_OFFSHORE_SERVICE'],features:features(.80,.72,.54,.94,.52,.58)};
  if(item.candidateId==='route-d') return {...item,hardConstraintViolations:['WAREHOUSE_CAPACITY'],nodeDemand:4560,nodeCapacity:4380,features:features(.84,.79,.51,.80,.69,.62)};
  if(item.candidateId==='route-c') return {...item,hardConstraintViolations:[],features:features(.97,.94,.98,.70,.90,.96),riskPenalty:.025,softConstraintViolation:.025,availableCapacity:4860,requiredCapacity:4210,nodeDemand:4210,nodeCapacity:4380};
  if(item.candidateId==='route-b') return {...item,features:features(.94,.89,.91,.68,.86,.90),riskPenalty:.04};
  if(item.candidateId==='candidate-e') return {...item,hardConstraintViolations:['MINIMUM_SLA','OPERATIONAL_NODE_COVERAGE']};
  if(item.candidateId==='candidate-f') return {...item,features:features(.92,.91,.93,.66,.95,.89),riskPenalty:.03};
  return item;
});

export const policyScenarios:Record<PolicyScenarioId,PolicyScenario>={
  'normal-operations':{
    id:'normal-operations',label:'正常營運',contextLabel:'正常營運',version:'ARCI-SEA-POLICY-v1.3',effectiveAt:'2026-09-09T20:40:00+08:00',observationTime:'20:40:08.013',priorSnapshotLabel:'BASELINE-v1.3',
    context:{orderPressure:.42,corridorCapacityDrop:.04,estimatedDelayMinutes:34,slaRisk:.08,nodeLoad:.57,inventoryRisk:.04,eventConfidence:.92,eventPersistence:.8,offshoreRisk:.12,greenIslandRisk:.13,weatherRisk:.16,cycle:0},
    signals:signals(normal,{...normal,orderRate:3010,orderPressure:39,backlog:390}),beta:1.35,candidates:normalCandidates,currentCandidateId:'route-a',
    outcome:{status:'monitoring',expected:'維持 SLA 與成本平衡',observed:'營運訊號仍在核准範圍',nextEvaluation:'事件可信度或節點負載越過門檻'},
  },
  'traffic-disruption':{
    id:'traffic-disruption',label:'交通中斷',contextLabel:'交通中斷 × 大促訂單壓力',version:'ARCI-SEA-POLICY-v1.3',effectiveAt:'2026-09-09T20:48:00+08:00',observationTime:'20:48:08.013',priorSnapshotLabel:'NORMAL-OPS-v1.3',
    context:{orderPressure:.86,corridorCapacityDrop:.42,estimatedDelayMinutes:102,slaRisk:.79,nodeLoad:.86,inventoryRisk:.31,eventConfidence:.87,eventPersistence:.91,offshoreRisk:.82,greenIslandRisk:.88,weatherRisk:.76,cycle:1},
    signals:signals(traffic,normal),beta:1.35,candidates:trafficCandidates,currentCandidateId:'route-a',
    outcome:{status:'retained',expected:'24 分鐘內使 SLA 回到 97% 以上',observed:'24 分鐘時 SLA 97.6%，Backlog 8 筆',nextEvaluation:'SLA < 95% 或中部負載 > 85%'},
  },
  'warehouse-overload':{
    id:'warehouse-overload',label:'倉庫過載',contextLabel:'中部節點過載 × 二次事件',version:'ARCI-SEA-POLICY-v1.3',effectiveAt:'2026-09-09T20:55:00+08:00',observationTime:'20:55:08.013',priorSnapshotLabel:'TRAFFIC-RECOVERY-v1.3',
    context:{orderPressure:.74,corridorCapacityDrop:.08,estimatedDelayMinutes:71,slaRisk:.68,nodeLoad:.96,inventoryRisk:.62,eventConfidence:.91,eventPersistence:.88,offshoreRisk:.70,greenIslandRisk:.73,weatherRisk:.54,cycle:2},
    signals:signals(overload,{...traffic,nodeLoad:91,sla:95.2,breach:.29,nodeFailure:.39}),beta:1.35,candidates:overloadCandidates,currentCandidateId:'route-b',
    outcome:{status:'rollback-required',expected:'中部負載在單一週期降至 85% 以下',observed:'中部替代節點仍為 96%，原策略假設失效',nextEvaluation:'排除超載節點後以新候選集合重算'},
  },
};

export const getPolicyScenario=(id:PolicyScenarioId)=>policyScenarios[id];
