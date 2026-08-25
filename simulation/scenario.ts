import { aggregateNetworkNodes, buildNetworkNodes, type OffshoreInput } from './network';
import type { CarrierState, CommerceSnapshot, Provenance, ScenarioEvent, SimulationPhase, WarehouseState } from './types';

export const provenance = {
  scenario:{sourceType:'simulated',sourceLabel:'ARCI Scenario Engine',sourceDetail:'競賽 Demo 情境資料 · 非真實營運',isLive:false,asOf:'情境時間 20:48'},
  projection:{sourceType:'inferred',sourceLabel:'ARCI Decision Engine',sourceDetail:'依情境輸入計算 · 非物流商即時容量',isLive:false,asOf:'情境時間 20:48'},
  trafficScenario:{sourceType:'simulated',sourceLabel:'TDX-ready Adapter',sourceDetail:'TDX schema 對齊的模擬道路事件',isLive:false,asOf:'情境時間 20:47'},
  weatherScenario:{sourceType:'simulated',sourceLabel:'CWA-ready Adapter',sourceDetail:'CWA 警特報欄位對齊的模擬事件',isLive:false,asOf:'情境時間 20:46'},
  commerceScenario:{sourceType:'simulated',sourceLabel:'Shopee-ready Adapter',sourceDetail:'Demo 訂單與 SKU 分區資料 · 平台未連接',isLive:false,asOf:'情境時間 20:48'},
} as const satisfies Record<string,Provenance>;

const warehouse=(id:WarehouseState['id'],name:string,region:string,load:number,queue:number,delay:number,health:WarehouseState['health']):WarehouseState=>({
  id,name,region,load,queue,predictedDelay:delay,health,capacity:id==='warehouse-a'?12000:id==='warehouse-b'?10800:9600,provenance:provenance.scenario,
});
const carrier=(id:CarrierState['id'],name:string,delay:number,capacity:number,reliability:number,health:CarrierState['health']):CarrierState=>({
  id,name,delay,capacity,reliability,health,available:health!=='unavailable',costScore:id==='carrier-a'?92:id==='carrier-b'?81:75,provenance:provenance.scenario,
});
const stableWarehouses=()=>[
  warehouse('warehouse-a','北部履約區','台北／桃園',68,12,.3,'healthy'),
  warehouse('warehouse-b','中部履約區','台中',57,8,.5,'healthy'),
  warehouse('warehouse-c','南部履約區','台南／高雄',51,6,.7,'healthy'),
];
const stableCarriers=()=>[
  carrier('carrier-a','西部幹線運力',.3,64,94,'healthy'),
  carrier('carrier-b','中部替代運力',.7,72,91,'healthy'),
  carrier('carrier-c','南北聯運運力',1.1,78,88,'healthy'),
];
const event=(id:string,title:string,description:string,location:string,severity:ScenarioEvent['severity'],eventProvenance:Provenance):ScenarioEvent=>({id,title,description,location,severity,provenance:eventProvenance});
type DisruptionProfile={transportAvailability:number;weatherDisruption:number;trafficDisruption:number};
const offshore=(id:OffshoreInput['id'],name:string,transport:string,orderRate:number,load:number,slaRate:number,predictedDelay:number,riskScore:number,constraint:string,health:OffshoreInput['health'],profile:Partial<DisruptionProfile>={}):OffshoreInput=>({
  id,name,transport,orderRate,capacity:Math.round(orderRate/Math.max(.01,load/100)),load,slaRate,predictedDelay,riskScore,constraint,health,
  transportAvailability:profile.transportAvailability??Math.max(20,Math.round(100-riskScore*.55)),
  weatherDisruption:profile.weatherDisruption??Math.round(riskScore*.3),trafficDisruption:profile.trafficDisruption??Math.round(riskScore*.2),
});
const offshoreProfiles:Record<SimulationPhase,OffshoreInput[]>={
  NORMAL:[offshore('penghu','澎湖','海運／航空',54,48,97.6,.8,22,'海空運能正常','healthy'),offshore('kinmen','金門','航空優先',42,51,97.2,.9,24,'航空時窗正常','healthy'),offshore('matsu','馬祖','航空／海運',28,46,96.8,1.1,28,'聯外運能正常','healthy'),offshore('green-island','綠島','海運／航空',21,44,97.1,1,26,'臺東海空運能正常','healthy',{transportAvailability:96,weatherDisruption:8,trafficDisruption:6})],
  SURGE:[offshore('penghu','澎湖','海運／航空',68,67,96.1,1.2,35,'大促需求升高','healthy'),offshore('kinmen','金門','航空優先',51,69,95.7,1.4,38,'航空容量收緊','strained'),offshore('matsu','馬祖','航空／海運',34,65,95.2,1.5,41,'端點時窗收緊','strained'),offshore('green-island','綠島','海運／航空',27,63,95.8,1.4,39,'大促需求與班次容量收緊','strained',{transportAvailability:91,weatherDisruption:12,trafficDisruption:10})],
  WAREHOUSE_OVERLOAD:[offshore('penghu','澎湖','海運／航空',70,74,94.8,2.1,55,'海運衔接風險升高','strained'),offshore('kinmen','金門','航空優先',54,79,94.4,2.4,62,'航空容量偏緊','strained'),offshore('matsu','馬祖','航空／海運',36,71,93.9,2.8,68,'預估延遲增加','strained'),offshore('green-island','綠島','海運／航空',29,71,93.8,2.3,61,'臺東 gateway 接駁容量下降','strained',{transportAvailability:78,weatherDisruption:18,trafficDisruption:47})],
  DEGRADED:[offshore('penghu','澎湖','海運／航空',74,82,90.2,4.8,82,'豪雨使海運時窗不穩','critical'),offshore('kinmen','金門','航空優先',58,88,91.6,3.9,78,'航空剩餘容量偏緊','critical'),offshore('matsu','馬祖','航空／海運',38,86,89.8,5.2,86,'預估延遲持續增加','critical'),offshore('green-island','綠島','海運／航空',31,87,88.9,5.6,88,'東南海象與航空時窗受阻','critical',{transportAvailability:42,weatherDisruption:86,trafficDisruption:35})],
  DECIDING:[],
  REROUTING:[offshore('penghu','澎湖','海運／航空',70,76,94.9,2.5,58,'已啟動離島優先緩衝','strained'),offshore('kinmen','金門','航空優先',54,78,95.2,2.2,54,'航空容量已保留','strained'),offshore('matsu','馬祖','航空／海運',36,74,94.6,2.8,61,'跨區中繼正在切換','strained'),offshore('green-island','綠島','海運／航空',29,75,94.2,2.9,62,'臺東海空運緩衝接管中','strained',{transportAvailability:73,weatherDisruption:52,trafficDisruption:24})],
  RECOVERING:[offshore('penghu','澎湖','海運／航空',65,66,97.1,1.2,31,'海運時窗已恢復','healthy'),offshore('kinmen','金門','航空優先',49,68,96.8,1.3,34,'航空容量回復安全','healthy'),offshore('matsu','馬祖','航空／海運',33,64,96.4,1.5,37,'延遲回到門檻內','healthy'),offshore('green-island','綠島','海運／航空',26,64,96.3,1.5,37,'海空運時窗回到門檻內','healthy',{transportAvailability:89,weatherDisruption:22,trafficDisruption:12})],
  SECOND_FAILURE:[offshore('penghu','澎湖','海運／航空',67,73,95.1,2.4,55,'中繼運能再度收緊','strained'),offshore('kinmen','金門','航空優先',51,81,94.6,2.7,64,'航空容量緩衝下降','strained'),offshore('matsu','馬祖','航空／海運',35,79,93.8,3.2,70,'原方案中繼假設失效','critical'),offshore('green-island','綠島','海運／航空',28,82,92.9,3.5,73,'臺東 gateway 容量假設失效','critical',{transportAvailability:62,weatherDisruption:48,trafficDisruption:58})],
  REPLANNING:[],
  UPDATED_EXECUTION:[],
  RECOVERED:[offshore('penghu','澎湖','海運／航空',62,62,97.4,1.1,27,'多運具緩衝已恢復','healthy'),offshore('kinmen','金門','航空優先',47,65,97.0,1.2,30,'航空容量已恢復','healthy'),offshore('matsu','馬祖','航空／海運',31,61,96.6,1.4,33,'延遲維持於門檻內','healthy'),offshore('green-island','綠島','海運／航空',25,60,96.8,1.4,34,'臺東海空運服務已驗證','healthy',{transportAvailability:92,weatherDisruption:14,trafficDisruption:9})],
};
offshoreProfiles.DECIDING=offshoreProfiles.DEGRADED;
offshoreProfiles.REPLANNING=offshoreProfiles.SECOND_FAILURE;
offshoreProfiles.UPDATED_EXECUTION=offshoreProfiles.RECOVERED;

type BaseOverrides=Partial<Omit<CommerceSnapshot,'metrics'|'events'|'trace'|'networkNodes'|'networkKpis'>> & {offshore?:OffshoreInput[];events?:ScenarioEvent[];trace?:Partial<CommerceSnapshot['trace']>};

const base=(overrides:BaseOverrides):CommerceSnapshot=>{
  const {offshore:requestedOffshore,...snapshotOverrides}=overrides;
  const values={
    orderRate:3180,ordersAtRisk:12,inventorySyncHealth:98.1,warehouses:stableWarehouses(),carriers:stableCarriers(),onTimeRate:98.1,
    averageDelayHours:.3,extraCostPercent:0,recoveryScore:98,activeRoute:'route-a' as const,arciStatus:'正常運作',headline:'雙 9 大促運作穩定',
    summary:'訂單與履約流量維持在情境模型安全範圍。',...snapshotOverrides,
  };
  const profilePhase:SimulationPhase=values.arciStatus==='壓力升高'?'SURGE':values.arciStatus==='異常發生'?'WAREHOUSE_OVERLOAD':values.arciStatus==='ARCI 診斷中'?'DEGRADED':values.arciStatus==='ARCI 決策中'?'DECIDING':values.arciStatus==='正在執行調度'?'REROUTING':values.arciStatus==='恢復中'?'RECOVERING':values.arciStatus==='二次事件'?'SECOND_FAILURE':values.arciStatus==='重新規劃'?'REPLANNING':values.arciStatus==='正在執行新方案'?'UPDATED_EXECUTION':values.arciStatus==='已恢復'?'RECOVERED':'NORMAL';
  const offshoreNodes=requestedOffshore??offshoreProfiles[profilePhase];
  const networkNodes=buildNetworkNodes({orderRate:values.orderRate,onTimeRate:values.onTimeRate,warehouses:values.warehouses,offshore:offshoreNodes,provenance:provenance.scenario});
  return {...values,
    networkNodes,
    networkKpis:aggregateNetworkNodes(networkNodes,provenance.projection),
    metrics:{
      orderRate:{value:values.orderRate,...provenance.commerceScenario},ordersAtRisk:{value:values.ordersAtRisk,...provenance.projection},
      onTimeRate:{value:values.onTimeRate,...provenance.projection},averageDelayHours:{value:values.averageDelayHours,...provenance.projection},
      extraCostPercent:{value:values.extraCostPercent,...provenance.projection},recoveryScore:{value:values.recoveryScore,...provenance.projection},
    },
    events:snapshotOverrides.events??[],
      trace:{observed:['訂單流與履約容量穩定'],objective:'維持 SLA 並保留調度餘裕',constraints:['七節點容量 < 85%','額外成本 < 5%','平均延遲 < 2 小時','四組離島最低履約保障'],reason:'目前不需要介入，持續監測外部事件與七節點負載。',...snapshotOverrides.trace},
  };
};

const trafficEvent={
  ...event('traffic-01','中部主要配送路徑壅塞','事故造成可用道路容量下降，原方案開始偏離 SLA。','台中都會區','critical',provenance.trafficScenario),
  operationalImpact:{corridor:'中部西部物流走廊',capacityDropPercent:42,estimatedDelayMinutes:68,affectedOrders:41,durationRangeMinutes:[65,90] as [number,number],confidence:.87,updatedAt:'20:47:18'},
};
const rainEvent=event('weather-01','南部豪雨風險升高','強降雨降低末端配送速度，南向流量需要保留緩衝。','台南—高雄','warning',provenance.weatherScenario);
const overloadEvent=event('capacity-02','替代節點負載快速上升','第一次調度後，中部替代節點接近容量上限。','中部履約區','critical',provenance.scenario);

export const snapshots:Record<SimulationPhase,CommerceSnapshot>={
  NORMAL:base({}),
  SURGE:base({orderRate:4620,ordersAtRisk:18,onTimeRate:97.4,averageDelayHours:.5,recoveryScore:95,arciStatus:'壓力升高',headline:'大促訂單流量快速升高',summary:'每小時訂單流量上升 24%，ARCI 正在追蹤容量餘裕。',warehouses:[warehouse('warehouse-a','北部履約區','台北／桃園',79,42,.7,'healthy'),warehouse('warehouse-b','中部履約區','台中',72,31,.8,'healthy'),warehouse('warehouse-c','南部履約區','台南／高雄',67,24,.9,'healthy')],trace:{observed:['訂單流量較基準上升 24%','中部節點負載升至 72%'],reason:'流量仍可吸收；提升監測頻率並保留替代路徑。'}}),
  WAREHOUSE_OVERLOAD:base({orderRate:4620,ordersAtRisk:29,onTimeRate:95.6,averageDelayHours:1.4,recoveryScore:86,arciStatus:'異常發生',headline:'中部配送路徑出現交通異常',summary:'道路事件使中部幹線容量下降，風險訂單開始累積。',events:[trafficEvent],warehouses:[warehouse('warehouse-a','北部履約區','台北／桃園',81,48,.8,'healthy'),warehouse('warehouse-b','中部履約區','台中',78,76,1.8,'strained'),warehouse('warehouse-c','南部履約區','台南／高雄',68,27,1,'healthy')],trace:{observed:['中部主要路徑可用容量下降','中部履約區負載 78%'],reason:'公共事件已影響原路線，但尚有容量緩衝。'}}),
  DEGRADED:base({orderRate:4620,ordersAtRisk:41,onTimeRate:91.4,averageDelayHours:4.2,extraCostPercent:1.1,recoveryScore:68,arciStatus:'ARCI 診斷中',headline:'交通與豪雨事件形成複合風險',summary:'原物流方案失效；41 筆訂單可能超過 SLA。',events:[trafficEvent,rainEvent],warehouses:[warehouse('warehouse-a','北部履約區','台北／桃園',83,61,1.1,'strained'),warehouse('warehouse-b','中部履約區','台中',86,118,4.2,'critical'),warehouse('warehouse-c','南部履約區','台南／高雄',76,45,2.1,'strained')],carriers:[carrier('carrier-a','西部幹線運力',4.2,91,62,'degraded'),carrier('carrier-b','中部替代運力',1.4,72,91,'healthy'),carrier('carrier-c','南北聯運運力',1.8,78,88,'healthy')],trace:{observed:['中部路徑中斷','南部豪雨風險','41 筆訂單可能超過 SLA'],objective:'最小化 SLA 違約並維持節點容量安全',reason:'原方案同時受到道路容量與氣象限制，必須建立替代方案。'}}),
  DECIDING:base({orderRate:4620,ordersAtRisk:41,onTimeRate:91.4,averageDelayHours:4.2,extraCostPercent:1.1,recoveryScore:68,arciStatus:'ARCI 決策中',headline:'ARCI 正在比較三個可執行方案',summary:'依延遲、成本、容量與恢復時間評估候選路徑。',events:[trafficEvent,rainEvent],warehouses:[warehouse('warehouse-a','北部履約區','台北／桃園',83,61,1.1,'strained'),warehouse('warehouse-b','中部履約區','台中',86,118,4.2,'critical'),warehouse('warehouse-c','南部履約區','台南／高雄',76,45,2.1,'strained')],carriers:[carrier('carrier-a','西部幹線運力',4.2,91,62,'degraded'),carrier('carrier-b','中部替代運力',1.4,72,91,'healthy'),carrier('carrier-c','南北聯運運力',1.8,78,88,'healthy')],trace:{observed:['中部路徑中斷','南部豪雨風險','履約負載 86%'],objective:'最小化 SLA 違約並限制額外成本',reason:'全家店到店候選策略在情境限制下，有最高的 ARCI 預估履約率。'}}),
  REROUTING:base({orderRate:4430,ordersAtRisk:24,onTimeRate:94.8,averageDelayHours:2.6,extraCostPercent:2.7,recoveryScore:80,activeRoute:'route-b',arciStatus:'正在執行調度',headline:'替代配送路徑正在接管訂單流',summary:'受影響訂單分批改道，原中部路徑保留為降載流量。',events:[trafficEvent,rainEvent],warehouses:[warehouse('warehouse-a','北部履約區','台北／桃園',77,43,.9,'healthy'),warehouse('warehouse-b','中部履約區','台中',79,69,2.3,'strained'),warehouse('warehouse-c','南部履約區','台南／高雄',81,58,1.7,'strained')],trace:{reason:'已執行全家店到店情境調度；負載依容量限制分批轉移。'}}),
  RECOVERING:base({orderRate:4180,ordersAtRisk:9,onTimeRate:97.8,averageDelayHours:1.1,extraCostPercent:2.8,recoveryScore:94,activeRoute:'route-b',arciStatus:'恢復中',headline:'第一次調度結果已通過驗證',summary:'風險訂單與平均延遲皆回到目標範圍。',events:[{...trafficEvent,severity:'resolved'}],warehouses:[warehouse('warehouse-a','北部履約區','台北／桃園',74,25,.7,'healthy'),warehouse('warehouse-b','中部履約區','台中',76,41,1.4,'healthy'),warehouse('warehouse-c','南部履約區','台南／高雄',82,47,1.1,'strained')],trace:{observed:['風險訂單 41 → 9','平均延誤 4.2 → 1.1 小時'],objective:'驗證執行結果並持續監測',reason:'方案達成 SLA 與成本限制；閉環進入持續驗證。'}}),
  SECOND_FAILURE:base({orderRate:4210,ordersAtRisk:27,onTimeRate:93.2,averageDelayHours:2.9,extraCostPercent:3.1,recoveryScore:75,activeRoute:'route-b',arciStatus:'二次事件',headline:'新事件：替代節點負載快速上升',summary:'第一次方案的容量假設失效，ARCI 自動重新啟動決策循環。',events:[overloadEvent],warehouses:[warehouse('warehouse-a','北部履約區','台北／桃園',76,31,.8,'healthy'),warehouse('warehouse-b','中部履約區','台中',96,137,3.4,'critical'),warehouse('warehouse-c','南部履約區','台南／高雄',84,59,1.6,'strained')],carriers:[carrier('carrier-a','西部幹線運力',3.8,86,68,'degraded'),carrier('carrier-b','中部替代運力',3.4,100,54,'unavailable'),carrier('carrier-c','南北聯運運力',1.6,82,88,'healthy')],trace:{observed:['中部替代節點負載 96%','已選方案容量假設失效'],objective:'不重用失效方案並重新恢復 SLA',reason:'新限制使第一次方案不可持續，必須即時重新規劃。'}}),
  REPLANNING:base({orderRate:4210,ordersAtRisk:27,onTimeRate:93.2,averageDelayHours:2.9,extraCostPercent:3.1,recoveryScore:75,activeRoute:'route-b',arciStatus:'重新規劃',headline:'ARCI 依新限制重新計算',summary:'排除超載節點後，重新比較可執行的南北聯運方案。',events:[overloadEvent],warehouses:[warehouse('warehouse-a','北部履約區','台北／桃園',76,31,.8,'healthy'),warehouse('warehouse-b','中部履約區','台中',96,137,3.4,'critical'),warehouse('warehouse-c','南部履約區','台南／高雄',84,59,1.6,'strained')],carriers:[carrier('carrier-a','西部幹線運力',3.8,86,68,'degraded'),carrier('carrier-b','中部替代運力',3.4,100,54,'unavailable'),carrier('carrier-c','南北聯運運力',1.6,82,88,'healthy')],trace:{observed:['中部替代節點超載','可用方案集合已改變'],objective:'最小化二次事件造成的 SLA 風險',reason:'黑貓宅急便南北直連策略不使用失效節點，ARCI 預估可在 24 分鐘內恢復流量。'}}),
  UPDATED_EXECUTION:base({orderRate:4020,ordersAtRisk:8,onTimeRate:97.6,averageDelayHours:1.2,extraCostPercent:3.4,recoveryScore:95,activeRoute:'route-c',arciStatus:'正在執行新方案',headline:'更新後方案正在接管履約流量',summary:'南北直連與四組離島保障依新限制逐步生效。',events:[overloadEvent],warehouses:[warehouse('warehouse-a','北部履約區','台北／桃園',73,21,.7,'healthy'),warehouse('warehouse-b','中部履約區','台中',78,46,1.3,'healthy'),warehouse('warehouse-c','南部履約區','台南／高雄',79,39,1.2,'healthy')],carriers:[carrier('carrier-a','西部幹線運力',2.1,72,78,'strained'),carrier('carrier-b','中部替代運力',3.4,76,70,'strained'),carrier('carrier-c','南北聯運運力',1.2,84,91,'healthy')],trace:{observed:['新方案已排除中部超載節點','南北直連與離島保障開始執行'],objective:'執行更新後決策並恢復 SLA',reason:'方案 B 已取得執行權；流量正在由失效方案切換至南北直連與離島保障。'}}),
  RECOVERED:base({orderRate:4020,ordersAtRisk:8,onTimeRate:97.6,averageDelayHours:1.2,extraCostPercent:3.4,recoveryScore:95,activeRoute:'route-c',arciStatus:'已恢復',headline:'二次調度完成，韌性恢復已驗證',summary:'ARCI 在新限制下完成重新規劃、執行與結果驗證。',events:[{...overloadEvent,severity:'resolved'}],warehouses:[warehouse('warehouse-a','北部履約區','台北／桃園',73,21,.7,'healthy'),warehouse('warehouse-b','中部履約區','台中',78,46,1.3,'healthy'),warehouse('warehouse-c','南部履約區','台南／高雄',79,39,1.2,'healthy')],carriers:[carrier('carrier-a','西部幹線運力',2.1,72,78,'strained'),carrier('carrier-b','中部替代運力',3.4,76,70,'strained'),carrier('carrier-c','南北聯運運力',1.2,84,91,'healthy')],trace:{observed:['風險訂單降至 8 筆','SLA 達成率回升至 97.6%'],objective:'確認新方案可持續並回到監測狀態',reason:'第二次方案在新容量限制下通過驗證，決策閉環完成。'}}),
};

export const serviceRecoverySeries:Array<{phase:SimulationPhase;minute:number;label:string;detail:string;slaPercent:number}>=[
  {phase:'NORMAL',minute:0,label:'事件前',detail:'服務維持正常基準',slaPercent:snapshots.NORMAL.onTimeRate},
  {phase:'SURGE',minute:4,label:'爆單',detail:'大促訂單壓力升高',slaPercent:snapshots.SURGE.onTimeRate},
  {phase:'WAREHOUSE_OVERLOAD',minute:8,label:'交通中斷',detail:'中部走廊可用容量下降',slaPercent:snapshots.WAREHOUSE_OVERLOAD.onTimeRate},
  {phase:'DEGRADED',minute:16,label:'氣象異常',detail:'豪雨使服務水準降至低點',slaPercent:snapshots.DEGRADED.onTimeRate},
  {phase:'REROUTING',minute:24,label:'首次調度',detail:'替代走廊開始接管流量',slaPercent:snapshots.REROUTING.onTimeRate},
  {phase:'RECOVERING',minute:32,label:'初次恢復',detail:'第一次調度通過驗證',slaPercent:snapshots.RECOVERING.onTimeRate},
  {phase:'SECOND_FAILURE',minute:40,label:'二次事件',detail:'中部替代節點容量假設失效',slaPercent:snapshots.SECOND_FAILURE.onTimeRate},
  {phase:'REPLANNING',minute:48,label:'ARCI 重規劃',detail:'排除超載節點並重排候選',slaPercent:snapshots.REPLANNING.onTimeRate},
  {phase:'RECOVERED',minute:56,label:'穩定',detail:'新方案使 SLA 回到目標以上',slaPercent:snapshots.RECOVERED.onTimeRate},
];
export const phaseOrder:SimulationPhase[]=['NORMAL','SURGE','WAREHOUSE_OVERLOAD','DEGRADED','DECIDING','REROUTING','RECOVERING','SECOND_FAILURE','REPLANNING','UPDATED_EXECUTION','RECOVERED'];
export const phaseLabels:Record<SimulationPhase,string>={NORMAL:'正常',SURGE:'爆單',WAREHOUSE_OVERLOAD:'交通異常',DEGRADED:'氣象異常',DECIDING:'ARCI 決策',REROUTING:'執行',RECOVERING:'恢復',SECOND_FAILURE:'二次事件',REPLANNING:'重新規劃',UPDATED_EXECUTION:'更新執行',RECOVERED:'已恢復'};
