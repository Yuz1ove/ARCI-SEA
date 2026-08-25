import { evaluateScenario } from './engine';
import { taiwanMarket } from './markets/taiwan';
import { decisionScenarios } from './scenarios';
import type { ScenarioEvaluation } from './types';

export type DemoDecisionScenarioId='normal-operations'|'demand-surge'|'traffic-only'|'traffic-disruption'|'warehouse-overload';

const cache=new Map<DemoDecisionScenarioId,ScenarioEvaluation>();

export function getDemoDecisionEvaluation(id:DemoDecisionScenarioId):ScenarioEvaluation{
  const cached=cache.get(id);
  if(cached) return cached;
  const evaluation=id==='normal-operations'?evaluateScenario(decisionScenarios.normal,taiwanMarket)
    :id==='demand-surge'?evaluateScenario(decisionScenarios.surge,taiwanMarket)
      :id==='traffic-only'?evaluateScenario(decisionScenarios.traffic,taiwanMarket)
        :id==='traffic-disruption'?evaluateScenario(decisionScenarios.compound,taiwanMarket)
          :evaluateScenario(decisionScenarios.secondEvent,taiwanMarket,{previousDecision:getDemoDecisionEvaluation('traffic-disruption')});
  cache.set(id,evaluation);
  return evaluation;
}
