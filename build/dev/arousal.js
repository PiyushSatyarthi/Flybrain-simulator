const {b,mk,run,report,meta}=require('../test.js');
for(const [a,n] of [[3,2],[4,2],[5,2],[5,3],[6,2]]){
  const s=mk({arousal:a,noise:n}); const w=run(s,1000); report(s,`arousal ${a} noise ${n} (${w}ms)`);
}
