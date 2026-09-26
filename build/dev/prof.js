const {b,mk,run}=require('../test.js');
const s=mk(); run(s,300);
let t0=Date.now(); for(let i=0;i<1000;i++){s.world.sense(s);} const tS=Date.now()-t0;
t0=Date.now(); for(let i=0;i<1000;i++){s.brainStep();} const tB=Date.now()-t0;
console.log('sense',tS,'brain',tB,'active',s.nActive);
