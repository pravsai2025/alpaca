// Drift events: scoring and records for Drift Attack and Free Drift.
//
// DriftScore stands in for Score (same methods) while a drift event runs, so the
// driving, walls and traffic code in drive.js calls it exactly as it calls Score.
//
//  * A drift counts while the car slides 12°–110° above 25 km/h on the road.
//  * Points grow with angle × speed. Keep sliding and the multiplier climbs to ×5 (one step every 2.2 s).
//  * Straighten up for 1.1 s and the drift is banked (points × multiplier).
//  * A hard wall hit, a crash into traffic, a reset, or 0.6 s off the road loses the drift in progress.
//  * Drifting close past traffic adds a bonus to the drift in progress.

export const RULES = { minAngle: 12, maxAngle: 110, minKmh: 25, grace: 1.1, multEvery: 2.2, maxMult: 5, offTime: 0.6 };

// Medal targets per location for Drift Attack.
export const TARGETS = {
  circuit: [6000, 15000, 30000],
  city: [5000, 12000, 25000],
  highway: [5000, 12000, 25000],
};

const STORE = 'apex-drift-3d-v1';

function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (_) { return {}; } }
function save(d) { try { localStorage.setItem(STORE, JSON.stringify(d)); } catch (_) { /* storage blocked: keep playing */ } }

export const DriftRecords = {
  get() { const d = load(); d.best = d.best || {}; d.prefs = d.prefs || {}; d.points = d.points || 0; d.runs = d.runs || 0; return d; },
  put(d) { save(d); },
  best(world, mode) { const b = DriftRecords.get().best[world] || {}; return mode === 'free' ? b.free || 0 : b.attack || 0; },
  /** Store a finished run. Returns which records it beat. */
  submit(world, mode, score, combo, car) {
    const d = DriftRecords.get(), b = d.best[world] = d.best[world] || {}, key = mode === 'free' ? 'free' : 'attack', out = {};
    if (score > (b[key] || 0)) { b[key] = score; b[key + 'Car'] = car; out.best = true; }
    if (combo > (b.combo || 0)) { b.combo = combo; out.combo = true; }
    d.points += score; d.runs++;
    save(d);
    return out;
  },
};

export class DriftScore {
  constructor() { this.onEvent = null; this.enabled = true; this.reset('circuit', ''); }

  reset(world, car) {
    this.world = world; this.car = car;
    this.score = 0; this.mult = 1; this.comboT = 0; this.drift = 0; this.chain = 0; this.gap = 0; this.off = 0;
    this.angle = 0; this.bestCombo = 0; this.drifts = 0; this.t = 0; this.wallNear = false;
    this.best = DriftRecords.best(world, this.mode || 'attack');
  }

  _emit(label, pts, kind = 'good') { if (this.onEvent) this.onEvent({ label, pts: Math.round(pts), kind }); }

  /** Called by Drive every frame. slipDeg = body slip angle (0 when not moving forward), clean = on the road. */
  tick(dt, kmh, slipDeg, clean = true) {
    this.t += dt;
    if (!this.enabled) { this.angle = 0; return; }
    this.angle = slipDeg;
    const R = RULES, drifting = clean && slipDeg > R.minAngle && slipDeg < R.maxAngle && kmh > R.minKmh;
    if (!clean && this.drift > 0) { this.off += dt; if (this.off > R.offTime) { this.lose('Off the road'); return; } } else this.off = 0;
    if (drifting) {
      this.drift += dt * slipDeg * kmh * 0.05;
      this.chain += dt; this.gap = 0;
      this.mult = Math.min(R.maxMult, 1 + Math.floor(this.chain / R.multEvery));
    } else if (this.drift > 0) {
      this.gap += dt;
      if (this.gap > R.grace) this.bankDrift();
    }
    // Drive shows comboT / 6 as the bar under the multiplier: progress towards the next step
    this.comboT = this.drift > 0 ? (this.mult >= R.maxMult ? 6 : ((this.chain % R.multEvery) / R.multEvery) * 6) : 0;
  }

  bankDrift() {
    const pts = Math.round(this.drift * this.mult);
    if (pts >= 50) {
      this.score += pts; this.drifts++;
      this.bestCombo = Math.max(this.bestCombo, pts);
      this._emit(this.mult > 1 ? `Drift ×${this.mult}` : 'Drift', pts);
    }
    this.drift = 0; this.chain = 0; this.gap = 0; this.mult = 1; this.comboT = 0;
  }

  lose(reason) {
    const pts = Math.round(this.drift * this.mult);
    if (pts >= 50) this._emit(`${reason} — drift lost`, -pts, 'bad');
    this.drift = 0; this.chain = 0; this.gap = 0; this.mult = 1; this.comboT = 0; this.off = 0;
  }

  // ---- the hooks Drive calls
  wall() { if (this.drift > 0) this.lose('Wall'); }
  crash() { if (this.drift > 0) this.lose('Crash'); return null; }
  pass(gap, side, kmh) {
    if (this.drift > 0 && gap < 1.8) { const b = Math.round((1.8 - gap) * 160 * Math.max(1, kmh / 90)); this.drift += b; this._emit('Drift past traffic', b * this.mult, 'minor'); }
  }
  /** End of the run: bank the drift in progress and hand back the total. */
  bank() {
    if (this.drift > 0) this.bankDrift();
    return { total: Math.round(this.score), combo: this.bestCombo, drifts: this.drifts };
  }
}
