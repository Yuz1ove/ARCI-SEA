'use client';

import { useMemo,useState } from 'react';
import { AppRouteLink } from '@/components/AppRouteLink';
import { useScenarioState } from '@/components/ScenarioStateProvider';
import { bounds,constraintMu,criteria,criterionLabels,policyScenarios,riskLambda,weightTotal } from '@/domain/policy';
import type { CandidateScore,DecisionCriterion,DecisionSignal,PolicyScenarioId,PolicySnapshot } from '@/domain/policy';

const scenarioIds:PolicyScenarioId[]=['normal-operations','traffic-disruption','warehouse-overload'];
const signalGroups:DecisionSignal['group'][]=['Demand / Order','Fulfillment','Logistics','SLA','Risk','Offshore'];
const chain=['Realtime Signals','Normalization','Context Detection','Adaptive Weight Update','Candidate Generation','Constraint Evaluation','Utility / Risk','Candidate Ranking','Decision','Execution','Outcome Observation','Replan Trigger'];
type FormulaKey='normalization'|'adaptive-weight'|'utility'|'risk-penalty'|'constraint-penalty'|'capacity-load'|'route-feasibility'|'sla-risk'|'replan-threshold'|'hysteresis'|'confidence';

const signed=(value:number,digits=1)=>`${value>0?'+':value<0?'−':''}${Math.abs(value).toFixed(digits)}`;
const formatSignal=(value:number,signal:DecisionSignal)=>signal.unit===''?value.toFixed(value<1?2:0):`${value.toLocaleString()}${signal.unit.startsWith(' ')?signal.unit:` ${signal.unit}`}`;
const candidateDefinition=(snapshot:PolicySnapshot,id:string)=>policyScenarios[snapshot.scenarioId].candidates.find(candidate=>candidate.candidateId===id)!;

export function AdaptivePolicyPage(){
  const {scenarioId,policySnapshot:snapshot,sharedScenario,selectScenario}=useScenarioState();
  const [expandedCandidate,setExpandedCandidate]=useState<string|null>(null);
  const [formula,setFormula]=useState<FormulaKey>('adaptive-weight');
  const selectedId=expandedCandidate&&snapshot.candidateRankingAfter.some(candidate=>candidate.candidateId===expandedCandidate)?expandedCandidate:snapshot.selectedCandidateId;
  const selectedScore=snapshot.candidateRankingAfter.find(candidate=>candidate.candidateId===selectedId)!;
  const selectedDefinition=candidateDefinition(snapshot,selectedId);
  const allPassed=snapshot.guardrails.every(rule=>rule.passed);
  const formulaItems=useMemo(()=>buildFormulaItems(snapshot),[snapshot]);
  const activeFormula=formulaItems.find(item=>item.id===formula)!;
  const focusFormula=(id:FormulaKey,target:string)=>{setFormula(id);document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'center'});};
  const changeScenario=(next:PolicyScenarioId)=>{setExpandedCandidate(null);selectScenario(next);};
  return <main className="policy-page decision-engine-page" data-formula={formula}>
    <header className="policy-topbar"><AppRouteLink className="policy-brand" href="/"><i/><span><strong>ARCI</strong><small>Autonomous Resilient Commerce Intelligence</small></span></AppRouteLink><div><span className="shared-state-chip">SHARED · {sharedScenario.executionState}</span><span className="demo-disclosure">SCENARIO / ARCI ESTIMATE · 非即時營運資料</span><AppRouteLink className="back-demo" href="/">← 返回 Demo</AppRouteLink></div></header>
    <div className="engine-wrap">
      <section className="engine-hero">
        <div className="engine-hero-copy"><small>ARCI DECISION ENGINE</small><h1>自適應決策計算引擎</h1><h2>即時狀態驅動的自主決策與重新規劃引擎</h2><p>ARCI 持續將物流狀態轉換為決策變數，動態調整目標權重、限制條件與候選方案排序。</p></div>
        <dl className="engine-status-grid">
          <Status label="POLICY VERSION" value={sharedScenario.policyVersion}/><Status label="SHARED STATE" value={sharedScenario.executionState}/><Status label="CURRENT DECISION" value={selectedDefinition.label}/><Status label="REPLAN CYCLE" value={String(snapshot.context.cycle).padStart(2,'0')}/>
          <Status label="LAST OBSERVATION" value={snapshot.lastObservation}/><Status label="CALC LATENCY · EST." value={`${snapshot.calculationLatencyMs} ms`}/><Status label="ACTIVE CONSTRAINTS" value={String(snapshot.activeConstraintCount)}/><Status label="CANDIDATES" value={String(snapshot.candidateRankingAfter.length)}/>
        </dl>
      </section>

      <nav className="engine-chain" aria-label="ARCI 完整推理鏈">{chain.map((step,index)=><span key={step} className={index<=7?'is-complete':index===8?'is-active':''}><i>{String(index+1).padStart(2,'0')}</i><b>{step}</b>{index<chain.length-1&&<em>→</em>}</span>)}</nav>
      <nav className="engine-scenarios" aria-label="決策情境切換">{scenarioIds.map((id,index)=><button key={id} type="button" className={scenarioId===id?'is-active':''} aria-pressed={scenarioId===id} onClick={()=>changeScenario(id)}><small>SCENARIO 0{index+1}</small><strong>{policyScenarios[id].label}</strong><span>{policyScenarios[id].contextLabel}</span></button>)}</nav>

      <section id="engine-inputs" className="engine-section formula-target normalization-target">
        <SectionHead eyebrow="REALTIME DECISION INPUTS" title="即時決策輸入" meta={`${snapshot.signals.length} SIGNALS · SCENARIO / ARCI ESTIMATE`}/>
        <div className="signal-groups">{signalGroups.map(group=><article key={group} className="signal-group"><header><small>{group.toUpperCase()}</small><span>CURRENT · PREVIOUS · Δ · NORMALIZED</span></header>{snapshot.signals.filter(signal=>signal.group===group).map(signal=><div className="signal-row" key={signal.id}><strong>{signal.label}</strong><b>{formatSignal(signal.current,signal)}</b><span>{formatSignal(signal.previous,signal)}</span><em className={signal.current-signal.previous>0?'is-up':signal.current-signal.previous<0?'is-down':''}>{signed(signal.current-signal.previous,signal.current<1?2:0)}</em><i><u style={{transform:`scaleX(${signal.normalized})`}}/></i><code>{signal.normalized.toFixed(2)}</code><small>{signal.sourceType}</small></div>)}</article>)}</div>
      </section>

      <section id="engine-normalization" className="engine-section normalization-section formula-target normalization-target">
        <SectionHead eyebrow="SIGNAL NORMALIZATION" title="即時訊號正規化" meta="DETERMINISTIC TRANSFORM"/>
        <div className="normalization-layout"><div className="formula-board"><code>x̂ᵢ = (xᵢ − xᵢ,min) / (xᵢ,max − xᵢ,min)</code><code>x̂ᵢ = 1 − (xᵢ − xᵢ,min) / (xᵢ,max − xᵢ,min)</code><p>第二式用於越低越好的指標；所有值固定裁切至 [0,1]。</p></div><div className="normalization-cards">{['node-utilization','eta','breach-probability'].map(id=>{const signal=snapshot.signals.find(item=>item.id===id)!;return <article key={id}><small>{signal.label}</small><div><span><b>RAW</b><strong>{formatSignal(signal.current,signal)}</strong></span><i>→</i><span><b>OBSERVED RANGE</b><strong>{signal.min}–{signal.max}{signal.unit}</strong></span><i>→</i><span className="normalized-output"><b>NORMALIZED</b><strong>{signal.normalized.toFixed(2)}</strong></span></div></article>})}</div></div>
      </section>

      <section id="engine-weights" className="engine-section weights-engine formula-target adaptive-weight-target">
        <SectionHead eyebrow="ADAPTIVE OBJECTIVE WEIGHTS" title="自適應目標權重" meta={`β = ${snapshot.beta.toFixed(2)} · Σ weights = ${weightTotal(snapshot.adaptiveWeights).toFixed(1)}%`}/>
        <div className="weight-engine-layout"><div className="adaptive-formula"><small>EXPONENTIAL NORMALIZATION</small><code>wᵢ(t) =</code><div><span>wᵢ⁰ × exp(βsᵢ(t))</span><i/><span>Σⱼ wⱼ⁰ × exp(βsⱼ(t))</span></div><dl><div><dt>wᵢ⁰</dt><dd>baseline weight</dd></div><div><dt>sᵢ(t)</dt><dd>context sensitivity</dd></div><div><dt>β</dt><dd>{snapshot.beta.toFixed(2)} adaptation intensity</dd></div></dl><p>{snapshot.classification.replaceAll('_',' ')} · context-derived sensitivity</p></div><div className="weight-card-grid">{criteria.map(criterion=><WeightCard key={criterion} criterion={criterion} snapshot={snapshot}/>)}</div></div>
        <footer className="weight-engine-footer"><strong>Σwᵢ = {weightTotal(snapshot.adaptiveWeights).toFixed(1)}%</strong><span className={allPassed?'is-pass':'is-fail'}>{allPassed?'GUARDRAILS PASSED':'POLICY BLOCKED'}</span><p>全部權重同步重新正規化；沒有單一 bar 的 visual-only 調整。</p></footer>
      </section>

      <section id="engine-candidates" className="engine-section formula-target utility-target risk-penalty-target constraint-penalty-target route-feasibility-target capacity-load-target">
        <SectionHead eyebrow="CANDIDATE SOLUTION SPACE" title="候選方案生成、過濾與效用排序" meta={`${snapshot.candidateRankingAfter.length} GENERATED · ${snapshot.candidateRankingAfter.filter(item=>item.eligible).length} ELIGIBLE`}/>
        <div className="candidate-engine"><div className="candidate-list">{snapshot.candidateRankingAfter.map((score,index)=><CandidateRow key={score.candidateId} rank={index+1} score={score} snapshot={snapshot} expanded={selectedId===score.candidateId} onSelect={setExpandedCandidate}/>)}</div><div className="utility-workbench"><small>UTILITY FUNCTION · SELECTED</small><h3>{selectedDefinition.label}</h3><code>U(a,t) = Σᵢ wᵢ(t)·qᵢ(a,t) − λR(a,t) − μC(a,t)</code><div className="utility-substitution">{criteria.map(criterion=><span key={criterion}><b>{(snapshot.adaptiveWeights[criterion]/100).toFixed(3)}</b> × {selectedScore.features[criterion].toFixed(2)}<em>{criterionLabels[criterion].symbol}</em></span>)}</div><dl><div><dt>WEIGHTED UTILITY</dt><dd>{selectedScore.weightedUtility.toFixed(4)}</dd></div><div><dt>RISK PENALTY · λ {riskLambda}</dt><dd>−{selectedScore.riskPenalty.toFixed(4)}</dd></div><div><dt>CONSTRAINT PENALTY · μ {constraintMu}</dt><dd>−{selectedScore.constraintPenalty.toFixed(4)}</dd></div></dl><strong className="decision-score">{selectedScore.totalScore.toFixed(1)}<i>/ 100</i></strong></div></div>
      </section>

      <section id="engine-constraints" className="engine-section constraint-engine formula-target constraint-penalty-target route-feasibility-target capacity-load-target sla-risk-target">
        <SectionHead eyebrow="CONSTRAINT ENGINE" title="決策限制引擎" meta="HARD EXCLUSION + SOFT PENALTY"/>
        <div className="constraint-engine-grid"><article><header><small>HARD CONSTRAINTS</small><code>gⱼ(a,t) ≤ 0</code></header>{snapshot.hardConstraints.map(item=><div key={item.id} className={item.rejectedCandidateIds.length?'has-rejection':''}><span><strong>{item.label}</strong><code>{item.expression}</code></span><b>{item.rejectedCandidateIds.length?`${item.rejectedCandidateIds.join(', ')} → INELIGIBLE`:'ENFORCED'}</b></div>)}</article><article><header><small>SOFT CONSTRAINTS</small><code>P(a,t) = Σⱼ ρⱼ·max(0,gⱼ)²</code></header>{snapshot.softConstraints.map(item=><div key={item.id}><span><strong>{item.label}</strong><code>{item.expression}</code></span><b>ρ {item.coefficient.toFixed(2)}</b></div>)}</article><article className="operational-math"><div><small>ROUTE FEASIBILITY</small><code>Froute = min(1,Fcapacity) × Favailability × Freliability</code><strong>{Math.min(1,selectedDefinition.availableCapacity/selectedDefinition.requiredCapacity).toFixed(2)} × {selectedDefinition.routeAvailable.toFixed(2)} × {selectedDefinition.routeReliability.toFixed(2)} = {selectedScore.routeFeasibility.toFixed(3)}</strong></div><div><small>CAPACITY BALANCE</small><code>Lₙ = demandₙ / capacityₙ</code><strong>{selectedDefinition.nodeDemand.toLocaleString()} / {selectedDefinition.nodeCapacity.toLocaleString()} = {(selectedScore.capacityLoad*100).toFixed(1)}%</strong></div><div><small>SLA RISK · ARCI ESTIMATE</small><code>P(SLA breach | stateₜ)</code><strong>Current {snapshot.signals.find(item=>item.id==='sla-compliance')!.current}% · Risk {snapshot.context.slaRisk.toFixed(2)} · Target ≥95%</strong></div></article></div>
      </section>

      <section id="engine-replan" className="engine-section replan-engine formula-target replan-threshold-target hysteresis-target confidence-target">
        <SectionHead eyebrow="REPLAN TRIGGER" title="重新規劃觸發、決策遲滯與信心" meta={snapshot.replanTriggered?'REPLAN TRIGGERED':'MONITORING'}/>
        <div className="replan-grid"><article className="trigger-list"><header><span className={snapshot.replanTriggered?'is-triggered':''}>{snapshot.replanTriggered?'REPLAN TRIGGERED':'NO REPLAN REQUIRED'}</span><strong>{snapshot.replanTriggers.find(item=>item.triggered)?.reason??'全部狀態維持門檻內'}</strong></header>{snapshot.replanTriggers.map(trigger=><div key={trigger.id} className={trigger.triggered?'is-triggered':''}><span><code>{trigger.expression}</code><small>{trigger.reason}</small></span><b>{trigger.previous} → {trigger.current}</b><i>{trigger.triggered?'TRIGGER':'CLEAR'}</i></div>)}</article><article className="hysteresis-panel"><small>DECISION HYSTERESIS</small><code>U(new) − U(current) &gt; θswitch</code><dl><div><dt>UTILITY DELTA</dt><dd>{snapshot.utilityDelta.toFixed(3)}</dd></div><div><dt>SWITCH THRESHOLD</dt><dd>ΔU &gt; {snapshot.switchThreshold.toFixed(3)}</dd></div><div><dt>SWITCH STATE</dt><dd>{snapshot.switchAllowed?'ALLOWED':'HELD'}</dd></div></dl><p>只有新方案形成實質優勢才切換，避免 A → B → A → B 的快速震盪。</p></article><article className="confidence-panel"><small>DECISION CONFIDENCE</small><strong>{Math.round(snapshot.decisionConfidence*100)}%</strong><code>f(signal completeness, candidate separation, constraint certainty)</code><dl><div><dt>TOP CANDIDATE</dt><dd>{snapshot.candidateRankingAfter.filter(item=>item.eligible)[0]?.totalScore.toFixed(1)}</dd></div><div><dt>SECOND</dt><dd>{snapshot.candidateRankingAfter.filter(item=>item.eligible)[1]?.totalScore.toFixed(1)}</dd></div><div><dt>MARGIN</dt><dd>{snapshot.candidateMargin.toFixed(1)}</dd></div></dl></article></div>
      </section>

      <section id="engine-trace" className="engine-section trace-inspector formula-target">
        <SectionHead eyebrow="DECISION TRACE + FORMULA INSPECTOR" title="決策計算軌跡與公式檢視器" meta={`${snapshot.calculationLatencyMs} ms DETERMINISTIC PIPELINE`}/>
        <div className="trace-inspector-grid"><div className="engine-trace-console">{snapshot.trace.map(entry=><div key={`${entry.time}-${entry.stage}`}><time>{entry.time}</time><b>{entry.stage}</b><span>{entry.message}</span></div>)}</div><aside className="formula-inspector"><nav>{formulaItems.map(item=><button type="button" key={item.id} className={formula===item.id?'is-active':''} onClick={()=>focusFormula(item.id,item.target)}>{item.label}</button>)}</nav><div><small>{activeFormula.label.toUpperCase()}</small><code>{activeFormula.formula}</code><dl><div><dt>VARIABLES</dt><dd>{activeFormula.variables}</dd></div><div><dt>CURRENT INPUT</dt><dd>{activeFormula.input}</dd></div><div><dt>CALCULATION</dt><dd>{activeFormula.calculation}</dd></div><div><dt>OUTPUT</dt><dd>{activeFormula.output}</dd></div></dl></div></aside></div>
      </section>

      <footer className="engine-footer"><span>ARCI SEA · DETERMINISTIC FRONTEND DECISION ENGINE</span><p>所有 operational values 為 SCENARIO；機率、效用與風險為 ARCI ESTIMATE。未連接 live Shopee / TDX / CWA，也未宣稱 ML prediction。</p><AppRouteLink href="/">返回主 Demo →</AppRouteLink></footer>
    </div>
  </main>;
}

function Status({label,value}:{label:string;value:string}){return <div><dt>{label}</dt><dd>{value}</dd></div>}
function SectionHead({eyebrow,title,meta}:{eyebrow:string;title:string;meta:string}){return <header className="engine-section-head"><div><small>{eyebrow}</small><h2>{title}</h2></div><span>{meta}</span></header>}

function WeightCard({criterion,snapshot}:{criterion:DecisionCriterion;snapshot:PolicySnapshot}){
  const base=snapshot.baseWeights[criterion],current=snapshot.adaptiveWeights[criterion],sensitivity=snapshot.sensitivities[criterion],[min,max]=bounds[criterion];
  const bound=current===min||current===max;
  return <article className={bound?'bound-active':''}><header><span><small>{criterionLabels[criterion].en}</small><strong>{criterionLabels[criterion].zh}</strong></span><code>{criterionLabels[criterion].symbol}</code></header><dl><div><dt>BASELINE</dt><dd>{base.toFixed(1)}%</dd></div><div><dt>CONTEXT sᵢ(t)</dt><dd>{signed(sensitivity,2)}</dd></div><div><dt>CURRENT</dt><dd>{current.toFixed(1)}%</dd></div></dl><div className="weight-morph"><i style={{width:`${(base-min)/(max-min)*100}%`}}/><em style={{width:`${(current-min)/(max-min)*100}%`}}/><u style={{left:`${(current-min)/(max-min)*100}%`}}/></div><footer><span>{min}%</span><b>wᵢ,min ≤ wᵢ(t) ≤ wᵢ,max</b><span>{max}%</span></footer>{bound&&<p>BOUND ACTIVE</p>}</article>;
}

function CandidateRow({rank,score,snapshot,expanded,onSelect}:{rank:number;score:CandidateScore;snapshot:PolicySnapshot;expanded:boolean;onSelect:(id:string)=>void}){
  const candidate=candidateDefinition(snapshot,score.candidateId);
  return <button type="button" className={`engine-candidate ${score.eligible?'is-eligible':'is-ineligible'} ${expanded?'is-expanded':''}`} aria-expanded={expanded} onClick={()=>onSelect(score.candidateId)}><span className="candidate-rank">C{String(rank).padStart(2,'0')}</span><span className="candidate-name"><strong>{candidate.label}</strong><small>{candidate.mode}</small></span><span className="candidate-state">{score.eligible?'ELIGIBLE':'INELIGIBLE'}<small>{score.hardConstraintViolations.join(' · ')||'ALL HARD CONSTRAINTS PASS'}</small></span><b className="candidate-engine-score">{score.totalScore.toFixed(1)}</b>{expanded&&<div className="candidate-vector"><header><code>xₖ = [ SLA, Route, Capacity, Cost, Risk, Recovery ]</code><p>{candidate.description}</p></header>{criteria.map(criterion=><span key={criterion}><small>{criterionLabels[criterion].en}</small><b>{score.features[criterion].toFixed(2)}</b><em>{(snapshot.adaptiveWeights[criterion]/100).toFixed(3)} × {score.features[criterion].toFixed(2)} = {score.criterionScores[criterion].toFixed(3)}</em></span>)}</div>}</button>;
}

function buildFormulaItems(snapshot:PolicySnapshot):Array<{id:FormulaKey;label:string;target:string;formula:string;variables:string;input:string;calculation:string;output:string}>{
  const normalized=snapshot.signals.find(item=>item.id==='node-utilization')!;
  const score=snapshot.candidateRankingAfter.find(item=>item.candidateId===snapshot.selectedCandidateId)!;
  const candidate=candidateDefinition(snapshot,snapshot.selectedCandidateId);
  const capacity=snapshot.adaptiveWeights.capacityBalance,capacityS=snapshot.sensitivities.capacityBalance;
  return [
    {id:'normalization',label:'Normalization',target:'engine-normalization',formula:'x̂ᵢ = (xᵢ − min) / (max − min)',variables:'xᵢ, observed min, observed max',input:`${normalized.current}, ${normalized.min}, ${normalized.max}`,calculation:`(${normalized.current} − ${normalized.min}) / (${normalized.max} − ${normalized.min})`,output:normalized.normalized.toFixed(2)},
    {id:'adaptive-weight',label:'Adaptive Weight',target:'engine-weights',formula:'wᵢ(t) = wᵢ⁰exp(βsᵢ) / Σⱼwⱼ⁰exp(βsⱼ)',variables:'baseline weight, context sensitivity, β',input:`wCapacity⁰ 17%, s ${capacityS.toFixed(2)}, β ${snapshot.beta}`,calculation:`17 × exp(${snapshot.beta} × ${capacityS.toFixed(2)}) / denominator`,output:`${capacity.toFixed(1)}%`},
    {id:'utility',label:'Utility',target:'engine-candidates',formula:'U(a,t) = Σᵢwᵢqᵢ − λR − μC',variables:'adaptive weights, feature vector, risk, soft violations',input:`${snapshot.selectedCandidateId} · ${criteria.map(item=>score.features[item].toFixed(2)).join(', ')}`,calculation:`${score.weightedUtility.toFixed(4)} − ${score.riskPenalty.toFixed(4)} − ${score.constraintPenalty.toFixed(4)}`,output:`${score.utility.toFixed(4)} = ${score.totalScore.toFixed(1)} / 100`},
    {id:'risk-penalty',label:'Risk Penalty',target:'engine-candidates',formula:'λR(a,t)',variables:'λ, deterministic candidate risk',input:`λ ${riskLambda}, R ${candidate.riskPenalty.toFixed(3)}`,calculation:`${riskLambda} × ${candidate.riskPenalty.toFixed(3)}`,output:`−${score.riskPenalty.toFixed(4)}`},
    {id:'constraint-penalty',label:'Constraint Penalty',target:'engine-constraints',formula:'P(a,t)=Σⱼρⱼ·max(0,gⱼ)²',variables:'soft violation magnitude, μ',input:`μ ${constraintMu}, violation ${candidate.softConstraintViolation.toFixed(3)}`,calculation:`${constraintMu} × ${candidate.softConstraintViolation.toFixed(3)}²`,output:`−${score.constraintPenalty.toFixed(4)}`},
    {id:'capacity-load',label:'Capacity Load',target:'engine-constraints',formula:'Lₙ = demandₙ / capacityₙ',variables:'node demand, node capacity',input:`${candidate.nodeDemand}, ${candidate.nodeCapacity}`,calculation:`${candidate.nodeDemand} / ${candidate.nodeCapacity}`,output:`${(score.capacityLoad*100).toFixed(1)}%`},
    {id:'route-feasibility',label:'Route Feasibility',target:'engine-constraints',formula:'Froute = min(1,Fcapacity) × Favailability × Freliability',variables:'available / required capacity, availability, reliability',input:`${candidate.availableCapacity}/${candidate.requiredCapacity}, ${candidate.routeAvailable}, ${candidate.routeReliability}`,calculation:`${Math.min(1,candidate.availableCapacity/candidate.requiredCapacity).toFixed(2)} × ${candidate.routeAvailable.toFixed(2)} × ${candidate.routeReliability.toFixed(2)}`,output:score.routeFeasibility.toFixed(3)},
    {id:'sla-risk',label:'SLA Risk',target:'engine-constraints',formula:'P(SLA breach | stateₜ)',variables:'scenario SLA and state-derived heuristic',input:`SLA ${snapshot.signals.find(item=>item.id==='sla-compliance')!.current}%`,calculation:'deterministic threshold-distance estimate',output:`${snapshot.context.slaRisk.toFixed(2)} · ARCI ESTIMATE`},
    {id:'replan-threshold',label:'Replan Threshold',target:'engine-replan',formula:'ΔState>θstate ∨ SLA<SLAmin ∨ NodeLoad>95%',variables:'current and previous state, policy thresholds',input:snapshot.replanTriggers.filter(item=>item.triggered).map(item=>item.id).join(', ')||'none',calculation:`${snapshot.replanTriggers.filter(item=>item.triggered).length} active trigger(s)`,output:snapshot.replanTriggered?'REPLAN TRIGGERED':'MONITORING'},
    {id:'hysteresis',label:'Decision Hysteresis',target:'engine-replan',formula:'U(new) − U(current) > θswitch',variables:'new utility, current utility, switch threshold',input:`ΔU ${snapshot.utilityDelta.toFixed(3)}, θ ${snapshot.switchThreshold.toFixed(3)}`,calculation:`${snapshot.utilityDelta.toFixed(3)} > ${snapshot.switchThreshold.toFixed(3)}`,output:snapshot.switchAllowed?'SWITCH ALLOWED':'CURRENT PLAN HELD'},
    {id:'confidence',label:'Confidence',target:'engine-replan',formula:'f(signal completeness, candidate separation, constraint certainty)',variables:'completeness, score margin, hard-constraint certainty',input:`${snapshot.signalCompleteness.toFixed(2)}, ${snapshot.candidateMargin.toFixed(1)}, ${snapshot.constraintCertainty.toFixed(2)}`,calculation:'0.40·completeness + 0.35·separation + 0.25·certainty',output:`${Math.round(snapshot.decisionConfidence*100)}%`},
  ];
}
