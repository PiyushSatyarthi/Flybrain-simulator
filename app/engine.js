/* FlyLab engine — whole-brain spiking model of Drosophila + virtual body + world.
 *
 * BRAIN   139,255 leaky integrate-and-fire neurons, 2.7M connections, FlyWire FAFB v783.
 *         Parameters from Shiu et al. 2024 (Nature 634:210) whole-brain LIF model:
 *         V_rest -52 mV, V_th -45 mV, tau_m 20 ms, tau_syn 5 ms, refractory 2.2 ms,
 *         synaptic delay 1.8 ms, 0.275 mV per synapse, sign from predicted transmitter
 *         (ACh +, GABA -, Glu -). Integrated at dt = 1 ms (event-driven active set).
 * SENSES  World physics -> firing rates of identified sensory / feature-detector neurons.
 * BODY    Reads ONLY spike rates of identified descending and motor neurons (MOTOR_MAP).
 *         There is no behaviour logic: nothing here knows what stimulus is present or
 *         which neurons were silenced. Lesions act only on the brain.
 */
(function (root) {
'use strict';

/* ------------------------------------------------------------ constants */
var DT = 1;                 // ms
var TAU_M = 20, TAU_SYN = 5, V_TH = 7;   // mV above rest
var REF_STEPS = 2, DELAY = 2, SLOTS = 3;
var DEG = Math.PI / 180;

/* Descending / motor neuron readout. This table is the ONLY place where the body
 * is told what brain output means. It stands in for the ventral nerve cord, which
 * is not part of the FAFB brain connectome. Each entry cites the experiment that
 * established the function of that neuron type. */
var MOTOR_MAP = [
	{key: 'fwd',   label: 'Forward walking',        types: ['DNp09'],                 ref: 'Bidaye et al. 2020 (P9 = DNp09)'},
	{key: 'bwd',   label: 'Backward walking',       types: ['MDN', 'DNp42'],          ref: 'Bidaye et al. 2014 (moonwalker); Braun et al. 2024'},
	{key: 'turn',  label: 'Ipsilateral turning',    types: ['DNa01', 'DNa02', 'DNb02'], ref: 'Rayshubskiy et al. 2020; Yang et al. 2024; Braun et al. 2024'},
	{key: 'groom', label: 'Foreleg rubbing (grooming)', types: ['DNg11'],             ref: 'Braun et al. 2024'},
	{key: 'gf',    label: 'Giant-fibre escape jump',types: ['DNp01'],                 ref: 'von Reyn et al. 2014 (DNp01 = Giant Fiber)'},
	{key: 'loom',  label: 'Looming takeoff (long mode)', types: ['DNp02', 'DNp04', 'DNp06', 'DNp11'], ref: 'von Reyn 2014; Ache et al. 2019 — hypothesised'},
	{key: 'power', label: 'Flight power',           types: ['DNg02_a','DNg02_b','DNg02_c','DNg02_d','DNg02_e','DNg02_f','DNg02_g','DNg02_h'], ref: 'Namiki et al. 2022'},
	{key: 'land',  label: 'Landing',                types: ['DNp07', 'DNp10'],        ref: 'Ache et al. 2019'},
	{key: 'prob',  label: 'Proboscis motor neurons',subclasses: ['proboscis_motor_neuron', 'haustellum_motor_neuron'], ref: 'Shiu et al. 2024 (MN9 etc.)'},
	{key: 'ingest',label: 'Ingestion (pharyngeal pump)', subclasses: ['ingestion_motor_neuron'], ref: 'FlyWire motor annotation'},
	{key: 'neck',  label: 'Neck motor neurons',     subclasses: ['neck_motor_neuron'],        ref: 'FlyWire motor annotation'},
	{key: 'ant',   label: 'Antennal motor neurons', subclasses: ['antennal_motor_neuron'],    ref: 'FlyWire motor annotation'}
];

/* Sensory entry points. Each channel is a set of identified neurons whose firing
 * rate is set by the physics of the world (transduction). */
var SENSOR_DEFS = {
	loomLPLC2: {types: ['LPLC2'], label: 'LPLC2 looming detectors', rf: 30},
	loomLC4:   {types: ['LC4'],   label: 'LC4 looming detectors', rf: 30},
	loomLPLC1: {types: ['LPLC1'], label: 'LPLC1 looming detectors', rf: 25},
	loomLC6:   {types: ['LC6'],   label: 'LC6 looming detectors', rf: 25},
	smallLC11: {types: ['LC11'],  label: 'LC11 small-object detectors', rf: 20},
	smallLC10: {types: ['LC10a'], label: 'LC10a small-object detectors', rf: 20},
	photo:     {types: ['R1-6', 'R7', 'R8'], label: 'Photoreceptors R1-R8 (pure-retina mode)', rf: 6},
	joA:  {prefix: 'JO-A', label: 'Johnston organ A (high-freq sound)'},
	joB:  {prefix: 'JO-B', label: 'Johnston organ B (low-freq sound / song)'},
	joD:  {prefix: 'JO-D', label: 'Johnston organ D (vibration)'},
	joC:  {prefix: 'JO-C', label: 'Johnston organ C (wind push)'},
	joE:  {prefix: 'JO-E', label: 'Johnston organ E (wind pull)'},
	headBristle: {subclasses: ['head bristle'], label: 'Head bristles'},
	eyeBristle:  {subclasses: ['eye bristle'], label: 'Eye bristles'},
	antBristle:  {types: ['BM_Ant'], label: 'Antennal bristles'},
	ornFood: {types: ['ORN_DM1','ORN_DM2','ORN_DM3','ORN_DM4','ORN_DP1m','ORN_VA2','ORN_VM2'], label: 'Food-odour ORNs (vinegar glomeruli)'},
	ornCO2:  {types: ['ORN_V'], label: 'CO2 ORNs (V glomerulus)'},
	sugar:   {subclasses: ['sugar/water'], label: 'Sugar/water GRNs (labellum)'},
	bitter:  {subclasses: ['bitter'], label: 'Bitter GRNs (labellum)'}
};

/* ------------------------------------------------------------ utilities */
function RNG(seed) { this.s = (seed >>> 0) || 1; }
RNG.prototype.next = function () {           // xorshift32 -> [0,1)
	var x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x >>> 0;
	return this.s / 4294967296;
};
RNG.prototype.poisson = function (lam) {
	if (lam < 30) { var L = Math.exp(-lam), k = 0, p = 1; do { k++; p *= this.next(); } while (p > L); return k - 1; }
	var n = lam + Math.sqrt(lam) * gauss(this); return n < 0 ? 0 : Math.round(n);
};
function gauss(r) { var u = r.next() || 1e-9, v = r.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function wrapDeg(a) { a = (a + 180) % 360; if (a < 0) a += 360; return a - 180; }
function angDist(az1, el1, az2, el2) {       // great-circle distance in degrees
	var a1 = az1 * DEG, e1 = el1 * DEG, a2 = az2 * DEG, e2 = el2 * DEG;
	var c = Math.sin(e1) * Math.sin(e2) + Math.cos(e1) * Math.cos(e2) * Math.cos(a1 - a2);
	return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}
function sat(x) { return x <= 0 ? 0 : 1 - Math.exp(-x); }

/* ------------------------------------------------------------ connectome */
function parseBrain(buf, meta) {
	var dv = new DataView(buf), o = 0;
	var magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
	if (magic !== 'FLY1') throw new Error('bad brain file');
	var N = dv.getUint32(4, true), E = dv.getUint32(8, true); o = 12;
	function take(T, n, bytes) { var a = new T(buf.slice(o, o + n * bytes)); o += n * bytes; return a; }
	var b = {N: N, E: E, meta: meta};
	b.rowptr = take(Uint32Array, N + 1, 4);
	b.post = take(Uint32Array, E, 4);
	b.w = take(Int16Array, E, 2);
	b.side = take(Uint8Array, N, 1); b.sc = take(Uint8Array, N, 1); b.cl = take(Uint8Array, N, 1);
	b.sub = take(Uint8Array, N, 1); b.nt = take(Uint8Array, N, 1); b.np = take(Uint8Array, N, 1);
	b.type = take(Uint16Array, N, 2);
	b.pos = take(Int16Array, N * 3, 2);
	b.az = take(Int16Array, N, 2); b.el = take(Int16Array, N, 2);
	/* lookup helpers */
	b.typeIndex = {}; meta.types.forEach(function (t, i) { b.typeIndex[t] = i; });
	b.subIndex = {}; meta.subclasses.forEach(function (t, i) { b.subIndex[t] = i; });
	b.byType = function (names) {
		var want = {}; names.forEach(function (n) { if (b.typeIndex[n] !== undefined) want[b.typeIndex[n]] = 1; });
		var out = []; for (var i = 0; i < N; i++) if (want[b.type[i]]) out.push(i); return out;
	};
	b.byPrefix = function (p) {
		var want = {}; meta.types.forEach(function (t, i) { if (t.indexOf(p) === 0) want[i] = 1; });
		var out = []; for (var i = 0; i < N; i++) if (want[b.type[i]]) out.push(i); return out;
	};
	b.bySub = function (names) {
		var want = {}; names.forEach(function (n) { if (b.subIndex[n] !== undefined) want[b.subIndex[n]] = 1; });
		var out = []; for (var i = 0; i < N; i++) if (want[b.sub[i]]) out.push(i); return out;
	};
	return b;
}

/* ------------------------------------------------------------ simulator */
function FlySim(brain, opts) {
	opts = opts || {};
	this.b = brain;
	var N = brain.N;
	this.N = N;
	this.params = {
		wSyn: 0.275,            // mV per synapse (Shiu et al. 2024)
		bgRate: 0,              // Hz of random background synaptic kicks per neuron
		bgKick: 10,             // synapse-equivalents per background kick
		maxSensoryRate: 200,    // Hz
		visualMode: 'features', // 'features' (LC/LPLC detectors) or 'retina' (photoreceptors)
		adaptInc: 1.0,          // mV added to adaptation per spike
		adaptTau: 300,          // ms
		stdU: 0.1,              // fraction of synaptic resources used per spike (Tsodyks-Markram)
		stdTau: 200,            // ms recovery
		speed: 1
	};
	for (var k in opts) this.params[k] = opts[k];
	this.u = new Float32Array(N); this.g = new Float32Array(N);
	this.ref = new Uint8Array(N);
	this.a = new Float32Array(N);          // spike-frequency adaptation (mV)
	this.xr = new Float32Array(N).fill(1); // synaptic resources (short-term depression)
	this.lastSp = new Float32Array(N).fill(-1e9);
	this.silenced = new Uint8Array(N);
	this.forced = new Float32Array(N);      // optogenetic activation rate (Hz)
	this.forcedList = [];
	this.active = new Int32Array(N); this.isActive = new Uint8Array(N); this.nActive = 0;
	this.pend = []; this.touched = []; this.nTouched = [];
	for (var s = 0; s < SLOTS; s++) { this.pend.push(new Float32Array(N)); this.touched.push(new Int32Array(N)); this.nTouched.push(0); }
	this.spiked = new Int32Array(N); this.nSpiked = 0;
	this.spikeCount = new Uint32Array(N);    // cumulative since last reset of counters
	this.frameSpikes = []; // neuron indices that spiked since last UI frame
	this.t = 0; this.step = 0;
	this.rng = new RNG(opts.seed || 12345);
	this.decayG = Math.exp(-DT / TAU_SYN);
	this.kM = DT / TAU_M;
	this._buildIO();
	this.world = new World(this);
	this.body = new Body(this);
}

FlySim.prototype._buildIO = function () {
	var b = this.b, self = this;
	/* sensors */
	this.sensors = {};
	Object.keys(SENSOR_DEFS).forEach(function (k) {
		var d = SENSOR_DEFS[k], idx = [];
		if (d.types) idx = idx.concat(b.byType(d.types));
		if (d.prefix) idx = idx.concat(b.byPrefix(d.prefix));
		if (d.subclasses) idx = idx.concat(b.bySub(d.subclasses));
		var n = idx.length, ch = {key: k, label: d.label, idx: new Int32Array(idx), rate: new Float32Array(n),
			side: new Uint8Array(n), az: new Float32Array(n), el: new Float32Array(n), rf: d.rf || 0};
		for (var j = 0; j < n; j++) {
			var i = idx[j]; ch.side[j] = b.side[i];
			ch.az[j] = b.az[i] === -32768 ? NaN : b.az[i] / 10; ch.el[j] = b.el[i] === -32768 ? NaN : b.el[i] / 10;
		}
		self.sensors[k] = ch;
	});
	/* motor readout groups */
	this.motor = {};
	MOTOR_MAP.forEach(function (m) {
		var idx = [];
		if (m.types) idx = idx.concat(b.byType(m.types));
		if (m.subclasses) idx = idx.concat(b.bySub(m.subclasses));
		var L = [], R = [];
		idx.forEach(function (i) { (b.side[i] === 1 ? R : L).push(i); });
		self.motor[m.key] = {key: m.key, label: m.label, ref: m.ref, L: L, R: R, all: idx,
			rateL: 0, rateR: 0, spikesL: 0, spikesR: 0};
	});
	this.isMotor = new Int8Array(this.N).fill(-1);
	MOTOR_MAP.forEach(function (m, mi) { self.motor[m.key].all.forEach(function (i) { self.isMotor[i] = mi; }); });
};

FlySim.prototype._activate = function (i) {
	if (!this.isActive[i]) { this.isActive[i] = 1; this.active[this.nActive++] = i; }
};

FlySim.prototype._spike = function (i) {
	this.u[i] = 0; this.ref[i] = REF_STEPS; this.a[i] += this.params.adaptInc;
	this.spiked[this.nSpiked++] = i;
	this.spikeCount[i]++;
	/* short-term synaptic depression (lazy recovery) */
	var P = this.params, x = this.xr[i];
	if (P.stdU > 0) {
		x = 1 - (1 - x) * Math.exp(-(this.t - this.lastSp[i]) / P.stdTau);
		this.lastSp[i] = this.t;
		this.xr[i] = x - P.stdU * x;
	} else x = 1;
	var slot = (this.step + DELAY) % SLOTS, pend = this.pend[slot], tch = this.touched[slot];
	var rp = this.b.rowptr, post = this.b.post, w = this.b.w, nt = this.nTouched[slot];
	for (var j = rp[i], e = rp[i + 1]; j < e; j++) {
		var q = post[j];
		if (pend[q] === 0) tch[nt++] = q;
		pend[q] += w[j] * x;
		if (pend[q] === 0) pend[q] = 1e-12;   // keep 'touched' semantics
	}
	this.nTouched[slot] = nt;
	var mi = this.isMotor[i];
	if (mi >= 0) { var m = this.motor[MOTOR_MAP[mi].key]; if (this.b.side[i] === 1) m.spikesR++; else m.spikesL++; }
};

/* one millisecond of brain time */
FlySim.prototype.brainStep = function () {
	var u = this.u, g = this.g, ref = this.ref, sil = this.silenced, rng = this.rng;
	var slot = this.step % SLOTS, pend = this.pend[slot], tch = this.touched[slot], nt = this.nTouched[slot];
	var wSyn = this.params.wSyn;
	/* 1. deliver synaptic input arriving now */
	for (var k = 0; k < nt; k++) {
		var q = tch[k]; g[q] += pend[q] * wSyn; pend[q] = 0; this._activate(q);
	}
	this.nTouched[slot] = 0;
	/* 2. background synaptic noise */
	if (this.params.bgRate > 0) {
		var nb = rng.poisson(this.N * this.params.bgRate * DT / 1000), kick = this.params.bgKick * wSyn;
		for (k = 0; k < nb; k++) { var r = (rng.next() * this.N) | 0; g[r] += kick; this._activate(r); }
	}
	this.nSpiked = 0;
	/* 3. integrate neurons. With global arousal (tonic depolarisation + membrane noise)
	 *    every neuron is integrated; otherwise only the active set. */
	var i, dg = this.decayG, km = this.kM, act = this.active, aa = this.a, da = Math.exp(-DT / this.params.adaptTau);
	var bias = this.params.arousal || 0, sig = this.params.noise || 0;
	if (bias > 0 || sig > 0) {
		if (!this._denseOn) { for (var d = 0; d < this.N; d++) this._activate(d); this._denseOn = true; }
		var scl = sig * Math.sqrt(km);
		for (k = 0; k < this.nActive; k++) {
			i = act[k];
			g[i] *= dg;
			if (ref[i] > 0) { ref[i]--; u[i] = 0; continue; }
			var nz = sig > 0 ? (rng.next() + rng.next() + rng.next() - 1.5) * 2 * scl : 0;
			aa[i] *= da;
			u[i] += km * (g[i] + bias - aa[i] - u[i]) + nz;
			if (u[i] >= V_TH) { if (sil[i]) u[i] = 0; else this._spike(i); }
		}
	} else {
	if (this._denseOn) this._denseOn = false;
	for (k = 0; k < this.nActive; k++) {
		i = act[k];
		g[i] *= dg; aa[i] *= da;
		if (ref[i] > 0) { ref[i]--; u[i] = 0; }
		else {
			u[i] += km * (g[i] - aa[i] - u[i]);
			if (u[i] >= V_TH) { if (sil[i]) u[i] = 0; else this._spike(i); }
		}
		if (ref[i] === 0 && g[i] < 0.02 && g[i] > -0.02 && u[i] < 0.02 && u[i] > -0.02 && aa[i] < 0.02) {
			u[i] = 0; g[i] = 0; aa[i] = 0; this.isActive[i] = 0; act[k] = act[--this.nActive]; k--;
		}
	}
	}
	/* 4. transduction: sensory neurons fire at rates set by the world (Poisson) */
	var sensors = this.sensors, p1 = DT / 1000;
	for (var key in sensors) {
		var ch = sensors[key], rate = ch.rate, idx = ch.idx;
		if (!ch.on) continue;
		for (var j = 0; j < idx.length; j++) {
			if (rate[j] > 0 && rng.next() < rate[j] * p1) {
				var n = idx[j];
				if (!sil[n] && ref[n] === 0) { this._spike(n); this._activate(n); }
			}
		}
	}
	/* 5. optogenetic activation */
	for (k = 0; k < this.forcedList.length; k++) {
		var f = this.forcedList[k];
		if (!sil[f] && ref[f] === 0 && rng.next() < this.forced[f] * p1) { this._spike(f); this._activate(f); }
	}
	for (k = 0; k < this.nSpiked; k++) this.frameSpikes.push(this.spiked[k]);
	this.step++; this.t += DT;
};

FlySim.prototype.tick = function () {        // world + brain + body, 1 ms
	this.world.sense(this);
	this.brainStep();
	this.body.update(this);
	this.world.update(this);
};

FlySim.prototype.resetBrain = function () {
	this.u.fill(0); this.g.fill(0); this.ref.fill(0); this.a.fill(0); this.xr.fill(1); this.lastSp.fill(-1e9); this.isActive.fill(0); this.nActive = 0;
	for (var s = 0; s < SLOTS; s++) { this.pend[s].fill(0); this.nTouched[s] = 0; }
	this.spikeCount.fill(0); this.frameSpikes = [];
	for (var k in this.motor) { var m = this.motor[k]; m.rateL = m.rateR = 0; m.spikesL = m.spikesR = 0; }
};

FlySim.prototype.resetAll = function (seed) {
	this.resetBrain();
	this.rng = new RNG(seed || 12345);
	this.t = 0; this.step = 0;
	this.world = new World(this);
	this.body = new Body(this);
};

FlySim.prototype.setSilenced = function (list) {
	this.silenced.fill(0);
	for (var k = 0; k < list.length; k++) this.silenced[list[k]] = 1;
};
FlySim.prototype.setForced = function (list, rate) {
	for (var k = 0; k < this.forcedList.length; k++) this.forced[this.forcedList[k]] = 0;
	this.forcedList = list.slice();
	for (k = 0; k < list.length; k++) this.forced[list[k]] = rate;
};

/* ------------------------------------------------------------ body */
/* Physical body in a 2-D arena with altitude. Its only inputs are motor-group spike rates. */
function Body(sim) {
	this.x = 0; this.y = 0; this.z = 0;      // mm; z = altitude
	this.heading = 0;                         // radians, 0 = +x, counter-clockwise positive (left turn)
	this.v = 0; this.omega = 0;               // mm/s, rad/s
	this.vx = 0; this.vy = 0; this.vz = 0;
	this.airborne = false; this.flightPower = 0; this.reflexFlight = 0;
	this.takeoffTimer = -1; this.takeoffMode = '';
	this.loomAcc = 0;
	this.proboscis = 0; this.headYaw = 0; this.antenna = 0; this.wingPhase = 0; this.legPhase = 0;
	this.events = [];
	this.odometer = 0; this.turnAccum = 0;
}
var TAU_RATE = 40;              // ms, filter for spike-rate estimate
var BODY = {
	vFwdMax: 30, vBwdMax: 12, omegaMax: 500 * DEG,   // walking limits (mm/s, rad/s)
	R0: 40,                      // Hz per neuron at which a command reaches ~63% of max
	tauBody: 60,                 // ms, body inertia
	jumpV: 550, jumpAngle: 50 * DEG,   // GF jump (Card & Dickinson 2008 ~ 0.5 m/s)
	g: 9810,                      // mm/s^2
	flightSpeed: 180,             // mm/s forward airspeed at full power
	reflexTau: 1500,              // ms: VNC flight reflex after leg contact is lost
	loomThresh: 1.2, loomTau: 120
};
Body.prototype.rates = function (sim) {
	var a = Math.exp(-DT / TAU_RATE);
	for (var k in sim.motor) {
		var m = sim.motor[k];
		var nL = Math.max(1, m.L.length), nR = Math.max(1, m.R.length);
		m.rateL = m.rateL * a + (m.spikesL / nL) * (1000 / DT) * (1 - a);
		m.rateR = m.rateR * a + (m.spikesR / nR) * (1000 / DT) * (1 - a);
		m.spikesL = 0; m.spikesR = 0;
		m.lastL = m.L.length; m.lastR = m.R.length;
	}
};
Body.prototype.update = function (sim) {
	/* spike counts of this ms are in motor.spikesX (set during brainStep) */
	var M = sim.motor, dt = DT / 1000;
	var gfSpike = M.gf.spikesL + M.gf.spikesR;
	this.rates(sim);
	var R0 = BODY.R0;
	var fwd = sat((M.fwd.rateL + M.fwd.rateR) / 2 / R0);
	var bwd = sat((M.bwd.rateL + M.bwd.rateR) / 2 / R0);
	var turn = sat(M.turn.rateL / R0) - sat(M.turn.rateR / R0);   // + = left
	var power = sat((M.power.rateL + M.power.rateR) / 2 / R0);
	var land = sat((M.land.rateL + M.land.rateR) / 2 / R0);
	this.cmd = {fwd: fwd, bwd: bwd, turn: turn, power: power, land: land};
	this.proboscis += (sat((M.prob.rateL + M.prob.rateR) / 2 / R0) - this.proboscis) * 0.05;
	this.headYaw += ((sat(M.neck.rateL / R0) - sat(M.neck.rateR / R0)) * 25 * DEG - this.headYaw) * 0.05;
	this.antenna += (sat((M.ant.rateL + M.ant.rateR) / 2 / R0) - this.antenna) * 0.05;
	this.ingest = sat((M.ingest.rateL + M.ingest.rateR) / 2 / R0);

	var t = sim.t;
	if (!this.airborne) {
		/* take-off triggers: a single GF spike drives the TTM jump muscle via a monosynaptic
		 * VNC pathway (short mode); sustained looming-DN drive -> long-mode takeoff. */
		this.loomAcc += dt * 1000 / BODY.loomTau * (sat((M.loom.rateL + M.loom.rateR) / 2 / R0) * 3 - this.loomAcc);
		if (this.takeoffTimer < 0) {
			if (gfSpike > 0) { this.takeoffTimer = 5; this.takeoffMode = 'short (Giant Fiber)'; }
			else if (this.loomAcc > BODY.loomThresh) { this.takeoffTimer = 30; this.takeoffMode = 'long (non-GF)'; }
		}
		if (this.takeoffTimer >= 0) {
			this.takeoffTimer -= DT;
			if (this.takeoffTimer < 0) this._takeoff(sim);
		}
		var tb = DT / BODY.tauBody;
		var vCmd = BODY.vFwdMax * fwd - BODY.vBwdMax * bwd;
		this.v += (vCmd - this.v) * tb;
		this.omega += (BODY.omegaMax * turn - this.omega) * tb;
		this.heading += this.omega * dt;
		this.turnAccum += this.omega * dt;
		this.vx = this.v * Math.cos(this.heading); this.vy = this.v * Math.sin(this.heading);
		this.x += this.vx * dt; this.y += this.vy * dt;
		this.odometer += Math.abs(this.v) * dt;
		this.legPhase += Math.abs(this.v) * dt * 2 + Math.abs(this.omega) * dt * 0.6;
	} else {
		/* flight: VNC flight reflex (decays) + descending power, steering by turning DNs */
		this.reflexFlight *= Math.exp(-DT / BODY.reflexTau);
		this.flightPower = Math.min(1, this.reflexFlight + power) * (1 - 0.8 * land);
		this.omega += (BODY.omegaMax * 0.6 * turn - this.omega) * DT / 80;
		this.heading += this.omega * dt; this.turnAccum += this.omega * dt;
		var sp = BODY.flightSpeed * this.flightPower;
		var ax = (sp * Math.cos(this.heading) - this.vx) * 4, ay = (sp * Math.sin(this.heading) - this.vy) * 4;
		this.vx += ax * dt; this.vy += ay * dt;
		var lift = BODY.g * 1.6 * this.flightPower;          // hover at power ~0.63
		this.vz += (lift - BODY.g) * dt - this.vz * 3 * dt;
		this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
		this.odometer += Math.hypot(this.vx, this.vy) * dt;
		this.wingPhase += dt * 200 * 2 * Math.PI * (this.flightPower > 0.05 ? 1 : 0);
		if (this.z > 40) { this.z = 40; this.vz = Math.min(0, this.vz); }
		if (this.z <= 0 && this.vz <= 0 && t - this.takeoffT > 40) {
			this.z = 0; this.vz = 0; this.airborne = false; this.v = 0; this.omega = 0;
			this.events.push({t: t, e: 'landed'});
		}
	}
	/* arena walls */
	var W = sim.world.W / 2 - 1.5, H = sim.world.H / 2 - 1.5;
	if (this.x > W) { this.x = W; this.vx = -Math.abs(this.vx) * 0.3; }
	if (this.x < -W) { this.x = -W; this.vx = Math.abs(this.vx) * 0.3; }
	if (this.y > H) { this.y = H; this.vy = -Math.abs(this.vy) * 0.3; }
	if (this.y < -H) { this.y = -H; this.vy = Math.abs(this.vy) * 0.3; }
};
Body.prototype._takeoff = function (sim) {
	this.airborne = true; this.takeoffT = sim.t;
	var v0 = this.takeoffMode.indexOf('short') === 0 ? BODY.jumpV : BODY.jumpV * 0.6;
	this.vx = v0 * Math.cos(BODY.jumpAngle) * Math.cos(this.heading);
	this.vy = v0 * Math.cos(BODY.jumpAngle) * Math.sin(this.heading);
	this.vz = v0 * Math.sin(BODY.jumpAngle);
	this.reflexFlight = 0.9;
	this.events.push({t: sim.t, e: 'takeoff', mode: this.takeoffMode});
	this.takeoffTimer = -1; this.loomAcc = 0;
};

/* ------------------------------------------------------------ world */
function World(sim) {
	this.W = 160; this.H = 110;             // arena, mm
	this.objects = [];                      // looming / passing objects
	this.sounds = [];                       // {x,y,freq,amp,pulsed,on}
	this.wind = {on: false, dir: 0, speed: 0};  // dir: radians the wind blows TOWARD (world)
	this.food = [];                         // {x,y,r,amount,kind:'sugar'|'bitter'|'water'}
	this.co2 = [];                          // {x,y,strength}
	this.touch = null;                      // {part:'head'|'eyeL'|'eyeR'|'antL'|'antR', until}
	this.lastLoom = {};
}
/* fly-centred direction of a world point: azimuth (deg, + = fly's right), elevation */
World.prototype.flyDir = function (b, x, y, z) {
	var hx = b.x + Math.cos(b.heading) * 1.0, hy = b.y + Math.sin(b.heading) * 1.0, hz = b.z + 0.6;
	var dx = x - hx, dy = y - hy, dz = z - hz;
	var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
	var ang = Math.atan2(dy, dx) - b.heading;          // + = left (ccw)
	var az = -wrapDeg(ang / DEG);                      // + = right
	var el = Math.asin(Math.max(-1, Math.min(1, dz / Math.max(d, 1e-6)))) / DEG;
	return {az: az, el: el, d: d};
};
World.prototype.sense = function (sim) {
	var b = sim.body, S = sim.sensors, P = sim.params, t = sim.t;
	for (var k in S) S[k].on = false;
	var maxR = P.maxSensoryRate;

	/* ---- vision ---- */
	var retina = P.visualMode === 'retina';
	var loomKeys = ['loomLPLC2', 'loomLC4', 'loomLPLC1', 'loomLC6'], smallKeys = ['smallLC11', 'smallLC10'];
	var objs = [];
	for (var oi = 0; oi < this.objects.length; oi++) {
		var o = this.objects[oi];
		var fd = this.flyDir(b, o.x, o.y, o.z);
		var theta = 2 * Math.atan(o.r / Math.max(fd.d, o.r * 1.01)) / DEG;     // angular size, deg
		var prev = o._prev;
		var dTheta = prev ? (theta - prev.theta) / (DT / 1000) : 0;            // deg/s
		var dPos = prev ? angDist(fd.az, fd.el, prev.az, prev.el) / (DT / 1000) : 0;
		o._prev = {theta: theta, az: fd.az, el: fd.el};
		o.theta = theta; o.dTheta = dTheta;
		objs.push({az: fd.az, el: fd.el, theta: theta, dTheta: dTheta, dPos: dPos});
	}
	if (!retina) {
		for (var li = 0; li < loomKeys.length; li++) {
			var ch = S[loomKeys[li]]; if (!ch || !ch.idx.length) continue;
			ch.rate.fill(0); ch.on = objs.length > 0;
			for (oi = 0; oi < objs.length; oi++) {
				var ob = objs[oi];
				if (ob.dTheta <= 0) continue;
				/* expansion drive saturates (Klapoetke et al. 2017: LPLC2 tuned to radial expansion) */
				var sizeGate = Math.max(0, Math.min(1, (ob.theta - 8) / 25));
				var drive = ob.dTheta / (ob.dTheta + 300) * sizeGate * (ob.theta < 170 ? 1 : 0.2);
				for (var j = 0; j < ch.idx.length; j++) {
					if (isNaN(ch.az[j])) continue;
					var dist = angDist(ch.az[j], ch.el[j], ob.az, ob.el);
					var reach = ch.rf + ob.theta / 2;
					if (dist > reach + 30) continue;
					var ov = Math.exp(-Math.pow(Math.max(0, dist - ob.theta / 2), 2) / (2 * ch.rf * ch.rf));
					ch.rate[j] = Math.min(maxR, ch.rate[j] + maxR * drive * ov);
				}
			}
		}
		for (li = 0; li < smallKeys.length; li++) {
			ch = S[smallKeys[li]]; if (!ch || !ch.idx.length) continue;
			ch.rate.fill(0); ch.on = objs.length > 0;
			for (oi = 0; oi < objs.length; oi++) {
				ob = objs[oi];
				if (ob.theta > 25) continue;
				var sd = ob.dPos / (ob.dPos + 60) * (1 - ob.theta / 25);
				for (j = 0; j < ch.idx.length; j++) {
					if (isNaN(ch.az[j])) continue;
					dist = angDist(ch.az[j], ch.el[j], ob.az, ob.el);
					if (dist > ch.rf * 3) continue;
					ch.rate[j] = Math.min(maxR, ch.rate[j] + maxR * sd * Math.exp(-dist * dist / (2 * ch.rf * ch.rf)));
				}
			}
		}
	} else {
		/* pure-retina mode: photoreceptors report local darkening/brightening; everything
		 * after the retina (motion, looming) must be computed by the connectome itself. */
		ch = S.photo; ch.on = true;
		for (j = 0; j < ch.idx.length; j++) {
			var cov = 0;
			for (oi = 0; oi < objs.length; oi++) {
				ob = objs[oi]; if (isNaN(ch.az[j])) continue;
				dist = angDist(ch.az[j], ch.el[j], ob.az, ob.el);
				cov = Math.max(cov, dist < ob.theta / 2 ? 1 : Math.exp(-Math.pow(dist - ob.theta / 2, 2) / (2 * 25)));
			}
			var prevC = ch._cov ? ch._cov[j] : 0;
			if (!ch._cov) ch._cov = new Float32Array(ch.idx.length);
			var change = Math.abs(cov - prevC) / (DT / 1000);      // per second
			ch._cov[j] = cov;
			ch.rate[j] = Math.min(maxR, 5 + change * 20 + cov * 10);
		}
	}

	/* ---- antennae: sound (near-field particle velocity) and wind ---- */
	var antX = [], antY = [];
	for (var s = 0; s < 2; s++) {            // 0 = left antenna, 1 = right
		var off = (s === 0 ? 1 : -1) * 0.25;
		antX[s] = b.x + Math.cos(b.heading) * 1.1 - Math.sin(b.heading) * off;
		antY[s] = b.y + Math.sin(b.heading) * 1.1 + Math.cos(b.heading) * off;
	}
	var vib = [[0, 0], [0, 0], [0, 0]];     // [A,B,D][side]
	for (var si = 0; si < this.sounds.length; si++) {
		var snd = this.sounds[si]; if (!snd.on) continue;
		if (snd.pulsed) { var ph = (t % 35); if (ph > 8) continue; }   // courtship-song-like pulses, 35 ms IPI
		for (s = 0; s < 2; s++) {
			var ddx = snd.x - antX[s], ddy = snd.y - antY[s];
			var dd = Math.max(2, Math.hypot(ddx, ddy));
			var dirAng = Math.atan2(ddy, ddx) - b.heading;             // + = left
			var ipsi = s === 0 ? Math.sin(dirAng) : -Math.sin(dirAng); // 1 = source on this side
			var amp = snd.amp * Math.pow(10 / dd, 2) * (0.55 + 0.45 * ipsi);
			var f = snd.freq;
			var tA = Math.exp(-Math.pow(Math.log(f / 500), 2) / 0.5);  // JO-A: high frequency
			var tB = Math.exp(-Math.pow(Math.log(f / 180), 2) / 0.5);  // JO-B: song band
			var tD = Math.exp(-Math.pow(Math.log(f / 300), 2) / 0.8);
			vib[0][s] += amp * tA; vib[1][s] += amp * tB; vib[2][s] += amp * tD;
		}
	}
	var joKeys = ['joA', 'joB', 'joD'];
	for (var q = 0; q < 3; q++) {
		ch = S[joKeys[q]]; ch.on = vib[q][0] > 0 || vib[q][1] > 0;
		for (j = 0; j < ch.idx.length; j++) {
			var sideIdx = ch.side[j] === 1 ? 1 : 0;
			ch.rate[j] = Math.min(maxR, maxR * sat(vib[q][sideIdx]));
		}
	}
	/* wind: arista deflection. Push (JO-C) vs pull (JO-E) per antenna */
	var push = [0, 0], pull = [0, 0];
	if (this.wind.on && this.wind.speed > 0 && !b.airborne) {
		var rel = this.wind.dir - b.heading;       // direction wind blows toward, fly frame (+ = left)
		var wx = Math.cos(rel) * this.wind.speed, wy = Math.sin(rel) * this.wind.speed;   // wx<0 : wind from front
		for (s = 0; s < 2; s++) {
			var lat = s === 0 ? -wy : wy;          // >0 when wind comes from this side
			var back = -wx;                          // >0 when blowing backward (from the front)
			var defl = back * 0.7 + lat * 0.7;
			push[s] = Math.max(0, defl); pull[s] = Math.max(0, -defl);
		}
	}
	ch = S.joC; ch.on = true;
	for (j = 0; j < ch.idx.length; j++) ch.rate[j] = Math.min(maxR, maxR * sat(push[ch.side[j] === 1 ? 1 : 0] / 1.5));
	ch = S.joE; ch.on = true;
	for (j = 0; j < ch.idx.length; j++) ch.rate[j] = Math.min(maxR, maxR * sat(pull[ch.side[j] === 1 ? 1 : 0] / 1.5));

	/* ---- touch ---- */
	['headBristle', 'eyeBristle', 'antBristle'].forEach(function (k2) { S[k2].rate.fill(0); });
	if (this.touch && t < this.touch.until) {
		var part = this.touch.part, map = {head: ['headBristle', -1], eyeL: ['eyeBristle', 0], eyeR: ['eyeBristle', 1], antL: ['antBristle', 0], antR: ['antBristle', 1]};
		var mm = map[part];
		if (mm) {
			ch = S[mm[0]]; ch.on = true;
			for (j = 0; j < ch.idx.length; j++) if (mm[1] < 0 || ch.side[j] === mm[1]) ch.rate[j] = maxR * 0.8;
		}
	}

	/* ---- smell (plumes decay with distance) and taste (labellum contact) ---- */
	var hx = b.x + Math.cos(b.heading) * 1.2, hy = b.y + Math.sin(b.heading) * 1.2;
	var cFood = [0, 0], cCO2 = [0, 0];
	var sweet = 0, bitter = 0;
	for (var fi = 0; fi < this.food.length; fi++) {
		var fo = this.food[fi]; if (fo.amount <= 0) continue;
		for (s = 0; s < 2; s++) cFood[s] += fo.amount * Math.exp(-Math.hypot(fo.x - antX[s], fo.y - antY[s]) / 15);
		if (!b.airborne && Math.hypot(fo.x - hx, fo.y - hy) < fo.r) {
			if (fo.kind === 'bitter') bitter += 1; else sweet += fo.kind === 'water' ? 0.5 : 1;
			if (b.proboscis > 0.3 && b.ingest > 0.05) fo.amount = Math.max(0, fo.amount - b.ingest * 0.00005 * DT);
		}
	}
	for (fi = 0; fi < this.co2.length; fi++) {
		var c2 = this.co2[fi];
		for (s = 0; s < 2; s++) cCO2[s] += c2.strength * Math.exp(-Math.hypot(c2.x - antX[s], c2.y - antY[s]) / 20);
	}
	ch = S.ornFood; ch.on = true;
	for (j = 0; j < ch.idx.length; j++) { var cc = cFood[ch.side[j] === 1 ? 1 : 0]; ch.rate[j] = cc > 0.005 ? (maxR * 0.8) * cc / (cc + 0.3) : 0; }
	ch = S.ornCO2; ch.on = true;
	for (j = 0; j < ch.idx.length; j++) { cc = cCO2[ch.side[j] === 1 ? 1 : 0]; ch.rate[j] = cc > 0.005 ? (maxR * 0.8) * cc / (cc + 0.3) : 0; }
	ch = S.sugar; ch.on = sweet > 0; for (j = 0; j < ch.idx.length; j++) ch.rate[j] = sweet > 0 ? 150 * Math.min(1, sweet) : 0;
	ch = S.bitter; ch.on = bitter > 0; for (j = 0; j < ch.idx.length; j++) ch.rate[j] = bitter > 0 ? 150 : 0;
};
World.prototype.update = function (sim) {
	var dt = DT / 1000, b = sim.body;
	for (var i = this.objects.length - 1; i >= 0; i--) {
		var o = this.objects[i];
		o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
		o.age += DT;
		if (o.age > o.life) this.objects.splice(i, 1);
	}
};
/* stimulus helpers --------------------------------------------------------- */
/* looming disc approaching the fly's current position from a fly-relative direction */
World.prototype.addLoom = function (sim, azDeg, elDeg, opts) {
	opts = opts || {};
	var b = sim.body, r = opts.radius || 5, v = opts.speed || 250;     // mm, mm/s  (r/v = 20 ms)
	var dist = opts.dist || 120;
	var worldAng = b.heading - azDeg * DEG;                           // az + = right = clockwise
	var dir = {x: Math.cos(worldAng) * Math.cos(elDeg * DEG), y: Math.sin(worldAng) * Math.cos(elDeg * DEG), z: Math.sin(elDeg * DEG)};
	var hx = b.x + Math.cos(b.heading), hy = b.y + Math.sin(b.heading), hz = b.z + 0.6;
	var o = {x: hx + dir.x * dist, y: hy + dir.y * dist, z: hz + dir.z * dist, r: r,
		vx: -dir.x * v, vy: -dir.y * v, vz: -dir.z * v, age: 0, life: (dist - r * 0.2) / v * 1000, kind: 'loom'};
	this.objects.push(o); return o;
};
World.prototype.addPasser = function (sim, azDeg, opts) {  // small object flying past (not approaching)
	opts = opts || {};
	var b = sim.body, d = opts.dist || 25, v = opts.speed || 60;
	var worldAng = b.heading - azDeg * DEG;
	var cx = b.x + Math.cos(worldAng) * d, cy = b.y + Math.sin(worldAng) * d;
	var tx = -Math.sin(worldAng), ty = Math.cos(worldAng);
	var o = {x: cx - tx * 40, y: cy - ty * 40, z: 2, r: opts.radius || 1, vx: tx * v, vy: ty * v, vz: 0, age: 0, life: 80 / v * 1000, kind: 'passer'};
	this.objects.push(o); return o;
};

/* ------------------------------------------------------------ exports */
var API = {FlySim: FlySim, parseBrain: parseBrain, MOTOR_MAP: MOTOR_MAP, SENSOR_DEFS: SENSOR_DEFS, RNG: RNG, BODY: BODY};
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.FlyEngine = API;
})(typeof self !== 'undefined' ? self : this);
