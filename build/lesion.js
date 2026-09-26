const {b,mk,run,meta}=require('./test.js');
function region(names){const set=new Set(names.map(n=>meta.neuropils.indexOf(n)));const o=[];for(let i=0;i<b.N;i++)if(set.has(b.np[i]))o.push(i);return o;}
function trial(les,stim,seed){const s=mk({seed});s.setSilenced(les);stim(s);let gf=0;run(s,600);for(const i of s.motor.gf.all)gf+=s.spikeCount[i];const ev=s.body.events.find(e=>e.e==='takeoff');return {to:ev?ev.t:null,mode:ev?ev.mode:'',gf};}
const L=(s)=>s.world.addLoom(s,-90,10), R=(s)=>s.world.addLoom(s,90,10);
const conds={intact:[],GF:b.byType(['DNp01']),'LPLC2+LC4':b.byType(['LPLC2','LC4']),'left optic lobe':region(['LA_L','ME_L','AME_L','LO_L','LOP_L']),'all loom DNs+GF':b.byType(['DNp01','DNp02','DNp04','DNp06','DNp11'])};
for(const [k,les] of Object.entries(conds)){
  for(const [sn,st] of [['loomL',L],['loomR',R]]){
    const r=[1,2,3,4,5].map(sd=>trial(les,st,sd));
    console.log(k.padEnd(18),sn,'n='+les.length,r.map(x=>x.to===null?'none':x.to+(x.mode[0]==='s'?'GF':'LM')).join(' '),'GFspk',r.map(x=>x.gf).join(','));
  }
}
