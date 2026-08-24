import type { Provenance, SourceType } from '@/simulation/types';

const labels:Record<SourceType,string>={observed:'CONNECTED',public:'OFFICIAL',inferred:'ARCI DERIVED',simulated:'SCENARIO'};

export function ProvenanceBadge({data,compact=false}:{data:Provenance;compact?:boolean}){
  const detail=[data.sourceLabel,data.sourceDetail,data.asOf].filter(Boolean).join('｜');
  return <span className={`provenance-badge provenance-${data.sourceType}`} title={detail}>
    <i aria-hidden="true"/><span>{labels[data.sourceType]}</span>{!compact&&<em>{data.sourceDetail}</em>}
  </span>;
}
