import { primaryCandidates, provenance, replanCandidates, snapshots } from '../../simulation/scenario';
import type { ARCIInferenceProvider, CommerceDataProvider, ProviderStatus, ScenarioDataProvider, TrafficDataProvider, WeatherDataProvider } from './types';

const status=(value:ProviderStatus):ProviderStatus=>value;

export const scenarioProvider:ScenarioDataProvider={
  status:status({id:'scenario',name:'ARCI Scenario Dataset',status:'scenario',displayStatus:'SCENARIO',lastUpdated:'情境 20:48',description:'雙 9 大促的可重現 Demo 訂單、SKU、節點與事件資料。',dataTypes:['訂單量','SKU 分區','履約節點'],cadence:'階段切換時',integration:'可替換為已授權商務資料的相同 snapshot schema',provenance:provenance.scenario}),
  getSnapshot:phase=>snapshots[phase],
};

export const commerceProvider:CommerceDataProvider={
  status:status({id:'commerce',name:'Shopee Open Platform',status:'unconnected',displayStatus:'UNCONNECTED',lastUpdated:'無授權連線',description:'本版未設定 credential；畫面中的訂單量與受影響訂單均為 Demo 情境。',dataTypes:['訂單','SKU','配送方式'],cadence:'未連接',integration:'實作 CommerceDataProvider 並在伺服器端完成 OAuth／簽章驗證',href:'https://open.shopee.com/',provenance:provenance.commerceScenario}),
  async getOrderSnapshot(phase){ return scenarioProvider.getSnapshot(phase); },
};

export const trafficProvider:TrafficDataProvider={
  status:status({id:'traffic',name:'交通部 TDX',status:'scenario',displayStatus:'SCENARIO',lastUpdated:'情境 20:47',description:'事件欄位對齊 TDX 路況資料，但本畫面未發出真實 API 請求。',dataTypes:['道路事件','路段速度','壅塞等級'],cadence:'情境階段更新',integration:'以 TDX Client ID／Secret 啟用 TrafficDataProvider live adapter',href:'https://tdx.transportdata.tw/',provenance:provenance.trafficScenario}),
  async getEvents(phase){ return scenarioProvider.getSnapshot(phase).events.filter(item=>item.id.startsWith('traffic')); },
};

export const weatherProvider:WeatherDataProvider={
  status:status({id:'weather',name:'中央氣象署 Open Data',status:'scenario',displayStatus:'SCENARIO',lastUpdated:'情境 20:46',description:'警特報事件使用 CWA 資料集欄位概念，現階段為可重現模擬。',dataTypes:['警特報','影響行政區','發布時間'],cadence:'情境階段更新',integration:'以氣象署授權碼取得 W-C0033-001／002 並正規化',href:'https://opendata.cwa.gov.tw/dataset/warning',provenance:provenance.weatherScenario}),
  async getEvents(phase){ return scenarioProvider.getSnapshot(phase).events.filter(item=>item.id.startsWith('weather')); },
};

export const inferenceProvider:ARCIInferenceProvider={
  status:status({id:'inference',name:'ARCI Decision Engine',status:'derived',displayStatus:'DERIVED',lastUpdated:'情境 20:48',description:'恢復時間、SLA、成本與風險訂單均由情境輸入推估，不是物流商即時容量。',dataTypes:['恢復時間','SLA 推估','成本變化'],cadence:'每次候選集重算',integration:'可由 ArciApiDecisionRuntime 替換現行 SimulatedDecisionRuntime',provenance:provenance.projection}),
  async evaluate(phase){
    return ['SECOND_FAILURE','REPLANNING','RECOVERED'].includes(phase)?replanCandidates:primaryCandidates;
  },
};

export const logisticsPolicyProvider=status({id:'logistics',name:'Official Logistics Service Policy',status:'official',displayStatus:'OFFICIAL POLICY',lastUpdated:'展示時查核',description:'候選方案的品牌與服務類型來自公開說明；不包含即時剩餘容量。',dataTypes:['服務名稱','配送類型','公開服務條件'],cadence:'依官方公告',integration:'建立版本化 policy registry，並由人工查核變更',sourceLinks:[{label:'7-ELEVEN 交貨便',href:'https://www.7-11.com.tw/service/accept.aspx'},{label:'全家店到店',href:'https://www.family.com.tw/Marketing/zh/Convenience'},{label:'黑貓常溫宅急便',href:'https://www.t-cat.com.tw/Product/normal.aspx'}],provenance:{sourceType:'public',sourceLabel:'Public service specifications',sourceDetail:'公開服務規格 · 非即時運力',isLive:false}});
