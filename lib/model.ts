// Token Radar — the value model and farm-plan generator (model radar-4).
//
// One sealed DefiLlama snapshot in, one ranked board out. Every number on the board comes
// from the snapshot's own ten fields; no protocol name is ever special-cased, so the same
// code would score a snapshot taken next year.
//
// The model, stated exactly as the dashboard states it:
//
//   implied = round( tvl_usd x blended multiple )
//
//   blended multiple = 10 ^ ( w x log10(category component) + (1 - w) x log10(regression multiple) ),
//                      w = n / (n + 4), n = the category's traded peers in the snapshot
//   category component = the category's median mcap/TVL, shrunk toward the global median:
//                      (n x category median + 3 x global median) / (n + 3)
//   regression multiple = 10 ^ ( b0 + b1 x log10(tvl_usd) + growth term + maturity term
//                                + chain term + category effect )
//
// Every coefficient is fitted from the snapshot's own traded protocols (the comparables:
// protocols that record a token, with a positive market cap and TVL) by ordinary least
// squares on log10(mcap/TVL) — b0..b4 in one regression, the category effects as shrunk,
// winsorised mean residuals of that regression. The growth, maturity and chain terms are
// the fitted coefficients times the protocol's own clamped seven-day change, its maturity
// (min(age, 1460 days) / 1460; an unrecorded age counts as the comparables' median age)
// and its chain count (capped at 20); each term's contribution is capped at ±0.5 dex, the
// same cap the category effects carry, so no single fitted factor can move a price by
// more than about 3.2x. The Model view counts the rows where a cap binds.
//
// Why a blend (radar-3's lesson): radar-3 priced a category from its median alone, and
// refused the median entirely below three peers — so a fifth of the board priced at one
// global number, and a category with a single wild peer (on this snapshot the one traded
// prediction market, at 400x its TVL) had to be guarded by a hard refusal. radar-4 keeps
// the median as one component but lets the fitted regression carry the weight the peer
// count has not earned: at one peer the blend is 80% regression, at fifteen peers 79%
// median. The regression is anchored to the same market — a log-log curve of market cap
// on TVL over the comparables runs through it — so a thin category's rows are priced off
// their own TVL through the market's own size curve, not off one flat number.
//
// The fit is audited in the open: a deterministic five-fold backtest (folds by slug hash)
// refits everything on four fifths of the comparables and predicts the held-out fifth's
// actual market caps; METHOD.md and the Model view publish its median error and the share
// of predictions within 2x, next to the same backtest run on radar-3's formula.
//
// A protocol counts as pre-token when its record carries no token (mcap, gecko id and
// symbol all null). Protocols whose token already trades are never ranked here; the
// dashboard sets them aside in a Live view with the market's own capitalisation. The
// board's rows pass the house's own screen for a launch of one's own (see
// isLaunchCandidate): a wrapped, staked or bridged product of a token that already
// trades — a wrapped bitcoin asset, a staked-ETH wrapper, a bridged stablecoin — records no token of its
// own yet is no launch candidate, so it never ranks; those protocols are shown, flagged
// with the reason, in the Products view instead. Board rows carry a tier from their TVL:
// Prime at or above the snapshot's floor, Standard at or above $10M, Speculative below.

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
export const MODEL_VERSION = 'radar-4';

/** Board size cap: the watchlist plus the best early finds below the floor. */
export const BOARD_ROWS = 200;

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 240;

/** A category needs at least this many traded comparables before its own median and effect are fitted. */
export const MIN_COMPS = 3;

/** How strongly a fitted category median is shrunk toward the global median. */
export const SHRINK_PRIOR = 3;

/** The blend weight on the category component: w = n / (n + BLEND_PRIOR). */
export const BLEND_PRIOR = 4;

/** Category effects are shrunk by n / (n + EFFECT_PRIOR) and clamped to ±EFFECT_CLAMP dex. */
export const EFFECT_PRIOR = 5;
export const EFFECT_CLAMP = 0.5;

/** Residuals are winsorised at ±RESID_WINSOR dex before a category effect is averaged. */
export const RESID_WINSOR = 1.0;

/** No single fitted factor term moves a price by more than ±TERM_CAP dex. */
export const TERM_CAP = 0.5;

/** The chain-count feature is capped so one many-chain comparable cannot dominate the fit. */
export const CHAIN_CAP = 20;

/** The seven-day change feature is clamped to [GROWTH_MIN, GROWTH_MAX] percent before fitting. */
export const GROWTH_MIN = -60;
export const GROWTH_MAX = 120;

/** Backtest folds, assigned by a hash of the comparable's slug. */
export const BACKTEST_FOLDS = 5;

/** Board tiers by TVL: Prime at the snapshot floor, Standard at or above this, else Speculative. */
export const STANDARD_FLOOR_USD = 10_000_000;
export type Tier = 'Prime' | 'Standard' | 'Speculative';

/** One category's calibration: its comparables, their median ratio, and the fitted pieces. */
export interface CategoryCalibration {
  category: string | null;
  comps: number;
  median: number | null;
  /** The shrunk median component that enters the blend: (n x median + 3 x global) / (n + 3). */
  component: number;
  /** The fitted category effect in dex (0 when the category has too few peers to fit one). */
  effect_dex: number;
  /** The blend weight this category's rows give the median component. */
  weight: number;
  fitted: boolean;
}

/** One fold of the backtest. */
export interface BacktestFold {
  fold: number;
  comps: number;
  median_ape_pct: number;
}

/** The backtest of the shipped model, and of the radar-3 formula it replaces, on the same folds. */
export interface Backtest {
  comps: number;
  folds: BacktestFold[];
  median_ape_pct: number;
  within_2x: number;
  within_2x_pct: number;
  previous_median_ape_pct: number;
  previous_within_2x_pct: number;
}

/** The whole calibration, computed from the snapshot's traded protocols at run time. */
export interface Calibration {
  global_comps: number;
  global_median: number;
  median_age_days: number;
  curve: { intercept: number; slope: number; r2: number };
  beta: { intercept: number; log_tvl: number; growth: number; maturity: number; chains: number };
  backtest: Backtest;
  capped_rows: number;
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
  tier: Tier;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    category_multiple: number;
    regression_multiple: number;
    blend_weight: number;
    category_comps: number;
    category_effect_dex: number;
    size_term_dex: number;
    growth_term_dex: number;
    maturity_term_dex: number;
    chain_term_dex: number;
    factor_capped: boolean;
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
  tiers: { prime: number; standard: number; speculative: number };
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
const round1 = (n: number): number => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

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

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The snapshot's comparables: traded protocols with a positive market cap and TVL, in slug order. */
function comparables(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** The regression features of one protocol, under a fit's median-age imputation. */
interface Features {
  lt: number;
  g: number;
  mat: number;
  ch: number;
  age: number | null;
}
function features(p: SnapshotProtocol, asOf: string, medianAge: number): Features {
  const age = ageDays(asOf, p.listed_at);
  const a = age ?? medianAge;
  return {
    lt: Math.log10(Math.max(1, p.tvl_usd)),
    g: clamp(p.change_7d ?? 0, GROWTH_MIN, GROWTH_MAX) / 100,
    mat: clamp(a, 0, 1460) / 1460,
    ch: Math.min(p.chains.length, CHAIN_CAP),
    age,
  };
}

/** Solve a small dense linear system by Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-12) throw new SnapshotError('the model fit is singular on this snapshot');
    const tmp = M[c]!;
    M[c] = M[piv]!;
    M[piv] = tmp;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      if (f === 0) continue;
      for (let j = c; j <= n; j++) M[r]![j] = M[r]![j]! - f * M[c]![j]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** Ordinary least squares through the normal equations; rows are taken in the order given. */
function ols(rows: number[][], y: number[]): number[] {
  const k = rows[0]!.length;
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  rows.forEach((x, r) => {
    for (let i = 0; i < k; i++) {
      b[i] = b[i]! + x[i]! * y[r]!;
      for (let j = 0; j < k; j++) A[i]![j] = A[i]![j]! + x[i]! * x[j]!;
    }
  });
  return solveLinear(A, b);
}

/** One category inside a raw fit. */
interface RawCategory {
  comps: number;
  median: number;
  component: number;
  effect: number;
}

/** A raw (unrounded) fit over a set of comparables: curve, regression, effects, medians. */
interface RawFit {
  comps: number;
  globalMedian: number;
  medianAge: number;
  curve: { intercept: number; slope: number; r2: number };
  beta: number[];
  categories: Map<string | null, RawCategory>;
}

/** Fit the whole model on the given comparables (already in slug order). Deterministic. */
function fitRaw(comps: SnapshotProtocol[], asOf: string): RawFit {
  const datedAges = comps.map((p) => ageDays(asOf, p.listed_at)).filter((a): a is number => a !== null);
  const medianAge = datedAges.length > 0 ? medianOf(datedAges) : 540;
  const feats = comps.map((p) => features(p, asOf, medianAge));

  // The size curve: log10(mcap) on log10(TVL), the market's own anchor line.
  const curveBeta = ols(
    feats.map((f) => [1, f.lt]),
    comps.map((p) => Math.log10(p.mcap_usd!)),
  );
  const meanY = comps.reduce((s, p) => s + Math.log10(p.mcap_usd!), 0) / comps.length;
  let ssRes = 0;
  let ssTot = 0;
  comps.forEach((p, i) => {
    const y = Math.log10(p.mcap_usd!);
    const pred = curveBeta[0]! + curveBeta[1]! * feats[i]!.lt;
    ssRes += (y - pred) * (y - pred);
    ssTot += (y - meanY) * (y - meanY);
  });
  const curve = { intercept: curveBeta[0]!, slope: curveBeta[1]!, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0 };

  // The ratio regression: log10(mcap/TVL) on size, growth, maturity and chain count.
  const beta = ols(
    feats.map((f) => [1, f.lt, f.g, f.mat, f.ch]),
    comps.map((p) => Math.log10(p.mcap_usd! / p.tvl_usd)),
  );

  // Category effects: winsorised mean residuals, shrunk toward zero, clamped.
  const residByCat = new Map<string | null, number[]>();
  comps.forEach((p, i) => {
    const f = feats[i]!;
    const pred = beta[0]! + beta[1]! * f.lt + beta[2]! * f.g + beta[3]! * f.mat + beta[4]! * f.ch;
    const resid = clamp(Math.log10(p.mcap_usd! / p.tvl_usd) - pred, -RESID_WINSOR, RESID_WINSOR);
    const list = residByCat.get(p.category);
    if (list === undefined) residByCat.set(p.category, [resid]);
    else list.push(resid);
  });

  // Category medians and their shrunk blend components.
  const ratiosByCat = new Map<string | null, number[]>();
  const all: number[] = [];
  for (const p of comps) {
    const ratio = p.mcap_usd! / p.tvl_usd;
    all.push(ratio);
    const list = ratiosByCat.get(p.category);
    if (list === undefined) ratiosByCat.set(p.category, [ratio]);
    else list.push(ratio);
  }
  const globalMedian = medianOf(all);
  const categories = new Map<string | null, RawCategory>();
  for (const [category, ratios] of ratiosByCat) {
    const n = ratios.length;
    const med = medianOf(ratios);
    const resids = residByCat.get(category) ?? [];
    const meanResid = resids.length > 0 ? resids.reduce((s, r) => s + r, 0) / resids.length : 0;
    categories.set(category, {
      comps: n,
      median: med,
      component: (n * med + SHRINK_PRIOR * globalMedian) / (n + SHRINK_PRIOR),
      effect: n >= MIN_COMPS ? clamp((n / (n + EFFECT_PRIOR)) * meanResid, -EFFECT_CLAMP, EFFECT_CLAMP) : 0,
    });
  }
  return { comps: comps.length, globalMedian, medianAge, curve, beta, categories };
}

/** One protocol priced under a raw fit, with every displayed component kept beside the price. */
interface Priced {
  implied: number;
  multiple: number;
  categoryMultiple: number;
  regressionMultiple: number;
  weight: number;
  comps: number;
  effect: number;
  sizeTerm: number;
  growthTerm: number;
  maturityTerm: number;
  chainTerm: number;
  capped: boolean;
  age: number | null;
}
/**
 * Price one protocol. Every step runs on the published (four-decimal) coefficients and
 * components, so the implied value reproduces by hand from the numbers the dashboard and
 * METHOD.md print — the same discipline radar-3 kept for its single multiple.
 */
function priceRaw(fit: RawFit, p: SnapshotProtocol, asOf: string): Priced {
  const f = features(p, asOf, fit.medianAge);
  const cat = fit.categories.get(p.category) ?? null;
  const n = cat ? cat.comps : 0;
  const effect = round4(cat ? cat.effect : 0);
  const sizeTerm = round4(round4(fit.beta[1]!) * f.lt);
  const gRaw = round4(round4(fit.beta[2]!) * f.g);
  const mRaw = round4(round4(fit.beta[3]!) * f.mat);
  const cRaw = round4(round4(fit.beta[4]!) * f.ch);
  const growthTerm = clamp(gRaw, -TERM_CAP, TERM_CAP);
  const maturityTerm = clamp(mRaw, -TERM_CAP, TERM_CAP);
  const chainTerm = clamp(cRaw, -TERM_CAP, TERM_CAP);
  const capped = growthTerm !== gRaw || maturityTerm !== mRaw || chainTerm !== cRaw;
  const logReg = round4(fit.beta[0]!) + sizeTerm + growthTerm + maturityTerm + chainTerm + effect;
  const regressionMultiple = round4(Math.pow(10, logReg));
  const categoryMultiple = round4(cat ? cat.component : fit.globalMedian);
  const weight = n >= 1 ? round4(n / (n + BLEND_PRIOR)) : 0;
  const logMult = weight * Math.log10(categoryMultiple) + (1 - weight) * Math.log10(regressionMultiple);
  const multiple = round4(Math.pow(10, logMult));
  return {
    implied: Math.max(1, Math.round(p.tvl_usd * multiple)),
    multiple,
    categoryMultiple,
    regressionMultiple,
    weight,
    comps: n,
    effect,
    sizeTerm,
    growthTerm,
    maturityTerm,
    chainTerm,
    capped,
    age: f.age,
  };
}

/** radar-3's formula, kept only so the backtest can score the model this one replaces. */
function radar3Implied(fit: RawFit, p: SnapshotProtocol, asOf: string): number {
  const cat = fit.categories.get(p.category) ?? null;
  const n = cat ? cat.comps : 0;
  const multiple = n >= MIN_COMPS && cat ? cat.component : fit.globalMedian;
  const growthMult = 1 + (clamp(p.change_7d ?? 0, -50, 100) / 100) * 0.6;
  const age = ageDays(asOf, p.listed_at) ?? 540;
  const maturityMult = 0.55 + (Math.min(Math.max(age, 0), 1460) / 1460) * 0.45;
  const chainMult = Math.min(1 + 0.04 * Math.max(0, p.chains.length - 1), 1.2);
  return p.tvl_usd * multiple * growthMult * maturityMult * chainMult;
}

/** FNV-1a over the slug, for the backtest's fixed folds. */
function foldOf(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % BACKTEST_FOLDS;
}

/** The five-fold backtest: refit on four folds, predict the held-out fold's actual caps. */
function backtest(comps: SnapshotProtocol[], asOf: string): Backtest {
  const apes: number[] = [];
  const prevApes: number[] = [];
  let within = 0;
  let prevWithin = 0;
  const folds: BacktestFold[] = [];
  for (let f = 0; f < BACKTEST_FOLDS; f++) {
    const train = comps.filter((p) => foldOf(p.slug) !== f);
    const test = comps.filter((p) => foldOf(p.slug) === f);
    const fit = fitRaw(train, asOf);
    const foldApes: number[] = [];
    for (const p of test) {
      const pred = priceRaw(fit, p, asOf).implied;
      const ape = Math.abs(pred - p.mcap_usd!) / p.mcap_usd!;
      apes.push(ape);
      foldApes.push(ape);
      if (pred / p.mcap_usd! >= 0.5 && pred / p.mcap_usd! <= 2) within++;
      const prev = radar3Implied(fit, p, asOf);
      prevApes.push(Math.abs(prev - p.mcap_usd!) / p.mcap_usd!);
      if (prev / p.mcap_usd! >= 0.5 && prev / p.mcap_usd! <= 2) prevWithin++;
    }
    folds.push({ fold: f, comps: test.length, median_ape_pct: round1(medianOf(foldApes) * 100) });
  }
  return {
    comps: comps.length,
    folds,
    median_ape_pct: round1(medianOf(apes) * 100),
    within_2x: within,
    within_2x_pct: round1((within / comps.length) * 100),
    previous_median_ape_pct: round1(medianOf(prevApes) * 100),
    previous_within_2x_pct: round1((prevWithin / comps.length) * 100),
  };
}

/** The fitted calibration of a snapshot, as the dashboard publishes it. */
export function calibrate(snapshot: Snapshot): { fit: RawFit; calibration: Calibration } {
  const comps = comparables(snapshot);
  const fit = fitRaw(comps, snapshot.as_of);
  const categories: CategoryCalibration[] = [...fit.categories.entries()]
    .map(([category, c]) => ({
      category,
      comps: c.comps,
      median: round4(c.median),
      component: round4(c.component),
      effect_dex: round4(c.effect),
      weight: round4(c.comps / (c.comps + BLEND_PRIOR)),
      fitted: c.comps >= MIN_COMPS,
    }))
    .sort((a, b) => {
      const ka = a.category ?? '';
      const kb = b.category ?? '';
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  const calibration: Calibration = {
    global_comps: fit.comps,
    global_median: round4(fit.globalMedian),
    median_age_days: Math.round(fit.medianAge),
    curve: { intercept: round4(fit.curve.intercept), slope: round4(fit.curve.slope), r2: round4(fit.curve.r2) },
    beta: {
      intercept: round4(fit.beta[0]!),
      log_tvl: round4(fit.beta[1]!),
      growth: round4(fit.beta[2]!),
      maturity: round4(fit.beta[3]!),
      chains: round4(fit.beta[4]!),
    },
    backtest: backtest(comps, snapshot.as_of),
    capped_rows: 0,
    categories,
  };
  return { fit, calibration };
}

/**
 * A board row's risk flags, each derived from the snapshot's own fields and nothing else:
 * young (first tracked under 180 days ago), single-chain (its TVL sits on one chain),
 * growth-spike (its seven-day TVL change is over 50% in either direction), thin-comps
 * (fewer than five traded protocols of its category calibrate its price).
 */
export function riskFlags(p: SnapshotProtocol, age: number | null, categoryComps: number): string[] {
  const flags: string[] = [];
  if (age !== null && age < 180) flags.push('young');
  if (p.chains.length <= 1) flags.push('single-chain');
  if (p.change_7d !== null && Math.abs(p.change_7d) > 50) flags.push('growth-spike');
  if (categoryComps < 5) flags.push('thin-comps');
  return flags;
}

/** A board row's tier, from its TVL against the snapshot's floor. */
export function tierFor(tvl: number, floor: number): Tier {
  if (tvl >= floor) return 'Prime';
  if (tvl >= STANDARD_FLOOR_USD) return 'Standard';
  return 'Speculative';
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

/** The category's second action on the same chain: how a farmer deepens the position after the first week. */
function deepenFor(p: SnapshotProtocol, capital: number, chain: string, gas: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `After 7 days, borrow at most 20% against the supplied balance on ${n} and repay it in full 14 days later, so the wallet shows both sides of the market. Cost: about ${gas} of gas twice, and never borrow more than you can repay the same day. Time: 10 minutes twice.`;
  if (c.includes('dex')) return `After 7 days, route three small swaps (about $25 each) through ${n}'s main pool on ${chain}, on different days, so the wallet is a user of the exchange and not only a liquidity provider. Cost: about ${gas} of gas per swap plus the pool's trading fee. Time: 5 minutes per swap.`;
  if (c.includes('bridge')) return `After 14 days, bridge a small amount (about $25) back the other way through ${n}, so the wallet holds a completed round trip rather than a one-way transfer. Cost: about ${gas} of gas on each chain the trip touches. Time: 15 minutes.`;
  if (c.includes('staking') || c.includes('restak')) return `After 7 days, add a second, smaller stake (about 25% of the first) through ${n} from the same wallet, so the position grows the way a real staker's would. Cost: the added stake plus about ${gas} of gas. Time: 10 minutes.`;
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options')) return `Each week, close the hedge and reopen it at the current price rather than letting one position age; two or three modest trades a week read as use, not as a single bet. Cost: the trading fee on about $${Math.max(25, Math.round(capital / 4))} of volume plus about ${gas} of gas. Time: 10 minutes a week.`;
  return `After 7 days, increase the position by about 25% from the same wallet, so its history shows a farmer adding over time rather than a single one-off deposit. Cost: about $${Math.max(20, Math.round(capital / 4))} of added capital plus about ${gas} of gas. Time: 10 minutes.`;
}

/** A step trimmed to the gate's 20..600 characters, keeping its cost-and-time tail intact. */
function step(s: string): string {
  let out = s.trim();
  if (out.length < 20) out = `${out} Keep the position open and check the protocol's own page weekly.`;
  if (out.length <= 600) return out;
  const at = out.indexOf(' Cost: ');
  if (at > 0) {
    const tail = out.slice(at);
    return `${out.slice(0, 600 - tail.length - 3).trimEnd()}...${tail}`;
  }
  return `${out.slice(0, 596)}...`;
}

/**
 * A protocol's farm plan: seven concrete steps generated from its own record — its chains
 * decide whether there is a bridge step and name it, its seven-day change decides the
 * cadence step (cautious after a fall, anti-chase after a spike, steady otherwise), its
 * category's traded-peer count decides whether the points step is a verification step,
 * its TVL decides the capital, its age decides the hold and whether the plan starts with
 * a test deposit. Every step names its cost and its duration.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, categoryComps: number): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(4, Math.round(hold / 7));
  const young = age !== null && age < 180;
  const change = p.change_7d;
  const quarter = Math.max(20, Math.round(capital / 4));

  const setup = young
    ? `Open ${p.name}'s app from its official site and connect a fresh wallet that holds only farm funds, never a wallet with your savings. ${p.name} was first tracked only ${age} days ago, so fund the wallet with a $25 test deposit first and wait 7 days before the main position. Cost: about ${gas} of gas on ${chain} for the first approval. Time: 10 minutes.`
    : `Open ${p.name}'s app from its official site and connect a fresh wallet that holds only farm funds, never a wallet with your savings. Cost: about ${gas} of gas on ${chain} for the first approval. Time: 10 minutes.`;

  const others = p.chains.slice(1, 3);
  const core = `${actionFor(p, capital, chain)}; the position this plan farms is $${capital} held for at least ${hold} days.${others.length > 0 ? ` It also counts TVL on ${others.join(' and ')}, which step 3 uses.` : ''} Cost: $${capital} of capital plus about ${gas} of gas. Time: 15 minutes to set up, then the ${hold}-day hold begins.`;

  const second =
    p.chains.length > 1
      ? `In week two, bridge about $${quarter} of USDC from ${chain} to ${p.chains[1]!} on the canonical route ${p.name}'s own app points to, and repeat the core action there, so the wallet is active on two of its chains. Cost: about $${quarter} of capital plus the bridge fee and about ${gasFor(p.chains[1]!)} of gas on ${p.chains[1]!}. Time: 20 minutes.`
      : deepenFor(p, capital, chain, gas);

  const cadence =
    change !== null && change <= -10
      ? `Its TVL fell ${Math.abs(change).toFixed(2)}% in the seven days to the snapshot, so halve the weekly top-up and set an exit watch instead of adding on schedule: if TVL falls another 15% before the hold ends, withdraw to the farming wallet and reassess. Cost: about ${gas} of gas per weekly visit, and nothing to withdraw. Time: 10 minutes a week for ${weeks} weeks.`
      : change !== null && change >= 25
        ? `Its TVL rose ${change.toFixed(2)}% in the seven days to the snapshot: do not raise the position to chase the move — keep the planned $${capital} and the weekly cadence, because points programs snapshot history, not size spikes. Cost: about ${gas} of gas per weekly visit. Time: 10 minutes a week for ${weeks} weeks.`
        : `Make one small qualifying transaction every week — a $10 top-up, a swap or a vote — so the wallet shows a pattern of use, not a single visit. Cost: about ${gas} of gas per visit. Time: 10 minutes a week for ${weeks} weeks.`;

  const holdStep = `Hold the position for at least ${hold} days without dropping below half the starting balance; points and snapshot programs reward balances that stay.${young ? ` ${p.name} is young and can pivot or delist, so confirm its app still resolves at every weekly visit.` : ''} Cost: the $${capital} stays deployed and cannot be spent meanwhile. Time: ${hold} days.`;

  const verify =
    categoryComps === 0
      ? `No traded protocol of its category calibrates this row's price, so treat any points figure as provisional: verify the program on ${p.name}'s own site and inside its app, save the balance page each week, and never trust a third-party points tracker. Cost: nothing to check, and never pay a fee to claim. Time: 5 minutes a week.`
      : categoryComps < 5
        ? `Only ${categoryComps} traded protocol${categoryComps === 1 ? '' : 's'} of its category calibrate this row's price, so treat any points figure as provisional: verify the program on ${p.name}'s own site and inside its app, save the balance page each week, and never trust a third-party points tracker. Cost: nothing to check, and never pay a fee to claim. Time: 5 minutes a week.`
        : `Once a week, open ${p.name}'s own points or rewards page from inside its app and note the balance; claim only from links the app itself publishes, never from messages. Cost: nothing to check, and never pay a fee to claim. Time: 5 minutes a week.`;

  const spike = change !== null && Math.abs(change) > 50;
  const exit = `Keep a farm log with the wallet address, every date, amount and transaction hash; to stop, withdraw in one transaction and keep the log until any token claim window closes.${spike ? ` Its seven-day TVL move was over 50%, so check the exit route's liquidity a week before the hold ends.` : ''} Cost: about ${gas} of gas to exit. Time: 15 minutes.`;

  return [step(setup), step(core), step(second), step(cadence), step(holdStep), step(verify), step(exit)];
}

/** The ranked board: watchlist first as the floor, then the best early finds by implied value. */
export function buildBoard(snapshot: Snapshot, fit: RawFit): { rows: BoardRow[]; capped: number } {
  const watch = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter((p) => watch.has(p.slug) || isLaunchCandidate(p))
    .map((p) => ({ p, v: priceRaw(fit, p, snapshot.as_of) }));
  const byValue = (a: { v: Priced; p: SnapshotProtocol }, b: { v: Priced; p: SnapshotProtocol }): number =>
    b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0);
  const watchlistRows = scored.filter((s) => watch.has(s.p.slug)).sort(byValue);
  const earlyRows = scored.filter((s) => !watch.has(s.p.slug)).sort(byValue);
  const chosen = [...watchlistRows, ...earlyRows.slice(0, Math.max(0, BOARD_ROWS - watchlistRows.length))].sort(byValue);
  let capped = 0;
  const rows = chosen.map((s, i) => {
    if (s.v.capped) capped++;
    return {
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
      tier: tierFor(s.p.tvl_usd, snapshot.floor_usd),
      age_days: s.v.age,
      implied_value_usd: s.v.implied,
      model: {
        multiple: s.v.multiple,
        category_multiple: round4(s.v.categoryMultiple),
        regression_multiple: round4(s.v.regressionMultiple),
        blend_weight: s.v.weight,
        category_comps: s.v.comps,
        category_effect_dex: round4(s.v.effect),
        size_term_dex: round4(s.v.sizeTerm),
        growth_term_dex: round4(s.v.growthTerm),
        maturity_term_dex: round4(s.v.maturityTerm),
        chain_term_dex: round4(s.v.chainTerm),
        factor_capped: s.v.capped,
      },
      risk_flags: riskFlags(s.p, s.v.age, s.v.comps),
      farm_steps: farmSteps(s.p, s.v.age, s.v.comps),
    };
  });
  return { rows, capped };
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

/** The formula as the dashboard prints it, with this snapshot's fitted numbers in it. */
export function formulaText(cal: Calibration): string {
  const b = cal.beta;
  return (
    `implied = round( tvl_usd x blended multiple ); the blended multiple is a geometric blend, weighted by traded-peer count as n/(n+${BLEND_PRIOR}), of ` +
    `(a) the category's median mcap/TVL shrunk toward the global median ${cal.global_median} over ${cal.global_comps} traded protocols and ` +
    `(b) a regression multiple 10^(${b.intercept} + ${b.log_tvl} x log10(tvl_usd) + growth term + maturity term + chain term + category effect), ` +
    `every coefficient fitted from the same ${cal.global_comps} traded protocols, each factor term capped at \u00b1${TERM_CAP} dex`
  );
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { fit, calibration } = calibrate(snapshot);
  const { rows: board, capped } = buildBoard(snapshot, fit);
  calibration.capped_rows = capped;
  const live = liveRows(snapshot);
  const products = productRows(snapshot);
  const liveTotal = snapshot.protocols.filter((p) => !isPreToken(p) && p.category !== 'CEX').length;
  const early = board.filter((r) => !r.watchlist).length;
  const tiers = { prime: 0, standard: 0, speculative: 0 };
  for (const r of board) {
    if (r.tier === 'Prime') tiers.prime++;
    else if (r.tier === 'Standard') tiers.standard++;
    else tiers.speculative++;
  }
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    formula: formulaText(calibration),
    snapshot_size: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    live_total: liveTotal,
    product_size: products.length,
    surfaced_size: board.length + live.length + products.length,
    tiers,
    calibration,
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
