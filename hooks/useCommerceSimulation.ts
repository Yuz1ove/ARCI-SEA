'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { phaseOrder } from '@/simulation/scenario';
import { initialSimulationState, simulationReducer } from '@/simulation/stateMachine';
import { getDemoProgress, interpolateSnapshot, stageDurationMs } from '@/simulation/timeline';
import type { RouteId, SimulationPhase } from '@/simulation/types';

const MANUAL_TRANSITION_MS = 1_600;

export function useCommerceSimulation(){
  const [state,dispatch] = useReducer(simulationReducer,initialSimulationState);
  const [stageProgress,setStageProgress] = useState(1);
  const progressRef=useRef(1);
  const manualTransitionRef=useRef(false);
  const previousPhaseRef=useRef(state.phase);
  const previousPlayingRef=useRef(state.autoPlaying);

  useEffect(()=>{
    const phaseChanged=previousPhaseRef.current!==state.phase;
    const playbackStarted=!previousPlayingRef.current&&state.autoPlaying;
    previousPhaseRef.current=state.phase;
    previousPlayingRef.current=state.autoPlaying;

    if(phaseChanged||playbackStarted){
      progressRef.current=0;
      setStageProgress(0);
    }
    if(!state.autoPlaying&&!manualTransitionRef.current){
      progressRef.current=1;
      setStageProgress(1);
      return;
    }
    if(state.autoPaused) return;

    const startProgress=progressRef.current;
    const duration=(state.autoPlaying?stageDurationMs[state.phase]:MANUAL_TRANSITION_MS)*(1-startProgress);
    const startedAt=performance.now();
    let lastCommit=startedAt;
    let frame=0;
    const tick=(now:number)=>{
      const next=Math.min(1,startProgress+(now-startedAt)/Math.max(1,duration)*(1-startProgress));
      progressRef.current=next;
      if(next===1||now-lastCommit>=50){
        lastCommit=now;
        setStageProgress(next);
      }
      if(next<1){ frame=window.requestAnimationFrame(tick); return; }
      manualTransitionRef.current=false;
      if(!state.autoPlaying) return;
      const index=phaseOrder.indexOf(state.phase);
      if(index===phaseOrder.length-1){ dispatch({type:'FINISH'}); return; }
      dispatch({type:'GO_TO',phase:phaseOrder[index+1]});
    };
    frame=window.requestAnimationFrame(tick);
    return ()=>window.cancelAnimationFrame(frame);
  },[state.autoPaused,state.autoPlaying,state.phase]);

  const goTo = useCallback((phase:SimulationPhase)=>{
    manualTransitionRef.current=true;
    dispatch({type:'GO_TO',phase});
  },[]);
  const previewRoute = useCallback((route:RouteId|null)=>dispatch({type:'PREVIEW_ROUTE',route}),[]);
  const selectRoute = useCallback((route:RouteId|null)=>dispatch({type:'SELECT_ROUTE',route}),[]);
  const selectNode = useCallback((node:string|null)=>dispatch({type:'SELECT_NODE',node}),[]);
  const controls=useMemo(()=>({
    startMegaSale:()=>goTo('SURGE'),overloadWarehouse:()=>goTo('WAREHOUSE_OVERLOAD'),failCarrier:()=>goTo('DEGRADED'),runArci:()=>goTo('DECIDING'),
    executeRoute:()=>goTo(state.phase==='REPLANNING'?'UPDATED_EXECUTION':'REROUTING'),recover:()=>goTo('RECOVERING'),secondShock:()=>goTo('SECOND_FAILURE'),replan:()=>goTo('REPLANNING'),
    previous:()=>goTo(phaseOrder[Math.max(0,phaseOrder.indexOf(state.phase)-1)]),next:()=>goTo(phaseOrder[Math.min(phaseOrder.length-1,phaseOrder.indexOf(state.phase)+1)]),
    reset:()=>{manualTransitionRef.current=false;dispatch({type:'RESET'});},play:()=>dispatch({type:'PLAY'}),pause:()=>dispatch({type:'PAUSE'}),resume:()=>dispatch({type:'RESUME'}),
  }),[goTo,state.phase]);

  const snapshot=useMemo(()=>interpolateSnapshot(state.phase,stageProgress),[stageProgress,state.phase]);
  const demoProgress=getDemoProgress(state.phase,stageProgress);
  return {state,snapshot,stageProgress,demoProgress,controls,goTo,previewRoute,selectRoute,selectNode};
}
