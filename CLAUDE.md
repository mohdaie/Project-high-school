# Project High School: guide for coding agents

A 1v1 teen fighting game for phones (Three.js, plain ES modules, no bundler). `README.md` is the spec and lists every module.
Fighters are the Universal Animation Library 2 mannequin (`assets/models/fighter.glb`, built by `scripts/build-fighter.mjs`), animated straight from its clips: rules and clip timings in `src/brawler.js`, playback in `src/fighter.js`. `watak.html` still uses the older character system copied from mohdaie/Malaysian-retro-game (v2.15.0).

## Commands

```sh
npm test      # node --test tests/*.test.js; must pass before every commit
npm run dev   # http://localhost:4173
```

## Rules

- **No new runtime dependencies.** Three.js is the only one, vendored in `vendor/` (import map in `index.html`).
- **Code style:** follow the file you are editing. Files are dense: short names, one-line arrow functions, few comments.
- **Pure rules, separate UI.** Fight rules (damage, stamina, rounds, AI decisions) go in pure modules tested in Node; Three.js and DOM code stays in view files.
- **Phones first.** Keep models small (about 10k triangles, 1024² texture) and test at landscape phone size.
- **Language:** in-game text is casual Bahasa Melayu mixed with English.
- Commit on the session's working branch. Never push to `main` directly.
