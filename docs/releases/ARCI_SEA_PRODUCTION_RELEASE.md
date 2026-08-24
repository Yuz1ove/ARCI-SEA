# ARCI SEA Production Release

- Release verdict: `ARCI_SEA_PRODUCTION_RELEASE_READY`
- Date: 2026-08-24 (Asia/Taipei)
- Deployment source SHA: `052bf2969b3ce252e41f95aaa5af02ff99709f58`
- Release seal: annotated tag `arci-sea-v1.0.0`
- GitHub repository: `https://github.com/Yuz1ove/ARCI-SEA` (private, `main`)
- Vercel project: `arci-sea` (`prj_am3sArj5F9QPeHJHuoa7vroAuhvg`)
- Production deployment: `dpl_BGg8yNNGfHz48YPTUwH5ZhFzJLkN`
- Production URL: `https://arci-sea.vercel.app`
- Protected geography hash: `d3478164a40b983bb77abb2c308415e04ef6c4354246a650842870a7ac2043ed`

## Acceptance results

- Interaction baseline: PASS — the protected `ARCI_SEA_INTERACTION_ACCEPTANCE_READY` behavior remained intact.
- Production routes: PASS — `/` and `/adaptive-policy` both returned HTTP 200.
- Desktop 1440×900: PASS — baseline through disruption, first decision (`route-b`, 89.0), execution, second event, re-plan, updated decision (`route-c`, 91.4), updated execution, recovery, and outcome validation.
- Geography: PASS — one Taiwan SVG, 7/7 operational nodes, Penghu, Kinmen, Matsu, Green Island, four offshore route groups, and the protected route geometry remained present.
- Adaptive Policy: PASS — CTA-driven SPA navigation, 7 technical sections, 11 formula tools, adaptive weights, Route Feasibility output `0.940`, back navigation, and preserved `RECOVERED / route-c / 97.6%` state.
- Mobile 390×844: PASS — root and policy `scrollWidth` equaled `390`; map, islands, 7 nodes, workspace, three candidates, recovery, updated execution, policy, and navigation were present.
- Mobile 430×932: PASS — root and policy `scrollWidth` equaled `430`; map, islands, 7 nodes, workspace, three candidates, recovery, updated execution, policy, and navigation were present.
- Console/network: PASS — 0 console errors, 0 console warnings, 0 failed requests, 0 HTTP responses ≥400, and 0 runtime exceptions during the production browser run.
- Production smoke: PASS — no navigation freeze or white screen was observed; a three-second sample recorded 0 layout shift and 0 blank frames.

## Automated gates

- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm test`: PASS — 7 files, 35 tests
- `npm run build`: PASS — Vinext/Vite production build
- `npx next build`: PASS — `/`, `/_not-found`, and `/adaptive-policy` prerendered
- `npm audit --json`: PASS — 0 known vulnerabilities
- `git diff --check`: PASS

## Production evidence

Evidence is retained locally at `output/playwright/production-release/` and intentionally excluded from Git to avoid turning the source repository into a binary archive. It contains the required 00–10 screenshot sequence, `production-release.trace`, network log, complete trace archive, and `production-desktop.webm`.

## Known non-blocking notes

- The Vercel dependency-install step reports npm's upstream deprecation notice for ESLint 9.39.4. Lint passes, `npm audit` reports 0 vulnerabilities, and this is not a browser console or production runtime warning.
- The trace archive and video are local-only large artifacts; this manifest records their stable location.
