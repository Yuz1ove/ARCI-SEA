import { describe, expect, it } from 'vitest';
import { initialSimulationState, simulationReducer } from './stateMachine';

describe('commerce simulation state machine',()=>{
  it('advances through the first incident and ARCI decision',()=>{
    let state=simulationReducer(initialSimulationState,{type:'GO_TO',phase:'SURGE'});
    state=simulationReducer(state,{type:'GO_TO',phase:'WAREHOUSE_OVERLOAD'});
    state=simulationReducer(state,{type:'GO_TO',phase:'DEGRADED'});
    state=simulationReducer(state,{type:'GO_TO',phase:'DECIDING'});
    expect(state.phase).toBe('DECIDING');
  });

  it('stores and clears a route preview without changing the active phase',()=>{
    const preview=simulationReducer({...initialSimulationState,phase:'DECIDING'},{type:'PREVIEW_ROUTE',route:'route-b'});
    expect(preview.previewRoute).toBe('route-b');
    expect(simulationReducer(preview,{type:'PREVIEW_ROUTE',route:null}).previewRoute).toBeNull();
  });

  it('persists a clicked candidate independently from hover preview',()=>{
    let state=simulationReducer({...initialSimulationState,phase:'DECIDING'},{type:'SELECT_ROUTE',route:'route-d'});
    state=simulationReducer(state,{type:'PREVIEW_ROUTE',route:'route-b'});
    expect(state.selectedRoute).toBe('route-d');
    expect(state.previewRoute).toBe('route-b');
    state=simulationReducer(state,{type:'PREVIEW_ROUTE',route:null});
    expect(state.selectedRoute).toBe('route-d');
  });

  it('resets the complete simulation',()=>{
    const failed={...initialSimulationState,phase:'SECOND_FAILURE' as const,autoPlaying:true,selectedNode:'carrier-b'};
    expect(simulationReducer(failed,{type:'RESET'})).toEqual(initialSimulationState);
  });

  it('replans after the second shock instead of retaining the failed phase',()=>{
    const shock={...initialSimulationState,phase:'SECOND_FAILURE' as const};
    expect(simulationReducer(shock,{type:'GO_TO',phase:'REPLANNING'}).phase).toBe('REPLANNING');
  });

  it('executes the updated decision before outcome validation',()=>{
    const replanning={...initialSimulationState,phase:'REPLANNING' as const};
    const executing=simulationReducer(replanning,{type:'GO_TO',phase:'UPDATED_EXECUTION'});
    expect(executing.phase).toBe('UPDATED_EXECUTION');
    expect(simulationReducer(executing,{type:'GO_TO',phase:'RECOVERED'}).phase).toBe('RECOVERED');
  });
});
