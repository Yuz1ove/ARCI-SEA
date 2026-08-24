import { runPolicyEngine } from './engine';
import { policyScenarios } from './scenarios';
import type { PolicyScenarioId } from './types';

export function getPolicySnapshot(id:PolicyScenarioId){
  if(id==='warehouse-overload'){
    const previous=runPolicyEngine(policyScenarios['traffic-disruption']);
    return runPolicyEngine(policyScenarios[id],previous);
  }
  return runPolicyEngine(policyScenarios[id]);
}
