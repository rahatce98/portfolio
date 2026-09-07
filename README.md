# Md. Rahat Hossain — Interactive 3D Engineering Portfolio

An interactive WebGL portfolio built with React, Three.js and React Three Fiber, deployed to
GitHub Pages at **<https://rahatce98.github.io/portfolio/>**.

The rocket, the vehicle and the mechanical systems are real 3D scenes you can orbit, take
apart, and inspect component by component — not images, and not CSS pretending to be 3D.

---

## 1. Repository layout

This repo holds **both the source and the built site**, because GitHub Pages for this
repository is configured as *Deploy from a branch → `main` / `(root)`*. Pages serves the top
level, so the compiled `index.html` has to live there. The source therefore lives one level
down, in `app/`.

```
portfolio/
│
├─ index.html            ← BUILT — this is what GitHub Pages serves
├─ build/                ← BUILT — hashed JS + CSS
├─ assets/               ← BUILT — images, favicon (copied from app/public)
├─ 404.html robots.txt sitemap.xml .nojekyll     ← BUILT
│
├─ app/                  ← SOURCE (the Vite root)
│  ├─ index.html         ← source HTML entry: meta, fonts, JSON-LD, no-JS fallback
│  ├─ public/            ← copied verbatim into the build
│  │  └─ assets/img/profile.jpg    ← YOUR PHOTO GOES HERE
│  └─ src/
│     ├─ main.jsx        ← React entry
│     ├─ App.jsx         ← page composition + code splitting
│     ├─ data/
│     │  ├─ site.js      ← ALL WRITTEN CONTENT LIVES HERE
│     │  └─ assemblies.js  ← the 3D component lists + their info-panel copy
│     ├─ three/          ← the WebGL layer
│     │  ├─ Stage.jsx      ← the single <Canvas> configuration + lighting rig
│     │  ├─ Rocket.jsx     ← procedural launch vehicle, 6 named components
│     │  ├─ Car.jsx        ← procedural vehicle, 9 named assemblies
│     │  ├─ Systems.jsx    ← gear train, truss, flow network
│     │  ├─ Atmosphere.jsx ← star field, dust, shader grid floor
│     │  ├─ Rig.jsx        ← camera rig: free orbit + scripted fly-to
│     │  └─ materials.js   ← shared material library
│     ├─ sections/       ← one file per page section
│     ├─ components/     ← nav, loader, control panel, info panel, cards
│     ├─ hooks/          ← scroll, visibility, device tier, pointer
│     └─ styles/global.css ← the whole design system
│
├─ scripts/publish.mjs   ← mirrors dist/ up to the repo root
└─ vite.config.js
```

---

## 2. Running it locally

Requires Node 18+.

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:5178/portfolio/> — note the `/portfolio/` path. The dev server
respects the same `base` as production, so what you see locally is what Pages serves.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves the built `dist/` at <http://localhost:4178/portfolio/> |
| `npm run publish:pages` | Builds **and** mirrors `dist/` to the repo root, ready to commit |

---

## 3. Deploying

### The normal flow

```bash
npm run publish:pages
```

```bash
git add -A && git commit -m "Update site" && git push
```

That is the whole deployment. `publish:pages` runs the build and then copies the output to
the repo root; pushing to `main` is what makes it live. GitHub Pages picks the change up
within a minute or two.

`scripts/publish.mjs` is deliberately conservative — it removes only the top-level names the
current build actually produced, refuses to run if `dist/index.html` is missing, and will
never touch `app/`, `scripts/`, `node_modules/`, or any git metadata.

### First-time Pages setup

If Pages is ever reset, restore it under **Settings → Pages**:

- **Source:** Deploy from a branch
- **Branch:** `main`, folder `/ (root)`

### Optional: build on GitHub instead

`.github/workflows/deploy.yml` can build and deploy from Actions, which keeps compiled files
out of git. It is **manual-dispatch only** so it cannot fight the committed-build flow above.
To switch over: set **Settings → Pages → Source** to *GitHub Actions*, then run the workflow
from the Actions tab. Once that works you can stop committing `index.html`, `build/` and
`assets/`.

### Changing the URL

Everything hangs off one value. If the repo is renamed, or you move to a custom domain, edit
`base` in `vite.config.js` (`'/portfolio/'` → `'/new-name/'`, or `'/'` for a custom domain),
then update `seo.canonical` in `app/src/data/site.js` and the absolute URLs in
`app/index.html`, `app/public/sitemap.xml` and `app/public/404.html`. Nothing in `src/`
hard-codes a path — runtime asset references go through `import.meta.env.BASE_URL`.

---

## 4. Editing the content

**Everything you will normally want to change is in `app/src/data/site.js`.** No component
reads a hard-coded string; every list renders itself.

| To change | Edit |
|---|---|
| Name, role, intro, photo, CV link | `person` |
| Email, WhatsApp, location | `contact` |
| Social links | `socials` |
| About copy and the three pillars | `about` |
| Skill groups | `expertise` |
| The Engineering × Technology chain | `chain` |
| Jobs | `experience` |
| Degrees | `education` |
| Projects and their filters | `projects`, `projectCategories` |
| What you are learning | `lab.items` |
| What you are working on now | `now` |
| Page title / description / canonical URL | `seo` |
| Nav items and section order | `sections` |

### Your photo

Save a square portrait (~800×800, under ~300 KB) to:

```
app/public/assets/img/profile.jpg
```

If the file is missing the site falls back to the **RH** monogram rather than breaking.

### The 3D component lists

`app/src/data/assemblies.js` drives the labs. Each entry gives a component its label, code,
explode offset, camera framing and the text shown in the information panel. Add an object to
`ROCKET_COMPONENTS` or `CAR_COMPONENTS` and the stepper, the progress ticks, the info panel,
the explode maths and the camera framing all pick it up — the only extra work is drawing the
geometry in `three/Rocket.jsx` or `three/Car.jsx` and giving its `<Part>` the matching id.

---

## 5. How the 3D works

### The models are procedural, not downloaded

Every object is generated from Three.js geometry at runtime. That is a deliberate choice, not
a shortcut:

- **The disassembly requires it.** A downloaded GLB is a single fused mesh. It cannot be split
  into a nose cone, a fuel tank and a nozzle that are individually clickable, labelled and
  animatable. Authoring the hierarchy is the only way that feature exists at all.
- **It costs nothing to download.** There are no `.glb` files, so there is no multi-megabyte
  model fetch, no Draco decoder to ship, and nothing to lazy-load but code.
- **No licence ambiguity.** Nothing here is derived from third-party art.

The nose cone is a real tangent-ogive profile, the nozzle is a converging–diverging bell with
a parabolic expansion, the gear pair meshes at a true 1 : 2.4 ratio derived from its tooth
counts, and the truss members change colour with the sign of their axial force as the load
traverses the span.

### Performance

- **Device tiering** (`hooks/useEnv.js`) sets particle counts, geometry segment counts, the
  device-pixel-ratio ceiling and whether shadows are enabled. Low-power devices get a
  simplified scene; the Engineering Systems canvas degrades to a text panel.
- **Visibility gating** — every canvas sets `frameloop="never"` when its section scrolls out
  of view. Off-screen scenes cost nothing per frame but keep their context and compiled
  shaders warm, so scrolling back is instant.
- **Code splitting** — `three`, `@react-three/*`, React and each lab section are separate
  chunks. The page shell and hero copy paint before the WebGL stack is parsed.
- **No HDRI fetch.** Reflections come from an in-scene environment built from emissive planes
  and baked once to a small cube target, instead of pulling several megabytes of HDR from a
  CDN.
- **Shared materials.** Every material is a module-level singleton, so the shader program
  count stays flat as parts are added. Highlighting clones rather than mutates them.

### Accessibility and preferences

- `prefers-reduced-motion` suppresses autonomous motion — auto-rotation, drift, camera sway,
  scroll-coupled parallax and reveal animations — **without** removing the 3D content. A
  motion preference is not a statement about the GPU, so the two are handled separately.
- Every control is a real `<button>` with a title and `aria-pressed`; the component list is a
  proper listbox; the labs are fully operable from the panel without dragging.
- Without WebGL, each scene renders a written fallback and the rest of the page is unaffected.
- Without JavaScript, `index.html` carries a readable summary and contact links.

---

## 6. Known limitations

- `@react-three/fiber` logs a `THREE.Clock is deprecated` warning on newer Three.js versions.
  It comes from inside the library, not from this code, and is harmless.
- The Rocket Lab is a scroll-driven sequence, so its section is deliberately tall. The nav
  rail and the component stepper both jump straight to any stage.
- There is no contact form. A static Pages site has no server to post one to, and a form that
  silently discarded submissions would be worse than none — the contact section uses real
  `mailto:` and `wa.me` links instead.

---

## 7. Stack

React 19 · Three.js · React Three Fiber 9 · Drei 10 · Vite 7 — no CSS framework, no icon
package, no analytics, no trackers.
