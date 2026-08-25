export function explanationMatchesDecision(currentDecisionId:string|null,responseDecisionId:string){
  return Boolean(currentDecisionId&&currentDecisionId===responseDecisionId);
}
