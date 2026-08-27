import type { ScenarioEvaluation } from '@/domain/decision-engine';

export function AdvancedDecisionInspector({evaluation}:{evaluation:ScenarioEvaluation}){
  const core=evaluation.v3;
  const selectedRisk=core.risks.find(item=>item.candidateId===evaluation.selectedPolicy.candidate.id)!;
  const selectedEnvelope=core.riskEnvelopes.find(item=>item.candidateId===evaluation.selectedPolicy.candidate.id)!;
  const boundary=core.counterfactual.criticalVariables[0];
  return <section className="engine-section v3-inspector" aria-label="ARCI Core V3 Advanced Decision Inspector">
    <header className="engine-section-head"><div><small>ADVANCED DECISION INSPECTOR · ARCI CORE V3</small><h2>不確定性、未來路徑、風險邊界與自主權</h2></div><span>{core.audit.authoritativeOutputHash} · ARCI DERIVED</span></header>
    <div className="replan-grid">
      <article className="confidence-panel"><small>WORLD MODEL</small><strong>{Math.round(core.worldModel.evidenceSufficiency*100)}%</strong><dl><Row label="UNCERTAINTY" value={`${Math.round(core.confidence.uncertaintyLevel*100)}%`}/><Row label="DISAGREEMENT" value={`${Math.round(core.worldModel.disagreement*100)}%`}/><Row label="FRESH / CONFLICT" value={`${Object.values(core.worldModel.values).filter(item=>item.status==='OBSERVED').length} / ${core.worldModel.conflicts.length}`}/></dl><code>{core.worldModel.snapshotId}</code></article>
      <article className="confidence-panel"><small>DIGITAL TWIN / FORECAST</small><strong>{core.forecast.trajectoryCount}</strong><dl><Row label="HORIZONS" value="5m · 30m · 2h · 24h"/><Row label="SCENARIOS" value="OPT · NOM · PES · TAIL"/><Row label="STATE HISTORY" value={`${core.digitalTwin.stateHistoryIds.length} snapshots`}/></dl><code>SEEDED · {core.forecast.seed}</code></article>
      <article className="confidence-panel"><small>DECISION CONFIDENCE</small><strong>{Math.round(core.confidence.value*100)}%</strong><dl><Row label="SIM AGREEMENT" value={`${Math.round(core.confidence.simulationAgreement*100)}%`}/><Row label="DECISION MARGIN" value={core.counterfactual.decisionMargin.toFixed(4)}/><Row label="POLICY STABILITY" value={`${Math.round(core.confidence.policyStability*100)}%`}/></dl><code>{evaluation.selectedPolicy.candidate.id}</code></article>
    </div>
    <div className="counterfactual-grid">
      <article><small>ROBUST RISK</small><strong>{selectedRisk.tailRiskCvar95.toFixed(3)}<i> CVaR95 LOSS</i></strong><dl><Row label="EXPECTED UTILITY" value={selectedRisk.expectedUtility.toFixed(3)}/><Row label="WORST UTILITY" value={selectedRisk.worstCaseUtility.toFixed(3)}/><Row label="FAILURE PROB." value={`${(selectedRisk.failureProbability*100).toFixed(1)}%`}/><Row label="ROBUSTNESS" value={selectedRisk.robustness.toFixed(3)}/><Row label="REVERSIBILITY" value={selectedRisk.reversibility.toFixed(3)}/></dl></article>
      <article className="is-selected"><small>COUNTERFACTUAL / BOUNDARY</small><strong>{core.counterfactual.runnerUpCandidateId}<i> RUNNER-UP</i></strong><dl><Row label="NO ACTION" value={core.counterfactual.noActionCandidateId}/><Row label="BOUNDARY VARIABLE" value={boundary?.variable??'NO SWITCH FOUND'}/><Row label="SWITCH THRESHOLD" value={boundary?.threshold?.toFixed(3)??'N/A'}/><Row label="SWITCHES TO" value={boundary?.selectedAtThreshold??'N/A'}/><Row label="SENSITIVITY" value={boundary?.rankingImpact.toFixed(3)??'0.000'}/></dl></article>
      <article><small>GOVERNANCE / POLICY</small><strong>{core.governance.autonomyLevel}<i> AUTHORITY</i></strong><dl><Row label="RISK ENVELOPE" value={selectedEnvelope.state}/><Row label="EXECUTION" value={core.governance.executionAuthorized?'AUTHORIZED':'WITHHELD'}/><Row label="ACTIVE POLICY" value={core.policy.activeVersion}/><Row label="SHADOW POLICY" value={core.policy.shadowVersion??'NONE'}/><Row label="CALIBRATION" value={core.calibration.status}/></dl></article>
    </div>
    <p className="candidate-disclosure">500-path values are scenario simulation and ARCI-derived—not live Shopee, Sea, SPX, TDX, or CWA observations. Governance and replay exclude the non-authoritative LLM explanation layer.</p>
  </section>;
}

function Row({label,value}:{label:string;value:string}){return <div><dt>{label}</dt><dd>{value}</dd></div>}
