'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { getPolicySnapshot, type PolicyScenarioId } from '@/domain/policy';
import { useCommerceSimulation } from '@/hooks/useCommerceSimulation';
import { candidatesForPhase } from '@/simulation/scenario';
import type { SimulationPhase } from '@/simulation/types';

const scenarioForPhase = (phase:SimulationPhase):PolicyScenarioId => {
  if (phase==='NORMAL'||phase==='SURGE') return 'normal-operations';
  if (phase==='SECOND_FAILURE'||phase==='REPLANNING'||phase==='UPDATED_EXECUTION'||phase==='RECOVERED') return 'warehouse-overload';
  return 'traffic-disruption';
};

const phaseForScenario:Record<PolicyScenarioId,SimulationPhase>={
  'normal-operations':'NORMAL',
  'traffic-disruption':'DECIDING',
  'warehouse-overload':'REPLANNING',
};

type SimulationContextValue=ReturnType<typeof useCommerceSimulation> & {
  scenarioId:PolicyScenarioId;
  policySnapshot:ReturnType<typeof getPolicySnapshot>;
  sharedScenario:{
    scenarioId:PolicyScenarioId;
    scenarioType:string;
    activeConstraints:string[];
    signals:ReturnType<typeof getPolicySnapshot>['signals'];
    decisionWeights:ReturnType<typeof getPolicySnapshot>['adaptiveWeights'];
    candidates:ReturnType<typeof getPolicySnapshot>['candidateRankingAfter'];
    selectedCandidateId:string;
    decisionScore:number;
    selectedPlan:string|null;
    executionState:SimulationPhase;
    replanCycle:number;
    replanReason:string;
    serviceLevel:number;
    outcome:{slaPercent:number;ordersAtRisk:number;averageDelayHours:number};
    policyVersion:string;
  };
  selectScenario:(scenarioId:PolicyScenarioId)=>void;
};

const ScenarioStateContext=createContext<SimulationContextValue|null>(null);

export function ScenarioStateProvider({children}:{children:ReactNode}){
  const simulation=useCommerceSimulation();
  const scenarioId=scenarioForPhase(simulation.state.phase);
  const policySnapshot=useMemo(()=>getPolicySnapshot(scenarioId),[scenarioId]);
  const selectedPlan=simulation.state.selectedRoute??candidatesForPhase(simulation.state.phase).find(item=>item.recommended)?.id??simulation.snapshot.activeRoute;
  const sharedScenario=useMemo(()=>({
    scenarioId,
    scenarioType:policySnapshot.classification,
    activeConstraints:policySnapshot.hardConstraints.filter(item=>item.active).map(item=>item.id),
    signals:policySnapshot.signals,
    decisionWeights:{...policySnapshot.adaptiveWeights},
    candidates:policySnapshot.candidateRankingAfter,
    selectedCandidateId:policySnapshot.selectedCandidateId,
    decisionScore:policySnapshot.candidateRankingAfter.find(item=>item.candidateId===policySnapshot.selectedCandidateId)?.totalScore??0,
    selectedPlan,
    executionState:simulation.state.phase,
    replanCycle:policySnapshot.context.cycle,
    replanReason:simulation.snapshot.trace.reason,
    serviceLevel:simulation.snapshot.onTimeRate,
    outcome:{slaPercent:simulation.snapshot.onTimeRate,ordersAtRisk:simulation.snapshot.ordersAtRisk,averageDelayHours:simulation.snapshot.averageDelayHours},
    policyVersion:policySnapshot.version,
  }),[policySnapshot,scenarioId,selectedPlan,simulation.snapshot,simulation.state.phase]);
  const value=useMemo<SimulationContextValue>(()=>({
    ...simulation,
    scenarioId,
    policySnapshot,
    sharedScenario,
    selectScenario:(next)=>simulation.goTo(phaseForScenario[next]),
  }),[policySnapshot,scenarioId,sharedScenario,simulation]);
  return <ScenarioStateContext.Provider value={value}>{children}</ScenarioStateContext.Provider>;
}

export function useScenarioState(){
  const value=useContext(ScenarioStateContext);
  if(!value) throw new Error('useScenarioState must be used inside ScenarioStateProvider');
  return value;
}
