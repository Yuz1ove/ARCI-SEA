'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PolicyScenarioId } from '@/domain/policy';
import type { ScenarioEvaluation } from '@/domain/decision-engine';
import { useCommerceSimulation } from '@/hooks/useCommerceSimulation';
import { decisionCandidatesFromEvaluation, decisionScenarioForPhase, engineEvaluationForPhase, projectEngineSnapshot } from '@/simulation/enterpriseAdapter';
import type { SimulationPhase } from '@/simulation/types';

const scenarioForPhase = (phase:SimulationPhase):PolicyScenarioId => decisionScenarioForPhase(phase);

const phaseForScenario:Record<PolicyScenarioId,SimulationPhase>={
  'normal-operations':'NORMAL',
  'traffic-disruption':'DECIDING',
  'warehouse-overload':'REPLANNING',
};

type SimulationContextValue=ReturnType<typeof useCommerceSimulation> & {
  scenarioId:PolicyScenarioId;
  engineEvaluation:ScenarioEvaluation;
  sharedScenario:{
    scenarioId:PolicyScenarioId;
    scenarioType:string;
    activeConstraints:string[];
    signals:ScenarioEvaluation['state'];
    decisionWeights:ScenarioEvaluation['adaptiveWeights'];
    candidates:ScenarioEvaluation['evaluations'];
    selectedCandidateId:string;
    decisionScore:number;
    selectedPlan:string|null;
    executionState:SimulationPhase;
    replanCycle:number;
    replanReason:string;
    serviceLevel:number;
    outcome:{slaPercent:number;ordersAtRisk:number;averageDelayHours:number};
    policyVersion:string;
    p50:number;
    p90:number;
    decisionConfidence:number;
    governance:string;
    counterfactual:ReturnType<typeof engineEvaluationForPhase>['counterfactual'];
  };
  selectScenario:(scenarioId:PolicyScenarioId)=>void;
  applyIntelligenceEvaluation:(evaluation:ScenarioEvaluation)=>void;
  resetIntelligenceEvaluation:()=>void;
};

const ScenarioStateContext=createContext<SimulationContextValue|null>(null);

export function ScenarioStateProvider({children}:{children:ReactNode}){
  const simulation=useCommerceSimulation();
  const [intelligenceEvaluation,setIntelligenceEvaluation]=useState<ScenarioEvaluation|null>(null);
  const scenarioId=scenarioForPhase(simulation.state.phase);
  const baselineEvaluation=useMemo(()=>engineEvaluationForPhase(simulation.state.phase),[simulation.state.phase]);
  const engineEvaluation=intelligenceEvaluation??baselineEvaluation;
  const snapshot=useMemo(()=>projectEngineSnapshot(simulation.snapshot,engineEvaluation,simulation.state.phase,simulation.stageProgress),[engineEvaluation,simulation.snapshot,simulation.stageProgress,simulation.state.phase]);
  const candidates=useMemo(()=>decisionCandidatesFromEvaluation(engineEvaluation),[engineEvaluation]);
  const selectedPlan=simulation.state.selectedRoute??candidates.find(item=>item.recommended)?.id??snapshot.activeRoute;
  const sharedScenario=useMemo(()=>({
    scenarioId,
    scenarioType:engineEvaluation.scenario.id,
    activeConstraints:[...new Set(engineEvaluation.evaluations.flatMap(item=>item.constraints.violations.map(violation=>violation.code)))],
    signals:engineEvaluation.state,
    decisionWeights:{...engineEvaluation.adaptiveWeights},
    candidates:engineEvaluation.evaluations,
    selectedCandidateId:engineEvaluation.selectedPolicy.candidate.id,
    decisionScore:engineEvaluation.selectedPolicy.riskAdjustedScore,
    selectedPlan,
    executionState:simulation.state.phase,
    replanCycle:engineEvaluation.decisionRecord.trigger==='SECOND_EVENT_REPLAN'?2:1,
    replanReason:snapshot.trace.reason,
    serviceLevel:snapshot.onTimeRate,
    outcome:{slaPercent:snapshot.onTimeRate,ordersAtRisk:snapshot.ordersAtRisk,averageDelayHours:snapshot.averageDelayHours},
    policyVersion:'ARCI-EI-V4',
    p50:engineEvaluation.selectedPolicy.uncertainty.p50,
    p90:engineEvaluation.selectedPolicy.uncertainty.p90,
    decisionConfidence:engineEvaluation.confidence.value,
    governance:engineEvaluation.governance.mode,
    counterfactual:engineEvaluation.counterfactual,
  }),[engineEvaluation,scenarioId,selectedPlan,snapshot,simulation.state.phase]);
  const value=useMemo<SimulationContextValue>(()=>({
    ...simulation,
    snapshot,
    scenarioId,
    engineEvaluation,
    sharedScenario,
    selectScenario:(next)=>{setIntelligenceEvaluation(null);simulation.goTo(phaseForScenario[next])},
    applyIntelligenceEvaluation:setIntelligenceEvaluation,
    resetIntelligenceEvaluation:()=>setIntelligenceEvaluation(null),
  }),[engineEvaluation,scenarioId,sharedScenario,simulation,snapshot]);
  return <ScenarioStateContext.Provider value={value}>{children}</ScenarioStateContext.Provider>;
}

export function useScenarioState(){
  const value=useContext(ScenarioStateContext);
  if(!value) throw new Error('useScenarioState must be used inside ScenarioStateProvider');
  return value;
}
