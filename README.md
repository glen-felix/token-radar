# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/glen-felix/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/glen-felix/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols, finds the ones that record no token yet, and ranks them by an implied launch value from one stated model (radar-4): TVL × a blended multiple. The blend is geometric, weighted by traded-peer count — one component is the category's median market-cap-to-TVL, shrunk toward the global median (0.2138 over 128 traded protocols); the other is a regression multiple whose every coefficient (size, seven-day growth, maturity, chain count, plus per-category effects) is fitted from those same 128 traded protocols by least squares on log(mcap/TVL), each factor term capped at ±0.5 dex. A thin category therefore leans on the regression — priced off its own TVL through the market's fitted curve — instead of one flat global number or one wild peer. The fit is graded in the open: a deterministic five-fold backtest against the comparables' actual market caps gives a median error of 89.3% with 27.3% of predictions within 2×, against 93.5% / 23.4% for the previous median-only model on the same folds. All 40 watchlist protocols are covered, plus the strongest early finds the watchlist leaves out (197 rows on this snapshot, tiered Prime / Standard / Speculative by TVL), screened so no wrapped, staked or bridged product of a token that already trades ranks as a launch — the 145 products the screen sets aside are listed in their own view with the reason for each. Every row carries risk flags read from its own record and a seven-step farm plan generated from that record — its chains, its week's direction, its category's peer count, its TVL and its age — with costs and durations. Protocols whose token already trades are set aside in a Live view with the market's own capitalisation, never mixed into the ranking; a Model view publishes the size curve, the coefficient table, the calibration and the backtest; and a Movers & risks view gathers the week's fastest movers and the largest flagged rows. The dashboard is static, sortable and filterable by category, chain and tier, with a detail view per protocol printing every term of that row's price so it reproduces by hand, plus its full farm plan; the method is also written out in `dashboard/METHOD.md`.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Then open `out/dashboard/index.html` in a browser. The program writes `out/board.json`, `out/data.js`, the dashboard and screenshots copies, and `out/dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=wvzbaab8&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
