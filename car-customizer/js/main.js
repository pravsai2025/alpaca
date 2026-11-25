// APEX GARAGE — application entry point.
import * as THREE from 'three';
import { CARS, SUSPENSIONS, AIR_PRESETS, airPresetHeight, slamHeight, defaultAir, byId, defaultBuild, defaultSetup } from './data.js';
import { DRAG_DISTANCES, TREES } from './drag.js';
import { createStage } from './scene.js';
import { createMaterials, applyAppearance } from './materials.js';
import { Car } from './car.js';
import { EngineAudio } from './audio.js';
import { computeStats, buildSheet, resolve, maxDrop } from './stats.js';
import { initUI } from './ui.js';
import { Drive, TRANSMISSIONS, DRIVE_MODES, CUSTOM_DEFAULT, CAMERA_MODES, CHASE_VIEWS } from './drive.js';
import { Net } from './net.js';
import { RemoteCars } from './remote.js';
import { WORLDS } from './world.js';
import { Records } from './score.js';
import { DriftScore, DriftRecords, TARGETS as DRIFT_TARGETS } from './drift.js';

const STORE = 'apex-garage-saves-v2', OLD_STORE = 'apex-garage-build-v1';
const $ = id => document.getElementById(id);

const stage = createStage($('view'));
const M = createMaterials();
const car = new Car(M);
stage.scene.add(car.root);
const audio = new EngineAudio();
const drive = new Drive(stage, car, audio);

const app = {
  build: defaultBuild(CARS[0]),
  toggles: { xray: false, lights: false, turntable: false, dyno: false },
  slot: null, driving: false,
  car: () => byId(CARS, app.build.carId),
  stats: () => computeStats(app.build),
  stockStats: () => computeStats(defaultBuild(app.car())),
  sheet: () => buildSheet(app.build),
  statsFor: b => computeStats(b),
};

const PREF = 'apex-garage-drive-v1';
const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch (_) { return {}; } })();
const savePrefs = () => { try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (_) { /* ignore */ } };

// ---- engine state
const eng = { running: false, cranking: 0, rpm: 0, throttle: 0, input: 0, cut: 0, boost: 0 };
let stats = app.stats();

// ---- ride height. Air suspension has separate front / rear heights that glide to their targets.
const ride = { f: 0, r: 0, moving: false };
const hasAir = () => !!byId(SUSPENSIONS, app.build.susp.type).air;
/** Where the suspension is heading: metres below stock at the front and rear. */
function rideTarget(speed = 0) {
  const su = app.build.susp;
  if (!hasAir()) return { f: su.drop, r: su.drop };
  const a = su.air || (su.air = defaultAir());
  // Show mode lays the car out when parked and lifts it just clear of the road once it rolls
  const lim = a.preset === 'show' && speed > 2.5 ? slamHeight(app.car()) - 0.022 : Infinity;
  return { f: Math.min(a.f, lim), r: Math.min(a.r, lim) };
}
const snapRide = () => { const t = rideTarget(); ride.f = t.f; ride.r = t.r; };

function rebuild() {
  car.build(app.build);
  applyAppearance(M, app.build);
  snapRide(); car.applyStance(app.build, ride.f, ride.r);
  const S = car.S;
  stage.blob.scale.set(S.car.dims.L * 1.12, S.car.dims.W * 1.35, 1);
  audio.configure(resolve(app.build));
}

/** Apply a mutation to the build. level: 'rebuild' | 'look' | 'stance'. */
app.change = (fn, level = 'rebuild', rerender = true) => {
  fn(app.build);
  if (level === 'rebuild') rebuild();
  else if (level === 'look') applyAppearance(M, app.build);
  else { if (!hasAir()) snapRide(); car.applyStance(app.build, ride.f, ride.r); }
  stats = app.stats();
  ui.refresh(rerender);
};

app.selectCar = id => {
  if (id === app.build.carId) return;
  stopEngine(); app.slot = null;
  app.build = defaultBuild(byId(CARS, id));
  rebuild(); stats = app.stats(); ui.refresh(); app.view('q');
  ui.toast(`${app.car().brand} ${app.car().name} rolled in`);
};

app.view = (name, dur) => {
  const S = car.S, L = S.car.dims.L, t = [0, 0.6, 0];
  const far = L * 1.75;
  const v = {
    q: [[far * 0.72, 1.75, far * 0.74], t],
    front: [[far * 1.05, 1.05, 0.01], t],
    side: [[0, 0.95, far * 1.08], t],
    rear: [[-far * 1.05, 1.25, 0.01], t],
    top: [[0.01, far * 1.45, 0.02], [0, 0.3, 0]],
    wheel: [[S.xf + 1.5, 0.6, S.W / 2 + 2.3], [S.xf, 0.36, S.W / 2]],
    engine: [[car.engineX + (S.car.layout === 'front' ? 2.4 : -2.4), 2.5, 2.3], [car.engineX, 0.55, 0]],
  }[name];
  if (name === 'engine' && !app.toggles.xray) app.toggle('xray');
  stage.flyTo(v[0], v[1], dur);
};

app.toggle = name => {
  const on = app.toggles[name] = !app.toggles[name];
  if (name === 'xray') car.setXray(on);
  if (name === 'lights') car.setLights(on);
  if (name === 'turntable') stage.controls.autoRotate = on;
  if (name === 'dyno' && on && !eng.running) ui.toast('Dyno armed — start the engine and rev to spin the driven wheels');
  ui.refresh(false);
};

// ---- drag setup, saved per car (launch control, gearing, tyre pressures, boost)
app.setup = () => { const all = (prefs.setup = prefs.setup || {}), su = all[app.build.carId]; return { ...defaultSetup(), ...su, gears: (su && su.gears ? su.gears : defaultSetup().gears).slice() }; };
app.setSetup = patch => { const su = { ...app.setup(), ...patch }; prefs.setup[app.build.carId] = su; savePrefs(); drive.setSetup(su); return su; };
app.resetSetup = keys => { const d = defaultSetup(), patch = {}; for (const k of keys) patch[k] = Array.isArray(d[k]) ? d[k].slice() : d[k]; return app.setSetup(patch); };
/** Garage preview of the parachute, fully open behind the car. */
app.previewChute = on => { app.chutePreview = !!on; if (!on) car.chute.update(0, 0, 0, false); };

// ---- air suspension presets (work in the garage and while driving)
const airStore = () => (prefs.air = prefs.air || {});
const hiss = up => { if (audio.ensure()) audio._burst({ dur: up ? 0.7 : 1.0, f0: up ? 2400 : 5200, f1: up ? 4400 : 1200, q: 0.9, gain: 0.15 }); };
app.rideInfo = () => { const c = app.car(); return { f: Math.round((c.gc - ride.f) * 1000), r: Math.round((c.gc - ride.r) * 1000), preset: hasAir() ? (app.build.susp.air || defaultAir()).preset : null }; };
app.setAirPreset = id => {
  if (!hasAir()) return false;
  const p = byId(AIR_PRESETS, id), a = app.build.susp.air || (app.build.susp.air = defaultAir()), h = airPresetHeight(app.car(), p.id);
  hiss(h < (a.f + a.r) / 2); a.preset = p.id; a.f = a.r = h;
  airStore()[app.build.carId] = { ...a }; savePrefs(); stats = app.stats();
  if (!app.driving) ui.refresh();
  return p;
};
app.setAirHeight = (axle, metres) => {
  if (!hasAir()) return;
  const a = app.build.susp.air || (app.build.susp.air = defaultAir());
  a[axle] = metres; a.preset = 'custom'; airStore()[app.build.carId] = { ...a }; savePrefs(); stats = app.stats(); ui.refresh(false);
};
/** Called when air suspension is fitted: bring back this car's last air settings. */
app.restoreAir = build => { const saved = airStore()[build.carId]; build.susp.air = saved ? { ...defaultAir(), ...saved } : defaultAir(); };

// ---- saved cars (any number, stored in this browser)
const readSaves = () => {
  try {
    const list = JSON.parse(localStorage.getItem(STORE)) || [];
    const old = localStorage.getItem(OLD_STORE);                      // migrate the single save from v1
    if (old) { list.push({ id: 'v1', name: 'My first build', build: JSON.parse(old), ts: Date.now() }); localStorage.removeItem(OLD_STORE); localStorage.setItem(STORE, JSON.stringify(list)); }
    return list.filter(s => s && s.build && CARS.some(c => c.id === s.build.carId));
  } catch (_) { return []; }
};
const writeSaves = list => { try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch (_) { ui.toast('Browser storage is full or blocked'); return false; } };
const snapshot = () => JSON.parse(JSON.stringify(app.build));
app.saves = readSaves;
app.defaultName = () => { const c = app.car(), n = readSaves().filter(s => s.build.carId === c.id).length; return `${c.name.replace(/\s*\(.*\)/, '')} build ${n + 1}`; };
app.saveNew = name => {
  const list = readSaves(), id = 's' + Date.now().toString(36);
  list.unshift({ id, name: (name || '').trim().slice(0, 40) || app.defaultName(), build: snapshot(), ts: Date.now() });
  if (writeSaves(list)) { app.slot = id; ui.refresh(); ui.toast(`Saved “${list[0].name}” — ${list.length} car${list.length > 1 ? 's' : ''} in your garage`); }
};
app.saveOver = id => {
  const list = readSaves(), s = list.find(x => x.id === id); if (!s) return app.saveNew();
  s.build = snapshot(); s.ts = Date.now();
  if (writeSaves(list)) { app.slot = id; ui.refresh(); ui.toast(`Updated “${s.name}”`); }
};
app.save = () => (app.slot && readSaves().some(s => s.id === app.slot) ? app.saveOver(app.slot) : app.saveNew());
app.loadSave = id => {
  const s = readSaves().find(x => x.id === id); if (!s) return ui.toast('That save no longer exists');
  stopEngine();
  const base = defaultBuild(byId(CARS, s.build.carId));
  app.build = { ...base, ...s.build, paint: { ...base.paint, ...s.build.paint }, rim: { ...base.rim, ...s.build.rim }, susp: { ...base.susp, ...s.build.susp } };
  app.slot = id;
  rebuild(); stats = app.stats(); ui.refresh(); ui.toast(`Loaded “${s.name}”`);
};
app.deleteSave = id => { const list = readSaves().filter(s => s.id !== id); if (writeSaves(list)) { if (app.slot === id) app.slot = null; ui.refresh(); ui.toast('Save deleted'); } };
app.renameSave = (id, name) => { const list = readSaves(), s = list.find(x => x.id === id); if (s && name.trim()) { s.name = name.trim().slice(0, 40); writeSaves(list); } };

// ---- drive mode
const keys = {};
const net = new Net(), remotes = new RemoteCars(net);
const dragPrefs = () => (prefs.drag = { dist: 'quarter', tree: 'sportsman', night: false, ...(prefs.drag || {}) });
const hud = { drag: $('hudDrag'), tree: [...$('hudTree').children], dClock: $('hudDragClock'), dState: $('hudDragState'), dDist: $('hudDragDist'), slip: $('hudSlip'), chuteBtn: $('hudChute'),
  aid: { abs: $('aidABS'), tcs: $('aidTCS'), esp: $('aidESP'), lc: $('aidLC'), chute: $('aidCHUTE') }, air: $('hudAir'), mp: $('hudMp'), root: $('driveHud'), speed: $('hudSpeed'), gear: $('hudGear'), lap: $('hudLap'), last: $('hudLast'), best: $('hudBest'), laps: $('hudLaps'), place: $('hudPlace'),
  score: $('hudScore'), mult: $('hudMult'), bar: $('hudComboBar'), drift: $('hudDrift'), pb: $('hudPb'), feed: $('hudFeed'), trans: $('hudTrans'), gearBox: $('hudGearBox') };
const fmtLap = t => t ? `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}` : '—:——.——';
const num = v => Math.round(v).toLocaleString('en-US');
drive.setTransmission(prefs.trans || 'auto');
drive.setCustom(prefs.custom || {}); drive.setMode(prefs.mode || 'sport');
let boardWorld = prefs.world || 'highway';

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function renderDriveMenu() {
  const worlds = $('dmWorlds'), trans = $('dmTrans'), tabs = $('dmTabs'), board = $('dmBoard');
  renderDriftMenu();
  worlds.replaceChildren(...WORLDS.map(w => {
    const b = el('button', 'card world'), top = el('div', 'card-top'); top.append(el('b', '', w.name), el('em', '', `Best ${num(Records.best(w.id))}`));
    b.append(top, el('p', '', w.desc)); b.onclick = () => app.drive(w.id); return b;
  }));
  trans.replaceChildren(...TRANSMISSIONS.map(t => { const b = el('button', 'chip' + (drive.trans === t.id ? ' on' : ''), t.name); b.title = t.desc; b.onclick = () => { app.setTransmission(t.id); renderDriveMenu(); }; return b; }));
  $('dmTransDesc').textContent = TRANSMISSIONS.find(t => t.id === drive.trans).desc;
  // drag strip options
  const dp = dragPrefs(), chip = (label, on, fn, title) => { const b = el('button', 'chip' + (on ? ' on' : ''), label); if (title) b.title = title; b.onclick = () => { fn(); savePrefs(); renderDriveMenu(); }; return b; };
  $('dmDrag').hidden = false;
  $('dmDragDist').replaceChildren(...DRAG_DISTANCES.map(d => chip(d.name, dp.dist === d.id, () => { dp.dist = d.id; })));
  $('dmDragTree').replaceChildren(...TREES.map(t => chip(t.name, dp.tree === t.id, () => { dp.tree = t.id; }, t.desc)));
  $('dmDragTime').replaceChildren(chip('Day', !dp.night, () => { dp.night = false; }), chip('Night', dp.night, () => { dp.night = true; }));
  // driver aids: the mode's defaults unless you have switched one yourself
  const AS = drive.assists(), ov = drive.assistOverride;
  $('dmAids').replaceChildren(...[['abs', 'ABS'], ['tcs', 'TCS'], ['esp', 'ESP']].map(([k, n]) => chip(`${n} ${AS[k] ? 'on' : 'off'}${k in ov ? ' (manual)' : ''}`, AS[k], () => { app.toggleAssist(k); })),
    ...(Object.keys(ov).length ? [chip('Use mode defaults', false, () => { drive.clearAssistOverrides(); prefs.assists = {}; })] : []));
  $('dmAidsNote').textContent = 'Each driving mode sets these. Switch one yourself (or press Z / X / V while driving) and your choice is kept when you change mode.';
  $('dmModes').replaceChildren(...DRIVE_MODES.map(m => { const b = el('button', 'chip' + (drive.mode.id === m.id ? ' on' : ''), m.name); b.title = m.desc; b.onclick = () => { app.setMode(m.id); renderDriveMenu(); }; return b; }));
  $('dmModeDesc').textContent = DRIVE_MODES.find(m => m.id === drive.mode.id).desc;
  const CUSTOM = [['steer', 'Steering response'], ['thr', 'Throttle response'], ['tc', 'Traction control'], ['esc', 'Stability control'], ['stiff', 'Suspension stiffness'], ['brake', 'Brake strength'], ['drift', 'Drift assist']];
  $('dmCustom').replaceChildren(...(drive.mode.id !== 'custom' ? [] : CUSTOM.map(([k, label]) => {
    const wrap = el('div', 'slider'), top = el('div', 'slider-top'), out = el('b', '', drive.custom[k] + '%'), inp = document.createElement('input');
    top.append(el('span', '', label), out); Object.assign(inp, { type: 'range', min: 0, max: 100, step: 5, value: drive.custom[k] }); inp.setAttribute('aria-label', label);
    inp.oninput = () => { out.textContent = inp.value + '%'; drive.setCustom({ [k]: +inp.value }); prefs.custom = { ...drive.custom }; savePrefs(); };
    wrap.append(top, inp); return wrap;
  })));
  tabs.replaceChildren(...WORLDS.filter(w => w.id !== 'drag').map(w => { const b = el('button', 'chip' + (boardWorld === w.id ? ' on' : ''), w.name); b.onclick = () => { boardWorld = w.id; renderDriveMenu(); }; return b; }));
  for (const d of DRAG_DISTANCES) { const b = el('button', 'chip' + (boardWorld === d.board ? ' on' : ''), 'Drag ' + d.name); b.onclick = () => { boardWorld = d.board; renderDriveMenu(); }; tabs.append(b); }
  { const b = el('button', 'chip' + (boardWorld === 'online-drag' ? ' on' : ''), 'Online drag'); b.title = 'Best server-verified multiplayer drag runs'; b.onclick = () => { boardWorld = 'online-drag'; renderDriveMenu(); }; tabs.append(b); }
  { const b = el('button', 'chip' + (boardWorld === 'online' ? ' on' : ''), 'Online'); b.title = 'All-time best multiplayer runs on this server'; b.onclick = () => { boardWorld = 'online'; renderDriveMenu(); }; tabs.append(b); }
  const me = Records.name(), online = boardWorld === 'online' || boardWorld === 'online-drag', timeBoard = boardWorld.startsWith('drag-') || boardWorld === 'online-drag';
  $('dmBoardHead').replaceChildren(...(timeBoard ? ['#', 'Driver', 'Car', 'E.T.', 'RT', 'km/h'] : ['#', 'Driver', 'Car', 'Score']).map(t => el('th', '', t)));
  if (timeBoard) {
    const carName = id => (CARS.find(c => c.id === id) || { name: id }).name;
    const list = boardWorld === 'online-drag' ? [...((net.topDrag || {})[dp.dist] || [])].map(r => ({ ...r, car: carName(r.car) })) : Records.times(boardWorld);
    board.replaceChildren(...list.map((r, i) => { const tr = el('tr', r.name === me ? 'me' : ''); tr.append(el('td', '', String(i + 1)), el('td', '', r.name), el('td', '', r.car), el('td', '', r.et.toFixed(3)), el('td', '', r.rt != null ? r.rt.toFixed(3) : '—'), el('td', '', String(Math.round(r.trap)))); return tr; }));
    if (!list.length) { const tr = el('tr', 'empty'), td = el('td', '', boardWorld === 'online-drag' ? (net.connected ? `No verified ${dp.dist === 'eighth' ? '1/8' : '1/4'} mile runs on this server yet.` : 'Connect to a multiplayer server to see its drag board.') : 'No clean runs yet — red lights do not count.'); td.colSpan = 6; tr.append(td); board.append(tr); }
    $('dmClear').hidden = boardWorld === 'online-drag'; $('dmName').value = me; return;
  }
  const rows = online ? (net.top || []).map(r => ({ name: r.name, score: r.score, car: (CARS.find(c => c.id === r.car) || { name: r.car }).name })) : Records.board(boardWorld);
  board.replaceChildren(...rows.map((r, i) => {
    const tr = el('tr', r.target ? 'target' : r.name === me ? 'me' : '');
    tr.append(el('td', '', String(i + 1)), el('td', '', r.name), el('td', '', r.car), el('td', '', num(r.score))); return tr;
  }));
  $('dmClear').hidden = online;
  if (!rows.some(r => !r.target)) { const tr = el('tr', 'empty'), td = el('td', '', online ? (net.connected ? 'No multiplayer runs on this server yet.' : 'Connect to a multiplayer server to see its all-time board.') : 'No runs recorded yet — go and set one.'); td.colSpan = 4; tr.append(td); board.append(tr); }
  $('dmName').value = me;
}
app.setTransmission = id => { drive.setTransmission(id); prefs.trans = drive.trans; savePrefs(); hud.trans.textContent = TRANSMISSIONS.find(t => t.id === drive.trans).name; };
// ---- cameras: Third-person / Cockpit / Hood (C), third-person distance (B). Remembered between sessions.
const camLabel = () => { $('hudCamName').textContent = drive.cameraLabel(); };
app.nextCamera = () => { const m = drive.nextCamera(); prefs.cam = m.id; savePrefs(); camLabel(); if (app.driving) feed(`Camera: ${drive.cameraLabel()}`, 0, 'minor'); return m; };
app.nextChaseView = () => { const v = drive.nextChaseView(); prefs.cam = 'chase'; prefs.chaseView = CHASE_VIEWS[drive.chaseView].id; savePrefs(); camLabel(); if (app.driving) feed(`Camera: ${drive.cameraLabel()}`, 0, 'minor'); return v; };
drive.setCamera(Math.max(0, CAMERA_MODES.findIndex(m => m.id === prefs.cam)), true);
drive.chaseView = Math.max(0, CHASE_VIEWS.findIndex(v => v.id === prefs.chaseView));
app.setMode = id => { const m = drive.setMode(id); prefs.mode = m.id; savePrefs(); return m; };
app.toggleAssist = k => { const on = drive.toggleAssist(k); prefs.assists = { ...drive.assistOverride }; savePrefs(); return on; };
drive.assistOverride = { ...(prefs.assists || {}) };
$('dmDragGo').addEventListener('click', () => app.drive('drag'));
app.openDriveMenu = () => { renderDriveMenu(); $('driveMenu').classList.add('show'); if (!net.connected && location.protocol !== 'file:') mpConnect(true); else if (net.connected) net.lobbies(); };

// ---- multiplayer (real connections to server.js; see net.js)
const mpStatus = t => { $('mpStatus').textContent = t; };
const myBuild = () => JSON.parse(JSON.stringify(app.build));
function renderLobbies(list) {
  $('mpPrivate').hidden = false; $('mpDrag').hidden = false;
  { const dp = dragPrefs(), w = (net.dragWaiting || {})[dp.dist] || 0; $('mpDragInfo').textContent = `${dp.dist === 'eighth' ? '1/8' : '1/4'} mile · ${w ? w + ' driver' + (w > 1 ? 's' : '') + ' waiting' : 'no one waiting — you will be first in line'}`; }
  $('mpLobbies').replaceChildren(...(list || []).map(l => {
    const row = el('div', 'lobby'), b = el('button', 'btn', l.players >= l.max ? 'Full' : 'Join'); b.disabled = l.players >= l.max;
    b.onclick = () => net.join(l.id, myBuild(), Records.name());
    row.append(el('b', '', l.name), el('span', '', `${l.players} / ${l.max} players`), b); return row;
  }));
}
async function mpConnect(quiet) {
  mpStatus('Connecting…');
  try { await net.connect($('mpUrl').value.trim() || undefined, Records.name()); prefs.mpUrl = $('mpUrl').value.trim(); savePrefs(); mpStatus(`Connected as ${Records.name()}. Pick a lobby, or create a private room and share its code.`); }
  catch (e) { $('mpLobbies').replaceChildren(); $('mpPrivate').hidden = true; mpStatus(quiet ? 'Multiplayer server not found. Run “node server.js” and open the address it prints (Live Server cannot host multiplayer), or enter a server address.' : e.message); }
}
$('mpUrl').value = prefs.mpUrl || '';
$('mpConnect').addEventListener('click', () => mpConnect(false));
$('mpCreate').addEventListener('click', () => net.create(myBuild(), Records.name()));
$('mpDragFind').addEventListener('click', () => { const dp = dragPrefs(); net.dragMatch(dp.dist, dp.tree, myBuild(), Records.name()); });
$('mpDragCreate').addEventListener('click', () => { const dp = dragPrefs(); net.createDrag(dp.dist, dp.tree, myBuild(), Records.name()); });
$('mpJoinCode').addEventListener('click', () => { const c = $('mpCode').value.trim(); if (c.length === 6) net.joinCode(c, myBuild(), Records.name()); else mpStatus('Room codes are six characters.'); });
const chatLine = (name, text, sys) => { const d = el('div', sys ? 'sys' : ''); if (name) d.append(el('b', '', name + ': ')); d.append(text); $('mpChat').append(d); while ($('mpChat').children.length > 6) $('mpChat').firstChild.remove(); };
function renderPlayers() {
  const rows = net.board.rows || [];
  $('mpPlayers').replaceChildren(...rows.map(r => { const li = el('li', r.id === net.id ? 'me' : ''); li.append(el('span', '', r.name), el('span', '', num(Math.max(r.best, r.score)))); return li; }));
}
net.on.lobbies = l => { renderLobbies(l); if (boardWorld === 'online' && $('driveMenu').classList.contains('show')) renderDriveMenu(); };
net.on.error = m => { mpStatus(m); if (app.driving) feed(m, 0, 'bad'); };
net.on.joined = m => {
  drive.dragCompare = null;
  if (m.room.mode === 'drag') app.drive('drag', { net, lane: m.lane, dist: m.room.dist, night: dragPrefs().night });
  else app.drive('highway', { net });
  remotes.clear(); for (const p of net.players.values()) remotes.add(p);
  hud.mp.hidden = false; $('mpChat').replaceChildren(); $('mpRoomName').textContent = m.room.name; $('mpRoomCode').textContent = m.room.private ? m.room.code : `${m.players.length} / ${m.room.max}`;
  chatLine('', m.room.private ? `Private room. Share code ${m.room.code} with friends.` : `Joined ${m.room.name}.`, true);
  if (m.room.mode === 'drag') chatLine('', m.players.length < 2 ? 'Waiting for an opponent. You can make practice runs meanwhile: stage and the tree will start.' : 'Opponent found. Stage when ready — the tree starts when you are both in the beams.', true);
};
net.on.in = p => { remotes.add(p); if (net.room && net.room.mode === 'drag') { chatLine('', `${p.name} is in the other lane. Stage when ready.`, true); drive.respawn(); } };
// drag racing online: the server starts the tree and decides the winner
drive.onDragStage = v => { if (net.inRoom && net.room.mode === 'drag') net.dragStage(v); };
drive.onDragResult = res => { if (net.inRoom && net.room.mode === 'drag') net.dragResult(res); };
net.on.dragGo = m => { if (drive.race) { drive.dragCompare = null; drive.race.go((m.green - net.serverNow()) / 1000, m.tree); } };
net.on.dragWait = () => { if (drive.race && drive.race.state === 'staging') drive.race.sentStage = false; };
net.on.dragResult = m => {
  drive.dragCompare = m;
  const me = m.rows.find(r => r.id === net.id), other = m.rows.find(r => r.id !== net.id);
  if (other && !other.rejected && !other.dnf && drive.world.showResult) drive.world.showResult(1 - net.lane, other.et.toFixed(3), String(other.trap), m.winner === other.id);
  if (me && !me.rejected && !me.dnf && drive.world.showResult) drive.world.showResult(net.lane, me.et.toFixed(3), String(me.trap), m.winner === net.id);
  feed(!other ? 'Solo run recorded' : m.winner === net.id ? `You win${other.foul ? ' — opponent red-lit' : ''}!` : m.winner ? `${other.name} wins${me && me.foul ? ' — you red-lit' : ''}` : 'No winner', 0, m.winner === net.id || !other ? 'good' : 'bad');
  if (other && me && !me.foul && !other.foul && !other.dnf && !other.rejected && !me.rejected) chatLine('', `Reaction: you ${me.rt.toFixed(3)} s, ${other.name} ${other.rt.toFixed(3)} s${me.et > other.et && m.winner === net.id ? ' — holeshot win!' : ''}`, true);
  chatLine('', 'Press R to return to the line for another race.', true);
};
net.on.out = p => { remotes.remove(p.id); };
net.on.board = () => { renderPlayers(); if (net.room && !net.room.private) $('mpRoomCode').textContent = `${net.board.rows.length} / ${net.room.max}`; };
net.on.chat = m => chatLine(m.name, m.m);
net.on.sys = m => chatLine('', m, true);
net.on.closed = was => { remotes.clear(); hud.mp.hidden = true; if (was && app.driving) feed('Disconnected from the server — carrying on solo', 0, 'bad'); mpStatus('Disconnected.'); };
drive.score.onBank = res => { if (net.inRoom) net.bank(res.total); };
const chatInput = $('chatInput');
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { const t = chatInput.value.trim(); if (t) net.chat(t); chatInput.value = ''; chatInput.blur(); $('view').focus(); }
  else if (e.key === 'Escape') { chatInput.value = ''; chatInput.blur(); $('view').focus(); }
  e.stopPropagation();
});
chatInput.addEventListener('focus', () => { for (const k in keys) keys[k] = false; });
$('dmName').addEventListener('change', e => { Records.setName(e.target.value); renderDriveMenu(); });
$('dmClear').addEventListener('click', () => { if (confirm('Clear all saved scores for this map?')) { Records.clear(boardWorld); renderDriveMenu(); } });

const fmtT = v => (v == null ? '—' : v.toFixed(3));
let slipKey = '';
function renderDragHud(g) {
  const L = g.lights, on = [L.pre, L.stage, L.amber >= 1, L.amber >= 2, L.amber >= 3, L.green, L.red];
  hud.tree.forEach((n, i) => n.classList.toggle('on', !!on[i]));
  hud.dClock.textContent = fmtT(g.clock); hud.dDist.textContent = g.dist.name;
  hud.dState.textContent = g.state === 'staging' ? (L.stage ? 'Staged — hold still' : L.pre ? 'Pre-staged — creep forward' : 'Roll up to the line') : g.state === 'tree' ? 'Watch the tree' : g.state === 'run' ? (L.red ? 'Red light' : `RT ${fmtT(g.rt)}`) : 'Run complete — R to go again';
  const key = Object.keys(g.splits).length + g.state + (drive.dragCompare ? 'c' : '');
  if (key === slipKey) return; slipKey = key;
  const rows = [['60 ft', 'ft60'], ['330 ft', 'ft330'], ['1/8 mile', 'eighth'], ['1000 ft', 'ft1000'], ['1/4 mile', 'quarter']].filter(([, k]) => g.splits[k] != null);
  hud.slip.replaceChildren(...rows.map(([n, k]) => { const tr = el('tr'); tr.append(el('td', '', n), el('td', '', fmtT(g.splits[k])), el('td', '', k === 'eighth' || k === 'quarter' ? Math.round(g.speeds[k]) + ' km/h' : '')); return tr; }));
  const c = drive.dragCompare;
  if (c) { const h = el('tr', 'head'); h.append(el('td', '', 'Driver'), el('td', '', 'RT / ET'), el('td', '', '')); hud.slip.append(h);
    for (const r of c.rows) { const tr = el('tr', r.id === c.winner ? 'win' : 'lose'); tr.append(el('td', '', r.name), el('td', '', r.rejected ? 'NOT VERIFIED' : r.dnf ? 'DID NOT FINISH' : r.foul ? 'RED LIGHT' : `${fmtT(r.rt)} / ${fmtT(r.et)}`), el('td', '', r.id === c.winner ? 'WIN' : '')); hud.slip.append(tr); } }
}
const feed = (label, pts, kind) => {
  const d = el('div', 'feed-item ' + kind); d.append(el('span', '', label)); if (pts) d.append(el('b', '', '+' + num(pts)));
  hud.feed.prepend(d); while (hud.feed.children.length > 4) hud.feed.lastChild.remove();
  setTimeout(() => d.classList.add('out'), 2200); setTimeout(() => d.remove(), 2700);
};
drive.score.onEvent = e => feed(e.label, e.pts, e.kind);
drive.onNotice = msg => feed(msg, 0, 'minor');

// ---- drift events: Drift Attack (3 laps or 2 minutes, medals) and Free Drift.
// While one runs, DriftScore stands in for the normal Score and the car uses the Drift driving mode.
const DRIFT_LOCATIONS = [
  { id: 'circuit', name: 'Apex Raceway', attack: '3 laps' },
  { id: 'city', name: 'Neon District', attack: '2 minutes' },
  { id: 'highway', name: 'Midnight Expressway', attack: '2 minutes' },
];
const DRIFT_LAPS = 3, DRIFT_TIME = 120;
const baseScore = drive.score, driftScore = new DriftScore();
driftScore.onEvent = e => {
  feed(e.label, e.kind === 'bad' ? 0 : e.pts, e.kind);
  if (!audio.ctx) return;
  if (e.kind === 'good') audio._burst({ dur: 0.18, f0: 1400 + Math.min(4, driftScore.mult) * 200, f1: 2200, q: 8, gain: 0.25 });
  if (e.kind === 'bad') audio._burst({ dur: 0.35, f0: 600, f1: 150, q: 2, gain: 0.3 });
};
let driftEv = null;                                            // the drift event in progress, if any
const dPrefs = () => (prefs.driftEv = { world: 'circuit', mode: 'attack', ...(prefs.driftEv || {}) });
const countText = (text, cls = '') => { const c = $('hudCount'); c.className = 'hud-count ' + cls; c.textContent = text; };
const beep = go => { if (audio.ctx) audio._burst({ dur: go ? 0.5 : 0.22, f0: go ? 1760 : 880, f1: go ? 1760 : 880, q: 30, gain: 0.35 }); };
const lapLabels = (a, b, c) => { $('hudLapLbl').textContent = a; $('hudLastLbl').textContent = b; $('hudBestLbl').textContent = c; };
function renderDriftMenu() {
  const dp = dPrefs(), t = DRIFT_TARGETS[dp.world], best = DriftRecords.best(dp.world, dp.mode), loc = DRIFT_LOCATIONS.find(l => l.id === dp.world);
  const chip = (label, on, fn) => { const b = el('button', 'chip' + (on ? ' on' : ''), label); b.onclick = () => { fn(); savePrefs(); renderDriftMenu(); }; return b; };
  const row = (...kids) => { const r = el('div', 'chip-row'); r.append(...kids); return r; };
  const targets = el('div', 'targets');
  ['Bronze', 'Silver', 'Gold'].forEach((n, i) => { const sp = el('span', DriftRecords.best(dp.world, 'attack') >= t[i] ? 'got' : '', n); sp.append(el('b', '', num(t[i]))); targets.append(sp); });
  const go = el('button', 'btn btn-drive wide-btn', `Start ${dp.mode === 'attack' ? 'Drift Attack' : 'Free Drift'} — ${loc.name}`);
  go.onclick = () => app.driftEvent(dp.world, dp.mode);
  const box = el('div', 'drift-event');
  box.append(
    row(...DRIFT_LOCATIONS.map(l => chip(l.name, dp.world === l.id, () => { dp.world = l.id; }))),
    row(chip(`Drift Attack · ${loc.attack}`, dp.mode === 'attack', () => { dp.mode = 'attack'; }), chip('Free Drift', dp.mode === 'free', () => { dp.mode = 'free'; })),
    el('p', 'dm-note', (dp.mode === 'attack' ? 'Score as much as you can for a medal. ' : 'No clock — press Esc to bank your points. ') +
      `Hold long, fast slides: the multiplier climbs to ×5. Straighten up to bank a drift; a wall hit or leaving the road loses it. Your best: ${best ? num(best) : '—'}.`),
    ...(dp.mode === 'attack' ? [targets] : []), go);
  $('dmDrift').replaceChildren(box);
}
app.driftEvent = (world, mode) => {
  $('driftResults').classList.remove('show');
  driftEv = { world, mode, prevMode: drive.mode.id, count: 3.4, last: 4, t: 0, done: 0 };
  drive.score = driftScore; driftScore.mode = mode; driftScore.enabled = false;
  drive.setMode('drift');
  app.drive(world);
  driftScore.best = DriftRecords.best(world, mode);
  hud.place.previousElementSibling.textContent = mode === 'attack' ? 'Drift Attack' : 'Free Drift';
  hud.laps.style.display = '';
  if (!drive.world.hasLaps) lapLabels(mode === 'attack' ? 'Time left' : 'Time', 'Drifts', 'Best drift');
  countText('');
};
/** Runs every frame while a drift event is on. Returns the input to drive with. */
function driftStep(dt, inp) {
  const ev = driftEv;
  if (ev.count > 0) {
    ev.count -= dt;
    const n = Math.ceil(ev.count);
    if (n !== ev.last && n <= 3) { ev.last = n; if (n > 0) { countText(String(n)); beep(false); } }
    if (ev.count <= 0) { countText('GO!', 'go'); beep(true); driftScore.enabled = true; setTimeout(() => { if (driftEv === ev && !ev.done) countText(''); }, 900); }
    return { fwd: 0, back: 0, steer: 0, hand: 1, clutch: 0 };
  }
  if (ev.done) { ev.done -= dt; if (ev.done <= 0) ev.leave = true; return inp; }
  ev.t += dt;
  if (ev.mode === 'attack' && (drive.world.hasLaps ? drive.lap.count >= DRIFT_LAPS : ev.t >= DRIFT_TIME)) {
    driftScore.bank(); driftScore.enabled = false; ev.done = 1.8; ev.finished = true; countText('FINISH', 'go');
    if (audio.ctx) [0, 0.12, 0.24].forEach((d, i) => audio._burst({ dur: 0.3, f0: 1046 + i * 262, f1: 1046 + i * 262, q: 30, gain: 0.3, delay: d }));
  }
  return inp;
}
function driftHud(d) {
  const ev = driftEv;
  hud.mult.textContent = '×' + driftScore.mult;
  if (drive.world.hasLaps) { if (ev.mode === 'attack') $('hudLapLbl').textContent = `Lap ${Math.min(DRIFT_LAPS, d.lap.count + 1)} / ${DRIFT_LAPS}`; return; }
  const clock = t => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  hud.lap.textContent = ev.mode === 'attack' ? clock(DRIFT_TIME - ev.t) : clock(ev.t);
  hud.last.textContent = num(driftScore.drifts); hud.best.textContent = num(driftScore.bestCombo);
}
/** Called when the run ends (finished, or Esc). res = what DriftScore banked. */
function endDriftEvent(res) {
  const ev = driftEv; driftEv = null;
  drive.score = baseScore; app.setMode(ev.prevMode); countText('');
  lapLabels('Lap', 'Last', 'Best'); hud.place.previousElementSibling.textContent = 'Now driving';
  const counts = ev.finished || ev.mode === 'free';
  if (!counts) return ui.toast('Drift Attack abandoned — it only counts when you finish it');
  if (!res || !res.total) return ui.toast('No drift points banked this time');
  const c = app.car(), nb = DriftRecords.submit(ev.world, ev.mode, res.total, res.combo, `${c.brand} ${c.name}`), t = DRIFT_TARGETS[ev.world];
  let medal = 0; if (ev.mode === 'attack') for (let i = 0; i < 3; i++) if (res.total >= t[i]) medal = i + 1;
  const names = ['none', 'bronze', 'silver', 'gold'], loc = DRIFT_LOCATIONS.find(l => l.id === ev.world);
  $('resMedal').className = 'medal ' + names[medal]; $('resMedal').textContent = medal ? 'BSG'[medal - 1] : '—'; $('resMedal').hidden = ev.mode !== 'attack';
  $('resKicker').textContent = ev.mode === 'attack' ? 'DRIFT ATTACK COMPLETE' : 'FREE DRIFT';
  $('resTitle').textContent = ev.mode === 'attack' ? (medal ? `${names[medal][0].toUpperCase()}${names[medal].slice(1)} medal` : 'No medal this time') : 'Session banked';
  const next = ev.mode === 'attack' ? t.find(v => v > res.total) : 0;
  $('resSub').textContent = `${loc.name} · ${c.brand} ${c.name}` + (next ? ` · ${num(next - res.total)} more for the next medal` : '');
  $('resStats').replaceChildren(...[['Score', num(res.total), nb.best], ['Best drift', num(res.combo), nb.combo], ['Drifts', num(res.drifts)], ['Time', fmtLap(ev.t)]].map(([k, v, n]) => {
    const d = el('div', n ? 'new' : ''); d.append(el('small', '', k), el('b', '', v)); return d;
  }));
  $('driftResults').classList.add('show'); $('resAgain').focus();
  app.lastDrift = ev;
}
$('resAgain').addEventListener('click', () => { const ev = app.lastDrift; if (ev) app.driftEvent(ev.world, ev.mode); });
$('resMenu').addEventListener('click', () => { $('driftResults').classList.remove('show'); app.openDriveMenu(); });
$('resClose').addEventListener('click', () => $('driftResults').classList.remove('show'));

app.drive = (id, opts = {}) => {
  $('driveMenu').classList.remove('show');
  if (app.toggles.xray) app.toggle('xray');
  if (app.toggles.turntable) app.toggle('turntable');
  if (!opts.net && net.inRoom) net.leave();
  app.previewChute(false); drive.setSetup(app.setup());
  if (id === 'drag') opts = { ...dragPrefs(), ...opts };
  const world = drive.enter(id, stats, car.r, { ...opts, chute: app.build.chute });
  document.body.classList.toggle('dragging', id === 'drag'); hud.drag.hidden = id !== 'drag'; hud.slip.replaceChildren(); hud.chuteBtn.hidden = drive.chute.state === 'none';
  if (opts.net) world.group.add(remotes.group); else { remotes.clear(); hud.mp.hidden = true; }
  prefs.world = world.id; if (boardWorld !== 'online') boardWorld = world.id; savePrefs();
  app.driving = true; document.body.classList.add('driving');
  hud.place.textContent = world.name; hud.laps.style.display = world.hasLaps ? '' : 'none';
  hud.trans.textContent = TRANSMISSIONS.find(t => t.id === drive.trans).name; hud.feed.replaceChildren(); camLabel();
  if (!eng.running) { audio.start(); eng.running = true; ui.setRunning(true); }
  eng.cranking = 0; eng.input = 0;
  if (drive.trans !== 'auto') feed(drive.trans === 'manual' ? 'Manual: hold Left Shift and press E / Q to change gear' : 'Semi-automatic: E shifts up, Q shifts down', 0, 'minor');
  $('view').focus();
};
app.exitDrive = () => {
  if (!app.driving) return;
  const res = drive.exit(), drift = !!driftEv; app.driving = false; document.body.classList.remove('dragging');
  if (net.inRoom) net.leave(); remotes.clear(); remotes.group.removeFromParent(); hud.mp.hidden = true; document.body.classList.remove('driving');
  for (const k in keys) keys[k] = false;
  eng.throttle = 0; eng.input = 0; eng.rpm = car.r.engine.idle;
  snapRide(); car.applyStance(app.build, ride.f, ride.r); app.view('q', 0.01);
  if (drift) endDriftEvent(res);
  else if (res) ui.toast(`Run banked: ${num(res.total)} pts${res.pb ? ' — new personal best!' : ''}${res.rank ? ` · #${res.rank} on the board` : ''}`);
};
app.reset = () => { app.slot = null; app.build = defaultBuild(app.car()); rebuild(); stats = app.stats(); ui.refresh(); ui.toast('Returned to factory spec'); };
app.copySheet = () => {
  const s = app.sheet(), st = app.stats();
  const txt = [`APEX GARAGE — ${app.car().brand} ${app.car().name}`, `${Math.round(st.hp)} hp · ${Math.round(st.tq)} Nm · ${Math.round(st.weight)} kg · 0-100 ${st.t100.toFixed(2)} s`, '',
    ...s.items.map(i => `${i.cat.padEnd(13)} ${i.name.padEnd(42)} $${i.price.toLocaleString('en-US')}`), '', `TOTAL $${s.total.toLocaleString('en-US')}`].join('\n');
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => ui.toast('Build sheet copied'), () => ui.toast('Clipboard unavailable'));
};
app.shot = () => {
  stage.renderer.render(stage.scene, stage.camera);
  const a = document.createElement('a'); a.download = `apex-garage-${app.build.carId}.png`; a.href = stage.renderer.domElement.toDataURL('image/png'); a.click();
};

// ---- engine control
function startEngine() {
  if (eng.running || eng.cranking > 0) return;
  if (!audio.start()) ui.toast('Audio is unavailable in this browser — running silent');
  eng.cranking = 0.85; eng.running = true; eng.rpm = 220; ui.setRunning(true);
}
function stopEngine() {
  if (!eng.running) return;
  eng.running = false; eng.cranking = 0; eng.throttle = 0; audio.stop(); ui.setRunning(false);
}
audio.onPop = i => car.pop(i);

function stepEngine(dt) {
  if (!eng.running) { eng.rpm += (0 - eng.rpm) * Math.min(1, dt * 4); eng.boost = 0; return; }
  const e = car.r.engine;
  if (eng.cranking > 0) {
    eng.cranking -= dt;
    eng.rpm = 230 + Math.sin(performance.now() / 45) * 40;
    if (eng.cranking <= 0) eng.rpm = e.idle * 1.9;          // catch + flare
    eng.boost = audio.update(dt, eng.rpm, 0.25);
    return;
  }
  eng.throttle += (eng.input - eng.throttle) * Math.min(1, dt * 14);
  eng.cut = Math.max(0, eng.cut - dt);
  if (eng.rpm >= e.redline) eng.cut = 0.075;                 // rev limiter: ignition cut
  const th = eng.cut > 0 ? 0 : eng.throttle;
  const lump = (e.lump || 0) * 90 + 18, t = performance.now() / 1000;
  const idle = e.idle + Math.sin(t * 7.3) * lump * 0.5 + Math.sin(t * 2.1) * lump * 0.5;
  const lag = car.r.turbo.id === 'big' ? 0.8 : 1;
  const target = th > 0.02 ? idle + th * (e.redline * 1.04 - idle) : idle;
  const rate = target > eng.rpm ? e.rev * lag * (0.7 + 0.6 * eng.boost) : (eng.cut > 0 ? 9 : 1.5 + e.rev * 0.22);
  eng.rpm += (target - eng.rpm) * (1 - Math.exp(-rate * dt));
  eng.boost = audio.update(dt, eng.rpm, eng.throttle, eng.cut > 0);
}

// ---- input
const rev = $('btnRev');
const press = on => { eng.input = on && eng.running ? 1 : 0; rev.classList.toggle('down', !!eng.input); };
rev.addEventListener('pointerdown', e => { rev.setPointerCapture(e.pointerId); press(true); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) rev.addEventListener(ev, () => press(false));
$('btnStart').addEventListener('click', () => (eng.running ? stopEngine() : startEngine()));
$('vol').addEventListener('input', e => audio.setVolume(+e.target.value));
$('btnSave').addEventListener('click', app.save); $('btnLoad').addEventListener('click', () => ui.setCategory('garage'));
$('btnDrive').addEventListener('click', () => app.openDriveMenu());
$('driveClose').addEventListener('click', () => $('driveMenu').classList.remove('show'));
$('hudChute').addEventListener('click', () => feed(drive.toggleChute(), 0, 'minor'));
$('hudExit').addEventListener('click', () => app.exitDrive()); $('hudReset').addEventListener('click', () => drive.respawn()); $('hudCam').addEventListener('click', () => app.nextCamera());
// HUD buttons never take keyboard focus, so Space (handbrake) and other driving keys can't "press" them by accident
for (const b of document.querySelectorAll('.hud-btns .btn')) { b.addEventListener('mousedown', e => e.preventDefault()); b.addEventListener('click', () => { b.blur(); $('view').focus(); }); }
$('btnReset').addEventListener('click', app.reset); $('btnShot').addEventListener('click', app.shot);
window.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) return;
  if (app.driving) {
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape') app.exitDrive(); else if (e.code === 'KeyR') { if (!(driftEv && driftEv.count > 0)) drive.respawn(); } else if (e.code === 'KeyC') app.nextCamera(); else if (e.code === 'KeyB') app.nextChaseView(); else if (e.code === 'KeyL') app.toggle('lights');
    else if (e.code === 'KeyE') drive.shift(1, !!keys.ShiftLeft); else if (e.code === 'KeyQ') drive.shift(-1, !!keys.ShiftLeft);
    else if (e.code === 'KeyZ' || e.code === 'KeyX' || e.code === 'KeyV') { const k = { KeyZ: 'abs', KeyX: 'tcs', KeyV: 'esp' }[e.code], on = app.toggleAssist(k); feed(`${k.toUpperCase()} ${on ? 'on' : 'off'}`, 0, on ? 'minor' : 'bad'); }
    else if (e.code === 'KeyG') { const su = app.setSetup({ lc: !app.setup().lc }); feed(su.lc ? `Launch control armed at ${su.lcRpm} rpm — hold brake or handbrake, floor it, release` : 'Launch control off', 0, 'minor'); }
    else if (e.code === 'KeyP') feed(drive.toggleChute(), 0, 'minor');
    else if (e.code === 'KeyM' && driftEv) feed('Drift events always use the Drift driving mode', 0, 'minor');
    else if (e.code === 'KeyM') { const i = DRIVE_MODES.findIndex(m => m.id === drive.mode.id), m = app.setMode(DRIVE_MODES[(i + 1) % DRIVE_MODES.length].id); feed(`${m.name} mode`, 0, 'minor'); }
    else if (/^Digit[1-4]$/.test(e.code)) { const p = app.setAirPreset(AIR_PRESETS[+e.code.slice(5) - 1].id); feed(p ? `Air suspension: ${p.name}` : 'This car has no air suspension — fit it in the Stance panel', 0, 'minor'); }
    else if (e.code === 'Enter' && net.inRoom) { e.preventDefault(); keys.Enter = false; chatInput.focus(); }
    else if (e.code === 'KeyT') { const i = TRANSMISSIONS.findIndex(t => t.id === drive.trans); app.setTransmission(TRANSMISSIONS[(i + 1) % TRANSMISSIONS.length].id); feed('Transmission: ' + TRANSMISSIONS.find(t => t.id === drive.trans).name, 0, 'minor'); }
    return;
  }
  if (e.repeat && e.code !== 'Space') return;
  if (e.code === 'Space' || e.code === 'KeyW') { e.preventDefault(); press(true); }
  else if (e.code === 'KeyE') eng.running ? stopEngine() : startEngine();
  else if (e.code === 'KeyX') app.toggle('xray');
  else if (e.code === 'KeyL') app.toggle('lights');
  else if (e.code === 'KeyT') app.toggle('turntable');
});
window.addEventListener('keyup', e => { keys[e.code] = false; if (!app.driving && (e.code === 'Space' || e.code === 'KeyW')) press(false); });
window.addEventListener('blur', () => { press(false); for (const k in keys) keys[k] = false; });

// ---- boot
const ui = initUI(app);
rebuild();
ui.refresh();
app.view('q');
requestAnimationFrame(() => $('loader').classList.add('hide'));

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.25, clock.getDelta());                 // game time tracks real time down to 4 fps (race clocks depend on it)
  // suspension glides to its target height (air presets, sliders, Show mode lifting off the ground)
  const tgt = rideTarget(app.driving ? Math.abs(drive.s.vx) : 0), stepH = dt * 0.075;
  if (Math.abs(tgt.f - ride.f) > 1e-4 || Math.abs(tgt.r - ride.r) > 1e-4) {
    ride.f += Math.sign(tgt.f - ride.f) * Math.min(Math.abs(tgt.f - ride.f), stepH);
    ride.r += Math.sign(tgt.r - ride.r) * Math.min(Math.abs(tgt.r - ride.r), stepH);
    car.applyStance(app.build, ride.f, ride.r); ride.moving = true;
    const ro = $('airReadout'); if (ro) { const i = app.rideInfo(); ro.textContent = `Front ${i.f} mm · Rear ${i.r} mm`; }
  } else ride.moving = false;
  if (app.driving) {
    const air = hasAir() ? app.build.susp.air : null;
    drive.setRide(ride.f, ride.r, air && air.preset !== 'custom' ? byId(AIR_PRESETS, air.preset) : null);
    let inp = {
      fwd: keys.KeyW || keys.ArrowUp ? 1 : 0, back: keys.KeyS || keys.ArrowDown ? 1 : 0,
      steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0), hand: keys.Space ? 1 : 0, clutch: keys.ShiftLeft ? 1 : 0,
    };
    if (driftEv) inp = driftStep(dt, inp);
    const d = drive.update(dt, inp);
    eng.rpm = d.rpm; eng.throttle = d.throttle; eng.boost = d.boost;
    car.update(dt, eng.rpm, 0, true, false, stats.redline);
    hud.speed.textContent = Math.round(d.kmh); hud.gear.textContent = d.gear;
    if (d.camera !== hud.camShown) { hud.camShown = d.camera; $('hudCamName').textContent = d.camera; }
    hud.trans.textContent = `${TRANSMISSIONS.find(t => t.id === d.trans).name} · ${d.mode}`;
    // driver-aid lamps: green = on, struck through = off, yellow = working right now
    for (const k of ['abs', 'tcs', 'esp']) hud.aid[k].className = d.active[k] ? 'act' : d.assists[k] ? 'on' : 'off';
    if (!d.assists.abs && d.locked) hud.aid.abs.className = 'warn';
    hud.aid.lc.className = d.lcHold ? 'act' : d.lc ? 'on' : 'na';
    hud.aid.chute.className = d.chute === 'none' ? 'na' : d.chute === 'open' ? 'warn' : d.chute === 'repack' ? 'act' : 'on';
    hud.aid.chute.textContent = d.chute === 'open' ? 'CHUTE OUT' : d.chute === 'repack' ? 'REPACKING' : 'CHUTE';
    stats.boostPsi = d.boostPsi;
    if (d.drag) renderDragHud(d.drag);
    if (air) { const i = app.rideInfo(); hud.air.textContent = `Air: ${air.preset === 'custom' ? 'Custom' : byId(AIR_PRESETS, air.preset).name} · ${i.f} / ${i.r} mm${d.scrape > 0.3 ? ' · scraping' : ''}`; } else hud.air.textContent = '';
    if (net.inRoom) {
      drive.justReset = Math.max(0, (drive.justReset || 0) - dt);
      net.sendState(drive.s, d.rpm, d.score, ((keys.KeyS || keys.ArrowDown) ? 1 : 0) | 2 | (drive.justReset > 0 ? 4 : 0) | (d.chute === 'open' ? 8 : 0));
      if (drive.race) for (const p of net.players.values()) { const sm = net.sample(p); if (sm) { const f = sm.x + 2.2; drive.race.other.pre = f >= -0.18 && f < 0.9; drive.race.other.staged = !!p.staged; } }
      remotes.update(dt);
    }
    hud.gearBox.classList.toggle('shift', d.shiftUp); hud.gearBox.classList.toggle('clutch', !!d.clutch);
    hud.score.textContent = num(d.score); hud.mult.textContent = '×' + d.mult.toFixed(1); hud.mult.classList.toggle('hot', d.mult > 1);
    hud.bar.style.width = Math.max(0, d.comboT * 100) + '%'; hud.pb.textContent = num(Math.max(d.best, d.score));
    hud.drift.textContent = d.drift >= 5 ? `Drift ${num(d.drift)}` : '';
    if (d.hasLaps) { hud.lap.textContent = d.lap.running ? fmtLap(d.time - d.lap.start) : 'Cross the line'; hud.last.textContent = fmtLap(d.lap.last); hud.best.textContent = fmtLap(d.lap.best); }
    if (driftEv && app.driving) { driftHud(d); if (driftEv.leave) app.exitDrive(); }
  } else {
    stepEngine(dt);
    car.update(dt, eng.rpm, eng.throttle, eng.running, app.toggles.dyno, stats.redline);
    if (app.chutePreview) car.chute.update(dt, 1, 30, true);
  }
  ui.drawTach(eng.rpm, eng.running, eng.boost, stats);
  stage.update(dt);
  stage.renderer.render(stage.scene, stage.camera);
  requestAnimationFrame(frame);
}
frame();

// handy for tinkering from the DevTools console
window.apex = { CAMERA_MODES, app, car, stage, audio, eng, drive, keys, maxDrop, Records, net, remotes, ride, driftScore, DriftRecords };
