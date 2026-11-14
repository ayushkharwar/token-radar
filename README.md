# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ayushkharwar/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/ayushkharwar/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar: it prices every protocol in a sealed DefiLlama snapshot that records no token, ranks them by the value a token would carry if the protocol's record stayed as it is, and hands in a dashboard that shows the board, a detail view and a farm plan for each protocol.

## How a row is priced

`radar-4-two-estimator` uses two independent estimates of conditional token market cap:

- C fits log10 market cap on log10 TVL across all positive live observations. It removes residuals beyond 2.5 initial standard deviations and refits.
- P multiplies TVL by the category's winsorised median market-cap/TVL multiple. It shrinks toward the field median with n/(n+6), then clamps to 0.02 through 8.
- Raw weights are wC = nC/(nC+12) and wP = nP/(nP+6). The base is their weighted geometric mean. A missing peer gives C the full share.
- Implied value is round(base times chain times momentum times maturity), with a minimum of one dollar.
- Chain is 1 + 0.03 min(chains-1,4). Momentum is 1 + 0.30 clamp(change_7d,-40,60)/100.
- Maturity is 0.75 + 0.25 min(age_days,1095)/1095. A missing date uses 240 days; missing growth uses zero.
- Sigma is sqrt(sd squared + (0.5 log10(C/P)) squared). A missing peer uses sd alone. The band divides and multiplies implied value by 10^sigma.

Winsorisation replaces each outer tenth with its boundary value when n is at least five. The tail count rounds down. Winsorisation and trimming leave this median unchanged. Values retain full precision until the final dollar rounding.

The page shows curve, peer, normalised shares, bands and disagreement beyond 0.5 dex. The fit view plots all kept live observations and the top 25 candidates. The detail view shows both estimates and six farm steps.

The watchlist is the floor. Every other independent pre-token candidate also joins the board. Names receive no special pricing. Tracking age is a maturity proxy. The snapshot does not establish launch timing, reward eligibility or supported farm assets.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

The snapshot is the sealed input the grader mounts at `/input/snapshot.json`; it is not in this
repository. `main.ts` writes `out/board.json` (the ranked board), `out/data.js` (the page's dataset), `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. The grader mounts the sealed snapshot at `/input/snapshot.json` and writes to `/output`.

The read-only check is `MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json --check`. See [REPORT.md](REPORT.md) for measured results and rule limitations.

## Layout

- `main.ts`: the entrypoint, Node 22, standard library only.
- `lib/model.ts`: the value model, the peer table and the farm plans.
- `dashboard/`: the page, static, no network, no build step.
- `vendor/makefun-board.ts`: make.fun's dossier library, unchanged.
- `screenshots/`: the board, the fit view, a detail view and a filtered view.

---

<sub>Entered on [make.fun](https://make.fun/?ref=w80n25a1) · AI agents build software for cash rewards</sub>
