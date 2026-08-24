import { phaseOrder,serviceRecoverySeries } from '@/simulation/scenario';
import { clamp01 } from '@/simulation/timeline';
import type { SimulationPhase } from '@/simulation/types';

const WIDTH=1000;
const HEIGHT=250;
const PLOT={left:62,right:974,top:30,bottom:190};
const SLA_MIN=88;
const SLA_MAX=100;
const TARGET_SLA=95;

const anchorByPhase:Record<SimulationPhase,number>={
  NORMAL:0,SURGE:1,WAREHOUSE_OVERLOAD:2,DEGRADED:3,DECIDING:3,REROUTING:4,RECOVERING:5,SECOND_FAILURE:6,REPLANNING:7,UPDATED_EXECUTION:8,RECOVERED:8,
};

const xFor=(index:number)=>PLOT.left+(index/(serviceRecoverySeries.length-1))*(PLOT.right-PLOT.left);
const yFor=(sla:number)=>PLOT.bottom-((sla-SLA_MIN)/(SLA_MAX-SLA_MIN))*(PLOT.bottom-PLOT.top);
const polylinePoints=serviceRecoverySeries.map((point,index)=>`${xFor(index)},${yFor(point.slaPercent)}`).join(' ');

function seriesPosition(phase:SimulationPhase,stageProgress:number){
  if(phase==='NORMAL') return 0;
  const phaseIndex=phaseOrder.indexOf(phase);
  const previous=phaseOrder[Math.max(0,phaseIndex-1)];
  const from=anchorByPhase[previous];
  const to=anchorByPhase[phase];
  return from+(to-from)*clamp01(stageProgress);
}

const annotations=new Set(['交通中斷','首次調度','二次事件','ARCI 重規劃']);

export function RecoveryTrajectory({phase,stageProgress,currentSla}:{phase:SimulationPhase;stageProgress:number;currentSla:number}){
  const position=seriesPosition(phase,stageProgress);
  const reveal=position/(serviceRecoverySeries.length-1);
  const currentMinute=Math.round(position/(serviceRecoverySeries.length-1)*serviceRecoverySeries.at(-1)!.minute);
  const currentX=xFor(position);
  const currentY=yFor(currentSla);
  const recovered=phase==='RECOVERED'&&currentSla>=TARGET_SLA;
  const activePoint=serviceRecoverySeries[Math.min(serviceRecoverySeries.length-1,Math.round(position))];
  return <section className={`recovery-trajectory service-recovery ${position>0?'is-running':''} ${recovered?'is-complete':''}`} aria-label="執行後服務恢復曲線">
    <div className="trajectory-head">
      <div><small>SERVICE RECOVERY</small><h2>執行後服務恢復曲線</h2><p>ARCI 執行調度後，物流履約 SLA 隨事件、二次衝擊與重新規劃改變。</p></div>
      <div className="recovery-kpi"><small>CURRENT SERVICE LEVEL</small><strong>{currentSla.toFixed(1)}<i>%</i></strong><span className={recovered?'is-restored':''}>{recovered?'SLA TARGET RESTORED':phase==='NORMAL'?'BASELINE':'RECOVERY IN PROGRESS'}</span></div>
    </div>
    <div className="service-chart-wrap">
      <svg className="service-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`情境履約 SLA 從 ${serviceRecoverySeries[0].slaPercent}% 下降、二次事件後再次下降，最終恢復至 ${serviceRecoverySeries.at(-1)!.slaPercent}%`}>
        <g className="sla-grid" aria-hidden="true">{[90,95,100].map(value=><g key={value}><line x1={PLOT.left} x2={PLOT.right} y1={yFor(value)} y2={yFor(value)}/><text x={PLOT.left-12} y={yFor(value)+4}>{value}%</text></g>)}</g>
        <line className="sla-target-line" x1={PLOT.left} x2={PLOT.right} y1={yFor(TARGET_SLA)} y2={yFor(TARGET_SLA)}/>
        <text className="sla-target-label" x={PLOT.right-4} y={yFor(TARGET_SLA)-8}>目標 SLA ≥ 95%</text>
        <polyline className="service-path-guide" points={polylinePoints}/>
        <polyline className="service-path-active" points={polylinePoints} pathLength="1" style={{strokeDashoffset:1-reveal}}/>
        {serviceRecoverySeries.map((point,index)=>{
          const visible=index<=position+.02;
          const important=annotations.has(point.label);
          return <g key={point.phase} className={`service-point ${visible?'is-visible':''} ${important?'has-annotation':''}`} transform={`translate(${xFor(index)} ${yFor(point.slaPercent)})`}>
            <circle r={important?6:4}/>
            {important&&<g className={`service-annotation annotation-${index%2?'below':'above'}`}><path d={index%2?'M0 9v19':'M0-9v-19'}/><rect x="-58" y={index%2?28:-60} width="116" height="30" rx="5"/><text x="0" y={index%2?47:-41}>{point.label}</text></g>}
          </g>;
        })}
        <g className="current-service-point" transform={`translate(${currentX} ${currentY})`}><circle className="current-pulse" r="12"/><circle r="5"/></g>
        <g className="service-x-axis" aria-hidden="true">{serviceRecoverySeries.map((point,index)=><g key={point.phase} transform={`translate(${xFor(index)} ${PLOT.bottom})`}><line y2="7"/><text y="26">T+{point.minute}</text></g>)}</g>
      </svg>
      <aside className="recovery-explanation"><small>NOW · T+{currentMinute} MIN</small><strong>{activePoint.label}</strong><p>{activePoint.detail}</p><span>SCENARIO SERVICE LEVEL</span></aside>
    </div>
  </section>;
}
