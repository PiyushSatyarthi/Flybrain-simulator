const T=require('../test.js');const {b,mk,run,meta}=T;
function topTypes(sim,filterSc,n){const c={};for(let i=0;i<sim.N;i++){if(!sim.spikeCount[i])continue;const sc=meta.superclasses[b.sc[i]];if(filterSc&&sc!==filterSc)continue;const t=meta.types[b.type[i]];c[t]=(c[t]||0)+sim.spikeCount[i];}return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,n).map(e=>e[0]+':'+e[1]).join(' ');}
function inputs(target){ // presyn summary for a type
  const tgt=new Set(b.byType([target]));const agg={};
  for(let i=0;i<b.N;i++)for(let j=b.rowptr[i];j<b.rowptr[i+1];j++)if(tgt.has(b.post[j])){const t=meta.types[b.type[i]];agg[t]=(agg[t]||0)+b.w[j];}
  return Object.entries(agg).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,15).map(e=>e[0]+':'+e[1]).join(' ');
}
console.log('GF inputs:',inputs('DNp01'));
console.log('DNp09 inputs:',inputs('DNp09'));
let s=mk(); const gf=b.byType(['DNp01']); let maxu=0,maxg=0;
s.world.addLoom(s,-90,10); run(s,600,(sim)=>{for(const i of gf){maxu=Math.max(maxu,sim.u[i]);maxg=Math.max(maxg,sim.g[i]);}});
console.log('GF max u',maxu.toFixed(2),'max g',maxg.toFixed(2));
const lp=b.byType(['LPLC2']);let sp=0;for(const i of lp)sp+=s.spikeCount[i];console.log('LPLC2 spikes',sp,'n',lp.length);
console.log('DN top (loom L):',topTypes(s,'descending',20));
s=mk(); run(s,500); console.log('DN top baseline:',topTypes(s,'descending',15));
console.log('all top baseline:',topTypes(s,null,15));
