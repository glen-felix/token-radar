# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/glen-felix/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/glen-felix/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols, finds the ones that record no token yet, and ranks them by an implied launch value from one stated model — TVL × a category multiple × clamped 7-day growth × maturity (time running with no token) × chain footprint × scale. All 40 watchlist protocols are covered, plus the strongest early finds the watchlist leaves out (197 rows on this snapshot), screened so no wrapped, staked or bridged product of a token that already trades ranks as a launch. Every row carries a concrete farm plan with costs and durations. Protocols whose token already trades are set aside in a Live view with the market's own capitalisation, never mixed into the ranking. The dashboard is static, sortable and filterable by category and chain, with a detail view per protocol showing the model's arithmetic for that row and its full farm plan.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Then open `out/dashboard/index.html` in a browser. The program writes `out/board.json`, `out/data.js`, the dashboard and screenshots copies, and `out/dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=wvzbaab8&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
