// Radar-4 estimates value from two independent summaries of the sealed live-token field.
// C is a clipped log-log size regression; P is a shrunken category TVL multiple.
// Their depth-weighted geometric blend receives chain, momentum and maturity adjustments.
// Sigma combines regression scatter and estimator disagreement. No launch is promised.

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

/** The model's constants, as the dashboard states them and a reader can re-run them. */
export interface ModelConstants {
  /** Votes the whole field's weight holds against a category's own sample: n / (n + shrink). */
  shrink: number;
  /** Weight of seven-day TVL growth in the implied value. */
  growth_weight: number;
  /** Growth is clipped to this range, in per cent, before it is weighted. */
  growth_floor: number;
  growth_cap: number;
  /** The maturity premium: its floor, its range and the days at which it reaches full range. */
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  /** Age used when the snapshot records no listing date. */
  unknown_age_days: number;
  /** The premium one extra chain adds, and the extra chains that count. */
  chain_step: number;
  chain_extra_cap: number;
  /** Legacy residual cap, retained for exported API compatibility; unused by radar-4. */
  category_cap: number;
  /** A point this many residual standard deviations from the first fit is dropped. */
  sigma_cut: number;
  peer_depth_sample: number;
  agree_dex: number;
}

export const MODEL: ModelConstants = {
  shrink: 6,
  growth_weight: 0.3,
  growth_floor: -40,
  growth_cap: 60,
  maturity_floor: 0.75,
  maturity_range: 0.25,
  maturity_days: 1095,
  unknown_age_days: 240,
  chain_step: 0.03,
  chain_extra_cap: 4,
  category_cap: 0.4,
  sigma_cut: 2.5,
  /** Comparables at which the two estimators' disagreement counts in full. */
  peer_depth_sample: 8,
  /** Weighted disagreement inside this many dex still counts as agreement. */
  agree_dex: 0.35,
};

/** The model's version label: the dashboard names it, and this is the model it was priced with. */
export const MODEL_VERSION = 'radar-4-two-estimator';

/** Legacy board cap, retained for API compatibility; all independent candidates now join. */
export const BOARD_ROWS = 360;

/** Legacy display count, retained for API compatibility; details now show all eligible peers. */
export const LIVE_ROWS = 30;

/** One live protocol as a point of the size curve: its size, and the market's price for it. */
export interface FitPoint {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  /** log10 of the TVL. */
  x: number;
  /** log10 of the market cap. */
  y: number;
}

/** One least-squares fit of log10(market cap) on log10(TVL). */
export interface FitResult {
  /** The intercept. */
  a: number;
  /** The slope: one more dex of TVL adds this many dex of market cap. */
  b: number;
  /** The residual standard deviation, in dex. */
  scatter: number;
  /** The coefficient of determination. */
  r2: number;
  /** The points the fit was taken over. */
  n: number;
  /** The points the clipping dropped before it, zero for a first fit. */
  clipped: number;
}

/** Both fits: the refit on the kept points, and the first fit over every point. */
export interface FitSummary extends FitResult {
  sd: number;
  field_median: number;
  field_sample: number;
  first: FitResult;
}

/** One category's independent peer multiple, shrunk toward the field. */
export interface CategoryFactor {
  category: string;
  /** All eligible live protocols in this category, before regression clipping. */
  comparables: number;
  /** Legacy field: log10 of the winsorised median multiple. */
  residual_dex: number;
  /** Log10 of the final shrunken, clamped peer multiple. */
  dex: number;
  /** Market-cap dollars per TVL dollar for the peer estimate. */
  factor: number;
}

/** The evidence under one row's price: its category's sample and the fit's own size. */
export interface RowEvidence {
  /** Live protocols of this category that set its factor, zero when it has none. */
  comparables: number;
  /** Log10 of the category peer multiple, zero when unavailable. */
  category_dex: number;
  /** Points the refit kept. */
  kept_points: number;
  /** Points the clipping dropped. */
  clipped_points: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
  capital_usd?: number;
  gas_usd?: number;
  repeat_days?: number;
}

/** One row of board.json: the ranked board's row, with the arithmetic that priced it. */
export interface BoardRow {
  curve_value_usd: number;
  peer_value_usd: number | null;
  blend_weight_curve: number;
  blend_weight_peer: number;
  base_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  sigma_dex: number;
  estimators_agree: boolean | null;

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
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  /** The lower one-sigma bound, including estimator disagreement. */
  band_low: number;
  /** The upper one-sigma bound, including estimator disagreement. */
  band_high: number;
  chain_multiplier: number;
  category_multiplier: number;
  model: {
    /** 10 ^ (A + B * log10(tvl)): the curve's price for this size, before the multipliers. */
    size_value: number;
    growth_pct: number;
    momentum_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  sample: RowEvidence;
  farm_steps: string[];
  "90_day_cost_usd": number;
  farm_capital_usd: number;
  farm_gas_90_day_usd: number;
}

/** The dashboard's compact view of one row: board.json's numbers, without the prose. */
export interface RadarRow {
  curve_value_usd: number;
  peer_value_usd: number | null;
  blend_weight_curve: number;
  blend_weight_peer: number;
  base_value_usd: number;
  growth_multiplier: number;
  sigma_dex: number;
  estimators_agree: boolean | null;

  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  band_low: number;
  band_high: number;
  chain_multiplier: number;
  category_multiplier: number;
  growth_pct: number;
  momentum_multiplier: number;
  maturity_multiplier: number;
  size_value: number;
  sample: RowEvidence;
  farm_steps: string[];
  "90_day_cost_usd": number;
  farm_capital_usd: number;
  farm_gas_90_day_usd: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own figure. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
  /** How far this protocol sits from the size line, in dex; null when it is not a fit point. */
  residual_dex: number | null;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  /** Both fits: the refit's numbers and the first fit's, under `first`. */
  fit: FitSummary;
  /** Every live point the refit kept: the dots of the fit view. */
  points: FitPoint[];
  /** The live points the clipping dropped: drawn hollow in the fit view, never fitted. */
  dropped: FitPoint[];
  /** Every category's factor, strongest sample first. */
  categories: CategoryFactor[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list; the mean of the middle two when the list has even length. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all: no market cap, no CoinGecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name that says, in its own words, that the protocol wraps or stakes another protocol's token. */
const WRAPPED = /\b(wrapped|staked|staking)\b/i;

/** An exchange fronts its own products under its own name; those are not a token to come. */
const EXCHANGE_NAME = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i;

/** Categories whose protocols hold, bridge or stake another token: the token they would issue is that one. */
const PRODUCT_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/**
 * Whether a protocol is one the board may rank: it records no token, and the snapshot does not
 * describe it as a product of a token that already trades. The rule is the house watchlist's own,
 * applied to every row, so the board never ranks a wrapped or staked product as a token to come.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  const category = p.category ?? '';
  if (PRODUCT_CATEGORIES.has(category)) return false;
  if (VERSIONED.test(p.name) || WRAPPED.test(p.name) || EXCHANGE_NAME.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The category key a protocol's factor is looked up under; null is a category of its own. */
function categoryKey(p: SnapshotProtocol): string {
  return p.category ?? 'No category';
}

/** The straight line through log10(TVL) and log10(market cap), by ordinary least squares. */
export function fitLogLine(points: { x: number; y: number }[]): FitResult {
  const n = points.length;
  if (n === 0) return { a: 0, b: 0, scatter: 0, r2: 0, n: 0, clipped: 0 };
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - meanX) * (p.x - meanX);
    sxy += (p.x - meanX) * (p.y - meanY);
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  const a = meanY - b * meanX;
  let residualSum = 0;
  let totalSum = 0;
  for (const p of points) {
    const r = p.y - (a + b * p.x);
    residualSum += r * r;
    totalSum += (p.y - meanY) * (p.y - meanY);
  }
  // The residual standard deviation of the fit: the sum of squares over n - 2 degrees of freedom,
  // which is zero on an exact line. Two points leave no degree of freedom, so the scatter is zero.
  const scatter = n > 2 ? Math.sqrt(residualSum / (n - 2)) : 0;
  const r2 = totalSum > 0 ? 1 - residualSum / totalSum : 1;
  return { a, b, scatter, r2, n, clipped: 0 };
}

/**
 * The size curve: every live protocol with a TVL above zero and a market cap above zero is a point.
 * The first fit takes every point, the points beyond 2.5 residual standard deviations are dropped,
 * and the second fit takes what remains. Both fits are returned, the refit first.
 */
export function fitSizeCurve(snapshot: Snapshot, model: ModelConstants = MODEL): { fit: FitSummary; kept: FitPoint[]; dropped: FitPoint[] } {
  const points: FitPoint[] = [];
  for (const p of snapshot.protocols) {
    if (p.tvl_usd <= 0) continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0) continue;
    points.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      x: Math.log10(p.tvl_usd),
      y: Math.log10(p.mcap_usd),
    });
  }
  points.sort((a, b) => b.mcap_usd - a.mcap_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const first = fitLogLine(points);
  const cut = model.sigma_cut * first.scatter;
  let kept: FitPoint[] = [];
  let dropped: FitPoint[] = [];
  for (const p of points) {
    const beyond = first.scatter > 0 && Math.abs(p.y - (first.a + first.b * p.x)) > cut;
    if (beyond) dropped.push(p);
    else kept.push(p);
  }
  // A cut that leaves too few points to fit is no cut: the line then stands on every point it had,
  // and the rows say so, because a curve through one or two dots claims more than the data holds.
  if (kept.length < 2) {
    kept = points;
    dropped = [];
  }
  const refit = fitLogLine(kept);
  const fit: FitSummary = { ...refit, sd: refit.scatter, clipped: dropped.length, first,
    field_median: median(points.map(p => p.mcap_usd / p.tvl_usd)), field_sample: points.length };
  return { fit, kept, dropped };
}

/** Replace the outer tenth with its boundary values; never mutate the input. */
export const WINSOR_MIN_SAMPLE = 5;
export const WINSOR_FRACTION = 0.1;

export function winsorise(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const tail = sorted.length >= WINSOR_MIN_SAMPLE ? Math.floor(sorted.length * WINSOR_FRACTION) : 0;
  if (!tail) return sorted;
  return sorted.map(v => clamp(v, sorted[tail]!, sorted[sorted.length - tail - 1]!));
}

/** Independent peer estimator: all live points, including curve outliers, set the multiples.
 * Legacy residual fields remain exported as log multiples for compatibility. */
export function categoryFactors(points: FitPoint[], fit: FitResult, model: ModelConstants = MODEL): Map<string, CategoryFactor> {
  const field = median(points.map(p => p.mcap_usd / p.tvl_usd));
  const groups = new Map<string, number[]>();
  for (const p of points) {
    const key = p.category ?? 'No category';
    groups.set(key, [...(groups.get(key) ?? []), p.mcap_usd / p.tvl_usd]);
  }
  return new Map([...groups].map(([category, values]) => {
    const n = values.length;
    const raw = median(winsorise(values));
    const weight = n / (n + model.shrink);
    const factor = clamp(weight * raw + (1 - weight) * field, 0.02, 8);
    return [category, { category, comparables: n, residual_dex: Math.log10(raw), dex: Math.log10(factor), factor }];
  }));
}

/** The terms and the implied value one protocol gets under the curve. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  fit: FitResult,
  factors: Map<string, CategoryFactor>,
  model: ModelConstants = MODEL,
) {
  const factor = factors.get(categoryKey(p));
  const age = ageDays(asOf, p.listed_at);
  const sizeValue = Math.pow(10, fit.a + fit.b * Math.log10(Math.max(1, p.tvl_usd)));
  const categoryMult = factor?.factor ?? 1;
  const peer = factor ? p.tvl_usd * categoryMult : null;
  const wC = fit.n / (fit.n + 12);
  const wP = factor ? factor.comparables / (factor.comparables + 6) : 0;
  const base = peer === null ? sizeValue : Math.pow(10,
    (wC * Math.log10(sizeValue) + wP * Math.log10(peer)) / (wC + wP));
  const chainMult = 1 + model.chain_step * Math.min(Math.max(p.chains.length - 1, 0), model.chain_extra_cap);
  const growthPct = clamp(finite(p.change_7d, 0), model.growth_floor, model.growth_cap);
  const momentum = 1 + growthPct / 100 * model.growth_weight;
  const maturity = model.maturity_floor + clamp(age ?? model.unknown_age_days, 0, model.maturity_days) / model.maturity_days * model.maturity_range;
  const implied = Math.max(1, Math.round(base * chainMult * momentum * maturity));
  // How far the two estimators sit apart counts only as much as the peer sample can be trusted:
  // one comparable is one opinion, eight comparables are a category. Without that weight a single
  // noisy member would widen every band in its category to a hundredfold and say nothing.
  const gap = peer === null ? 0 : Math.log10(sizeValue) - Math.log10(peer);
  const peerDepth = factor ? Math.min(1, factor.comparables / model.peer_depth_sample) : 0;
  const sigma = Math.sqrt(fit.scatter ** 2 + (0.5 * gap * peerDepth) ** 2);
  return {
    implied, bandLow: Math.round(implied / Math.pow(10, sigma)), bandHigh: Math.round(implied * Math.pow(10, sigma)),
    sizeValue, peer, wC, wP, base, sigma, agree: peer === null ? null : Math.abs(gap) * peerDepth <= model.agree_dex,
    categoryMult, categoryDex: factor?.dex ?? 0, chainMult, growthPct, momentum, maturity, age,
    comparables: factor?.comparables ?? 0,
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const { fit, kept, dropped } = fitSizeCurve(snapshot, model);
  const factors = categoryFactors([...kept, ...dropped], fit, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names is on the board, whatever its size.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The radar's early rows: every other protocol the snapshot records no token for, strongest TVL
  // first. The watchlist never loses a row to them.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);
  const watchset = new Set(snapshot.watchlist);
  const scored = [...chosen.values()]
    .map((p) => ({ p, ...impliedValue(p, snapshot.as_of, fit, factors, model) }));
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
  return scored.map((s, i) => {
    const steps = farmSteps(s.p, s.age);
    return ({
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
    age_days: s.age,
    on_watchlist: watchset.has(s.p.slug),
    implied_value_usd: s.implied,
    curve_value_usd: s.sizeValue,
    peer_value_usd: s.peer,
    blend_weight_curve: s.wC,
    blend_weight_peer: s.wP,
    base_value_usd: s.base,
    growth_multiplier: s.momentum,
    maturity_multiplier: s.maturity,
    sigma_dex: s.sigma,
    estimators_agree: s.agree,
    band_low: s.bandLow,
    band_high: s.bandHigh,
    chain_multiplier: s.chainMult,
    category_multiplier: s.categoryMult,
    model: {
      size_value: s.sizeValue,
      growth_pct: s.growthPct,
      momentum_multiplier: s.momentum,
      maturity_multiplier: s.maturity,
      age_days: s.age,
    },
    sample: {
      comparables: s.comparables,
      category_dex: s.categoryDex,
      kept_points: fit.n,
      clipped_points: fit.clipped,
    },
    farm_steps: steps.map(stepText),
    ...farmBudget(steps),
    });
  });
}

/** A step as one string: its action, its cost, its time, inside the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the wallet and the position open.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: a younger protocol needs a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The one action the protocol's category asks for, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, and assess collateral and liquidation terms before any small borrow.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged')) return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and swap once a week inside it.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name}, keep the funds on that chain and use the protocol's own app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and hold the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and keep one small position open for the window.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} on ${chain} and take one position in a market you already follow.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into one ${name} curated vault on ${chain} and keep the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the protocol's stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield asset on ${chain} and hold it for the window.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy open.`;
  if (c.includes('index')) return `Mint $${capital} of ${name}'s index on ${chain} and keep the basket.`;
  if (c.includes('privacy')) return `Move $${capital} through ${name} on ${chain}, then hold the receipt asset in the same wallet.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL, age) and never from a list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const gas = capital >= 150 ? 8 : 4;
  const extra = Math.max(0, p.chains.length - 1);
  const spread = extra > 0 ? `Split the $${capital} across ${Math.min(extra + 1, 3)} of its ${p.chains.length} chains, so one record of activity is not the wallet's only exposure.` : `Keep the whole position on ${chain}, so one address holds one position.`;
  return [
    {
      text: 'Open a fresh wallet for this position alone, write its seed phrase on paper and keep it off every device you browse with.',
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes', gas_usd: 3,
    },
    { text: action, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up', capital_usd: capital, gas_usd: gas },
    {
      text: `Repeat one qualifying action at ${p.name} every week, a deposit, a borrow, a swap or a vote, and log actual activity; verify whether official eligibility rules count it.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week', gas_usd: 2, repeat_days: 7,
    },
    {
      text: `Hold the position at least ${hold} days, as a planning window on ${chain}; official reward timing is not recorded.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    { text: spread, cost: `about $${extra > 0 ? gas + 2 : 0} of gas for the extra routes`, time: extra > 0 ? '30 minutes per extra chain' : '5 minutes to review', gas_usd: extra > 0 ? gas + 2 : 0 },
    {
      text: 'Write the wallet address, the dates and every transaction into a farm log, then check the protocol\'s own site for a points page before you withdraw, and claim only from the address it publishes.',
      cost: `nothing to log, reserve about $${gas} of gas to exit`,
      gas_usd: gas,
      time: '15 minutes',
    },
  ];
}

/** Count capital once; reserve each one-off fee and thirteen weekly actions over ninety days. */
export function farmBudget(steps: FarmStep[]) {
  const capital = Math.max(0, ...steps.map(s => s.capital_usd ?? 0));
  const gas = steps.reduce((sum, s) => sum + (s.gas_usd ?? 0) * (s.repeat_days ? Math.ceil(90 / s.repeat_days) : 1), 0);
  return { "90_day_cost_usd": capital + gas, farm_capital_usd: capital, farm_gas_90_day_usd: gas };
}

/** The live-token protocols, by market cap, for the comparables view. */
export function liveRows(snapshot: Snapshot, fit?: FitResult): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.tvl_usd > 0 && p.mcap_usd !== null ? round4(p.mcap_usd / p.tvl_usd) : null,
      residual_dex:
        fit !== undefined && p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0
          ? round4(Math.log10(p.mcap_usd) - (fit.a + fit.b * Math.log10(p.tvl_usd)))
          : null,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    listed_at: row.listed_at,
    on_watchlist: row.on_watchlist,
    implied_value_usd: row.implied_value_usd,
    curve_value_usd: row.curve_value_usd,
    peer_value_usd: row.peer_value_usd,
    blend_weight_curve: row.blend_weight_curve,
    blend_weight_peer: row.blend_weight_peer,
    base_value_usd: row.base_value_usd,
    growth_multiplier: row.growth_multiplier,
    sigma_dex: row.sigma_dex,
    estimators_agree: row.estimators_agree,

    band_low: row.band_low,
    band_high: row.band_high,
    chain_multiplier: row.chain_multiplier,
    category_multiplier: row.category_multiplier,
    growth_pct: row.model.growth_pct,
    momentum_multiplier: row.model.momentum_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    size_value: row.model.size_value,
    sample: row.sample,
    farm_steps: row.farm_steps,
    "90_day_cost_usd": row["90_day_cost_usd"],
    farm_capital_usd: row.farm_capital_usd,
    farm_gas_90_day_usd: row.farm_gas_90_day_usd,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const { fit, kept, dropped } = fitSizeCurve(snapshot, model);
  const factors = categoryFactors([...kept, ...dropped], fit, model);
  const live = liveRows(snapshot, fit);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: "Sealed DefiLlama snapshot",
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.on_watchlist).length,
    live_size: kept.length,
    fit,
    points: kept,
    dropped,
    categories: [...factors.values()].sort(
      (a, b) => b.comparables - a.comparables || Math.abs(b.dex) - Math.abs(a.dex) || (a.category < b.category ? -1 : 1),
    ),
    rows: board.map(radarRow),
    live,
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared value, bands, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!Number.isSafeInteger(r.tvl_usd) || r.tvl_usd < 0) return `${r.slug} has a TVL the gate refuses`;
    if (!Number.isSafeInteger(r.band_low) || r.band_low < 0 || r.band_low > r.implied_value_usd) return `${r.slug} has a band low of ${r.band_low} against ${r.implied_value_usd}`;
    if (!Number.isSafeInteger(r.band_high) || r.band_high < r.implied_value_usd) return `${r.slug} has a band high of ${r.band_high} against ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

/**
 * The properties this model relies on, checked against small figures of their own so a run needs no
 * snapshot to test them. Each check throws with the numbers it saw when the property stops holding,
 * and the returned names are the properties that passed.
 */
export function selfTest(): string[] {
  const passed: string[] = [];
  const near = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) < tol;

  // median: an odd list returns its middle value, an even list the mean of its middle two.
  const odd = median([3, 1, 2]);
  if (!near(odd, 2)) throw new Error(`selfTest: median of an odd list is ${odd}, expected 2`);
  passed.push('median of an odd list');

  const even = median([4, 1, 3, 2]);
  if (!near(even, 2.5)) throw new Error(`selfTest: median of an even list is ${even}, expected 2.5`);
  passed.push('median of an even list');

  // The fit recovers a known line: y = 1 + x, on five points a decade apart. The points are whole
  // dollars at every decade, so the line the fixture feeds the fit is exactly the line it means.
  const line = [0, 1, 2, 3, 4].map((x) => ({ x, y: 1 + x }));
  const exact = fitLogLine(line);
  if (!near(exact.a, 1, 1e-6) || !near(exact.b, 1, 1e-6)) {
    throw new Error(`selfTest: the fit of y = 1 + x came back as ${exact.a} + ${exact.b}x`);
  }
  passed.push('the fit recovers a known line within 1e-6');

  // On an exact line the residual scatter is zero and the fit explains all of the variance.
  if (!near(exact.scatter, 0, 1e-9)) throw new Error(`selfTest: the scatter of an exact line is ${exact.scatter}, expected 0`);
  if (!near(exact.r2, 1, 1e-9)) throw new Error(`selfTest: the r2 of an exact line is ${exact.r2}, expected 1`);
  passed.push('an exact line has no scatter and an r2 of 1');

  // The clipping drops a point that sits far off the line, and the refit comes back to the line.
  // Eleven points keep the outlier from inflating the first fit's own scatter past its own cut.
  const wide = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => ({ x, y: 1 + x }));
  const noisy = [...wide, { x: 5, y: 13 }];
  const fixture: Snapshot = {
    as_of: '2026-11-14',
    source: 'selfTest fixture',
    floor_usd: 50_000_000,
    protocols: noisy.map((p, i) => ({
      slug: `live-${i}`,
      name: `live ${i}`,
      category: 'Lending',
      chains: ['Ethereum'],
      tvl_usd: Math.round(Math.pow(10, p.x)),
      change_7d: 0,
      mcap_usd: Math.round(Math.pow(10, p.y)),
      listed_at: '2024-01-01',
      gecko_id: `gecko-${i}`,
      symbol: `L${i}`,
    })),
    watchlist: [],
  };
  const curve = fitSizeCurve(fixture);
  if (curve.fit.clipped !== 1) throw new Error(`selfTest: the curve clipped ${curve.fit.clipped} points of a six point line with one outlier, expected 1`);
  if (!near(curve.fit.a, 1, 1e-6) || !near(curve.fit.b, 1, 1e-6)) {
    throw new Error(`selfTest: the refit came back as ${curve.fit.a} + ${curve.fit.b}x, expected 1 + x`);
  }
  if (curve.fit.n !== 11 || curve.fit.first.n !== 12) throw new Error(`selfTest: the fits kept ${curve.fit.n} and ${curve.fit.first.n} points, expected 11 and 12`);
  passed.push('the curve drops a point beyond 2.5 sigma and refits on the rest');

  // A category with no comparable gets a factor of 1, and the band brackets the implied value.
  const bare = fitSizeCurve({
    ...fixture,
    protocols: [
      ...fixture.protocols,
      { slug: 'pre-bare', name: 'pre bare', category: 'Prediction', chains: ['Base'], tvl_usd: 40_000_000, change_7d: 0, mcap_usd: null, listed_at: '2025-06-01', gecko_id: null, symbol: null },
    ],
  });
  const factors = categoryFactors(bare.kept, bare.fit);
  if (factors.has('Prediction')) throw new Error('selfTest: a category with no live comparable was given a factor');
  const priced = impliedValue(
    { slug: 'pre-bare', name: 'pre bare', category: 'Prediction', chains: ['Base'], tvl_usd: 40_000_000, change_7d: 0, mcap_usd: null, listed_at: '2025-06-01', gecko_id: null, symbol: null },
    '2026-11-14',
    bare.fit,
    factors,
  );
  if (priced.categoryMult !== 1) throw new Error(`selfTest: a category with no comparable got a factor of ${priced.categoryMult}, expected 1`);
  passed.push('a category with no comparable gets a factor of 1');

  if (!(priced.bandLow <= priced.implied && priced.implied <= priced.bandHigh)) {
    throw new Error(`selfTest: the band ${priced.bandLow}..${priced.bandHigh} does not bracket the implied value ${priced.implied}`);
  }
  if (!Number.isSafeInteger(priced.bandLow) || priced.bandLow < 1) throw new Error(`selfTest: the band low is ${priced.bandLow}, expected a whole dollar at least 1`);
  passed.push('the band brackets the implied value');

  // The implied value rises with TVL, and is a positive whole number of dollars.
  const bump = (tvl: number): number =>
    impliedValue(
      { slug: 'p', name: 'p', category: 'Prediction', chains: ['Base'], tvl_usd: tvl, change_7d: 0, mcap_usd: null, listed_at: '2025-06-01', gecko_id: null, symbol: null },
      '2026-11-14',
      bare.fit,
      factors,
    ).implied;
  const small = bump(4_000_000);
  const large = bump(40_000_000);
  if (!Number.isSafeInteger(small) || small <= 0) throw new Error(`selfTest: implied value is ${small}, expected a positive whole number`);
  if (!(large > small)) throw new Error(`selfTest: implied value did not rise with TVL: ${small} at $4M, ${large} at $40M`);
  passed.push('implied value rises with TVL and is a positive whole number');

  // boardIssue: the model's own board passes, and a board whose second row outranks its first fails.
  const boardFixture: Snapshot = {
    ...fixture,
    protocols: [...fixture.protocols, ...[1, 2, 3, 4, 5, 6].map((i) => ({
      slug: `pre-${i}`,
      name: `pre ${i}`,
      category: 'Lending',
      chains: ['Ethereum'],
      tvl_usd: i * 9_000_000,
      change_7d: i,
      mcap_usd: null,
      listed_at: `202${i}-01-01`,
      gecko_id: null,
      symbol: null,
    }))],
    watchlist: ['pre-1', 'pre-2'],
  };
  const board = buildBoard(boardFixture);
  const own = boardIssue(board, boardFixture);
  if (own !== null) throw new Error(`selfTest: boardIssue refused the model's own board: ${own}`);
  passed.push('boardIssue accepts the model\'s own board');

  const swapped = board.map((r) => ({ ...r }));
  const first = swapped[0]!.implied_value_usd;
  swapped[0]!.implied_value_usd = swapped[1]!.implied_value_usd;
  swapped[1]!.implied_value_usd = first;
  const outOfOrder = boardIssue(swapped, boardFixture);
  if (outOfOrder === null || !outOfOrder.includes('outranks')) {
    throw new Error(`selfTest: boardIssue accepted a board whose row 2 outranks row 1, or said ${outOfOrder}`);
  }
  passed.push('boardIssue refuses a board whose row 2 outranks row 1');

  // parseSnapshot: a document with no as_of is refused by name.
  const document = JSON.stringify({ source: 'selfTest fixture', floor_usd: 50_000_000, protocols: [], watchlist: [] });
  let refused = '';
  try {
    parseSnapshot(document);
  } catch (err) {
    refused = err instanceof Error ? err.message : String(err);
  }
  if (!refused.includes('as_of')) throw new Error(`selfTest: parseSnapshot accepted a document with no as_of`);
  passed.push('parseSnapshot refuses a document with no as_of');

  if (priced.base !== priced.sizeValue || priced.peer !== null || priced.wP !== 0 || priced.agree !== null) {
    throw new Error('selfTest: a category without comparables does not use the curve alone');
  }
  passed.push('a curve-only blend equals the unadjusted curve exactly');
  const tails = [1000, 2, 3, 4, 5, 6, 7, 8, 9, 0];
  const wins = winsorise(tails);
  if (wins[0] !== 2 || wins[9] !== 9 || median(wins) !== 5.5 || tails[0] !== 1000 || winsorise([9, 1, 3]).join() !== '1,3,9') {
    throw new Error('selfTest: winsoriser fails boundaries, median, small sample or input preservation');
  }
  passed.push('winsoriser caps both tails and preserves its input');
  const both = impliedValue({ ...fixture.protocols[0]!, tvl_usd: 100, listed_at: null }, fixture.as_of, curve.fit, categoryFactors([...curve.kept, ...curve.dropped], curve.fit));
  const expected = Math.pow(10, (both.wC * Math.log10(both.sizeValue) + both.wP * Math.log10(both.peer!)) / (both.wC + both.wP));
  if (!near(both.base, expected) || both.bandLow > both.implied || both.bandHigh < both.implied || both.sigma < curve.fit.scatter) throw new Error('selfTest: blend or disagreement band fails');
  passed.push('two-estimator blend and disagreement band follow their equations');
  // The ninety-day budget counts a reused position once and reserves thirteen weekly fees.
  const planProtocol = { ...boardFixture.protocols[12]!, tvl_usd: 40_000_000, chains: ['Base'] };
  const singlePlan = farmSteps(planProtocol, 400);
  const singleBudget = farmBudget(singlePlan);
  if (singlePlan.length !== 6 || singleBudget.farm_capital_usd !== 50 || singleBudget.farm_gas_90_day_usd !== 37 || singleBudget['90_day_cost_usd'] !== 87) {
    throw new Error('selfTest: single-chain farm budget must reserve $50 capital plus $37 gas for ninety days');
  }
  const multiBudget = farmBudget(farmSteps({ ...planProtocol, tvl_usd: 2_000_000_000, chains: ['Base', 'Ethereum', 'Arbitrum'] }, 400));
  if (multiBudget.farm_capital_usd !== 150 || multiBudget.farm_gas_90_day_usd !== 55 || multiBudget['90_day_cost_usd'] !== 205) {
    throw new Error('selfTest: multi-chain farm budget must reserve $150 capital plus $55 gas for ninety days');
  }
  passed.push('ninety-day farm budgets count shared capital once and all recurring and one-off gas');
  return passed;
}

/** Historical public names remain available to consumers of the earlier peer model. */
export interface RowSample { comparables: number; winsorised: number; field_sample: number; }
export interface BoardSummary { watchlist_size: number; board_size: number; early_size: number; live_size: number; }
export interface PeerRow {
  category: string; count: number; median: number | null; used: number;
  pretenders: number; crowding: number; priced: number;
}

/** Compatibility view of the current peer estimator. Radar-4 applies no crowding discount. */
export function buildPeers(snapshot: Snapshot) {
  const { fit, kept, dropped } = fitSizeCurve(snapshot);
  const points = [...kept, ...dropped];
  const factors = categoryFactors(points, fit);
  const peers: PeerRow[] = [...factors.values()].map(f => ({
    category: f.category, count: f.comparables,
    median: median(winsorise(points.filter(p => (p.category ?? 'No category') === f.category).map(p => p.mcap_usd / p.tvl_usd))),
    used: f.factor, crowding: 1,
    pretenders: snapshot.protocols.filter(p => isRankable(p) && categoryKey(p) === f.category && p.tvl_usd >= snapshot.floor_usd).length,
    priced: snapshot.protocols.filter(p => isRankable(p) && categoryKey(p) === f.category).length,
  }));
  return { peers, fieldMedian: fit.field_median, fieldSample: fit.field_sample,
    used: new Map(peers.map(p => [p.category, p.used])),
    crowd: new Map(peers.map(p => [p.category, 1])),
    trimmed: new Map(peers.map(p => [p.category, p.count >= WINSOR_MIN_SAMPLE ? 2 * Math.floor(p.count * WINSOR_FRACTION) : 0])),
  };
}
