# Method — how this radar prices a launch (model radar-3)

This dashboard is a token launch radar over one sealed DefiLlama snapshot (758 protocols,
as of 2026-11-14). Its implied value is a model claim about what a protocol's token could
be worth at launch if its record stayed as the snapshot shows it. It is not a prediction
that any protocol issues a token, and no number here comes from outside the snapshot.

## The formula

    implied = round( tvl_usd
                     x fitted category multiple
                     x (1 + clamp(change_7d, -50, 100) / 100 x 0.6)
                     x (0.55 + 0.45 x min(age_days, 1460) / 1460)
                     x (1 + 0.04 per extra chain, max 1.20) )

Every factor is computed from the protocol's own snapshot record: its TVL, its category,
its seven-day TVL change, the day DefiLlama first tracked it, and its chain list. No
protocol name is ever special-cased, and there is no factor for sheer size: TVL is already
the quantity being priced, so a size bonus would count it twice.

## The category multiple is fitted, not chosen

The snapshot's traded protocols are the comparables. A comparable is a protocol that
already records a token, with a positive market cap and a positive TVL; its ratio is
market cap over TVL — what the market currently pays per TVL dollar for that kind of
protocol. Over all 128 comparables the median ratio (the global median) is 0.2138.

A category's multiple is its comparables' median ratio, shrunk toward the global median:

    multiple = (n x category median + 3 x global median) / (n + 3)

A category needs at least 3 comparables before its own median is used at all; with fewer
it prices at the global median. A median of one observation is not a statistic. On this
snapshot the single traded prediction market records a capitalisation 400 times its TVL;
trusting it would price a $320M pre-token protocol above $30B — more than ten times the
largest market cap in the snapshot. The categories that price at the global median are
named in the Model view, and every board row states how many traded peers calibrated it.

Fitted categories on this snapshot (peers, median mcap/TVL, multiple used):

    Lending               15   0.1324   0.1460
    Dexs                  11   0.3424   0.3149
    Liquid Staking         9   0.0406   0.0839
    Yield                  9   0.1914   0.1970
    CEX                    9   0.0748   0.1096
    RWA                    9   0.2748   0.2595
    Canonical Bridge       8   0.7464   0.6011
    Basis Trading          7   0.6544   0.5222
    Bridge                 6   0.5567   0.4424
    Cross Chain Bridge     4   1.2205   0.7890
    Yield Aggregator       4   0.1510   0.1779
    CDP                    3   0.1687   0.1913
    Indexes                3   0.1477   0.1807
    Privacy                3   0.9691   0.5915

The other 20 categories with comparables have one or two each and price at the global
median, as do categories with no traded peers at all. The largest board row the fitted
model produces is $500M (Steakhouse Financial, TVL $2.75B at the global median, because
Risk Curators has a single traded peer) — inside the range the snapshot's own traded
protocols actually occupy, whose largest market cap is $2.65B.

## The other three factors

- Growth: the protocol's own seven-day TVL change, clamped to [-50%, +100%] and weighted
  0.6, so one hot week can raise a value by at most 60% and a bad week cut it by 30%.
- Maturity: 0.55 plus 0.45 for up to four years of running with no token (age measured
  from first tracked to the snapshot date; an unrecorded date counts as 540 days).
- Chain footprint: 4% per additional chain beyond the first, capped at 1.20.

## The launch screen and the board

The board covers all 40 watchlist protocols (the floor: TVL at or above $50M, no token
recorded, not a product of a trading token). It then admits every other pre-token protocol
that passes the house's launch screen: its category is not a bridge, staking, restaking or
exchange product category; its name does not end in a version marker (a pool of another
protocol); its name carries no whole word wrapped, staked or staking; and it does not begin
with an exchange's name. On this snapshot the screen admits 157 early finds, for 197 ranked
rows. The 145 pre-token protocols it sets aside are not hidden: the Products view lists
every one with its TVL and the exact reason, so the screen can be audited line by line.
The 416 protocols that already record a token are never ranked; the Live view carries the
240 largest by market cap (of 402, exchanges aside) with the market's own figures. In all,
582 of the snapshot's 758 protocols are surfaced across the views.

## Risk flags

Each board row carries flags read from its own record, and only from it: young (first
tracked under 180 days ago), single-chain (TVL on one chain), growth-spike (seven-day TVL
change over 50% in either direction), thin-comps (fewer than five traded protocols of its
category calibrate its multiple). Flags change nothing in the score; they tell the reader
which rows to read with care, and the Movers & risks view gathers the largest flagged rows.

## Farm plans

Every board row carries a seven-step farm plan generated from its own record: the category
decides the core action and the second action; the first chain decides the gas figure; the
TVL tier decides the capital ($75 under $50M of TVL, then $100, $150, $250, $500); the age
tier decides the hold (60 days under six months, then 45, 35, 30). Every step states what
it costs and how long it takes, and the core action step names the row's own capital and
hold before anything else. The plan in a row's detail view is the exact text written to
board.json; the page never re-derives it.

## Reproducibility

The program reads only the sealed snapshot, uses no network, and writes the same board,
data file and dossier on every run: two runs of it on this snapshot are byte-identical.
