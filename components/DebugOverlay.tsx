'use client';

import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import type { CommerceSimulationState, RouteId } from '@/simulation/types';

const subscribe=()=>()=>{};

export function DebugOverlay({state,activeRoute,renderCounter,stageProgress,demoProgress}:{state:CommerceSimulationState;activeRoute:RouteId;renderCounter:RefObject<number>;stageProgress:number;demoProgress:number}){
  const enabled=useSyncExternalStore(subscribe,()=>new URLSearchParams(window.location.search).get('debug')==='1',()=>false);
  const [stats,setStats]=useState({fps:0,renders:0});
  useEffect(()=>{
    if(!enabled)return;
    let frames=0;let last=performance.now();let id=0;
    const tick=(now:number)=>{frames+=1;if(now-last>=500){setStats({fps:Math.round(frames*1000/(now-last)),renders:renderCounter.current});frames=0;last=now;}id=requestAnimationFrame(tick);};
    id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);
  },[enabled,renderCounter]);
  if(!enabled)return null;
  return <aside className="debug-overlay"><strong>ARCI DEBUG</strong><span>phase <b>{state.phase}</b></span><span>stage <b>{Math.round(stageProgress*100)}%</b></span><span>demo <b>{Math.round(demoProgress*100)}%</b></span><span>FPS <b>{stats.fps}</b></span><span>route <b>{activeRoute}</b></span><span>renders <b>{stats.renders}</b></span><span>providers <b>scenario / derived</b></span></aside>;
}
