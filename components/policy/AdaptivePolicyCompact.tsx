import { AppRouteLink } from '@/components/AppRouteLink';
import { taiwanMarket, type ObjectiveComponent, type ScenarioEvaluation } from '@/domain/decision-engine';
import { segmentProgress } from '@/simulation/timeline';

const featured:ObjectiveComponent[]=['slaLoss','cost','risk','recoveryTime','capacityStress','instability'];
const labels:Record<ObjectiveComponent,string>={slaLoss:'wSLA',cost:'wCost',risk:'wRisk',recoveryTime:'wRecovery',capacityStress:'wCapacity',instability:'wStability'};

export function AdaptivePolicyCompact({evaluation,stageProgress}:{evaluation:ScenarioEvaluation;stageProgress:number}){
  const progress=segmentProgress(stageProgress,.1,.5);
  const guardrailsPassed=evaluation.selectedPolicy.constraints.feasible&&evaluation.governance.mode!=='BLOCKED';
  return <section className="adaptive-policy-compact" aria-label="ARCI Decision Engine">
    <header><span><small>DECISION ENGINE V2</small><strong>即時計算鏈</strong></span><em>{evaluation.scenario.label}</em></header>
    <div className="compact-weight-list">{featured.map(criterion=>{
      const before=taiwanMarket.objectiveDefaults[criterion]*100,after=evaluation.adaptiveWeights[criterion]*100;
      const current=before+(after-before)*progress,delta=after-before;
      return <div key={criterion}><span>{labels[criterion]}</span><i><em style={{transform:`scaleX(${current/40})`}}/></i><b>{before.toFixed(0)}% <small>→</small> {current.toFixed(1)}%</b><strong>{delta>0?'+':''}{delta.toFixed(1)}</strong></div>;
    })}</div>
    <footer><span className={guardrailsPassed?'is-pass':'is-fail'}>{guardrailsPassed?evaluation.governance.mode:'POLICY BLOCKED'}</span><p>{evaluation.evaluations.filter(item=>item.constraints.feasible).length} / {evaluation.evaluations.length} eligible · P90 {evaluation.selectedPolicy.uncertainty.p90.toFixed(3)}</p><AppRouteLink href="/adaptive-policy">查看計算引擎 <span>→</span></AppRouteLink></footer>
  </section>;
}
