/* FlyLab simulation worker: owns the brain, world and body; streams frames to the page. */
importScripts('engine.js');
var E = self.FlyEngine;
var brain = null, meta = null, sim = null;
var running = true, speed = 1;
var silenced = [], forced = [], forcedRate = 150;
var lastReal = 0, simDebt = 0, rtf = 0, rtfAcc = 0, rtfReal = 0;
var typeCounts = null, typeTimer = 0;
var newEvents = [];
var busy = false;

async function load(base) {
	post({type: 'status', text: 'Downloading connectome (11 MB)…'});
	var mres = await fetch(base + 'meta.json');
	if (!mres.ok) throw new Error('could not fetch meta.json');
	meta = await mres.json();
	var gz = null;
	try {                                    // binary package (local server, GitHub Pages)
		var bres = await fetch(base + 'brain.bin.gz');
		if (bres.ok) gz = await bres.arrayBuffer();
	} catch (e) { gz = null; }
	if (!gz || gz.byteLength < 1000) {       // base64 copy (hosts that serve text only)
		var tres = await fetch(base + 'brain.b64.txt');
		if (!tres.ok) throw new Error('could not fetch brain.bin.gz or brain.b64.txt');
		var bin = atob((await tres.text()).trim()), u8 = new Uint8Array(bin.length);
		for (var q = 0; q < bin.length; q++) u8[q] = bin.charCodeAt(q);
		gz = u8.buffer;
	}
	post({type: 'status', text: 'Decompressing 2.7 million connections…'});
	var raw;
	var head = new Uint8Array(gz, 0, 2);
	if (head[0] === 0x1f && head[1] === 0x8b) {
		var ds = new DecompressionStream('gzip');
		raw = await new Response(new Blob([gz]).stream().pipeThrough(ds)).arrayBuffer();
	} else raw = gz;   // server already decoded it
	post({type: 'status', text: 'Building 139,255 neurons…'});
	brain = E.parseBrain(raw, meta);
	sim = makeSim(1);
	typeCounts = new Uint32Array(meta.types.length);
	var sensorsInfo = {};
	for (var k in sim.sensors) sensorsInfo[k] = {label: sim.sensors[k].label, n: sim.sensors[k].idx.length};
	var motorInfo = {};
	for (k in sim.motor) motorInfo[k] = {label: sim.motor[k].label, ref: sim.motor[k].ref, types: E.MOTOR_MAP.filter(function (m) { return m.key === k; })[0].types || [], n: sim.motor[k].all.length};
	post({type: 'ready', N: brain.N, E: brain.E,
		meta: {types: meta.types, neuropils: meta.neuropils, superclasses: meta.superclasses, classes: meta.classes, subclasses: meta.subclasses, nts: meta.nts, sides: meta.sides, source: meta.source},
		arrays: {type: brain.type.slice(), np: brain.np.slice(), side: brain.side.slice(), sc: brain.sc.slice(), cl: brain.cl.slice(), sub: brain.sub.slice(), nt: brain.nt.slice(), pos: brain.pos.slice(), az: brain.az.slice(), el: brain.el.slice(),
			loomIdx: sim.sensors.loomLPLC2.idx.slice()},
		sensors: sensorsInfo, motor: motorInfo, body: E.BODY});
	lastReal = performance.now();
	setInterval(loop, 16);
}

function makeSim(seed, opts) {
	var s = new E.FlySim(brain, Object.assign({seed: seed}, opts || {}));
	s.setSilenced(silenced);
	s.setForced(forced, forcedRate);
	return s;
}
var liveParams = {};
function post(m, tr) { self.postMessage(m, tr || []); }

function loop() {
	if (!sim || busy) { lastReal = performance.now(); return; }
	var now = performance.now(), dReal = Math.min(100, now - lastReal); lastReal = now;
	var stepped = 0;
	if (running) {
		simDebt += dReal * speed;
		var t0 = performance.now();
		while (simDebt >= 1 && performance.now() - t0 < 13) {
			var nEv = sim.body.events.length;
			sim.tick(); simDebt -= 1; stepped++;
			if (sim.body.events.length > nEv) newEvents = newEvents.concat(sim.body.events.slice(nEv));
			checkCollisions();
		}
		if (simDebt > 50) simDebt = 50;      // cannot keep up: run slower than requested
	}
	rtfAcc += stepped; rtfReal += dReal;
	if (rtfReal > 500) { rtf = rtfAcc / rtfReal; rtfAcc = 0; rtfReal = 0; }
	sendFrame();
}

function checkCollisions() {
	var w = sim.world, b = sim.body;
	for (var i = 0; i < w.objects.length; i++) {
		var o = w.objects[i];
		if (o.kind !== 'loom' || o.hitChecked) continue;
		var d = Math.hypot(o.x - b.x, o.y - b.y, o.z - b.z);
		if (d < o.r + 1.5) { o.hitChecked = true; var ev = {t: sim.t, e: 'hit'}; b.events.push(ev); newEvents.push(ev); }
		else if (o.age >= o.life - 1) { o.hitChecked = true; ev = {t: sim.t, e: 'missed'}; b.events.push(ev); newEvents.push(ev); }
	}
}

function sendFrame() {
	var b = sim.body, w = sim.world;
	var spikes = Int32Array.from(sim.frameSpikes.length > 60000 ? sim.frameSpikes.slice(0, 60000) : sim.frameSpikes);
	var nSp = sim.frameSpikes.length;
	for (var k = 0; k < sim.frameSpikes.length; k++) typeCounts[brain.type[sim.frameSpikes[k]]]++;
	sim.frameSpikes = [];
	var motor = {};
	for (k in sim.motor) motor[k] = [sim.motor[k].rateL, sim.motor[k].rateR];
	var objs = w.objects.map(function (o) {
		var fd = w.flyDir(b, o.x, o.y, o.z);
		return {x: o.x, y: o.y, z: o.z, r: o.r, kind: o.kind, az: fd.az, el: fd.el, theta: o.theta || 0};
	});
	var sens = {};
	for (k in sim.sensors) { var ch = sim.sensors[k], s = 0; if (ch.on) for (var j = 0; j < ch.rate.length; j++) s += ch.rate[j]; sens[k] = ch.idx.length ? s / ch.idx.length : 0; }
	typeTimer++;
	var top = null;
	if (typeTimer >= 15) {
		typeTimer = 0; top = [];
		for (k = 0; k < typeCounts.length; k++) if (typeCounts[k]) top.push([k, typeCounts[k]]);
		top.sort(function (a, c) { return c[1] - a[1]; }); top = top.slice(0, 14);
		typeCounts.fill(0);
	}
	post({type: 'frame', t: sim.t, rtf: rtf, running: running,
		body: {x: b.x, y: b.y, z: b.z, heading: b.heading, v: b.v, omega: b.omega, airborne: b.airborne, proboscis: b.proboscis,
			headYaw: b.headYaw, antenna: b.antenna, wingPhase: b.wingPhase, legPhase: b.legPhase, flightPower: b.flightPower, cmd: b.cmd, loomAcc: b.loomAcc, vx: b.vx, vy: b.vy},
		world: {W: w.W, H: w.H, objects: objs, sounds: w.sounds, food: w.food, co2: w.co2, wind: w.wind, touch: w.touch && sim.t < w.touch.until ? w.touch.part : null},
		motor: motor, sens: sens, events: newEvents, spikes: spikes, nSpikes: nSp, nActive: sim.nActive, top: top}, [spikes.buffer]);
	newEvents = [];
}

/* ------------------------------------------------------------ stimuli */
function stim(m) {
	var w = sim.world;
	switch (m.kind) {
	case 'loom': w.addLoom(sim, m.az, m.el || 0, {radius: m.radius, speed: m.speed, dist: m.dist}); break;
	case 'passer': w.addPasser(sim, m.az, {}); break;
	case 'sound': w.sounds.push({x: m.x, y: m.y, freq: m.freq, amp: m.amp, pulsed: m.pulsed, on: true}); break;
	case 'wind': w.wind = {on: m.on, dir: m.dir, speed: m.speed}; break;
	case 'food': w.food.push({x: m.x, y: m.y, r: m.r || 3, amount: 1, kind: m.flavor}); break;
	case 'co2': w.co2.push({x: m.x, y: m.y, strength: m.strength || 2}); break;
	case 'touch': w.touch = {part: m.part, until: sim.t + (m.dur || 300)}; break;
	case 'clear':
		w.objects = []; w.sounds = []; w.food = []; w.co2 = []; w.wind = {on: false, dir: 0, speed: 0}; w.touch = null; break;
	case 'moveFly': sim.body.x = m.x; sim.body.y = m.y; if (m.heading !== undefined) sim.body.heading = m.heading; sim.body.v = 0; break;
	}
}

/* ------------------------------------------------------------ experiments */
var PROTOCOLS = {
	loomL:  {label: 'Looming disc from the left',  dur: 700, setup: function (s) { s._stimAt = 100; s._stim = function () { s.world.addLoom(s, -90, 10); }; }},
	loomR:  {label: 'Looming disc from the right', dur: 700, setup: function (s) { s._stimAt = 100; s._stim = function () { s.world.addLoom(s, 90, 10); }; }},
	loomF:  {label: 'Looming disc from the front', dur: 700, setup: function (s) { s._stimAt = 100; s._stim = function () { s.world.addLoom(s, 0, 10); }; }},
	loomB:  {label: 'Looming disc from behind',    dur: 700, setup: function (s) { s._stimAt = 100; s._stim = function () { s.world.addLoom(s, 180, 10); }; }},
	loomUp: {label: 'Looming disc from above',     dur: 700, setup: function (s) { s._stimAt = 100; s._stim = function () { s.world.addLoom(s, 0, 70); }; }},
	sugar:  {label: 'Sugar drop under the head',   dur: 600, setup: function (s) { s.world.food.push({x: 1.2, y: 0, r: 3, amount: 1, kind: 'sugar'}); }},
	bitter: {label: 'Bitter drop under the head',  dur: 600, setup: function (s) { s.world.food.push({x: 1.2, y: 0, r: 3, amount: 1, kind: 'bitter'}); }},
	touchHead: {label: 'Touch on the head bristles', dur: 600, setup: function (s) { s.world.touch = {part: 'head', until: 300}; }},
	touchAntL: {label: 'Touch on the left antenna', dur: 600, setup: function (s) { s.world.touch = {part: 'antL', until: 300}; }},
	songL:  {label: 'Pulse song (200 Hz) from the left', dur: 600, setup: function (s) { s.world.sounds.push({x: -3, y: 15, freq: 200, amp: 3, pulsed: true, on: true}); }},
	windF:  {label: 'Wind from the front', dur: 600, setup: function (s) { s.world.wind = {on: true, dir: Math.PI, speed: 2}; }},
	co2:    {label: 'CO2 plume ahead', dur: 600, setup: function (s) { s.world.co2.push({x: 6, y: 0, strength: 2}); }},
	odor:   {label: 'Food odour ahead', dur: 600, setup: function (s) { s.world.food.push({x: 12, y: 0, r: 3, amount: 1, kind: 'sugar'}); }}
};

function runTrial(protoKey, les, seed, frc) {
	var P = PROTOCOLS[protoKey];
	var s = new E.FlySim(brain, Object.assign({seed: seed * 7919 + 1}, liveParams));
	s.setSilenced(les);
	if (frc && frc.length) s.setForced(frc, forcedRate);
	P.setup(s);
	var hit = null, gfFirst = null;
	for (var t = 0; t < P.dur; t++) {
		if (s._stim && t === s._stimAt) s._stim();
		var gfBefore = s.motor.gf.spikesL + s.motor.gf.spikesR;
		s.tick();
		if (gfFirst === null) { var gc = 0; for (var q = 0; q < s.motor.gf.all.length; q++) gc += s.spikeCount[s.motor.gf.all[q]]; if (gc > 0) gfFirst = s.t; }
		var w = s.world, b = s.body;
		for (var i = 0; i < w.objects.length; i++) {
			var o = w.objects[i];
			if (o.kind === 'loom' && hit === null && Math.hypot(o.x - b.x, o.y - b.y, o.z - b.z) < o.r + 1.5) hit = s.t;
		}
		frameDrain(s);
	}
	var res = {spikes: {}, total: 0};
	for (var k in s.motor) { var c = 0; for (q = 0; q < s.motor[k].all.length; q++) c += s.spikeCount[s.motor[k].all[q]]; res.spikes[k] = c; }
	for (i = 0; i < s.N; i++) res.total += s.spikeCount[i];
	var to = s.body.events.filter(function (e) { return e.e === 'takeoff'; })[0];
	res.takeoff = to ? 1 : 0; res.takeoffT = to ? to.t : null; res.mode = to ? (to.mode.indexOf('short') === 0 ? 'GF' : 'long') : '';
	res.hit = hit !== null && (!to || to.t > hit) ? 1 : 0;
	res.gfFirst = gfFirst;
	res.turn = s.body.turnAccum / (Math.PI / 180);
	res.dist = Math.hypot(s.body.x, s.body.y);
	res.odometer = s.body.odometer;
	res.maxProb = 0;
	return res;
}
function frameDrain(s) { s.frameSpikes.length = 0; }

function summarize(trials) {
	var n = trials.length, out = {n: n, spikes: {}};
	function mean(f) { var v = trials.map(f).filter(function (x) { return x !== null && !isNaN(x); }); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; }
	out.takeoff = mean(function (r) { return r.takeoff; });
	out.takeoffT = mean(function (r) { return r.takeoffT; });
	out.gfMode = mean(function (r) { return r.takeoff ? (r.mode === 'GF' ? 1 : 0) : null; });
	out.hit = mean(function (r) { return r.hit; });
	out.turn = mean(function (r) { return r.turn; });
	out.dist = mean(function (r) { return r.dist; });
	out.total = mean(function (r) { return r.total; });
	for (var k in trials[0].spikes) out.spikes[k] = mean(function (r) { return r.spikes[k]; });
	return out;
}

async function experiment(m) {
	busy = true;
	try {
		var conds = m.conditions;     // [{label, silence:[...], forced:[...]}]
		var results = [];
		var total = conds.length * m.trials, done = 0;
		for (var c = 0; c < conds.length; c++) {
			var trials = [];
			for (var tr = 0; tr < m.trials; tr++) {
				trials.push(runTrial(m.protocol, conds[c].silence || [], tr + 1, conds[c].forced));
				done++;
				post({type: 'expProgress', id: m.id, done: done, total: total, label: conds[c].label});
				await new Promise(function (r) { setTimeout(r, 0); });
				if (cancelFlag) { cancelFlag = false; post({type: 'expCancelled', id: m.id}); busy = false; return; }
			}
			results.push({label: conds[c].label, n: (conds[c].silence || []).length, summary: summarize(trials), trials: trials.map(function (t) { return {takeoff: t.takeoff, takeoffT: t.takeoffT, mode: t.mode, hit: t.hit, gf: t.spikes.gf, prob: t.spikes.prob, turn: t.turn}; })});
			post({type: 'expPartial', id: m.id, results: results});
		}
		post({type: 'expResult', id: m.id, protocol: m.protocol, protocolLabel: PROTOCOLS[m.protocol].label, kind: m.kind, results: results});
	} catch (err) { post({type: 'error', message: 'Experiment failed: ' + err.message}); }
	busy = false; lastReal = performance.now();
}
var cancelFlag = false;

/* upstream partners of a set of neurons, aggregated by cell type (1 or 2 hops) */
function upstream(targets, hops, k) {
	var N = brain.N, tgt = new Float32Array(N);
	targets.forEach(function (i) { tgt[i] = 1; });
	var score = new Float64Array(N);
	var rp = brain.rowptr, post = brain.post, w = brain.w;
	for (var i = 0; i < N; i++) for (var j = rp[i]; j < rp[i + 1]; j++) if (tgt[post[j]]) score[i] += w[j];
	if (hops > 1) {
		var s2 = new Float64Array(N), norm = new Float64Array(N);
		// normalised by the target's total input so weights are fractions
		for (i = 0; i < N; i++) for (j = rp[i]; j < rp[i + 1]; j++) if (score[post[j]] !== 0) s2[i] += w[j] * Math.sign(score[post[j]]) * Math.min(1, Math.abs(score[post[j]]) / 200);
		for (i = 0; i < N; i++) score[i] += s2[i] * 0.5;
	}
	var byType = {};
	for (i = 0; i < N; i++) if (score[i] !== 0 && !tgt[i]) { var t = brain.type[i]; byType[t] = (byType[t] || 0) + score[i]; }
	var list = Object.keys(byType).map(function (t) { return [+t, byType[t]]; });
	list.sort(function (a, b) { return Math.abs(b[1]) - Math.abs(a[1]); });
	return list.slice(0, k);
}

self.onmessage = function (e) {
	var m = e.data;
	switch (m.type) {
	case 'init': load(m.base).catch(function (err) { post({type: 'error', message: err.message}); }); break;
	case 'run': running = m.on; lastReal = performance.now(); break;
	case 'speed': speed = m.speed; break;
	case 'silence': silenced = m.list; if (sim) sim.setSilenced(silenced); break;
	case 'force': forced = m.list; forcedRate = m.rate || 150; if (sim) sim.setForced(forced, forcedRate); break;
	case 'params': Object.assign(liveParams, m.params); if (sim) Object.assign(sim.params, m.params); break;
	case 'stim': if (sim) stim(m); break;
	case 'reset':
		sim = makeSim(m.seed || 1, liveParams); newEvents = [{t: 0, e: 'reset'}]; break;
	case 'experiment': experiment(m); break;
	case 'cancel': cancelFlag = true; break;
	case 'upstream': post({type: 'upstream', id: m.id, list: upstream(m.targets, m.hops || 1, m.k || 20)}); break;
	case 'protocols': post({type: 'protocols', list: Object.keys(PROTOCOLS).map(function (k) { return {key: k, label: PROTOCOLS[k].label}; })}); break;
	}
};
