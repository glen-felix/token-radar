# Method — how this radar prices a token that does not exist yet

Snapshot: DefiLlama https://api.llama.fi/protocols, fetched 2026-11-14T01:18:33.201Z (the sealed input's as_of is 2026-11-14; 758 protocols). Model: radar-4. One formula, fitted from the snapshot itself, prices every row; no protocol name is special-cased anywhere, and the same code would score a snapshot taken next year.

## The formula

implied = round( tvl_usd x blended multiple )

blended multiple = 10 ^ ( w x log10(category component) + (1 - w) x log10(regression multiple) ), with w = n / (n + 4) and n the category's traded peers in the snapshot.

- Category component: the category's median mcap/TVL among its traded protocols, shrunk toward the global median — (n x category median + 3 x 0.2138) / (n + 3).
- Regression multiple: 10 ^ ( 3.1022 -0.4967 x log10(tvl_usd) + growth term + maturity term + chain term + category effect ). Every term of a row's price is printed in its detail view, and every row's implied value reproduces by hand from those printed numbers.

## Where the coefficients come from

128 of the snapshot's 416 traded protocols are usable comparables — a recorded token with a positive market cap and TVL (the other 288 record a token but no usable market cap). Everything below is fitted from those 128 alone.

- The size curve: log10(mcap) = 3.0247 + 0.5223 x log10(TVL), R2 = 0.1939. Market cap rises with TVL, but at about half the rate — the market's own anchor line, and the reason a raw TVL ranking would misprice everything.
- The ratio regression: log10(mcap/TVL) on log10(TVL), the seven-day change clamped to [-60%, +120%] and read as a fraction, maturity = min(age, 1460 days) / 1460 (an unrecorded age counts as the comparables' median age, 1000 days), and chain count capped at 20. Fitted coefficients: intercept 3.1022, log TVL -0.4967, growth -1.8178, maturity -0.2662, chains +0.0149.
- Reading them: the ratio falls about half a dex for every tenfold of TVL — big protocols trade at a smaller multiple of their TVL, which the curve says too. The growth coefficient is negative because the snapshot caught a falling week (115 of 128 comparables shrank over the seven days): protocols that had just run up did not hold a premium. Maturity is mildly negative, chain count mildly positive. These are the market's coefficients on this snapshot, not constants chosen by hand.
- Category effects: each category's mean regression residual, winsorised at +-1 dex, shrunk by n / (n + 5), clamped to +-0.5 dex, and fitted only when the category has at least 3 traded peers. The table below lists every one.
- Term caps: the growth, maturity and chain terms are each capped at +-0.5 dex, the same cap the effects carry, so no single fitted factor moves a price by more than about 3.2x. On this board a cap binds on 10 of 197 rows; a capped row says so in its detail view.

## Why a blend — what the previous model got wrong

radar-3 priced a category from its median alone, and refused the median entirely below three peers, so 121 of these rows would have priced off one flat global number. Worse, a category with a single wild peer had to be guarded by that refusal: the one traded prediction market sits at about 400x its TVL, and an unguarded median once priced Polymarket International at $31.9B in an early draft of that model. radar-4 keeps the median as one component but weights it by the peer count that backs it — at one peer the price is 80% regression, at fifteen peers 79% median — so a thin category is priced off its own rows' TVL through the market's fitted curve, with the median leaning in as evidence accumulates. Polymarket International now prices at $66.5M, not $31.9B and not the flat median either.

## The backtest

Five folds, assigned by a hash of each comparable's slug. Each fold refits everything — curve, regression, effects, medians, age imputation — on the other four folds and predicts the held-out protocols' actual market caps.

| Fold | Held out | Median error |
| --- | --- | --- |
| 0 | 34 | 85.0% |
| 1 | 26 | 88.1% |
| 2 | 15 | 97.2% |
| 3 | 26 | 99.4% |
| 4 | 27 | 91.4% |

Headline: median absolute error 89.3%; 35 of 128 predictions (27.3%) land within 2x of the actual market cap. The same backtest run on radar-3's formula gives a 93.5% median error and 23.4% within 2x — the blend is measurably better than the model it replaces, on the snapshot's own ground truth. Pricing a token from TVL alone is genuinely this noisy: the board is a ranking instrument, the interval around any single row is wide, and that is exactly why every component of every price is shown instead of a bare number.

## The board: 197 rows, honestly

342 protocols record no token. 145 of them are products of tokens that already trade — wrapped, staked or bridged assets and exchange entries; the largest is Bybit at $13.82B of TVL — and a launch radar does not rank them. They are listed in the Products view with the reason each was set aside. The remaining 197 are the board: the house's 40-protocol watchlist in full, plus 157 early finds. Tiers by TVL: Prime (at or above the snapshot's $50.0M floor) 59 rows, Standard ($10M-$50M) 94, Speculative (under $10M) 44. There is no honest widening beyond 197: every other pre-token protocol in the snapshot is one of the 145 products. Breadth is carried instead by the surfaced universe — 582 protocols across the board, the Live view (240 traded protocols by market cap) and Products.

## Calibration table

Every category with traded peers: its peer count, raw median ratio, the shrunk component that enters the blend, its fitted effect, and the weight its rows give the component. Categories under three peers fit no effect; categories under five peers are why 121 board rows carry the thin-comps flag.

| Category | Peers | Median mcap/TVL | Component | Effect (dex) | Weight |
| --- | --- | --- | --- | --- | --- |
| AI Agents | 2 | 0.6047 | 0.3702 | not fitted | 0.33 |
| Basis Trading | 7 | 0.6544 | 0.5222 | +0.2350 | 0.64 |
| Bridge | 6 | 0.5567 | 0.4424 | +0.0506 | 0.60 |
| CDP | 3 | 0.1687 | 0.1913 | -0.1484 | 0.43 |
| CEX | 9 | 0.0748 | 0.1096 | +0.1244 | 0.69 |
| Canonical Bridge | 8 | 0.7464 | 0.6011 | +0.2604 | 0.67 |
| Chain | 1 | 3.0264 | 0.9170 | not fitted | 0.20 |
| Collateral Management | 1 | 12.1602 | 3.2004 | not fitted | 0.20 |
| Cross Chain Bridge | 4 | 1.2205 | 0.7890 | +0.0866 | 0.50 |
| DOR | 1 | 0.0898 | 0.1828 | not fitted | 0.20 |
| Decentralized AI | 1 | 2.0604 | 0.6755 | not fitted | 0.20 |
| Derivatives | 2 | 2.1619 | 0.9930 | not fitted | 0.33 |
| Dexs | 11 | 0.3424 | 0.3149 | +0.0678 | 0.73 |
| Dual-Token Stablecoin | 1 | 0.0316 | 0.1683 | not fitted | 0.20 |
| Indexes | 3 | 0.1477 | 0.1807 | -0.0204 | 0.43 |
| Launchpad | 1 | 0.1306 | 0.1930 | not fitted | 0.20 |
| Lending | 15 | 0.1324 | 0.1460 | -0.1225 | 0.79 |
| Leveraged Farming | 1 | 0.1725 | 0.2035 | not fitted | 0.20 |
| Liquid Restaking | 2 | 0.1828 | 0.2014 | not fitted | 0.33 |
| Liquid Staking | 9 | 0.0406 | 0.0839 | -0.2213 | 0.69 |
| Liquidity Manager | 1 | 0.0150 | 0.1641 | not fitted | 0.20 |
| NFT Marketplace | 1 | 2.0017 | 0.6608 | not fitted | 0.20 |
| Onchain Capital Allocator | 2 | 0.0125 | 0.1333 | not fitted | 0.33 |
| Options | 1 | 1.5145 | 0.5390 | not fitted | 0.20 |
| Payments | 2 | 0.1813 | 0.2008 | not fitted | 0.33 |
| Prediction Market | 1 | 400.2045 | 100.2115 | not fitted | 0.20 |
| Privacy | 3 | 0.9691 | 0.5915 | +0.1707 | 0.43 |
| RWA | 9 | 0.2748 | 0.2595 | +0.1040 | 0.69 |
| Restaking | 2 | 0.0246 | 0.1381 | not fitted | 0.33 |
| Risk Curators | 1 | 2.9747 | 0.9040 | not fitted | 0.20 |
| Staking Pool | 2 | 0.0018 | 0.1290 | not fitted | 0.33 |
| Token Locker | 2 | 9.5204 | 3.9364 | not fitted | 0.33 |
| Yield | 9 | 0.1914 | 0.1970 | -0.1216 | 0.69 |
| Yield Aggregator | 4 | 0.1510 | 0.1779 | -0.2337 | 0.50 |

## The top of the board, checked by hand

Rank 1 is Steakhouse Financial: TVL $2.75B. Its category (Risk Curators) has 1 traded peer, so w = 0.20 and the component is 0.9040 (the peer's own ratio is 2.9747, shrunk hard toward the global median). The regression reads 3.1022 -4.6888 (size) +0.0399 (growth) -0.0990 (maturity) +0.1639 (chains) +0.0000 (effect) = -1.4818, a multiple of 0.0330. Blended: 10 ^ (0.20 x log10(0.9040) + 0.80 x log10(0.0330)) = 0.0640, and $2.75B x 0.0640 = $176.3M — the board's rank 1. For scale: no row is priced above the largest market cap the snapshot itself records ($2.65B), and the board's maximum is $176.3M.

## Risk flags

Each flag is read off the row's own record, and the detail view spells it out: young — first tracked under 180 days ago (48 rows); single-chain — its TVL sits on one chain (113); growth-spike — its seven-day TVL change is over 50% in either direction (7); thin-comps — fewer than five traded peers calibrate its category (121). Flags describe the record; they are not scores, and they do not move the price.

## Farm plans

Seven steps per row, generated from the row's own record rather than a category template: its chains decide whether there is a bridge step and name the chains it crosses; a young protocol's plan starts with a $25 test deposit; a row whose TVL fell over the week gets cautious sizing and an exit watch, a row that spiked gets an anti-chase step; a thin-comps row's plan verifies the points program on the protocol's own site instead of trusting a tracker; capital follows the row's TVL tier ($75-$500) and the hold its age (30-60 days). Every step names its cost and its duration. One complete plan, verbatim — rank 1, Steakhouse Financial (multi-chain, so step 3 is a named bridge step; thin-comps, so step 6 is a verification step):

1. Open Steakhouse Financial's app from its official site and connect a fresh wallet that holds only farm funds, never a wallet with your savings. Cost: about $0.40 of gas on Base for the first approval. Time: 10 minutes.
2. Deposit $250 into a Steakhouse Financial vault on Base and keep the vault shares in the farming wallet; the position this plan farms is $250 held for at least 35 days. It also counts TVL on Ethereum and Robinhood Chain, which step 3 uses. Cost: $250 of capital plus about $0.40 of gas. Time: 15 minutes to set up, then the 35-day hold begins.
3. In week two, bridge about $63 of USDC from Base to Ethereum on the canonical route Steakhouse Financial's own app points to, and repeat the core action there, so the wallet is active on two of its chains. Cost: about $63 of capital plus the bridge fee and about $8 of gas on Ethereum. Time: 20 minutes.
4. Make one small qualifying transaction every week — a $10 top-up, a swap or a vote — so the wallet shows a pattern of use, not a single visit. Cost: about $0.40 of gas per visit. Time: 10 minutes a week for 5 weeks.
5. Hold the position for at least 35 days without dropping below half the starting balance; points and snapshot programs reward balances that stay. Cost: the $250 stays deployed and cannot be spent meanwhile. Time: 35 days.
6. Only 1 traded protocol of its category calibrate this row's price, so treat any points figure as provisional: verify the program on Steakhouse Financial's own site and inside its app, save the balance page each week, and never trust a third-party points tracker. Cost: nothing to check, and never pay a fee to claim. Time: 5 minutes a week.
7. Keep a farm log with the wallet address, every date, amount and transaction hash; to stop, withdraw in one transaction and keep the log until any token claim window closes. Cost: about $0.40 of gas to exit. Time: 15 minutes.

## What this board is not

Not a price prediction: the backtest's 89.3% median error is the honest uncertainty, printed next to the model rather than under it. Not a full census: 18 board rows sit in categories with no traded peer at all and price off the regression and the global median alone, and the 288 traded protocols without a usable market cap enter neither the fit nor the board. And one snapshot is one week — the growth coefficient above is this market week's, and a later snapshot would refit it.
