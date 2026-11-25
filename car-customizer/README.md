# APEX GARAGE — 3D Car Customization Simulator

A browser-based 3D car customizer built with plain **HTML, CSS, JavaScript and Three.js**.
No build step, no downloads at runtime: Three.js is bundled in `vendor/`, every 3D model is
generated procedurally in code, and every sound is synthesised live with the Web Audio API.

## Run it in VS Code

The app uses JavaScript modules, which browsers only load over `http://` — double-clicking
`index.html` will not work. Use either option below.

### Option A — Live Server (easiest)

1. Open VS Code, then **File → Open Folder…** and choose the `car-customizer` folder.
2. Open the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`), search for **Live Server**
   (by Ritwick Dey) and click **Install**. VS Code will also suggest it automatically.
3. In the Explorer, right-click `index.html` → **Open with Live Server**.
4. Your browser opens at `http://127.0.0.1:5500/index.html`. Done.

### Option B — built-in Node server (no extension)

1. Install [Node.js](https://nodejs.org) if you do not have it.
2. Open the `car-customizer` folder in VS Code.
3. Open the terminal (**Terminal → New Terminal**) and run:

   ```bash
   node server.js
   ```

4. Open <http://localhost:5173> in Chrome, Edge or Firefox.

You can also press **F5** and pick *Run APEX GARAGE* — it starts the server and opens the browser.

## Controls

| Action | How |
| --- | --- |
| Orbit / zoom the camera | Drag / mouse wheel (touch: one finger / pinch) |
| Start or stop the engine | **ENGINE START** button or `E` |
| Rev | Hold the **REV** pedal, `Space` or `W` |
| X-ray view (see engine, turbos, suspension) | **X-Ray** or `X` |
| Headlights and tail lights | **Lights** or `L` |
| Rotating showroom camera | **Turntable** or `T` |
| Spin the driven wheels with engine rpm | **Dyno** |
| Camera presets | 3/4 · Front · Side · Rear · Top · Wheel · Engine |
| Save the current car | **Save** in the top bar (updates the car you last saved or loaded) |
| Keep several cars | **My Cars** → type a name → **Save as new**; load, overwrite, rename or delete any of them |
| Reset / screenshot | **Reset** and **Photo** in the top bar |

### Drive mode

Press **Drive** in the top bar. Pick a location and a transmission, then go. The car you built
is what you drive: power, weight, tyres, drivetrain, turbo lag, aero and suspension all change
how it accelerates, grips and slides.

| Action | Key |
| --- | --- |
| Throttle | `W` or `↑` |
| Brake (automatic: also reverse once stopped) | `S` or `↓` |
| Steer | `A` `D` or `←` `→` |
| Handbrake — also starts a drift | `Space` |
| Shift up / shift down (semi-automatic and manual) | `E` / `Q` |
| Clutch (manual only — hold it while you shift) | `Left Shift` |
| Cycle transmission mode | `T` |
| Cycle driving mode | `M` |
| Air suspension preset: Show / Street / Track / Off-Road | `1` `2` `3` `4` |
| Parachute: deploy; press again when stopped to repack | `P` |
| ABS / traction control / stability control on-off | `Z` / `X` / `V` |
| Launch control on-off | `G` |
| Chat (multiplayer) | `Enter` to type, `Enter` to send, `Esc` to cancel |
| Switch camera: Third-person → Cockpit → Hood | `C` (or the **Camera** button) |
| Third-person distance: Far → Near → Overhead | `B` |
| Put the car back on the road | `R` |
| Return to the garage (banks your score) | `Esc` |

**Locations**

- **Apex Dragway** — quarter-mile strip with staging beams, a Christmas tree, timing boards
  and a shutdown area with a sand trap. Day or night. See *Drag racing* below.
  A return road loops round the facility: carry on to the very end of the strip, where it
  narrows into a U-turn (signposted *Return Road*) that brings you back past the pits, round
  behind the start and into the staging lanes, which lead through the burnout box to the start
  line. You can drive it either way. Grass is drivable but slow; the strip walls, buildings,
  poles and perimeter fence are solid.
- **Midnight Expressway** — a 6 km four-lane expressway loop at night with AI traffic, a
  suspension bridge over a river, two tunnels, overhead signs and a city on both sides.
  Traffic keeps a safe gap, changes lane to pass slower vehicles and reacts to you.
- **Apex Raceway** — a 1.5 km circuit in daylight with lap timing. Grass is slow and slippery.
- **Neon District** — a night-time city grid to free-roam, with solid buildings.

**Drift events**

At the top of the Drive menu. Pick a location (Apex Raceway, Neon District or Midnight
Expressway) and a mode, then press *Start*. The car you built is switched to the **Drift** driving
mode for the event (your usual mode comes back afterwards), and a 3-2-1 countdown starts it.

- **Drift Attack** — three laps on the raceway, or two minutes in the city or on the expressway.
  Finish it for a bronze, silver or gold medal; press `Esc` early and the run is abandoned.
- **Free Drift** — no clock and no laps. Press `Esc` to bank your points.

Scoring: a drift counts while the car slides 12°–110° above 25 km/h on the road. Points grow with
angle × speed, and the multiplier climbs to ×5 the longer you keep sliding (one step every 2.2 s).
Straighten up for about a second and the drift is banked. A hard wall hit, a crash, a reset or
running off the road loses the drift in progress. On the expressway, drifting close past traffic
adds a bonus. Results show your score, best single drift and how far the next medal is; best
scores per location and mode are kept in the browser. Rules and medal targets are at the top of
`js/drift.js`.

**Transmissions**

- **Automatic** — the car shifts for you.
- **Semi-automatic** — you shift with `E` / `Q`; no clutch.
- **Manual** — hold `Left Shift` (clutch) and press `E` / `Q`. Shifting without the clutch is
  refused. With the clutch in, or in neutral, the engine revs freely.

In both manual modes the gears are R · N · 1–6, the engine hits its rev limiter if you do not
shift up, and a downshift that would over-rev the engine is refused. Select R from a standstill
by shifting down past neutral. The dashboard shows gear, rpm and speed; the gear indicator
lights up when it is time to shift.

**Driving modes** (press `M` while driving, or choose in the Drive menu)

| Mode | What changes in the physics |
| --- | --- |
| Comfort | Slow, smooth steering and throttle, soft suspension with more body roll, stability control steps in early, no power slides |
| Sport | Quicker steering and throttle, a little slip allowed |
| Track | Stiff and flat, +5 % tyre grip, stronger brakes, faster shifts, later stability control |
| Drift | Rear grip reduced, traction control off, fast steering lock; any car with driven rear wheels slides on power and holds it |
| Race | Fastest steering, throttle and shifts, +6 % grip, strongest brakes, minimal aids |
| Custom | Seven sliders: steering response, throttle response, traction control, stability control, suspension stiffness, brake strength, drift assist |

**Air suspension presets** (only on cars fitted with *Air Suspension* in the Stance panel)

| Preset | Key | Effect |
| --- | --- | --- |
| Show | `1` | Laid out on the ground with the wheels tucked. Rises 22 mm automatically once the car is moving. Grounding out costs grip and speed. |
| Street | `2` | Factory ride height, full travel. |
| Track | `3` | 45 mm lower, stiffer: lower centre of gravity, 40 % less body roll, more cornering grip. |
| Off-Road | `4` | 55 mm higher with long travel: much more grip and less drag on grass, more roll and less grip on tarmac. |

The four preset buttons are in the Stance panel, with separate front and rear height sliders
(set them differently for rake) and a live ground-clearance readout. Presets can be changed
while driving and the suspension glides to the new height without interrupting anything. Each
car remembers its last air settings.

**Cameras**

| Camera | What you see |
| --- | --- |
| Third-person | The chase camera, trailing the direction of travel so slides show. Far, Near or Overhead with `B`. Pulls back when the parachute opens. |
| Cockpit | The driver's eye, on the correct side of the car (right-hand drive for Japanese brands, left for the rest). Dashboard, A-pillars, rear-view mirror, centre console and a live instrument cluster with rev counter, gear, speed and shift lights. The steering wheel turns with your steering at a 13:1 ratio. Your head moves slightly with acceleration, braking and cornering, and the view leans into turns. |
| Hood | Just above the bonnet, ahead of the windscreen, with the bonnet in the bottom of the frame. It follows pitch and most of the body roll. |

The **Camera** button in the top-right corner shows the current camera; it and `C` cycle the
three, gliding from one view to the next over half a second. Switching never affects the car:
physics runs the same in every camera. The choice is remembered between sessions. Positions are
worked out from each car's own body (seat, belt line, roof, cowl) and can be tuned per car with
a `cam` entry in `js/data.js` (see `CAMERA` there for every setting).

**Drag racing — Apex Dragway**

Choose *1/4 mile* or *1/8 mile*, *Sportsman* or *Pro* tree and *Day* or *Night* under
**Drag strip options** in the Drive menu, then **Go to the drag strip**.

1. Tap `W` to creep forward. The top bulbs light when you are pre-staged, the second pair when
   staged. Come off the throttle in the beams and the line-lock stops the car there.
2. Hold still. The tree starts after a short random pause: three ambers half a second apart
   then green (Sportsman), or all ambers then green 0.4 s later (Pro).
3. Launch on green. Leaving before green is a red light and the run does not count.
4. The time slip shows reaction time, 60 ft, 330 ft, 1/8 mile, 1000 ft and 1/4 mile times and
   the trap speed (averaged over the last 66 ft). The finish-line boards show your E.T. and speed.
5. Brake in the shutdown area (deploy the parachute with `P` if fitted), then press `R` to
   return to the line.

Clean runs go on the *Drag 1/4 mile* and *Drag 1/8 mile* boards in the Drive menu.

**Parachute** — fit one in the garage under **Drag Setup** (single, cross-form or dual; five
canopy designs; the dual needs a body at least 1.80 m wide). The pack is mounted on the rear
of the car. `P` or the **Chute** button deploys it: the canopy streams out, inflates and its
drag grows with the square of speed (about 0.9 g at 250 km/h, 0.3 g at 120 km/h on the test
car). It can only be repacked once the car has stopped. It works on every map, and other
players see it open.

**Driver aids** — `Z` ABS, `X` traction control, `V` stability control; lamps on the dashboard
are green when on, struck through when off and yellow while working.

| System | On | Off |
| --- | --- | --- |
| ABS | Each axle is held just below lock-up, so you can brake and steer | Braking too hard locks the wheels: longer stops and no steering until you ease off |
| TCS | Engine torque is cut to what the surface can take, earlier on loose ground | Excess torque spins the driven wheels, which then push less and slide sideways |
| ESP | Detects oversteer and understeer, brakes individual wheels to correct the yaw and trims the throttle; catches spins | Nothing intervenes — the car will spin if provoked |

Driving modes set the defaults (Comfort, Sport, Track, Custom: all on; Race: ESP off; Drift:
TCS and ESP off). If you switch one yourself, your choice is kept when you change mode until
you press **Use mode defaults** in the Drive menu. In Custom mode the traction and stability
sliders at 0 % switch those systems off.

**Drag Setup panel** (garage; saved separately for every car and used on all maps)

- **Launch control** — on/off (`G` while driving), launch rpm, and Grip / Balanced / Aggressive
  wheelspin management. Hold the brake or handbrake, floor the throttle (the engine holds the
  launch rpm and turbo cars build boost), then release.
- **Gear ratios and final drive** — six ratios plus the final drive, with the top speed in
  each gear shown. Shorter gearing accelerates harder and lowers top speed.
- **Tyre pressure** — front and rear, 12–45 psi. Lower pressure gives more traction off the
  line but less cornering grip and more rolling drag; higher pressure does the opposite.
- **Boost pressure** — on turbocharged or supercharged builds, 60–170 % of the base boost.
  Power follows boost until the engine's limit, where the wastegate holds it and the panel
  says so.

**Multiplayer drag racing** — connect as for multiplayer below, then press **Find drag race**
to be paired with whoever is waiting on the same distance, or **Private drag room** for a
code to share. Each racer gets a lane. When both are staged the server starts one tree for
both and afterwards sends both players the same result: reaction times, elapsed times, trap
speeds and the winner (first across the line; a red light loses). While you wait for an
opponent you can make practice runs. Verified runs go on the **Online drag** board.
The server rejects a run that is faster than physically possible, whose time does not match
the server's own clock since the green light, or where the car's position stream never
reached the finish.

**Scoring**

| Manoeuvre | Points |
| --- | --- |
| Close overtake (under 1.6 m of clearance) | 60–300, more the tighter and faster it is |
| Weave (close overtakes on alternate sides within 3 s) | +150 |
| Clean overtake | +25 |
| High speed (above 140 km/h on the expressway, 170 elsewhere) | points every second |
| Drift | angle × speed, banked when the slide ends cleanly |

Every scoring manoeuvre raises the multiplier (up to ×8). It lasts six seconds and is renewed
by the next manoeuvre. Hitting a wall resets the multiplier and cancels the current drift.
Hitting traffic ends the run and banks the points you had. Leaving with `Esc` banks the run too.

The **leaderboard** in the Drive menu keeps the ten best runs per map with driver name and
car, and highlights your personal best. Set your driver name there; several people can use the
same computer under different names. Scores are stored in the browser on that computer — there
is no online ranking. Rows marked *target* are reference scores to aim for, not real players.

**Multiplayer** (Midnight Expressway)

Multiplayer is real: every other car is another person connected to the same server.

1. Start the server with `node server.js` and open the address it prints. Live Server cannot
   host multiplayer — it only serves files.
2. Press **Drive**. The menu connects automatically and lists the public lobbies with their
   player counts. Press **Join**, or **Create private room** to get a six-character code to
   share. Friends enter the code and press **Join**. Private rooms are not listed and cannot
   be entered without the code.
3. You see each player's customised car with their name above it, a player list with scores,
   and a chat box (press `Enter`). The **Online** leaderboard tab shows the server's all-time
   best multiplayer runs.

Playing with friends:

- **Same Wi-Fi:** run `node server.js` on one computer and have friends open
  `http://<that computer's IP address>:5173` (find the address with `ipconfig` on Windows or
  `ifconfig` / `ip addr` on Mac and Linux).
- **Over the internet:** deploy this folder to any host that runs Node.js (Render, Railway,
  Fly.io, a VPS). Start command: `node server.js`. It listens on the `PORT` environment
  variable and needs no packages installed. Everyone then opens that site's address. Over
  https the game uses secure WebSockets automatically.
- **Game hosted somewhere else:** type the server's address (for example
  `wss://my-server.example.com/ws`) into the *Server address* box and press **Connect**.

What the server checks: message size and rate, that a car build is well-formed, that positions
are inside the map, that no car moves faster than is possible or teleports, that scores only
grow as fast as the scoring rules allow, and that a banked run is no bigger than the points it
saw being earned. Names and chat are sanitised and rate-limited. Players who stop responding
for 30 seconds are removed.

Things to know: up to 8 players per room. Traffic in multiplayer follows the server clock so
everyone sees the same vehicles in the same places, but it does not brake or change lane for
players as single-player traffic does. Players' cars pass through each other. Single-player is
unchanged and needs no server.

**Handling notes**

- Steering always takes priority: the brakes (ABS) and engine (traction control) only get the
  grip that cornering is not using, so you can steer while braking or accelerating.
- To drift, flick the handbrake while turning and stay on the throttle; counter-steer to hold
  it. Powerful rear-drive cars can also be kicked sideways with full throttle and full lock in
  first or second gear.
- Tyres matter: semi-slicks grip hardest and respond sharply, touring tyres slide earlier,
  drag radials launch hard but corner poorly. FWD pushes wide under power, RWD rotates,
  AWD puts power down early.

Drive mode needs a keyboard; there are no on-screen touch controls.

## What is in the garage

- **32 cars, 19 brands** — Nissan GT-R R35, Skyline GT-R R34, Silvia S15 and Z; Toyota Supra MK4,
  GR Supra and GR86; Honda NSX, Civic Type R and S2000; Mazda RX-7; Subaru WRX STI;
  Mitsubishi Lancer Evo X; Lexus LFA; BMW M3 E46 and M4; Mercedes-AMG GT R; Audi R8;
  Porsche 911 GT3 and 718 Cayman GT4; Ford Mustang GT and GT; Chevrolet Corvette C8 and
  Camaro ZL1; Dodge Challenger Hellcat and Viper ACR; Aston Martin Vantage; Lamborghini
  Huracán and Aventador; Ferrari 488 GTB; McLaren 720S; Bugatti Chiron.
- **Body kits** — Street Aero, Liberty Walk LB★WORKS (riveted over-fenders),
  LB-Silhouette WORKS GT, Rocket Bunny / Pandem, Time Attack Carbon. Plus five rear wings,
  vented / carbon hoods, roof options and window tint.
- **Paint** — 24 colours + custom picker; gloss, metallic, pearl, satin, matte and chrome.
- **Wheels** — 8 rim designs, 9 finishes, diameter options, caliper colours.
- **Tyres** — touring, UHP summer, semi-slick, drag radial, stretched fitment.
- **Suspension** — factory, lowering springs, coilovers and air suspension (with air-out),
  plus ride height, front/rear camber and wheel offset sliders.
- **Engines** — 30 swaps from a 2.0 L four to an 8.0 L W16, including rotary, boxer,
  cross-plane and flat-plane V8s, V10s and a V12. Each has its own 3D model and firing-order-based sound.
- **Forced induction** — three turbo setups (whistle, blow-off valve, flutter) and three
  superchargers (whine); they can be combined.
- **Exhausts & intakes** — four of each; they change tone, volume, overrun pops, tip style,
  induction noise and power.
- **Live performance sheet** — power, torque, 0–100, top speed, handling and weight compared
  with factory spec, plus an itemised build cost.

## Project structure

```
car-customizer/
├── index.html          Page shell and UI markup
├── css/style.css       Garage interface styling
├── js/
│   ├── main.js         App entry: state, saved cars, engine simulation, input, render loop
│   ├── data.js         Catalogue of cars and every part (edit this to add content)
│   ├── scene.js        Renderer, camera, lighting, garage environment
│   ├── materials.js    Paint, glass, carbon, metal materials
│   ├── geo.js          Geometry helpers (lofting, interpolation)
│   ├── body.js         Procedural car body, lights, grilles, shut-lines
│   ├── kit.js          Body kits: flares, splitters, skirts, diffusers, wings
│   ├── wheels.js       Tyres, rims, brakes, struts
│   ├── engine3d.js     Engines, turbos, superchargers, intakes, exhaust piping
│   ├── car.js          Assembles the car; stance, x-ray, lights, flames
│   ├── audio.js        Synthesised engine, starter, turbo, blower, exhaust and road sound
│   ├── designs.js      Individual grille / lamp / bumper designs for all 32 cars
│   ├── world.js        Drivable locations: expressway, race circuit, night city
│   ├── traffic.js      AI traffic for the expressway
│   ├── score.js        Points, combo multiplier, records and leaderboard
│   ├── drift.js        Drift events: drift scoring, medal targets and drift records
│   ├── drive.js        Drive mode: vehicle physics, driving modes, transmissions, cameras
│   ├── drag.js         Drag race control: staging, tree, timing, time slip
│   ├── chute.js        Parachute pack and canopy
│   ├── cockpit.js      Cockpit interior, instrument cluster and camera attachment points
│   ├── net.js          Multiplayer client (WebSocket)
│   ├── remote.js       Other players' cars and name tags
│   ├── stats.js        Performance model and pricing
│   └── ui.js           Panels, stats bars, tachometer
├── vendor/three/       Three.js r170 (MIT licence) — bundled for offline use
├── server.js           Zero-dependency web server + multiplayer server (WebSocket)
└── .vscode/            Recommended extension + F5 launch config
```

## Adding your own content

Everything is data-driven. To add a car, copy an entry in `CARS` inside `js/data.js` and
change its dimensions and profile; the body, kits, wheels and engine bay adapt automatically.
Give it a face by adding an entry with the same id in `js/designs.js` (grille, lamps, vents).
New engines, rims, kits or exhausts are added the same way in their respective lists.

## Notes

- The cars are **procedurally generated approximations** built from each model's real
  dimensions and proportions — they are recognisable in stance and silhouette but are not
  licensed, scan-accurate replicas. Brand and product names are used for identification only.
- Saved cars, scores and settings are stored in your browser (localStorage) on this computer; clearing site data
  removes them.
- Sound needs a user gesture (browser policy), so audio starts when you first press
  **ENGINE START**.
- A discrete or recent integrated GPU is recommended. Tested in current Chrome, Edge and Firefox.
