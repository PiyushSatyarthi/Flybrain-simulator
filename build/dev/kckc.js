const {b,mk,run,meta}=require('../test.js');
function tot(s){let t=0;for(let i=0;i<s.N;i++)t+=s.spikeCount[i];return t;}
function top(s,n){const c={};for(let i=0;i<s.N;i++){if(!s.spikeCount[i])continue;const t=meta.types[b.type[i]];c[t]=(c[t]||0)+s.spikeCount[i];}return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,n).map(e=>e[0]+':'+e[1]).join(' ');}
// count KC->KC weight
const kc=new Uint8Array(b.N); for(let i=0;i<b.N;i++){if(meta.classes[b.cl[i]]==='Kenyon_Cell')kc[i]=1;}
let kk=0,tk=0; for(let i=0;i<b.N;i++) if(kc[i]) for(let j=b.rowptr[i];j<b.rowptr[i+1];j++){tk+=b.w[j]; if(kc[b.post[j]])kk+=b.w[j];}
console.log('KC out weight',tk,'to KC',kk);
const saved=Int16Array.from(b.w);
for(let i=0;i<b.N;i++) if(kc[i]) for(let j=b.rowptr[i];j<b.rowptr[i+1];j++) if(kc[b.post[j]]) b.w[j]=0;
let s=mk(); s.world.co2.push({x:5,y:0,strength:2}); run(s,300); console.log('noKCKC CO2 on',tot(s),top(s,6)); s.world.co2=[]; s.spikeCount.fill(0); run(s,1000); console.log('after off',tot(s),'active',s.nActive, top(s,8));
b.w.set(saved);
