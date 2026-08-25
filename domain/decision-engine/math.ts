export const clamp=(value:number,min=0,max=1)=>Math.min(max,Math.max(min,Number.isFinite(value)?value:min));
export const safeDivide=(numerator:number,denominator:number,fallback=0)=>denominator===0||!Number.isFinite(denominator)?fallback:numerator/denominator;
export const round=(value:number,digits=4)=>Number((Number.isFinite(value)?value:0).toFixed(digits));
export const sum=(values:number[])=>values.reduce((total,value)=>total+value,0);
export const mean=(values:number[])=>safeDivide(sum(values),values.length,0);
export const quantile=(values:number[],probability:number)=>{
  if(!values.length) return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const index=(sorted.length-1)*clamp(probability);
  const lower=Math.floor(index),upper=Math.ceil(index);
  return round(sorted[lower]+(sorted[upper]-sorted[lower])*(index-lower));
};
export const stableHash=(value:string)=>{
  let hash=2166136261;
  for(let index=0;index<value.length;index++){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(16).padStart(8,'0');
};
export const finiteRecord=(value:unknown):boolean=>{
  if(typeof value==='number') return Number.isFinite(value);
  if(Array.isArray(value)) return value.every(finiteRecord);
  if(value&&typeof value==='object') return Object.values(value).every(finiteRecord);
  return true;
};
