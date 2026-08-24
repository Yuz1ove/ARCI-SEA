import type { CommerceSimulationState, RouteId, SimulationPhase } from './types';

export type SimulationAction =
  | { type:'GO_TO'; phase:SimulationPhase }
  | { type:'PREVIEW_ROUTE'; route:RouteId | null }
  | { type:'SELECT_ROUTE'; route:RouteId | null }
  | { type:'SELECT_NODE'; node:string | null }
  | { type:'PLAY' }
  | { type:'PAUSE' }
  | { type:'RESUME' }
  | { type:'FINISH' }
  | { type:'RESET' };

export const initialSimulationState: CommerceSimulationState = { phase:'NORMAL', previewRoute:null, selectedRoute:null, selectedNode:null, autoPlaying:false, autoPaused:false };

export function simulationReducer(state:CommerceSimulationState, action:SimulationAction):CommerceSimulationState {
  switch(action.type){
    case 'GO_TO': return {...state,phase:action.phase,previewRoute:null,selectedRoute:null};
    case 'PREVIEW_ROUTE': return {...state,previewRoute:action.route};
    case 'SELECT_ROUTE': return {...state,selectedRoute:action.route,previewRoute:null};
    case 'SELECT_NODE': return {...state,selectedNode:action.node};
    case 'PLAY': return {...initialSimulationState,autoPlaying:true};
    case 'PAUSE': return {...state,autoPaused:true};
    case 'RESUME': return {...state,autoPaused:false};
    case 'FINISH': return {...state,autoPlaying:false,autoPaused:false};
    case 'RESET': return initialSimulationState;
    default: return state;
  }
}
