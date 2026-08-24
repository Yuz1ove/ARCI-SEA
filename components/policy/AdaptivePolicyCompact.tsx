import { AppRouteLink } from '@/components/AppRouteLink';
import { criterionLabels } from '@/domain/policy';
import { segmentProgress } from '@/simulation/timeline';
import type { PolicySnapshot } from '@/domain/policy';

const featured=['slaProtection','routeFeasibility','capacityBalance','costEfficiency','disruptionRisk','recoverySpeed'] as const;

export function AdaptivePolicyCompact({snapshot,stageProgress}:{snapshot:PolicySnapshot;stageProgress:number}){
  const progress=segmentProgress(stageProgress,.1,.5);
  const guardrailsPassed=snapshot.guardrails.every(rule=>rule.passed);
  return <section className="adaptive-policy-compact" aria-label="ARCI Decision Engine">
    <header><span><small>DECISION ENGINE</small><strong>即時計算鏈</strong></span><em>{snapshot.contextLabel}</em></header>
    <div className="compact-weight-list">{featured.map(criterion=>{
      const before=snapshot.baseWeights[criterion],after=snapshot.adaptiveWeights[criterion];
      const current=before+(after-before)*progress,delta=after-before;
      return <div key={criterion}><span>{criterionLabels[criterion].symbol}</span><i><em style={{transform:`scaleX(${current/40})`}}/></i><b>{before.toFixed(0)}% <small>→</small> {current.toFixed(1)}%</b><strong>{delta>0?'+':''}{delta.toFixed(1)}</strong></div>;
    })}</div>
    <footer><span className={guardrailsPassed?'is-pass':'is-fail'}>{guardrailsPassed?'GUARDRAILS PASSED':'POLICY BLOCKED'}</span><p>{snapshot.candidateRankingAfter.filter(item=>item.eligible).length} / {snapshot.candidateRankingAfter.length} eligible · {snapshot.selectedCandidateId}</p><AppRouteLink href="/adaptive-policy">查看計算引擎 <span>→</span></AppRouteLink></footer>
  </section>;
}
