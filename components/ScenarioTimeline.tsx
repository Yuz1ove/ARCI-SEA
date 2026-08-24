'use client';

import { useEffect,useRef } from 'react';
import { phaseLabels, phaseOrder } from '@/simulation/scenario';
import { stageDurationLabel } from '@/simulation/timeline';
import type { SimulationPhase } from '@/simulation/types';

export function ScenarioTimeline({phase,progress,onGoTo}:{phase:SimulationPhase;progress:number;onGoTo:(phase:SimulationPhase)=>void}){
  const current=phaseOrder.indexOf(phase);
  const currentRef=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{currentRef.current?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});},[phase]);
  return <nav className="scenario-timeline" aria-label="ARCI Operational Timeline">
    <div className="timeline-track" aria-hidden="true"><i style={{transform:`scaleX(${progress})`}}/></div>
    {phaseOrder.map((item,index)=><button ref={index===current?currentRef:undefined} key={item} type="button" onClick={()=>onGoTo(item)} className={index===current?'is-current':index<current?'is-complete':''} aria-current={index===current?'step':undefined} title={`${phaseLabels[item]} · ${stageDurationLabel(item)}`}>
      <span className="timeline-dot"><i/></span><span>{phaseLabels[item]}</span>
    </button>)}
  </nav>;
}
