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

Start beneath a dim violet desert sky. The camera tilts from stars down to the dunes and moves straight toward a well fixed in the sand. The well glows softly three times before the landscape brightens. Three chapters explore seeing, bodily ritual and sound, and encounters with other people.

Edit the opening scroll length, six named scene boundaries, camera path, and light timing in `src/openingSequence.ts`. The active scene name appears in the opening caption and `data-scene-name` attribute.

The later chapters use one continuous scroll timeline. Edit the named camera beats and 1:1 window transition in `src/sceneTimeline.ts`; section anchors are derived from the page layout. Before chapter 02, the window exits right, pauses offscreen, and re-enters from the left. The well stays fixed while the camera, light, ground glyph, water, and visitors change around it.

Sound starts only after a click and can be muted. “TEXT ONLY” turns off the 3D scene. The two-person response is a local exercise, not an online presence system.

## Terrain

`src/desertTerrain.ts` generates a fixed slice through a 3D Perlin field with five fBM octaves, domain warping, directional scaling, and a flat clearing around the shaft. Edit `DESERT` to adjust seed, frequency, amplitude, wind direction, mesh resolution, or clearing size.

Geometry, stone and sand textures, and the sky are procedural. No external model or texture download is required.

## Stack

React · TypeScript · Tailwind · Motion · Three.js / React Three Fiber · Rapier.

See [SPEC.md](SPEC.md) for the narrative and camera specification.
