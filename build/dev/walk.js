const {b,mk,run,report,meta}=require('../test.js');
function dnTop(s,n){const c={};for(let i=0;i<s.N;i++){if(!s.spikeCount[i])continue;if(meta.superclasses[b.sc[i]]!=='descending')continue;const t=meta.types[b.type[i]];c[t]=(c[t]||0)+s.spikeCount[i];}return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,n).map(e=>e[0]+':'+e[1]).join(' ');}
for(const [bg,kick] of [[0,10],[2,10],[5,10],[10,10],[5,20],[20,5]]){
  const s=mk({bgRate:bg,bgKick:kick}); const w=run(s,1000); report(s,`bg ${bg}Hz x${kick} (${w}ms)`);
}
// ambient light: photoreceptors tonic
const s=mk({visualMode:'retina'}); s.world.addLoom(s,-90,10); run(s,700); report(s,'retina mode loom L');
console.log(dnTop(s,12));
