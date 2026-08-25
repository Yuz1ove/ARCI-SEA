'use client';

import { Profiler, useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { DebugOverlay } from './DebugOverlay';
import { OperationsPanel } from './OperationsPanel';
import { ScenarioTimeline } from './ScenarioTimeline';
import { TaiwanOperationsMap } from './TaiwanOperationsMap';
import { TopControlRail } from './TopControlRail';
import { RecoveryTrajectory } from './RecoveryTrajectory';
import { useScenarioState } from './ScenarioStateProvider';
import { decisionCandidatesFromEvaluation } from '@/simulation/enterpriseAdapter';
import type { SimulationPhase } from '@/simulation/types';

export function CommerceConsole(){
  const {state,snapshot,stageProgress,demoProgress,controls,goTo,previewRoute,selectRoute,selectNode,engineEvaluation}=useScenarioState();
  const candidates=decisionCandidatesFromEvaluation(engineEvaluation);
  const candidatePhase=state.phase==='DECIDING'||state.phase==='REPLANNING';
  const focusedRoute=state.previewRoute??state.selectedRoute??(candidatePhase?candidates.find(item=>item.recommended)?.id:snapshot.activeRoute);
  const renderCount=useRef(0);
  const countRender=useCallback(()=>{renderCount.current+=1;},[]);
  useEffect(()=>{
    const handleKey=(event:KeyboardEvent)=>{
      if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement) return;
      if(event.code==='Space'){
        event.preventDefault();
        if(!state.autoPlaying) controls.play();
        else if(state.autoPaused) controls.resume();
        else controls.pause();
      }
      if(event.key==='ArrowLeft'){event.preventDefault();controls.previous();}
      if(event.key==='ArrowRight'){event.preventDefault();controls.next();}
      if(event.key.toLowerCase()==='r'){event.preventDefault();controls.reset();}
    };
    window.addEventListener('keydown',handleKey);
    return ()=>window.removeEventListener('keydown',handleKey);
  },[controls,state.autoPaused,state.autoPlaying]);
  useEffect(()=>{
    const requested=new URLSearchParams(window.location.search).get('phase') as SimulationPhase|null;
    if(requested&&['NORMAL','SURGE','WAREHOUSE_OVERLOAD','DEGRADED','DECIDING','REROUTING','RECOVERING','SECOND_FAILURE','REPLANNING','UPDATED_EXECUTION','RECOVERED'].includes(requested)) goTo(requested);
  },[goTo]);
  const shellStyle={'--stage-progress':stageProgress,'--demo-progress':demoProgress} as CSSProperties;
  return <main style={shellStyle} className={`shell shell-${state.phase.toLowerCase()} ${state.autoPaused?'simulation-paused':''}`} data-phase={state.phase} data-stage-progress={stageProgress.toFixed(3)} data-demo-progress={demoProgress.toFixed(3)}>
    <TopControlRail state={state} status={snapshot.arciStatus} onPlay={controls.play} onPause={controls.pause} onResume={controls.resume} onReset={controls.reset} onPrevious={controls.previous} onNext={controls.next}/>
    <div className="workspace">
      <ScenarioTimeline phase={state.phase} progress={demoProgress} onGoTo={goTo}/>
      <section className="hero-heading"><div><span>SEA COMMERCE OPERATIONS</span><h1>{snapshot.headline}</h1></div><p><i/> {snapshot.summary}</p></section>
      <Profiler id="control-center" onRender={countRender}><section className="control-center">
          <TaiwanOperationsMap snapshot={snapshot} state={state} stageProgress={stageProgress} onSelectNode={selectNode}/>
          <OperationsPanel phase={state.phase} snapshot={snapshot} engineEvaluation={engineEvaluation} stageProgress={stageProgress} previewRoute={state.previewRoute} selectedRoute={state.selectedRoute} onPreview={previewRoute} onSelect={selectRoute} onExecute={state.phase==='DEGRADED'?controls.runArci:controls.executeRoute} onReplan={controls.replan}/>
        </section></Profiler>
      <RecoveryTrajectory phase={state.phase} stageProgress={stageProgress} currentSla={snapshot.onTimeRate}/>
    </div>
    <DebugOverlay state={state} activeRoute={focusedRoute??snapshot.activeRoute} renderCounter={renderCount} stageProgress={stageProgress} demoProgress={demoProgress}/>
  </main>;
}
