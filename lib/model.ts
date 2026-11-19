// Token Radar — the value model and farm-plan generator (model radar-3).
//
// One sealed DefiLlama snapshot in, one ranked board out. Every number on the board comes
// from the snapshot's own ten fields; no protocol name is ever special-cased, so the same
// code would score a snapshot taken next year.
//
// The model, stated exactly as the dashboard states it:
//
//   implied = round( tvl_usd
//                    x fittedMultiple(category)   what the snapshot's own traded protocols of this
//                                                 kind are worth per TVL dollar (see below)
//                    x growthMult                 1 + clamp(change_7d, -50, 100)/100 x 0.6
//                    x maturityMult               0.55 + 0.45 x min(age_days, 1460)/1460
//                    x chainMult )                1 + 0.04 per extra chain, capped at 1.20
//
// The category multiple is fitted, not chosen. The snapshot's traded protocols (the ones that
// record a token) are the comparables: each one's market cap over its TVL is what the market
// currently pays per TVL dollar for a protocol of that kind. A category's multiple is the
// median of its comparables' ratios, shrunk toward the global median over all comparables:
//
//   multiple = (n x category median + 3 x global median) / (n + 3)
//
// A category needs at least 3 comparables before its own median is trusted at all; with
// fewer, it prices at the global median. A median of one observation is not a statistic —
// on this snapshot the single traded prediction market records a capitalisation 400 times
// its TVL, and trusting it would price a $320M protocol above $30B, more than ten times the
// largest market cap in the snapshot. Thin categories are exactly where a fitted model must
// fall back to the whole market's evidence, and the dashboard says so wherever it happens.
//
// radar-2 (the previous model) multiplied by a further scale factor for sheer TVL. That
// double-counted size — TVL is already the thing being multiplied — so radar-3 drops it.
//
// A protocol counts as pre-token when its record carries no token (mcap, gecko id and symbol
// all null). Protocols whose token already trades are never ranked here; the dashboard sets
// them aside in a Live view with the market's own capitalisation. The board's early rows use
// the house's own screen for a launch of one's own (see isLaunchCandidate): a wrapped, staked
// or bridged product of a token that already trades — WBTC, a staked-ETH wrapper, a bridged
// stablecoin — records no token of its own yet is no launch candidate, so it never ranks;
// those protocols are shown, flagged with the reason, in the Products view instead.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label, shown on the dashboard. */
export const MODEL_VERSION = 'radar-3';

/** Board size: the 40 watchlist protocols plus the best early finds below the floor. */
export const BOARD_ROWS = 200;

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 240;

/** A category needs at least this many traded comparables before its own median is used. */
export const MIN_COMPS = 3;

/** How strongly a fitted category median is shrunk toward the global median. */
export const SHRINK_PRIOR = 3;

/** One category's calibration: its comparables, their median ratio, and the multiple used. */
export interface CategoryCalibration {
  category: string | null;
  comps: number;
  median: number | null;
  multiple: number;
  fitted: boolean;
}

/** The whole calibration, computed from the snapshot's traded protocols at run time. */
export interface Calibration {
  global_comps: number;
  global_median: number;
  categories: CategoryCalibration[];
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    category_comps: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
  };
  risk_flags: string[];
  farm_steps: string[];
}

/** The dashboard's view of one board row: the board row plus its farm plan, verbatim. */
export interface RadarRow extends BoardRow {}

/** A live-token protocol: it already trades, so its value is the market's, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

/** A pre-token protocol the launch screen sets aside, with the reason it is no launch. */
export interface ProductRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  reason: string;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  formula: string;
  snapshot_size: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  live_total: number;
  product_size: number;
  surfaced_size: number;
  calibration: Calibration;
  rows: RadarRow[];
  live: LiveRow[];
  products: ProductRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Whole days from listed_at to the snapshot's as_of; null when either date is unusable. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers, taken on a sorted copy. */
function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * The calibration: what a TVL dollar is worth at launch, fitted from the snapshot's own
 * traded protocols. A comparable is a protocol that records a token (so it is not pre-token)
 * with a positive market cap and a positive TVL; its ratio is mcap / TVL. Categories are the
 * snapshot's own category strings, matched exactly. Deterministic: comparables are taken in
 * slug order and every median is computed on a sorted copy.
 */
export function calibrate(snapshot: Snapshot): Calibration {
  const byCategory = new Map<string | null, number[]>();
  const all: number[] = [];
  const comps = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of comps) {
    const ratio = p.mcap_usd! / p.tvl_usd;
    all.push(ratio);
    const list = byCategory.get(p.category);
    if (list === undefined) byCategory.set(p.category, [ratio]);
    else list.push(ratio);
  }
  const globalMedian = all.length > 0 ? medianOf(all) : 0;
  const categories: CategoryCalibration[] = [...byCategory.entries()]
    .map(([category, ratios]) => {
      const med = medianOf(ratios);
      const fitted = ratios.length >= MIN_COMPS;
      return {
        category,
        comps: ratios.length,
        median: round4(med),
        multiple: round4(fitted ? (ratios.length * med + SHRINK_PRIOR * globalMedian) / (ratios.length + SHRINK_PRIOR) : globalMedian),
        fitted,
      };
    })
    .sort((a, b) => {
      const ka = a.category ?? '';
      const kb = b.category ?? '';
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  return { global_comps: all.length, global_median: round4(globalMedian), categories };
}

/** The fitted multiple and comparable count one category prices at under a calibration. */
export function fittedMultiple(cal: Calibration, category: string | null): { multiple: number; comps: number } {
  const row = cal.categories.find((c) => c.category === category);
  if (row === undefined) return { multiple: cal.global_median, comps: 0 };
  return { multiple: row.multiple, comps: row.comps };
}

/**
 * A board row's risk flags, each derived from the snapshot's own fields and nothing else:
 * young (first tracked under 180 days ago), single-chain (its TVL sits on one chain),
 * growth-spike (its seven-day TVL change is over 50% in either direction), thin-comps
 * (fewer than five traded protocols of its category calibrate its multiple).
 */
export function riskFlags(p: SnapshotProtocol, age: number | null, categoryComps: number): string[] {
  const flags: string[] = [];
  if (age !== null && age < 180) flags.push('young');
  if (p.chains.length <= 1) flags.push('single-chain');
  if (p.change_7d !== null && Math.abs(p.change_7d) > 50) flags.push('growth-spike');
  if (categoryComps < 5) flags.push('thin-comps');
  return flags;
}

/** The multipliers and the implied value one protocol gets under a calibration. */
export function impliedValue(p: SnapshotProtocol, asOf: string, cal: Calibration): { implied: number; categoryMult: number; categoryComps: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(100, Math.max(-50, p.change_7d ?? 0));
  const growthMult = 1 + (growthPct / 100) * 0.6;
  const ageForModel = age ?? 540;
  const maturityMult = 0.55 + (Math.min(Math.max(ageForModel, 0), 1460) / 1460) * 0.45;
  const chainMult = Math.min(1 + 0.04 * Math.max(0, p.chains.length - 1), 1.2);
  const { multiple, comps } = fittedMultiple(cal, p.category);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult * chainMult));
  return { implied, categoryMult: multiple, categoryComps: comps, growthMult, maturityMult, chainMult, age };
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product of another protocol, per the house's watchlist rule. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A name carrying a whole word wrapped, staked or staking, in any case. */
const WRAPPED_NAME = /\b(wrapped|staked|staking)\b/i;

/** A name that begins with an exchange's name, per the house's watchlist rule. */
const EXCHANGE_NAME = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * Whether a pre-token protocol is a launch candidate of its own, judged only from the
 * snapshot's fields: not an exchange, not a versioned pool of another protocol, and not a
 * wrapped, staked or bridged product of a token that already trades. This is the same screen
 * the house's watchlist rule publishes, minus the parentProtocol record the snapshot omits.
 */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name) || WRAPPED_NAME.test(p.name) || EXCHANGE_NAME.test(p.name)) return false;
  return true;
}

/** Why the launch screen sets a pre-token protocol aside, in the screen's own order of tests. */
export function screenReason(p: SnapshotProtocol): string {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return `product category: ${p.category}`;
  if (VERSIONED.test(p.name)) return 'a versioned pool of another protocol';
  if (WRAPPED_NAME.test(p.name)) return 'a wrapped or staked product by name';
  if (EXCHANGE_NAME.test(p.name)) return 'an exchange product by name';
  return 'screened out by the launch screen';
}

/** One-off gas for a small transaction on a chain, from the chain's own fee level. */
export function gasFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return '$8';
  if (c.includes('solana')) return '$0.05';
  if (c.includes('polygon')) return '$0.05';
  if (c.includes('binance') || c.includes('bnb')) return '$0.30';
  if (c.includes('avalanche')) return '$0.40';
  if (c.includes('arbitrum') || c.includes('base') || c.includes('optimism')) return '$0.40';
  if (c.includes('bitcoin')) return '$1.50';
  return '$1';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 75;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 730) return 35;
  return 30;
}

/** The category's core farming action, in words a reader can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${n}'s main lending market on ${chain} and leave the supplied balance untouched`;
  if (c.includes('dex')) return `Provide $${capital} split evenly between USDC and the pool's other asset in ${n}'s main pool on ${chain}`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC from Ethereum to ${chain} through ${n}, then hold the bridged balance in its app`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} worth of the chain's staking asset through ${n} on ${chain} and keep the staking receipt in the same wallet`;
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${n} and open one small position hedged against a spot holding`;
  if (c.includes('prediction')) return `Fund ${n} with $${capital} and take a position in two of its most liquid markets`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('liquidity manager') || c.includes('yield')) return `Deposit $${capital} into a ${n} vault on ${chain} and keep the vault shares in the farming wallet`;
  if (c.includes('launchpad')) return `Register the farming wallet on ${n}, complete its participation tasks and reserve $${capital} for one allocation`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${n} on ${chain} and hold it in the farming wallet`;
  if (c.includes('rwa')) return `Subscribe $${capital} to ${n}'s yield asset on ${chain} from the farming wallet and hold the position`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${n} on ${chain} for the wallet's main position and keep the policy active`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC onto ${chain} through its canonical route and use two of its native apps, ${n} first`;
  return `Deposit $${capital} of USDC into ${n}'s main product on ${chain} and keep the position open`;
}

/** The category's second action: how a farmer deepens the position after the first week. */
function deepenFor(p: SnapshotProtocol, capital: number, chain: string, gas: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `After 7 days, borrow at most 20% against the supplied balance on ${n} and repay it in full 14 days later, so the wallet shows both sides of the market. Cost: about ${gas} of gas twice, and never borrow more than you can repay the same day. Time: 10 minutes twice.`;
  if (c.includes('dex')) return `After 7 days, route three small swaps (about $25 each) through ${n}'s main pool on ${chain}, on different days, so the wallet is a user of the exchange and not only a liquidity provider. Cost: about ${gas} of gas per swap plus the pool's trading fee. Time: 5 minutes per swap.`;
  if (c.includes('bridge')) return `After 14 days, bridge a small amount (about $25) back the other way through ${n}, so the wallet holds a completed round trip rather than a one-way transfer. Cost: about ${gas} of gas on each chain the trip touches. Time: 15 minutes.`;
  if (c.includes('staking') || c.includes('restak')) return `After 7 days, add a second, smaller stake (about 25% of the first) through ${n} from the same wallet, so the position grows the way a real staker's would. Cost: the added stake plus about ${gas} of gas. Time: 10 minutes.`;
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options')) return `Each week, close the hedge and reopen it at the current price rather than letting one position age; two or three modest trades a week read as use, not as a single bet. Cost: the trading fee on about $${Math.max(25, Math.round(capital / 4))} of volume plus about ${gas} of gas. Time: 10 minutes a week.`;
  if (secondChain !== null) return `In week two, repeat the core action with a quarter of the capital on ${secondChain}, where ${n} also counts TVL, so the wallet is active on two of its chains. Cost: about a quarter of the starting capital plus that chain's gas. Time: 15 minutes.`;
  return `After 7 days, increase the position by about 25% from the same wallet, so its history shows a farmer adding over time rather than a single one-off deposit. Cost: about $${Math.max(20, Math.round(capital / 4))} of added capital plus about ${gas} of gas. Time: 10 minutes.`;
}

/** A step trimmed to the gate's 20..600 characters. */
function step(s: string): string {
  let out = s.trim();
  if (out.length > 600) out = `${out.slice(0, 596)}...`;
  if (out.length < 20) out = `${out} Keep the position open and check the protocol's own page weekly.`;
  return out;
}

/**
 * A protocol's farm plan: seven concrete steps derived from its own record — category decides
 * the action and the second action, the first chain decides the gas, TVL decides the capital,
 * age decides the hold. The core action step names the row's own capital and hold up front,
 * so the plan's two governing numbers are on the step a reader sees first. Every step names
 * its cost and its duration.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(4, Math.round(hold / 7));
  return [
    step(`Open ${p.name}'s app from its official site and connect a fresh wallet that holds only farm funds, never a wallet with your savings. Cost: about ${gas} of gas on ${chain} for the first approval. Time: 10 minutes.`),
    step(`${actionFor(p, capital, chain)}; the position this plan farms is $${capital} held for at least ${hold} days. Cost: $${capital} of capital plus about ${gas} of gas. Time: 15 minutes to set up, then the ${hold}-day hold begins.`),
    step(deepenFor(p, capital, chain, gas)),
    step(`Make one small qualifying transaction every week — a $10 top-up, a swap or a vote — so the wallet shows a pattern of use, not a single visit. Cost: about ${gas} of gas per visit. Time: 10 minutes a week for ${weeks} weeks.`),
    step(`Hold the position for at least ${hold} days without dropping below half the starting balance; points and snapshot programs reward balances that stay. Cost: the $${capital} stays deployed and cannot be spent meanwhile. Time: ${hold} days.`),
    step(`Once a week, open ${p.name}'s own points or rewards page from inside its app and note the balance; claim only from links the app itself publishes, never from messages. Cost: nothing to check, and never pay a fee to claim. Time: 5 minutes a week.`),
    step(`Keep a farm log with the wallet address, every date, amount and transaction hash; to stop, withdraw in one transaction and keep the log until any token claim window closes. Cost: about ${gas} of gas to exit. Time: 15 minutes.`),
  ];
}

/** The ranked board: watchlist first as the floor, then the best early finds by implied value. */
export function buildBoard(snapshot: Snapshot, cal: Calibration): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter((p) => watch.has(p.slug) || isLaunchCandidate(p))
    .map((p) => ({ p, v: impliedValue(p, snapshot.as_of, cal) }));
  const byValue = (a: { v: { implied: number }; p: SnapshotProtocol }, b: { v: { implied: number }; p: SnapshotProtocol }): number =>
    b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0);
  const watchlistRows = scored.filter((s) => watch.has(s.p.slug)).sort(byValue);
  const earlyRows = scored.filter((s) => !watch.has(s.p.slug)).sort(byValue);
  const chosen = [...watchlistRows, ...earlyRows.slice(0, Math.max(0, BOARD_ROWS - watchlistRows.length))].sort(byValue);
  return chosen.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: watch.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      category_multiple: s.v.categoryMult,
      category_comps: s.v.categoryComps,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      chain_multiplier: round4(s.v.chainMult),
    },
    risk_flags: riskFlags(s.p, s.v.age, s.v.categoryComps),
    farm_steps: farmSteps(s.p, s.v.age),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d, symbol: p.symbol }));
}

/** The pre-token protocols the launch screen sets aside, by TVL, for the Products view. */
export function productRows(snapshot: Snapshot): ProductRow[] {
  const watch = new Set(snapshot.watchlist);
  return snapshot.protocols
    .filter((p) => isPreToken(p) && !watch.has(p.slug) && !isLaunchCandidate(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, change_7d: p.change_7d, reason: screenReason(p) }));
}

/** The formula as the dashboard prints it, with this snapshot's fitted global median in it. */
export function formulaText(cal: Calibration): string {
  return (
    `implied = round( tvl_usd x fitted category multiple (median mcap/TVL of the category's traded protocols, shrunk toward the global median ${cal.global_median} over ${cal.global_comps} traded protocols; ` +
    `a category with fewer than ${MIN_COMPS} traded peers prices at the global median) x (1 + clamp(change_7d, -50, 100)/100 x 0.6) x (0.55 + 0.45 x min(age_days, 1460)/1460) x (1 + 0.04 per extra chain, max 1.20) )`
  );
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const cal = calibrate(snapshot);
  const board = buildBoard(snapshot, cal);
  const live = liveRows(snapshot);
  const products = productRows(snapshot);
  const liveTotal = snapshot.protocols.filter((p) => !isPreToken(p) && p.category !== 'CEX').length;
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    formula: formulaText(cal),
    snapshot_size: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    live_total: liveTotal,
    product_size: products.length,
    surfaced_size: board.length + live.length + products.length,
    calibration: cal,
    rows: board,
    live,
    products,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'all rows share one implied value';
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
