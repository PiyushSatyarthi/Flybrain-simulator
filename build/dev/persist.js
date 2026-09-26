const {b,mk,run,meta}=require('../test.js');
function tot(s){let t=0;for(let i=0;i<s.N;i++)t+=s.spikeCount[i];return t;}
function top(s,n){const c={};for(let i=0;i<s.N;i++){if(!s.spikeCount[i])continue;const t=meta.types[b.type[i]];c[t]=(c[t]||0)+s.spikeCount[i];}return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,n).map(e=>e[0]+':'+e[1]).join(' ');}
let s=mk(); s.world.co2.push({x:5,y:0,strength:2}); run(s,300); console.log('CO2 on 300ms',tot(s),top(s,8)); s.world.co2=[]; s.spikeCount.fill(0); run(s,1000); console.log('after off 1s',tot(s),'active',s.nActive, top(s,8));
s=mk(); s.world.touch={part:'head',until:300}; run(s,300); s.spikeCount.fill(0); run(s,1000); console.log('touch after 1s',tot(s),top(s,8));
