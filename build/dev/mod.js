const {b,mk,run,meta}=require('../test.js');
function tot(s){let t=0;for(let i=0;i<s.N;i++)t+=s.spikeCount[i];return t;}
function top(s,n){const c={};for(let i=0;i<s.N;i++){if(!s.spikeCount[i])continue;const t=meta.types[b.type[i]];c[t]=(c[t]||0)+s.spikeCount[i];}return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,n).map(e=>e[0]+':'+e[1]).join(' ');}
const mod=new Set(['dopamine','serotonin','octopamine','tyramine'].map(n=>meta.nts.indexOf(n)));
for(let i=0;i<b.N;i++) if(mod.has(b.nt[i])) for(let j=b.rowptr[i];j<b.rowptr[i+1];j++) b.w[j]=0;
let s=mk(); s.world.co2.push({x:5,y:0,strength:2}); run(s,300); console.log('CO2 on',tot(s),top(s,6)); s.world.co2=[]; s.spikeCount.fill(0); run(s,1000); console.log('after off',tot(s),'active',s.nActive, top(s,8));
s=mk(); s.world.food.push({x:1.2,y:0,r:3,amount:1,kind:'sugar'}); run(s,300); console.log('sugar', tot(s)); s.world.food=[]; s.spikeCount.fill(0); run(s,1000); console.log('after sugar off',tot(s),top(s,6));
