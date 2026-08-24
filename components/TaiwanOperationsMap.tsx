import { candidatesForPhase } from '@/simulation/scenario';
import { islandGeometry,logisticsRoutes,networkNodeAnchors,offshoreRoutes,routeAnchors,taiwanGeometry,westernCorridor } from '@/simulation/geography';
import { segmentProgress } from '@/simulation/timeline';
import type { CSSProperties } from 'react';
import { OPERATIONAL_NODE_IDS, type CommerceSimulationState, type CommerceSnapshot, type NetworkNodeState, type RouteId } from '@/simulation/types';

type Props={snapshot:CommerceSnapshot;state:CommerceSimulationState;stageProgress:number;onSelectNode:(id:string|null)=>void};
const routes=(Object.entries(logisticsRoutes) as Array<[RouteId,(typeof logisticsRoutes)[RouteId]]>).map(([id,route])=>({id,...route}));
const routeCandidates=(phase:CommerceSimulationState['phase'])=>phase==='DECIDING'||phase==='REPLANNING';
const routeExecuting=(phase:CommerceSimulationState['phase'])=>phase==='REROUTING'||phase==='UPDATED_EXECUTION';

export function TaiwanOperationsMap({snapshot,state,stageProgress,onSelectNode}:Props){
  const recommended=candidatesForPhase(state.phase).find(item=>item.recommended)?.id;
  const visibleRoute=state.previewRoute??state.selectedRoute??(routeCandidates(state.phase)||routeExecuting(state.phase)?recommended:snapshot.activeRoute);
  const selectedCandidate=candidatesForPhase(state.phase).find(item=>item.id===visibleRoute);
  const hasTraffic=['WAREHOUSE_OVERLOAD','DEGRADED','DECIDING','REROUTING','RECOVERING'].includes(state.phase);
  const hasWeather=['DEGRADED','DECIDING','REROUTING'].includes(state.phase);
  const secondShock=['SECOND_FAILURE','REPLANNING','UPDATED_EXECUTION'].includes(state.phase);
  const rerouting=['REROUTING','RECOVERING'].includes(state.phase);
  const updatedReroute=state.phase==='UPDATED_EXECUTION';
  const incidentStrength=hasTraffic?segmentProgress(stageProgress,.1,.65):0;
  const weatherStrength=hasWeather?segmentProgress(stageProgress,.12,.7):0;
  const orderPressure=Math.max(0,Math.min(1,(snapshot.orderRate-3000)/1800));
  const toggleNode=(id:string)=>onSelectNode(state.selectedNode===id?null:id);
  const centralAnchor=networkNodeAnchors['warehouse-b'];
  return <section className={`operations-map phase-${state.phase.toLowerCase()} ${state.autoPaused?'is-paused':''}`} data-active-route={visibleRoute} aria-label="臺灣、澎湖、金門、馬祖與綠島同一地圖座標空間的履約網路">
    <div className="map-head"><div><span className="section-kicker">TAIWAN FULFILLMENT NETWORK</span><h2>全臺履約態勢 · Geographic Projection</h2></div><div className="map-mode"><span className="geometry-mark">{snapshot.networkKpis.nodeCount} / {OPERATIONAL_NODE_IDS.length} GEO NODES</span><span className="map-data-status">SCENARIO</span></div></div>
    <div className="order-pressure network-summary"><small>ALL-NODE ORDER PRESSURE</small><strong>{snapshot.networkKpis.orderRate.toLocaleString()}<i>/min</i></strong><span><em style={{transform:`scaleX(${orderPressure})`}}/></span><dl><div><dt>SLA</dt><dd>{snapshot.networkKpis.onTimeRate}%</dd></div><div><dt>延遲</dt><dd>{snapshot.networkKpis.averageDelayHours}h</dd></div><div><dt>風險</dt><dd>{snapshot.networkKpis.riskExposure}/100</dd></div></dl><p>本島＋四組離島加權</p></div>
    <div className="route-context"><small>ACTIVE CORRIDOR</small><strong>{selectedCandidate?.serviceName??routes.find(route=>route.id===visibleRoute)?.corridor}</strong><span>{selectedCandidate?.serviceMode??'西部物流走廊'} · ARCI estimate</span></div>
    <svg className="taiwan-map" viewBox="0 0 760 520" role="img" aria-label="以同一地圖座標空間呈現臺灣主島、澎湖、金門、馬祖與臺東以東的綠島">
      <defs>
        <linearGradient id="sea-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f8faf9"/><stop offset="1" stopColor="#edf3f1"/></linearGradient>
        <linearGradient id="island-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fcfcf8"/><stop offset=".55" stopColor="#edf1ec"/><stop offset="1" stopColor="#e1e8e4"/></linearGradient>
        <filter id="island-shadow" x="-40%" y="-20%" width="190%" height="170%"><feDropShadow dx="0" dy="12" stdDeviation="14" floodColor="#40504a" floodOpacity=".13"/></filter>
        <radialGradient id="rain-fill"><stop offset="0" stopColor="#4e8baa" stopOpacity=".25"/><stop offset="1" stopColor="#4e8baa" stopOpacity="0"/></radialGradient>
      </defs>
      <rect className="map-sea" width="760" height="520" fill="url(#sea-fill)"/>
      <g className="map-grid" aria-hidden="true"><path d="M42 130H718M42 226H718M42 322H718M42 418H718M160 34V486M318 34V486M476 34V486M634 34V486"/></g>
      <text className="strait-label" x="235" y="292">TAIWAN STRAIT</text>
      <path className="taiwan-outline" data-geometry="restored-natural-earth" filter="url(#island-shadow)" d={taiwanGeometry.path} transform={taiwanGeometry.transform}/>
      <path className="offshore-geometry" d={islandGeometry.penghu}/><path className="offshore-geometry" d={islandGeometry.kinmen}/><path className="offshore-geometry" d={islandGeometry.matsu}/><path className="offshore-geometry green-island-geometry" d={islandGeometry.greenIsland}/>
      <path className="west-plain" d={logisticsRoutes['route-a'].path}/>
      <g className="road-corridors" aria-hidden="true"><path d={logisticsRoutes['route-a'].path}/><path d={logisticsRoutes['route-b'].path}/></g>
      <g className="corridor-waypoints" aria-hidden="true">{westernCorridor.slice(1,-1).map(point=><g key={point.label} transform={`translate(${point.x} ${point.y})`}><circle r="2.4"/><text x="-9" y="-7">{point.label}</text></g>)}</g>
      <g className={`weather-overlay ${hasWeather?'is-visible':''}`} style={{opacity:weatherStrength}} aria-hidden="true"><ellipse cx="394" cy="338" rx="82" ry="68" fill="url(#rain-fill)"/></g>
      <g className="route-network" aria-hidden="true">{routes.map((route,index)=>{
        const legacy=(route.id==='route-a'&&['REROUTING','RECOVERING','SECOND_FAILURE','REPLANNING','UPDATED_EXECUTION','RECOVERED'].includes(state.phase))||(route.id==='route-b'&&['SECOND_FAILURE','REPLANNING','UPDATED_EXECUTION','RECOVERED'].includes(state.phase));
        const executingRoute=(rerouting&&route.id==='route-b')||(updatedReroute&&route.id==='route-c');
        const reveal=executingRoute?segmentProgress(stageProgress,.08,.82):routeCandidates(state.phase)?segmentProgress(stageProgress,index*.08,.68):1;
        const style={'--route-reveal':reveal} as CSSProperties;
        return <g style={style} key={route.id} data-route={route.id} className={`map-route map-${route.id} ${visibleRoute===route.id?'is-active':''} ${state.previewRoute===route.id?'is-preview':''} ${routeCandidates(state.phase)?'is-candidate':''} ${legacy?'is-legacy':''} ${executingRoute?'is-executing':''}`}>
          <path className="route-halo" pathLength="1" d={route.path}/><path className="route-base" d={route.path}/><path className="route-glow" pathLength="1" d={route.path}/><g className="route-particles">{[0,1,2].map(particle=><circle key={particle} r="3"><animateMotion path={route.path} dur={`${route.duration}s`} begin={`${particle*-2.8}s`} repeatCount="indefinite"/></circle>)}</g>
        </g>;
      })}</g>
      <g className="route-helper-anchor" transform={`translate(${routeAnchors['taitung-gateway'].x} ${routeAnchors['taitung-gateway'].y})`} aria-label="臺東東南岸路線 anchor，非主要營運節點"><circle r="3"/><text x="-8" y="-9">臺東 GATEWAY</text></g>
      <g className="offshore-route-network" aria-label="離島海空運路線">{offshoreRoutes.map((route,index)=>{const target=snapshot.networkNodes.find(node=>node.id===route.to),greenIslandRoute=route.id==='green-island-link';return <g key={route.id} data-offshore-route={route.id} className={`offshore-route ${target?`health-${target.health}`:''}`}><path id={route.id} d={route.path}/><text dy={greenIslandRoute?-7:undefined}><textPath href={`#${route.id}`} startOffset={greenIslandRoute?'32%':'50%'}>{route.type}</textPath></text><circle r="2.5"><animateMotion path={route.path} dur={`${7+index}s`} repeatCount="indefinite"/></circle></g>;})}</g>
      <g className={`traffic-incident ${hasTraffic?'is-visible':''}`} style={{opacity:incidentStrength}} transform={`translate(${centralAnchor.x} ${centralAnchor.y})`} aria-label="情境中部道路事件"><path d="M-10 2 C-13 18 -17 31 -22 45"/><g transform="translate(-19 36)"><circle r="13"/><text y="5">!</text></g><text className="incident-copy" x="22" y="39">TRAFFIC CAPACITY ↓</text></g>
      <g className={`capacity-incident ${secondShock?'is-visible':''}`} style={{opacity:secondShock?segmentProgress(stageProgress,.1,.55):0}} transform={`translate(${centralAnchor.x} ${centralAnchor.y})`}><circle r="26"/><circle r="17"/><text y="5">96%</text><text className="incident-copy" x="34" y="5">NEW CONSTRAINT</text></g>
      {snapshot.networkNodes.map(node=><MapNode key={node.id} node={node} anchor={networkNodeAnchors[node.id]} offshore={node.scope==='offshore'} selected={state.selectedNode===node.id} onSelect={()=>toggleNode(node.id)}/>) }
      <g className="map-scale" aria-hidden="true"><path d="M610 458h82"/><path d="M610 454v8M651 454v8M692 454v8"/><text x="610" y="476">0</text><text x="675" y="476">100 km</text></g>
    </svg>
    <div className="map-disclosure">Natural Earth restored outline · offshore geometry and nodes share one responsive viewBox</div>
  </section>;
}

function MapNode({node,anchor,offshore,selected,onSelect}:{node:NetworkNodeState;anchor:{x:number;y:number};offshore:boolean;selected:boolean;onSelect:()=>void}){
  return <g data-node={node.id} data-transport-availability={node.transportAvailability} className={`map-node ${offshore?'is-offshore':''} health-${node.health} ${selected?'is-selected':''}`} transform={`translate(${anchor.x} ${anchor.y})`} role="button" tabIndex={0} aria-label={`${node.name}，${node.transport}，負載 ${node.load}%，容量 ${node.capacity}，SLA ${node.slaRate}%，運輸可用率 ${node.transportAvailability}%，延遲 ${node.predictedDelay} 小時`} onClick={onSelect} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect();}}}>
    <rect className="node-hit-area" x={offshore?-18:-25} y={offshore?-20:-25} width={offshore?116:138} height={offshore?42:52} rx="8"/><circle className="node-radar" r={offshore?19:25}/><circle className="node-ring-bg" r={offshore?13:18}/><circle className="node-load-ring" pathLength="100" strokeDasharray={`${node.load} 100`} r={offshore?13:18}/><circle className="node-core" r={offshore?5:6}/><text className="node-title" x={offshore?22:31} y="-3">{node.name} · {offshore?node.transport.replace('運',''):node.id==='warehouse-a'?'桃園':node.id==='warehouse-b'?'臺中':'高雄'}</text><text className="node-load" x={offshore?22:31} y={offshore?12:17}>{offshore?`LOAD ${node.load}% · SLA ${node.slaRate}%`:`${node.load}%`}</text>
  </g>;
}
