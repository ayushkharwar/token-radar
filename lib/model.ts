// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board answers one question per protocol: what would this protocol's token be worth if its
// record stayed as it is? It answers it from the snapshot's own figures alone, in four steps, and
// never from a list of names:
//
//   1. peer multiple   the price the market already pays for one dollar of TVL in this protocol's
//                      category: the median mcap_usd / tvl_usd of the protocols in the same category
//                      whose token trades. Small categories are shrunk toward the whole field's
//                      median, so one loud comparable cannot set a category's price:
//                        m = (n * m_cat + SHRINK * m_field) / (n + SHRINK)
//   2. momentum         the last seven days of TVL growth, weighted and clipped, so a single spike
//                      moves a rank but cannot own it:  1 + (growth / 100) * GROWTH_WEIGHT
//   3. patience         how long the protocol has run while recording no token, as a premium: a
//                      protocol that survived years without issuing one carries a wider claim base
//                      and a longer discount window:   PATIENCE_FLOOR + min(age, PATIENCE_DAYS) / PATIENCE_DAYS * PATIENCE_RANGE
//   4. implied value   tvl_usd * m * momentum * patience, rounded to whole dollars.
//
// Every row carries the three multipliers it was priced with, so a reader can re-derive the number
// on paper, and the dashboard prints the peer table the multiples came from.

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
  /** Weight of the whole field's median in a category's multiple: higher means more shrinkage. */
  shrink: number;
  /** Weight of seven-day TVL growth in the implied value. */
  growth_weight: number;
  /** Growth is clipped to this range, in per cent, before it is weighted. */
  growth_floor: number;
  growth_cap: number;
  /** The patience premium: its floor, its range and the days at which it reaches full range. */
  patience_floor: number;
  patience_range: number;
  patience_days: number;
  /** Age used when the snapshot records no listing date. */
  unknown_age_days: number;
  /** A category multiple is clipped to this range, whatever its comparables say. */
  multiple_floor: number;
  multiple_cap: number;
  /** How much each extra pre-token protocol of the same category dilutes the ones already priced. */
  crowd_weight: number;
}

export const MODEL: ModelConstants = {
  shrink: 6,
  growth_weight: 0.35,
  growth_floor: -40,
  growth_cap: 80,
  patience_floor: 0.78,
  patience_range: 0.47,
  patience_days: 1460,
  unknown_age_days: 240,
  multiple_floor: 0.02,
  multiple_cap: 2.5,
  crowd_weight: 0.05,
};

/** The model's version label: the dashboard names it, and this is the model it was priced with. */
export const MODEL_VERSION = 'radar-2-peer-fdv';

/** The board's cap: the gate takes up to 4000 rows, and the snapshot's pre-token set is smaller. */
export const BOARD_ROWS = 360;

/** How many live-token protocols the comparables view carries, by market cap. */
export const LIVE_ROWS = 30;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row, with the arithmetic that priced it. */
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
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  model: {
    peer_multiple: number;
    peer_count: number;
    peer_median: number | null;
    field_median: number;
    crowding_multiplier: number;
    growth_pct: number;
    growth_multiplier: number;
    patience_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row: board.json's numbers, without the prose. */
export interface RadarRow {
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
  peer_multiple: number;
  peer_count: number;
  peer_median: number | null;
  crowding_multiplier: number;
  growth_multiplier: number;
  patience_multiplier: number;
  farm_steps: string[];
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
}

/** One row of the peer table: the price of TVL in one category, and the sample behind it. */
export interface PeerRow {
  category: string;
  /** Protocols in this category whose token trades and whose TVL is known. */
  count: number;
  /** Their median mcap/tvl, or null when the category has no comparable at all. */
  median: number | null;
  /** The multiple this model uses: the shrunken, clipped value. */
  used: number;
  /** Pre-token protocols of this category at or above the floor: the tokens that would compete. */
  pretenders: number;
  /** The dilution this category's crowding applies to each of its rows. */
  crowding: number;
  /** How many pre-token protocols the board prices with it. */
  priced: number;
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
  field_median: number;
  field_sample: number;
  peers: PeerRow[];
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

/** Whether a protocol's token trades and its TVL is known, so it can price a category. */
function isComparable(p: SnapshotProtocol): boolean {
  return !isPreToken(p) && p.tvl_usd > 0 && (p.mcap_usd ?? 0) > 0;
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

/** The category key a protocol's multiple is looked up under; null is a category of its own. */
function categoryKey(p: SnapshotProtocol): string {
  return p.category ?? 'No category';
}

/**
 * The peer table: for every category, the median mcap/tvl of the protocols in it whose token
 * trades, the whole field's median, and the multiple the model uses for each category. This is the
 * value model's only input that is not one protocol's own record, and it is the snapshot's own.
 */
export function buildPeers(snapshot: Snapshot): { peers: PeerRow[]; fieldMedian: number; fieldSample: number; used: Map<string, number>; crowd: Map<string, number> } {
  const ratios: number[] = [];
  const byCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (!isComparable(p)) continue;
    const ratio = (p.mcap_usd as number) / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    ratios.push(ratio);
    const key = categoryKey(p);
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  // How many pre-token protocols of each category stand at or above the floor: each one is a
  // future token competing for the same demand, so a crowded category prices its rows lower.
  const pretenders = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (!isRankable(p) || p.tvl_usd < snapshot.floor_usd) continue;
    const key = categoryKey(p);
    pretenders.set(key, (pretenders.get(key) ?? 0) + 1);
  }
  const fieldMedian = ratios.length > 0 ? median(ratios) : 0.2;
  const used = new Map<string, number>();
  const crowd = new Map<string, number>();
  const peers: PeerRow[] = [];
  const categories = new Set<string>([...byCategory.keys(), ...pretenders.keys()]);
  for (const category of categories) {
    const list = byCategory.get(category) ?? [];
    const own = list.length > 0 ? median(list) : fieldMedian;
    // Shrinkage in log space: a category's own median is worth n votes, the whole field's median
    // MODEL.shrink votes, so one comparable moves its category a little and a deep sample moves it
    // most of the way. Ratios are multiplicative, so the blend is geometric.
    const weight = list.length / (list.length + MODEL.shrink);
    const shrunk = own > 0 ? fieldMedian * Math.exp(weight * Math.log(own / fieldMedian)) : fieldMedian;
    const value = clamp(shrunk, MODEL.multiple_floor, MODEL.multiple_cap);
    const pretenderCount = pretenders.get(category) ?? 0;
    const crowdValue = 1 / (1 + MODEL.crowd_weight * Math.max(0, pretenderCount - 1));
    used.set(category, value);
    crowd.set(category, crowdValue);
    peers.push({
      category,
      count: list.length,
      median: round4(own),
      used: round4(value),
      pretenders: pretenderCount,
      crowding: round4(crowdValue),
      priced: 0,
    });
  }
  peers.sort((a, b) => b.pretenders - a.pretenders || b.count - a.count || (a.category < b.category ? -1 : 1));
  return { peers, fieldMedian: round4(fieldMedian), fieldSample: ratios.length, used, crowd };
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  peers: Map<string, number>,
  crowd: Map<string, number>,
  fieldMedian: number,
  model: ModelConstants = MODEL,
): {
  implied: number;
  peerMultiple: number;
  peerCount: number;
  peerMedian: number | null;
  crowdMult: number;
  growthPct: number;
  growthMult: number;
  patienceMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = finite(p.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const patienceMult = model.patience_floor + (clamp(ageForModel, 0, model.patience_days) / model.patience_days) * model.patience_range;
  const key = categoryKey(p);
  const peerMultiple = peers.get(key) ?? fieldMedian;
  const crowdMult = crowd.get(key) ?? 1;
  const implied = Math.max(1, Math.round(p.tvl_usd * peerMultiple * crowdMult * growthMult * patienceMult));
  return {
    implied,
    peerMultiple: round4(peerMultiple),
    peerCount: 0,
    peerMedian: null,
    crowdMult: round4(crowdMult),
    growthPct,
    growthMult: round4(growthMult),
    patienceMult: round4(patienceMult),
    age,
  };
}

/** The headline sentence's figures. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const { peers, fieldMedian, used, crowd } = buildPeers(snapshot);
  const counts = new Map<string, number>(peers.map((p) => [p.category, p.count]));
  const medians = new Map<string, number | null>(peers.map((p) => [p.category, p.median]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names is on the board, whatever its size.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The radar's early rows: every other protocol the snapshot records no token for, down to the
  // smallest TVL it carries, strongest TVL first. The watchlist never loses a row to them.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) if (chosen.size < BOARD_ROWS) chosen.set(p.slug, p);
  const watchset = new Set(snapshot.watchlist);
  const scored = [...chosen.values()]
    .filter((p) => isRankable(p))
    .map((p) => ({ p, ...impliedValue(p, snapshot.as_of, used, crowd, fieldMedian, model) }));
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
  return scored.map((s, i) => {
    const key = categoryKey(s.p);
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
      age_days: s.age,
      on_watchlist: watchset.has(s.p.slug),
      implied_value_usd: s.implied,
      model: {
        peer_multiple: s.peerMultiple,
        peer_count: counts.get(key) ?? 0,
        peer_median: medians.get(key) ?? null,
        field_median: fieldMedian,
        crowding_multiplier: s.crowdMult,
        growth_pct: s.growthPct,
        growth_multiplier: s.growthMult,
        patience_multiplier: s.patienceMult,
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
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
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow a small position against it to create two counted actions.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged')) return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and swap once a week inside it.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name}, keep the funds on that chain and use the protocol's own app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and hold the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} and keep one small position open for the window.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and take one position in a market you already follow.`;
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
  return [
    {
      text: 'Open a fresh wallet for this position alone, write its seed phrase on paper and keep it off every device you browse with.',
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    { text: action, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
    {
      text: `Repeat one qualifying action at ${p.name} every week, a deposit, a borrow, a swap or a vote, so the wallet is active in more than one snapshot.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position at least ${hold} days, long enough that two monthly snapshots of ${chain} activity both count it.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: 'Check the protocol\'s own site and its official channels for a points or rewards page before you withdraw, and claim only from the address it publishes.',
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, the dates and every transaction into a farm log, so the position can be repeated or unwound without guessing.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the comparables view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.tvl_usd > 0 && p.mcap_usd !== null ? round4(p.mcap_usd / p.tvl_usd) : null,
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
    peer_multiple: row.model.peer_multiple,
    peer_count: row.model.peer_count,
    peer_median: row.model.peer_median,
    crowding_multiplier: row.model.crowding_multiplier,
    growth_multiplier: row.model.growth_multiplier,
    patience_multiplier: row.model.patience_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const { peers, fieldMedian, fieldSample } = buildPeers(snapshot);
  const priced = new Map<string, number>();
  for (const row of board) {
    const key = row.category ?? 'No category';
    priced.set(key, (priced.get(key) ?? 0) + 1);
  }
  const early = board.filter((r) => !r.on_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    field_median: fieldMedian,
    field_sample: fieldSample,
    peers: peers.map((p) => ({ ...p, priced: priced.get(p.category) ?? 0 })),
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared value, farm steps. */
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
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
