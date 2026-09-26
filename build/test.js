const fs=require('fs'),zlib=require('zlib');
const E=require('../app/engine.js');
const meta=JSON.parse(fs.readFileSync('app/meta.json'));
const raw=zlib.gunzipSync(fs.readFileSync('app/brain.bin.gz'));
const buf=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
const b=E.parseBrain(buf,meta);
function mk(o){return new E.FlySim(b,o||{});}
function run(sim,ms,cb){const t0=Date.now();for(let i=0;i<ms;i++){if(cb)cb(sim,i);sim.tick();}return Date.now()-t0;}
function report(sim,label){
  const m=sim.motor; const out={};
  for(const k in m){let s=0;for(const i of m[k].all)s+=sim.spikeCount[i];out[k]=s;}
  const ev=sim.body.events.map(e=>e.e+'@'+e.t+(e.mode?'('+e.mode+')':'')).join(' ');
  let tot=0;for(let i=0;i<sim.N;i++)tot+=sim.spikeCount[i];
  console.log(label.padEnd(26),'spikes',tot,'active',sim.nActive,JSON.stringify(out),'| pos',sim.body.x.toFixed(1),sim.body.y.toFixed(1),'z',sim.body.z.toFixed(1),'turn°',(sim.body.turnAccum*57.3).toFixed(0),ev);
}
module.exports={b,mk,run,report,E,meta};
if(require.main===module){
 let s=mk(); let ms=run(s,500); report(s,'baseline 500ms ('+ms+'ms wall)');
 s=mk(); s.world.addLoom(s,-90,10); ms=run(s,600); report(s,'loom from LEFT ('+ms+'ms)');
 s=mk(); s.world.addLoom(s,90,10); run(s,600); report(s,'loom from RIGHT');
 s=mk(); s.world.addLoom(s,0,10); run(s,600); report(s,'loom from FRONT');
 s=mk(); s.world.food.push({x:1.2,y:0,r:3,amount:1,kind:'sugar'}); run(s,600); report(s,'sugar under head');
 s=mk(); s.world.food.push({x:1.2,y:0,r:3,amount:1,kind:'bitter'}); run(s,600); report(s,'bitter under head');
 s=mk(); s.world.sounds.push({x:-5,y:20,freq:200,amp:3,pulsed:true,on:true}); run(s,600); report(s,'song from left');
 s=mk(); s.world.wind={on:true,dir:Math.PI,speed:2}; run(s,600); report(s,'wind from front');
 s=mk(); s.world.touch={part:'head',until:300}; run(s,600); report(s,'touch head');
 s=mk(); s.world.touch={part:'antL',until:300}; run(s,600); report(s,'touch left antenna');
 s=mk(); s.world.co2.push({x:5,y:0,strength:2}); run(s,600); report(s,'CO2 ahead');
}
