const {b,mk,run,meta}=require('./test.js');
const s0=mk(); const keys=Object.keys(s0.motor);
const cands=['LC9','LC31a','LC31b','LC10a','LC10d','LC11','LC12','LC15','LC16','LC17','LC18','LC20','LC21','LC22','LC24','LC25','LC26','LC6','LC4','LPLC1','LPLC2','LPLC4','LC13','LCe04','HSE','HSS','VSm','BM_Ant','JO-B1_a','JO-EV1','JO-A5','ORN_DM1','ORN_V','ORN_DA2'];
console.log('type'.padEnd(10),keys.join(' '));
for(const t of cands){
  const idx=b.byType([t]); if(!idx.length){continue;}
  const s=mk(); s.setForced(idx,120); run(s,400);
  const row=keys.map(k=>{let c=0;for(const i of s.motor[k].all)c+=s.spikeCount[i];return String(c).padStart(4)});
  console.log(t.padEnd(10),row.join(' '), s.body.events.map(e=>e.e).join(','));
}
