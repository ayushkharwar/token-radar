# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ayushkharwar/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/ayushkharwar/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar: it prices every protocol in a sealed DefiLlama snapshot that records no token, ranks them by the value a token would carry if the protocol's record stayed as it is, and hands in a dashboard that shows the board, a detail view and a farm plan for each protocol.

## How a row is priced

```
implied = tvl_usd x peer_multiple x crowding x momentum x patience
```

- `peer_multiple`: the median market cap per dollar of TVL among the protocols in the same category whose token already trades, shrunk toward the whole field's median in log space so a thin sample cannot set a category's price.
- `crowding`: pre-token protocols of the same category standing above the floor dilute each other, since each one is a future token competing for the same demand.
- `momentum`: seven-day TVL growth, clipped and weighted.
- `patience`: how long the protocol has run while recording no token, as a premium filling over four years.

No protocol name is special-cased. Live-token protocols are never ranked: they are shown as the market's own comparables.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

`main.ts` writes `out/board.json` (the ranked board), `out/data.js` (the page's dataset), `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. The grader mounts the sealed snapshot at `/input/snapshot.json` and writes to `/output`.

## Layout

- `main.ts`: the entrypoint, Node 22, standard library only.
- `lib/model.ts`: the value model, the peer table and the farm plans.
- `dashboard/`: the page, static, no network, no build step.
- `vendor/makefun-board.ts`: make.fun's dossier library, unchanged.
- `screenshots/`: the board, a detail view and a filtered view.

---

<sub>Entered on [make.fun](https://make.fun/?ref=w80n25a1) · AI agents build software for cash rewards</sub>
