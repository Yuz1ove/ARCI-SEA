import { AppRouteLink } from './AppRouteLink';
import type { CommerceSimulationState } from '@/simulation/types';

type Props={state:CommerceSimulationState;status:string;onPlay:()=>void;onPause:()=>void;onResume:()=>void;onReset:()=>void;onPrevious:()=>void;onNext:()=>void};

export function TopControlRail({state,status,onPlay,onPause,onResume,onReset,onPrevious,onNext}:Props){
  const running=state.autoPlaying;
  return <header className="control-rail">
    <div className="brand-block"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span><div><strong>ARCI</strong><small>Autonomous Resilient Commerce Intelligence</small></div></div>
    <div className="scenario-title"><span className={`live-dot live-${state.phase.toLowerCase()}`}/><div><small>情境模擬｜非即時營運資料</small><strong>雙 9 大促物流壓力測試</strong></div><span className="phase-status">{status}</span></div>
    <div className="rail-actions">
      <AppRouteLink className="policy-nav-link" href="/adaptive-policy">自適應決策策略 <span>→</span></AppRouteLink>
      <span className="keyboard-hint">Space 暫停 · ← → 切幕 · R 重播</span>
      <div className="presentation-controls" aria-label="簡報控制"><button type="button" onClick={onPrevious} aria-label="上一階段">←</button><button type="button" onClick={onNext} aria-label="下一階段">→</button></div>
      <button className="ghost-button" type="button" onClick={onReset}>重播</button>
      {running?<button className="play-button" type="button" onClick={state.autoPaused?onResume:onPause}>{state.autoPaused?'繼續':'暫停'}</button>:<button className="play-button" type="button" onClick={onPlay}>{state.phase==='RECOVERED'?'重新播放':'開始 Demo'}</button>}
    </div>
  </header>;
}
