# wellwellwell

**wellwellwell** — a spatial essay around a pixelated circular well in a procedural desert.

## Run

```sh
npm install
npm run dev
```

`npm run build` runs TypeScript and creates the production site in `dist/`.
`npm run preview` serves that build.

## Experience

Start beneath a dense violet starfield. As the camera tilts toward the dunes, 48 shooting stars take varied paths into the shaft of the fixed well; each wave culminates in one of its three soft inner glows. A blurred, non-emissive mosaic covers the outside and top of the well; the shaft is plain stone and glows from within. The camera then moves straight toward it before the landscape brightens. Three chapters explore seeing, bodily ritual and sound, and encounters with other people. The 8,200 background stars share one points draw call, and the meteor heads and trails use two instanced draws.

Edit the opening scroll length, six named scene boundaries, shooting-star arrivals, camera path, and light timing in `src/openingSequence.ts`. The active scene name appears in the opening caption and `data-scene-name` attribute.

The later chapters use one continuous scroll timeline. Edit the named camera beats and 1:1 window transition in `src/sceneTimeline.ts`; section anchors are derived from the page layout. Chapter 01 holds a frontal view of the glowing well inside the circular window. Chapter 02 bends into the shaft for the sound ritual. Before chapter 03, the fixed-size view becomes pixelated, its pixels become finer, and its colors dissolve into the page background. After a pause, chapter 03 reverses that transition and returns to the well. The closing window expands to fill the screen, the ending text appears as timed subtitles, and the camera approaches, tilts over, then descends into a pool of iridescent balls inside the well. Click a ball to lift it toward the lens, move the pointer across its surface to draw a fading stroke, or click away to release it. The well stays fixed while the camera, light, ground glyph, and water change around it.

Sound starts only after a click and can be muted. “TEXT ONLY” turns off the 3D scene. The two-person response is a local exercise, not an online presence system.

Clicking or dragging the sand near the well, including in the full-screen closing scene, scoops the actual 3D mesh, piles a little sand around the scoop, and lets steep edges settle. An impact trace fades away, while the changed sand surface remains until the page is reloaded. The first click plays a soft synthesized rustle when sound is on. Clicks on the well, text, links, and controls do not dig.

## Terrain

`src/desertTerrain.ts` generates a fixed slice through a 3D Perlin field with five fBM octaves, domain warping, and directional scaling. A denser annular mesh around the shaft adds irregular shallow relief and sheltered sand deposits, then blends into the distant dune mesh. Edit `DESERT` and `NEAR_SAND` to adjust terrain scale, wind, resolution, and the detailed area.

`src/sandMaterial.ts` extends the sand's PBR material with non-periodic world-space color and roughness variation. The stone and sand base textures are generated locally in `src/sceneMaterials.ts`.

`src/sandSimulation.ts` holds the near-well sand heightfield and its local slope relaxation. This is a lightweight granular approximation on the existing mesh; the distant dunes remain static.

Geometry, stone and sand textures, and the sky are procedural. No external model or texture download is required.

## Stack

React · TypeScript · Tailwind · Motion · Three.js / React Three Fiber · Rapier.

See [SPEC.md](SPEC.md) for the narrative and camera specification.
