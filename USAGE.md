# Using FlyLab

This guide walks through the interface and then gives step-by-step recipes for the experiments FlyLab is built for. For how the model works, see [README.md](README.md).

- [1. Start it](#1-start-it)
- [2. The screen at a glance](#2-the-screen-at-a-glance)
- [3. Giving the fly stimuli](#3-giving-the-fly-stimuli)
- [4. Reading what the fly does](#4-reading-what-the-fly-does)
- [5. Turning neurons off (and on)](#5-turning-neurons-off-and-on)
- [6. Measuring effects: experiments and knockout screens](#6-measuring-effects-experiments-and-knockout-screens)
- [7. Watching the brain](#7-watching-the-brain)
- [8. Model settings](#8-model-settings)
- [9. Recipes](#9-recipes)
- [10. Troubleshooting](#10-troubleshooting)
- [11. Glossary](#11-glossary)

---

## 1. Start it

```bash
npm start            # or: python3 -m http.server 8000 --directory app
```

Open <http://localhost:8000>. A loading screen shows progress while the connectome downloads (about 14 MB), decompresses and is built into 139,255 neurons. This takes a few seconds. When it finishes, the fly is standing in the middle of the arena.

The intact fly stands still until something stimulates it. That is expected; see [Limitations](README.md#limitations).

---

## 2. The screen at a glance

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ FlyLab           t · speed · spikes/frame · rate ▾ · Pause · Reset · Clear    │  header
├──────────────────────────────────────────────┬────────────────────────────────┤
│ Stimulus: Looming | Small object | Sound | … │ Lesions | Experiments |        │
│ tool options (sliders, preset buttons)       │ Brain | Model                  │
├──────────────────────────────────────────────┤                                │
│                                              │   side panel for the tab       │
│              ARENA (top-down view)           │   you picked                   │
│                                              │                                │
├───────────────────────┬──────────────────────┤                                │
│ Descending & motor    │ Fly's-eye view       │                                │
│ neuron output         │ Event log            │                                │
└───────────────────────┴──────────────────────┴────────────────────────────────┘
```

**Header controls**

| Control | What it does |
|---|---|
| `t` | Simulated time in seconds |
| `speed` | Actual simulated ms per real ms. It drops below the requested rate when the brain is very busy. |
| `spikes/frame` | Spikes across the whole brain since the last screen update |
| `rate` | Requested playback speed: 0.05×, 0.1×, 0.25×, 0.5× or 1×. Use slow rates to watch an escape. |
| **Pause / Run** | Freezes and resumes the simulation |
| **Reset fly** | New brain state and body at the centre of the arena. Your lesions are kept. |
| **Clear stimuli** | Removes objects, speakers, wind, food and CO₂ |

---

## 3. Giving the fly stimuli

Pick a tool in the **Stimulus** bar. Its options appear underneath. Most tools work by clicking in the arena. Direction is always measured from the fly's point of view, so "from the left" means the fly's left, whichever way it faces.

| Tool | How to use it | Which neurons it reaches |
|---|---|---|
| **Looming object** | Click anywhere around the fly: a dark disc launches from that direction and flies straight at it. Or press **From left / From right / Front / Behind**. Sliders: **speed** (100–600 mm/s), **radius** (1–12 mm) and **elevation** (−20° to 80°; high values come from above). | LPLC2, LC4, LPLC1, LC6 looming detectors |
| **Small object** | Click on one side of the fly: a small object crosses its view 25 mm away without approaching. | LC11, LC10a small-object detectors |
| **Sound** | Click to place a speaker. Sliders: **frequency** (50–900 Hz) and **loudness**. Tick **song pulses** for courtship-song-like 35 ms pulses. The antenna facing the speaker hears it louder. | Johnston's organ A, B, D |
| **Wind** | Click where the wind should come from. **Speed** slider; **Stop wind** turns it off. | Johnston's organ C, E |
| **Touch** | Press **Head, Left eye, Right eye, Left antenna** or **Right antenna** to brush that bristle field for 0.3 s. | Head, eye and antennal bristle neurons |
| **Food** | Choose **sugar, water** or **bitter**, then click to place a drop, or press **Under the head**. The fly smells it from a distance and tastes it when its head is over the drop. If it extends its proboscis and pumps, the drop shrinks. | Food-odour receptor neurons; sugar or bitter taste neurons |
| **CO₂** | Click to place a CO₂ source. | V-glomerulus receptor neurons |
| **Move fly** | Press where the fly should go and drag in the direction it should face. | — |

Stimuli stack: you can have wind, a speaker and food out at once and then launch a looming object.

---

## 4. Reading what the fly does

### Arena

- **Status pills** (bottom left): *Standing*, *Walking*, *Airborne* with altitude, *Turning left/right*, *Proboscis out*, *Hit by object*, and the number of silenced neurons.
- A **looming object** is drawn as a dark disc with its shadow, a dashed line to the fly and a label with its angular size (as the fly sees it) and height.
- The fly's **proboscis** is drawn in amber when extended. The **head** turns when neck motor neurons fire unevenly. When airborne the fly grows slightly and casts a shadow offset by its altitude.
- **Zoom** slider and **follow** checkbox (bottom right). Untick *follow* to keep the camera still.

### Descending and motor neuron output

One row per output in the brain-to-body table. For each: the left and right bars and the firing rate in Hz per neuron (left · right). Hover a row name to see the paper behind it. If every neuron of an output is silenced, its name turns red and is struck through.

Rules of thumb:

- **Forward walking** (DNp09) above ~10 Hz moves the fly forward. **Backward walking** (MDN, DNp42) moves it backward.
- The fly turns toward the side whose **turning** DNs fire more.
- **Any single Giant Fiber spike** means a jump 5 ms later.
- **Looming take-off** DNs must stay active for about a tenth of a second to trigger a slower, wings-first take-off.

### Fly's-eye view

A panorama of what the fly sees: left edge = directly behind via the left, centre = straight ahead, right edge = behind via the right. Each dot is one **LPLC2 looming detector**, placed at its receptive-field centre. Dots flash when the neuron spikes and turn red when silenced. Approaching objects appear as growing dark discs.

### Event log

Timestamped events: stimuli you gave, **TAKE-OFF** (with *short (Giant Fiber)* or *long (non-GF)* mode), *landed*, **HIT** (the object reached the fly while it was still on the ground) and *object passed, fly escaped*.

---

## 5. Turning neurons off (and on)

Open the **Lesions** tab.

### Mode

- **Silence neurons** (default): chosen neurons never fire.
- **Activate (optogenetics)**: chosen neurons fire at 150 Hz.

The mode applies to what you add next. The list can hold both kinds at once; silenced items are red and driven items are amber.

### Ways to pick neurons

| Section | Use it to | Example |
|---|---|---|
| **Quick picks** | One-click common manipulations | *Giant Fiber (DNp01)*, *Left optic lobe*, *Sugar taste neurons*, *Forward walking DN (DNp09)* |
| **Brain regions** | Silence a region on the left (**L**), right (**R**) or both sides (**L+R**). Click again to undo. | *Central complex L+R*; *Optic lobe L* |
| **Cell type** | Any of ~8,800 FlyWire types. Start typing and pick from the suggestions, choose *both sides / left / right*, press **Add** (or Enter). The line below shows the count, transmitter and region. | `LPLC2`, `MDN`, `KCg-m`, `DNa02` (left) |
| **Single neuron** | One specific neuron, by FlyWire root ID or as *type #n* | `DNp01 #1`, `720575940622838154` |
| **Whole class** | Every neuron of a super-class or class | *Super-class: descending*, *Class: Kenyon Cell* |

**Active manipulations** lists everything applied, with neuron counts. Remove an item with **×**, or press **Restore all neurons**. Changes reach the running fly immediately; you don't need to reset.

> **Which neurons count as "in" a region?** A neuron belongs to the region where it receives most of its input synapses, which is where its dendrites do their computing. So silencing the lobula also silences the LPLC2 and LC4 detectors whose dendrites sit there.

---

## 6. Measuring effects: experiments and knockout screens

Watching one trial is anecdotal. The **Experiments** tab repeats a standard stimulus on fresh flies and measures the result. The live fly pauses while an experiment runs.

### Protocols

| Protocol | What happens (per trial) |
|---|---|
| Looming disc from the left / right / front / behind / above | Disc launched at 100 ms; trial lasts 700 ms |
| Sugar / Bitter drop under the head | Drop present from the start; 600 ms |
| Touch on the head bristles / left antenna | 300 ms touch; 600 ms trial |
| Pulse song (200 Hz) from the left | Speaker on from the start; 600 ms |
| Wind from the front · CO₂ plume ahead · Food odour ahead | Present from the start; 600 ms |

**Trials** sets repetitions per condition (1–30; 5 is a good default). Trial *k* uses the same random seed in every condition, so the comparison is paired.

### Intact vs. current manipulations

1. Set up your lesions in the Lesions tab.
2. In Experiments, pick a protocol and the number of trials.
3. Press **Run comparison**.

You get a bar for each condition on the chosen **measure**, plus a table of every measure side by side, plus a per-trial line (take-off time with `GF` or `L` for long mode, `hit`, or `—` for no take-off).

### Knockout screen (one by one)

A screen silences each candidate **on its own**, reruns the protocol, and ranks candidates by how much the chosen measure moved from intact.

| Candidate list | What it tests |
|---|---|
| Each brain region, each side | ~23 region lesions |
| Top 20 cell types wired into the Giant Fiber / looming DNs / proboscis motor neurons / DNp09 / turning DNs | The strongest direct inputs to that output, by synapse count and sign. The label shows the net synapses, e.g. `LPLC2 (+844 syn)`. |
| Each neuron of one cell type | Every neuron of the type you enter, one at a time (first 80) |
| My list of cell types | Comma-separated types you enter |

Pick the **measure** that matches the question. It is set automatically when you change protocol, and you can override it.

| Measure | Use with |
|---|---|
| Take-off probability · Hit before escaping · Take-off time · Share of Giant-Fiber take-offs | Looming protocols |
| Giant Fiber spikes · Looming-DN spikes | Looming, finer-grained |
| Proboscis / Ingestion motor neuron spikes | Sugar, bitter, head touch |
| Forward-walking / Turning DN spikes · Neck motor neuron spikes · Net body turn | Any protocol |
| Total brain spikes | How much of the brain the stimulus engages |

In the results, grey is the intact baseline. The right-hand column shows the value and its change (red = decrease, green = increase). **Cancel** stops a running screen.

**How long it takes.** A looming trial with a quiet brain takes about 0.2 s of compute. A 21-condition screen with 5 trials takes roughly 20–40 s. Odour protocols engage more of the brain and are slower.

---

## 7. Watching the brain

The **Brain** tab shows:

- **Whole-brain activity.** A frontal view of the brain with every neuron as a faint dot. Spikes flash in teal, silenced neurons are red and driven neurons are amber. The optic lobes are the two wide lobes at the sides; the fly's left is on the left.
- **Most active cell types** over the last quarter second, with spikes per second and the number of neurons of that type. Use it to trace a response: during a looming stimulus you'll see LPLC2, LC4 and then descending neurons.
- **Sensory input.** The mean firing rate per neuron for every sensory channel, so you can confirm a stimulus is actually reaching the brain.

The brain map only draws while the Brain tab is open, which saves a little speed.

---

## 8. Model settings

In the **Model** tab:

| Setting | Default | Effect |
|---|---|---|
| Visual entry point | Feature detectors | *Pure retina* drives the ~11,000 photoreceptors instead and leaves all visual processing to the connectome. Looming escapes largely stop, because the model has no graded neurons to compute motion. |
| Global arousal | off | Adds the same depolarisation to every neuron, a stand-in for neuromodulatory state. It produces spontaneous activity and take-offs. Above ~3 mV the simulation runs roughly 3× slower. |
| Membrane noise | off | Random voltage fluctuations in every neuron (also forces full integration, so it is slower) |
| Synaptic depression | 0.10 | Fraction of synaptic resources used per spike. Set it to 0 to see the runaway activity it prevents (give an odour, then watch the Brain tab). |
| Spike adaptation | 1.00 mV | Self-inhibition added per spike (decays over 300 ms) |

Settings apply to the live fly and to any experiment started afterwards. The tab also lists the complete brain-to-body table, the sensory channels with neuron counts, known limits and sources.

---

## 9. Recipes

### Watch a looming escape

1. Set **rate** to **0.1×**.
2. Stimulus → **Looming object** → **From left**.
3. Watch the LPLC2 dots on the left side of the fly's-eye view light up as the disc grows, then the **Giant-fibre escape jump** row, then **TAKE-OFF · short (Giant Fiber)** in the log. The fly flies off and lands after about a second.
4. Press **Reset fly** to bring it back.

### Reproduce the Giant Fiber knockout (von Reyn et al. 2014)

1. Lesions → Quick picks → **Giant Fiber (DNp01)**.
2. **From left** again. The fly now takes off in *long (non-GF)* mode, later, and the disc often reaches it first (**HIT**).
3. Quantify: Experiments → *Looming disc from the left*, 5 trials → **Run comparison**. Compare *Take-off time* and *Share of Giant-Fiber take-offs*.
4. Add **GF + looming DNs** and compare again: take-off disappears.

### Blind one side

1. Brain regions → **Optic lobe → L**.
2. Launch from the left: no response, and the left-eye dots in the fly's-eye view are red. Launch from the right: normal escape.

### Feeding

1. Stimulus → **Food** → *sugar* → **Under the head**. The proboscis extends and *Proboscis* and *Ingestion* rows fire. The drop shrinks as the fly eats.
2. Switch to *bitter*: nothing.
3. Silence **Sugar taste neurons**, or the **SEZ** region, and try sugar again.

### Make the fly walk (optogenetics)

1. Lesions → **Activate (optogenetics)**.
2. Cell type `DNp09` → **Add**. The fly walks forward.
3. Replace it with `MDN`: it walks backward (moonwalker).
4. Replace it with `DNa02`, side **left**: the fly turns left on the spot. Add `DNp09` as well and it walks in a leftward circle.
5. Switch back to **Silence neurons** mode before you add lesions.

### Find which inputs matter for escape

1. Experiments → Protocol *Looming disc from the left* → trials 3–5.
2. Knockout screen → **Top 20 cell types wired into the Giant Fiber** → measure **Giant Fiber spikes** (or *Take-off probability*) → **Run screen**.
3. The ranked list shows which input types the escape depends on. Some strong inputs are inhibitory, and silencing one of those can raise GF output (shown in green).

### Turn neurons off one at a time

1. Knockout screen → **Each neuron of one cell type** → type `LPLC2`.
2. Protocol *Looming disc from the left*, measure *Giant Fiber spikes*, 3 trials.
3. See whether single detectors matter or whether the population is redundant.

### Survey the whole brain

Knockout screen → **Each brain region, each side** with any protocol. For looming from the left, expect *Optic lobe L* at the top.

### Probe hearing

Place a **Sound** speaker at 200 Hz with song pulses. The fly doesn't move. The Brain tab's sensory list shows Johnston's organ B firing, and *Most active cell types* is dominated by the JO-B and JO-D afferents themselves; activity further along the auditory pathway is weak in this model. Try silencing the **Hearing centre** and compare *Total brain spikes* in an experiment.

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| Stuck on "Wiring up a fruit-fly brain" | Serve the folder over HTTP (`npm start`); `file://` blocks the worker. Use a current browser. The error, if any, replaces the loading text. |
| `speed` well below 1× | The brain is very active, for example from odours or with arousal or noise on. Turn arousal and noise off, clear stimuli, or press **Reset fly**. |
| Fly flew into a wall or off-screen | Press **Reset fly**, or use **Move fly**. Tick **follow** to keep the camera on it. |
| Fly does nothing after a stimulus | Check the Brain tab's **Sensory input** to confirm the channel fired. Many stimuli (sound, wind, odours) excite the brain without reaching the mapped outputs. That is a model result, not a bug. |
| "Unknown cell type" | Pick a name from the suggestions. Names are case-sensitive (`DNp01`, not `dnp01`). |
| "No neurons match" | That side or class has no neurons of that kind (e.g. unpaired regions have no L/R). |
| Root ID not found | IDs must be from FAFB **v783**. Older IDs change when neurons are edited. |
| Experiment seems frozen | Screens with many conditions take a while. Watch the progress bar, or press **Cancel**. |

---

## 11. Glossary

| Term | Meaning |
|---|---|
| **Connectome** | Complete wiring diagram: every neuron and every synapse between them. FlyWire mapped the adult fly brain from electron microscopy. |
| **LIF neuron** | Leaky integrate-and-fire: voltage adds up incoming input, leaks back to rest, and fires a spike when it crosses a threshold. |
| **Neuropil** | A dense region of synapses; the brain's anatomical "areas" (e.g. LO = lobula, AL = antennal lobe, GNG = gnathal ganglion). |
| **DN (descending neuron)** | Neuron that carries commands from the brain down to the nerve cord that runs the legs and wings |
| **Giant Fiber (DNp01)** | Pair of very large DNs that trigger the fastest escape jump |
| **LPLC2 / LC4** | Visual projection neurons of the lobula that respond to objects approaching on a collision course |
| **Short-mode / long-mode take-off** | Fast jump without raising the wings (Giant Fiber) vs slower take-off with the wings raised first (other DNs) |
| **Johnston's organ (JO)** | Hearing and wind sensor in the antenna; subgroups A–E respond to different kinds of antenna movement |
| **Optogenetics** | Switching neurons on with light in real flies; here, forcing them to fire |
| **Lesion / silencing** | Removing neurons' output; here, they are prevented from firing |
