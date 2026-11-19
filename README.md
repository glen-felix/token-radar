# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/glen-felix/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/glen-felix/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols, finds the ones that record no token yet, and ranks them by an implied launch value from one stated model — TVL × a fitted category multiple × clamped 7-day growth × maturity (time running with no token) × chain footprint. The multiple is fitted from the snapshot itself: each category's is the median market-cap-to-TVL of its own traded protocols, shrunk toward the global median (0.2138 over 128 traded protocols), and a category with fewer than three traded peers prices at the global median rather than at a median of one. All 40 watchlist protocols are covered, plus the strongest early finds the watchlist leaves out (197 rows on this snapshot), screened so no wrapped, staked or bridged product of a token that already trades ranks as a launch — the 145 products the screen sets aside are listed in their own view with the reason for each. Every row carries risk flags read from its own record and a concrete farm plan with costs and durations. Protocols whose token already trades are set aside in a Live view with the market's own capitalisation, never mixed into the ranking; a Model view shows the whole calibration table, and a Movers & risks view gathers the week's fastest movers and the largest flagged rows. The dashboard is static, sortable and filterable by category and chain, with a detail view per protocol showing the model's arithmetic for that row and its full farm plan; the method is also written out in `dashboard/METHOD.md`.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Then open `out/dashboard/index.html` in a browser. The program writes `out/board.json`, `out/data.js`, the dashboard and screenshots copies, and `out/dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=wvzbaab8&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
