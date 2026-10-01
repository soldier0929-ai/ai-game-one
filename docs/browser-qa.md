# Tidal Tower browser QA

2026-10-01. Reproducible real-input QA completed on Linux 6.18.44 x86_64, Chromium 151.0.7922.173 and SwiftShader, against the stable production preview at `http://127.0.0.1:4173`. Final progression/home recheck used asset `index-CYWf06i0.js`. No product files, dependency files, commits or Sites configuration were changed by QA. Game state changed only through normal browser inputs.

The combined interaction pass has 45 passing checks in [results.json](../artifacts/qa/results.json). After the owner corrected the home screen to load saved progress, the final production build passed all 28 scoped progression/home checks in [progression-home-recheck.json](../artifacts/qa/progression-home-recheck.json). Both runs independently won all eight levels in order, first attempt, by real mouse drag/release with the actual physical shot plans. The browser naturally earned every unlock. `window.__tidal.inspect()` was read only; no score injection, forced unlock, storage writes, tool firing or simulation mutation was used.

Final browser victories:

| Level | Fallen / target | Shots | Ammo left | Stars |
| --- | --- | --- | --- | --- |
| 1 | 15 / 15 | 1 | 2 | 3 |
| 2 | 20 / 20 | 1 | 2 | 3 |
| 3 | 24 / 24 | 2 | 2 | 3 |
| 4 | 26 / 26 | 2 | 2 | 3 |
| 5 | 29 / 29 | 2 | 2 | 3 |
| 6 | 34 / 34 | 1 | 4 | 3 |
| 7 | 39 / 39 | 2 | 3 | 3 |
| 8 | 48 / 48 | 2 | 3 | 3 |

The combined pass covered first-run tutorial and locked levels, gesture audio unlock, immediate mute, Escape with a focused mute button, help returning to level selection and to a frozen pause, real held-Space repeat suppression, three physical misses reaching defeat, and mouse drag cancellation on viewport resize. Across a 700ms pause during flight, the observed projectile position, ammo, fallen count and settlement timer stayed identical. Twenty real pause/restart cycles retained body count 19, block meshes 18, renderer geometries 14, textures 3, owned geometries 17 and owned materials 35; active voices remained bounded by eight. Normal flows produced no console errors, warnings or uncaught exceptions.

At 390×844, real CDP touchscreen drag/release won level 1 with 15 fallen blocks, and touch cancellation spent no ammo. Reduced-motion emulation remained playable. Screenshots cover desktop 1440×900, portrait 390×844 and landscape 844×390. The visible pause-menu controls in both touch viewports fit the viewport and meet the 44px minimum. The final level hides Next and shows full completion. After all eight physically earned victories, reload preserved eight three-star records and mute; home metadata, Start and selection→Back all identify level 8. See [earned-progress home](../artifacts/qa/desktop-earned-progress-home.png), [level 8 result](../artifacts/qa/level-08-result.png), [portrait play](../artifacts/qa/portrait-playing.png) and [landscape play](../artifacts/qa/landscape-playing.png).

An isolated 60-second desktop idle-aiming sample collected 249 frames over 60,014.2ms: average 4.15 FPS, median 200ms, p95 483.4ms, maximum 1,316.6ms, 235 frames above 50ms and 223 above 100ms. It used SwiftShader software rendering with no other browser test running. [Summary](../artifacts/qa/performance-isolated.json) and [raw frame intervals](../artifacts/qa/frame-times-isolated.json) retain the measurement. The earlier combined-pass sample was contended by concurrent browser QA and is not the performance reference. Neither sample establishes real desktop GPU or phone performance; the design FPS targets remain unverified on real hardware.

Reproduce with Vite production preview already running:

```sh
QA_URL=http://127.0.0.1:4173 python scripts/browser-qa.py
QA_URL=http://127.0.0.1:4173 QA_PROGRESSION_ONLY=1 python scripts/browser-qa.py
QA_URL=http://127.0.0.1:4173 QA_PERFORMANCE_ONLY=1 python scripts/browser-qa.py
```

[QA script](../scripts/browser-qa.py), [combined log](../artifacts/qa/run-final.log), [final recheck log](../artifacts/qa/run-progression-home-recheck.log) and [isolated performance log](../artifacts/qa/run-performance-isolated.log) are preserved. The owner retains obsolete prototype-control evidence separately from current release evidence; its focused-Escape failure was corrected and verified in the combined pass. The saved-progress home mismatch was confirmed from the original earned-progress reload, corrected by the owner, and then verified through both changed paths in the final recheck.

No remaining browser functional blocker was found in this scope. Safari, real phones, real GPU frame-rate targets, native background/foreground behavior and human-audible speaker output were not verified here. Audio checks establish browser diagnostics, gesture unlock, mute and voice bounds. All QA browser contexts and processes were closed at completion.
