import { ProvenanceBadge } from './ProvenanceBadge';
import { decisionCandidatesFromEvaluation } from '@/simulation/enterpriseAdapter';
import { AdaptivePolicyCompact } from './policy/AdaptivePolicyCompact';
import type { CSSProperties } from 'react';
import type { CommerceSnapshot, DecisionCandidate, RouteId, SimulationPhase } from '@/simulation/types';
import type { ScenarioEvaluation } from '@/domain/decision-engine';

type Props={phase:SimulationPhase;snapshot:CommerceSnapshot;engineEvaluation:ScenarioEvaluation;stageProgress:number;previewRoute:RouteId|null;selectedRoute:RouteId|null;onPreview:(route:RouteId|null)=>void;onSelect:(route:RouteId)=>void;onExecute:()=>void;onReplan:()=>void};

const panelTitles:Record<SimulationPhase,[string,string,string]>={
  NORMAL:['MONITOR','System normal','Observe'],SURGE:['DEMAND SURGE','大促壓力升高','Detect'],WAREHOUSE_OVERLOAD:['TRAFFIC DISRUPTION','中部走廊容量下降','Detect'],
  DEGRADED:['CASCADE RISK','偵測到複合履約風險','Evaluate'],DECIDING:['DECISION','比較可執行調度','Decide'],REROUTING:['EXECUTION','調度正在產生效果','Act'],
  RECOVERING:['VALIDATION','讀取實際結果','Verify'],SECOND_FAILURE:['SECOND EVENT','新限制使原方案失配','Detect'],REPLANNING:['REPLAN','以新限制重排候選','Evaluate'],UPDATED_EXECUTION:['UPDATED EXECUTION','新方案正在產生效果','Act'],RECOVERED:['CLOSED LOOP','二次恢復通過驗證','Verify'],
};

export function OperationsPanel({phase,snapshot,engineEvaluation,stageProgress,previewRoute,selectedRoute,onPreview,onSelect,onExecute,onReplan}:Props){
  const [eyebrow,title,activeVerb]=panelTitles[phase];
  const deciding=phase==='DECIDING'||phase==='REPLANNING';
  const candidates=decisionCandidatesFromEvaluation(engineEvaluation);
  const currentRoute=previewRoute??selectedRoute??candidates.find(item=>item.recommended)?.id??null;
  const currentCandidate=candidates.find(item=>item.recommended);
  const verifying=phase==='RECOVERING'||phase==='RECOVERED';
  const executing=phase==='REROUTING'||phase==='UPDATED_EXECUTION';
  return <aside className={`operations-panel panel-${phase.toLowerCase()}`} aria-label="ARCI Decision Workspace">
    <div className="panel-head"><div><small>{eyebrow}</small><h2>{title}</h2></div><span className={`runtime-word ${verifying?'is-complete':''}`}><i/>{activeVerb}</span></div>
    <div className="panel-body">
      <div className="panel-summary"><p>{snapshot.summary}</p><ProvenanceBadge data={snapshot.events[0]?.provenance??snapshot.metrics.ordersAtRisk} compact/></div>
      <DecisionTrace phase={phase} snapshot={snapshot}/>
      {deciding&&<DecisionInputs snapshot={snapshot}/>}
      {deciding&&<EvaluationPipeline evaluation={engineEvaluation} stageProgress={stageProgress}/>}
      {(phase==='NORMAL'||phase==='SURGE')&&<StatusOverview snapshot={snapshot}/>}
      {(phase==='WAREHOUSE_OVERLOAD'||phase==='DEGRADED'||phase==='SECOND_FAILURE')&&<EventList snapshot={snapshot}/>}
      {deciding&&<AdaptivePolicyCompact evaluation={engineEvaluation} stageProgress={stageProgress}/>}
      {deciding&&<DecisionRows candidates={candidates} evaluation={engineEvaluation} activeRoute={currentRoute} stageProgress={stageProgress} onPreview={onPreview} onSelect={onSelect}/>}
      {(executing||verifying)&&<ExecutionStatus phase={phase} progress={stageProgress} snapshot={snapshot} evaluation={engineEvaluation}/>}
      {phase==='SECOND_FAILURE'&&<ConstraintShift evaluation={engineEvaluation}/>}
    </div>
    <div className="panel-action">
      {phase==='DEGRADED'&&<button type="button" onClick={onExecute}>建立並比較候選方案 <span>→</span></button>}
      {phase==='DECIDING'&&<button type="button" onClick={onExecute}>執行 {currentCandidate?.serviceName} <span>→</span></button>}
      {phase==='SECOND_FAILURE'&&<button type="button" onClick={onReplan}>納入新限制，重新規劃 <span>→</span></button>}
      {phase==='REPLANNING'&&<button type="button" onClick={onExecute}>執行新方案 <span>→</span></button>}
      {!['DEGRADED','DECIDING','SECOND_FAILURE','REPLANNING'].includes(phase)&&<div className="monitoring-note"><i/><span>{verifying?'Outcome observed against target':'ARCI autonomous loop is active'}</span></div>}
    </div>
  </aside>;
}

function StatusOverview({snapshot}:{snapshot:CommerceSnapshot}){
  return <section className="status-overview" aria-label="即時情境狀態">
    <div className="status-numbers"><span><small>履約穩定度</small><strong>{snapshot.recoveryScore}<i>%</i></strong></span><span><small>風險訂單</small><strong>{snapshot.ordersAtRisk}<i>筆</i></strong></span></div>
    <div className="capacity-rows"><small>區域容量</small>{snapshot.warehouses.map(node=><span key={node.id}><b>{node.name.replace('履約區','')}</b><i><em style={{transform:`scaleX(${node.load/100})`}}/></i><strong>{node.load}%</strong></span>)}</div>
  </section>;
}

function EventList({snapshot}:{snapshot:CommerceSnapshot}){
  return <section className="event-list" aria-label="偵測事件">{snapshot.events.map((item,index)=><article key={item.id} className={`severity-${item.severity} ${item.operationalImpact?'has-impact':''}`}><span>{String(index+1).padStart(2,'0')}</span><div><small>{item.location}</small><strong>{item.title}</strong><p>{item.description}</p>{item.operationalImpact&&<TrafficImpact impact={item.operationalImpact}/>}</div></article>)}</section>;
}

function TrafficImpact({impact}:{impact:NonNullable<CommerceSnapshot['events'][number]['operationalImpact']>}){
  const rows=[
    ['影響走廊',impact.corridor,'SCENARIO'],
    ['可用運能',`−${impact.capacityDropPercent}%`,'SCENARIO'],
    ['預估額外延遲',`+${impact.estimatedDelayMinutes} min`,'ESTIMATED'],
    ['受影響訂單',`${impact.affectedOrders} 筆`,'ARCI DERIVED'],
    ['預估持續',`${impact.durationRangeMinutes[0]}–${impact.durationRangeMinutes[1]} min`,'ESTIMATED'],
    ['事件可信度',`${Math.round(impact.confidence*100)}%`,'ESTIMATED'],
  ];
  return <div className="traffic-impact">
    <div className="impact-capacity"><span><b>可用運能 <small>AVAILABLE CAPACITY</small></b><strong>{100-impact.capacityDropPercent}%</strong></span><i><em style={{transform:`scaleX(${(100-impact.capacityDropPercent)/100})`}}/></i></div>
    <dl>{rows.map(([label,value,source])=><div key={label}><dt>{label}</dt><dd>{value}</dd><em>{source}</em></div>)}</dl>
    <footer><span>TDX-ready scenario adapter · 未連接即時 API</span><time>UPDATED {impact.updatedAt}</time></footer>
  </div>;
}

function DecisionRows({candidates,evaluation,activeRoute,stageProgress,onPreview,onSelect}:{candidates:DecisionCandidate[];evaluation:ScenarioEvaluation;activeRoute:RouteId|null;stageProgress:number;onPreview:(route:RouteId|null)=>void;onSelect:(route:RouteId)=>void}){
  const routeEvaluations=evaluation.evaluations.filter(item=>item.candidate.routeId);
  const scoreById=new Map(routeEvaluations.map(item=>[item.candidate.routeId!,item]));
  const selectedCandidate=candidates.find(item=>item.recommended)!;
  const selectedScore=scoreById.get(selectedCandidate.id)!;
  return <section className="decision-rows" aria-label="ARCI 候選方案">
    <div className="decision-columns" aria-hidden="true"><span>候選方案與策略得分</span><span>總分</span><span>硬性條件</span></div>
    <div className="decision-rank-stage">{routeEvaluations.map((score,index)=>{
      const candidate=candidates.find(item=>item.id===score.candidate.routeId);
      if(!candidate) return null;
      const adaptiveIndex=index;
      const selected=activeRoute===candidate.id;
      const reveal=Math.max(0,Math.min(1,(stageProgress-index*.12)/.5));
      const shift=0;
      const style={'--row-reveal':reveal,'--base-rank':index,'--rank-shift':`${shift}px`} as CSSProperties;
      return <button style={style} key={candidate.id} type="button" disabled={!score.constraints.feasible} className={`${selected?'is-selected':''} ${score.constraints.feasible?'is-eligible':'is-ineligible'}`} aria-pressed={selected} aria-label={`排名 ${adaptiveIndex+1}，${candidate.planLabel}，預估 SLA ${candidate.slaRate}%，延遲 ${candidate.delay} 小時，成本指數 ${candidate.cost}，離島 SLA ${candidate.offshoreImpact.slaDelta>0?'+':''}${candidate.offshoreImpact.slaDelta}%，可行性 ${candidate.feasibility}%`} onClick={()=>onSelect(candidate.id)} onMouseEnter={()=>onPreview(candidate.id)} onMouseLeave={()=>onPreview(null)} onFocus={()=>onPreview(candidate.id)} onBlur={()=>onPreview(null)}>
        <span className="candidate-service"><i>{adaptiveIndex+1}</i><strong>{candidate.planLabel}</strong><small>{candidate.serviceName} · {candidate.serviceMode}</small></span>
        <span className="candidate-total"><b>{Math.max(0,(1-score.riskAdjustedScore)*100).toFixed(1)}</b><small>/ 100</small></span>
        <span className={`constraint-state ${score.constraints.feasible?'is-pass':'is-blocked'}`}>{score.constraints.feasible?'ELIGIBLE':'INELIGIBLE'}<small>{score.constraints.feasible?'HARD CONSTRAINTS PASS':score.constraints.violations.map(item=>item.code).join(' · ')}</small></span>
        <span className="candidate-scoreline"><small><b>SLA</b>{candidate.slaRate}%</small><small><b>延遲</b>{candidate.delay}h</small><small><b>成本 IDX</b>{candidate.cost}</small><small><b>離島</b>{candidate.offshoreImpact.slaDelta>0?'+':''}{candidate.offshoreImpact.slaDelta}%</small><small><b>風險</b>{candidate.risk}</small><small><b>可行</b>{candidate.feasibility}%</small></span>
      </button>;
    })}</div>
    <div className="decision-selection"><span><small>SELECTED · ARCI DERIVED</small><strong>{selectedCandidate.planLabel}</strong></span><b>{Math.max(0,(1-selectedScore.riskAdjustedScore)*100).toFixed(1)}</b><p>{evaluation.topDecisionFactors.join(' · ')}</p><em>P50 {selectedScore.uncertainty.p50.toFixed(3)} · P90 {selectedScore.uncertainty.p90.toFixed(3)} · {evaluation.governance.mode}</em></div>
    <p className="candidate-disclosure">所有比較值皆為 ARCI scenario estimate，非物流商即時容量。</p>
  </section>;
}

function DecisionInputs({snapshot}:{snapshot:CommerceSnapshot}){
  const offshore=snapshot.networkNodes.filter(node=>node.scope==='offshore');
  return <section className="decision-inputs" aria-label="ARCI 即時決策輸入">
    <header><small>REALTIME DECISION INPUTS</small><strong>七節點狀態已讀取</strong><em>SCENARIO</em></header>
    <div><span><small>總訂單壓力</small><b>{snapshot.networkKpis.orderRate.toLocaleString()} /h</b></span><span><small>本島利用率</small><b>{snapshot.warehouses.map(node=>node.load+'%').join(' · ')}</b></span><span><small>全臺預估</small><b>SLA {snapshot.networkKpis.onTimeRate}% · 延遲 {snapshot.networkKpis.averageDelayHours}h</b></span><span className="offshore-signal"><small>離島約束</small><b>{offshore.map(node=>`${node.name} ${node.constraint}`).join(' · ')}</b></span></div>
  </section>;
}

function EvaluationPipeline({evaluation,stageProgress}:{evaluation:ScenarioEvaluation;stageProgress:number}){
  const eligible=evaluation.evaluations.filter(candidate=>candidate.constraints.feasible).length;
  const active=stageProgress<.12?0:stageProgress<.30?1:stageProgress<.48?2:stageProgress<.68?3:4;
  const steps=[
    ['INPUT',`${Object.keys(evaluation.state.nodes).length} nodes · ${Object.keys(evaluation.state.edges).length} edges`],
    ['WEIGHT UPDATE',`Σ ${Object.values(evaluation.adaptiveWeights).reduce((sum,value)=>sum+value,0).toFixed(2)}`],
    ['CONSTRAINT FILTER',`${eligible} eligible`],
    ['SCORING',`${evaluation.selectedPolicy.riskAdjustedScore.toFixed(3)} risk-adjusted`],
    ['RANKING',evaluation.selectedPolicy.candidate.id],
  ];
  return <section className="evaluation-pipeline" aria-label="ARCI Evaluate 計算階段"><header><small>EVALUATE · 2.5–4 SEC EXPLAINABLE WINDOW</small><strong>{active<1?'Generating candidates…':active<2?'Updating adaptive weights…':active<3?'Evaluating constraints…':active<4?'Scoring candidates…':'Decision selected'}</strong></header><div>{steps.map(([label,value],index)=><span key={label} className={index===active?'is-active':index<active?'is-complete':''}><i>{index<active?'✓':String(index+1).padStart(2,'0')}</i><small>{label}</small><b>{index<=active?value:'—'}</b></span>)}</div></section>;
}

function ExecutionStatus({phase,progress,snapshot,evaluation}:{phase:SimulationPhase;progress:number;snapshot:CommerceSnapshot;evaluation:ScenarioEvaluation}){
  const verify=phase==='RECOVERING'||phase==='RECOVERED';
  const complete=phase==='RECOVERED';
  const executionPercent=complete?100:Math.round(progress*100);
  const candidates=decisionCandidatesFromEvaluation(evaluation);
  const executionTarget=phase==='REROUTING'||phase==='UPDATED_EXECUTION';
  const selectedPlan=executionTarget?candidates.find(candidate=>candidate.recommended):candidates.find(candidate=>candidate.id===snapshot.activeRoute)??candidates.find(candidate=>candidate.recommended);
  const offshore=snapshot.networkNodes.filter(node=>node.scope==='offshore');
  const offshoreSla=offshore.reduce((sum,node)=>sum+node.slaRate*node.orderRate,0)/Math.max(1,offshore.reduce((sum,node)=>sum+node.orderRate,0));
  return <section className={`execution-status ${verify?'is-verifying':''}`}>
    <div className="execution-line"><span>{verify?'VERIFYING OUTCOME':'EXECUTING REALLOCATION'} · {selectedPlan?.planLabel}</span><strong>{executionPercent}%</strong></div>
    <i className="execution-track"><em style={{transform:`scaleX(${complete?1:progress})`}}/></i>
    <div className="execution-metrics"><span><small>中部負載</small><strong>{snapshot.warehouses[1].load}<i>%</i></strong></span><span><small>Backlog</small><strong>{snapshot.ordersAtRisk}<i>筆</i></strong></span><span><small>七節點 SLA</small><strong>{snapshot.networkKpis.onTimeRate}<i>%</i></strong></span><span><small>離島 SLA</small><strong>{offshoreSla.toFixed(1)}<i>%</i></strong></span></div>
    <p>{verify?`已對照 ${selectedPlan?.planLabel??'執行方案'} 門檻：預估 SLA ${selectedPlan?.slaRate??'—'}%，觀測 ${snapshot.networkKpis.onTimeRate}%。`:'舊路徑降載；跨區分流、幹線重排與離島緩衝正在同步執行。'}</p>
  </section>;
}

function ConstraintShift({evaluation}:{evaluation:ScenarioEvaluation}){
  const confidence=Math.round(evaluation.confidence.value*100);
  return <section className="constraint-shift"><div><small>ORIGINAL PLAN CONFIDENCE</small><strong>{confidence}%</strong></div><i><em style={{transform:`scaleX(${confidence/100})`}}/></i><p><b>+ NEW CONSTRAINT</b> 中部替代節點容量已降至不可持續範圍。</p></section>;
}

function DecisionTrace({phase,snapshot}:{phase:SimulationPhase;snapshot:CommerceSnapshot}){
  const active=phase==='NORMAL'?0:['SURGE','WAREHOUSE_OVERLOAD','SECOND_FAILURE'].includes(phase)?1:['DEGRADED','REPLANNING'].includes(phase)?2:phase==='DECIDING'?3:['REROUTING','UPDATED_EXECUTION'].includes(phase)?4:5;
  const steps=['Observe','Detect','Evaluate','Decide','Act','Verify'];
  return <section className="decision-trace"><div className="trace-steps">{steps.map((step,index)=><span key={step} className={index===active?'is-active':index<active?'is-complete':''}><i/>{step}</span>)}</div><p><span>Current reasoning</span>{snapshot.trace.reason}</p></section>;
}
