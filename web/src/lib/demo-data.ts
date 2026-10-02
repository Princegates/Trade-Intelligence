// Fallback data used whenever Supabase isn't configured (see
// src/lib/supabase/env.ts#isSupabaseConfigured), so the UI — dashboard,
// admin panel, settings — is fully browsable before a real project is wired
// up. None of this is persisted; edits in demo mode are visual-only.

import type { SessionUser } from "@/lib/auth";
import type { ConfidenceBreakdown, RangeZone, VolatilityRegime } from "@/lib/signal-view";
import type { LifecycleState, SettingsCategory } from "@/lib/supabase/types";
import type { CalendarEvent } from "@/lib/calendar-view";
import type { NewsItem } from "@/lib/news-view";
import type { ActivityView } from "@/lib/activity-log-view";
import type { BacktestRunView, TradeOutcomeView } from "@/lib/performance-view";
import { GUDA_SPECIAL_STRATEGY_VERSION } from "@/lib/guda-special-version";

export const DEMO_USER: SessionUser = {
  id: "demo-user",
  email: "trader@example.com",
  fullName: "Demo Trader",
  role: "user",
  approved: true,
  // Mid-trial in the demo, same as a freshly-approved real account would be.
  fullAccessUntil: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
  mustChangePassword: false,
};

export const DEMO_ADMIN: SessionUser = {
  id: "demo-admin",
  email: "admin@example.com",
  fullName: "Demo Admin",
  role: "admin",
  approved: true,
  fullAccessUntil: null,
  mustChangePassword: false,
};

export interface DemoSignal {
  symbol: string;
  timeframe: string;
  generatedAt: string;
  price: number;
  verdict: "BUY" | "SELL" | "HOLD";
  score: number;
  reasoning: string[];
  confidence: number | null;
  strategyVersion: string;
  patterns: string[];
  levels: {
    entry: number | null;
    stop: number | null;
    target: number | null;
    buyAbove: number | null;
    sellBelow: number | null;
  } | null;
  aiCommentary: string | null;
  confluenceBias: string | null;
  regime: string | null;
  marketPhase: string | null;
  invalidationLevel: number | null;
  entryZone: { low: number; high: number } | null;
  lifecycle: { state: LifecycleState; enteredAt: string } | null;
  volatilityRegime: VolatilityRegime | null;
  fib: { direction: 1 | -1; f50: number; f61_8: number; f72: number; f78_6: number } | null;
  priceRange: { positionPct: number; zone: RangeZone } | null;
  confidenceBreakdown: ConfidenceBreakdown | null;
}

const now = () => new Date().toISOString();

// "demo" rather than a real version number: these never came from the engine,
// and the card shows this alongside the verdict.
const demoLineage = { confidence: null, strategyVersion: "demo" };

// Stands in for the engine's ATR sizing so demo cards show the same shape of
// levels a real one would. A flat 1.8% of price is a plausible stand-in, not
// a measurement — these are samples, and the card labels them as such.
function demoLevels(price: number, verdict: DemoSignal["verdict"]): DemoSignal["levels"] {
  const stop = price * 0.018;
  const target = stop * 1.5;
  if (verdict === "BUY") {
    return { entry: price, stop: price - stop, target: price + target, buyAbove: null, sellBelow: null };
  }
  if (verdict === "SELL") {
    return { entry: price, stop: price + stop, target: price - target, buyAbove: null, sellBelow: null };
  }
  return { entry: null, stop: null, target: null, buyAbove: price + stop, sellBelow: price - stop };
}

type DemoSignalSeed = Omit<
  DemoSignal,
  | "patterns"
  | "levels"
  | "aiCommentary"
  | "confluenceBias"
  | "regime"
  | "marketPhase"
  | "invalidationLevel"
  | "entryZone"
  | "lifecycle"
  | "volatilityRegime"
  | "fib"
  | "priceRange"
  | "confidenceBreakdown"
> & {
  patterns?: string[];
  aiCommentary?: string;
  volatilityRegime?: VolatilityRegime;
  fib?: DemoSignal["fib"];
  priceRange?: DemoSignal["priceRange"];
  confidenceBreakdown?: ConfidenceBreakdown;
};

const DEMO_SIGNAL_SEEDS: DemoSignalSeed[] = [
  {
    symbol: "BTCUSDT",
    timeframe: "15m",
    generatedAt: now(),
    ...demoLineage,
    price: 68205.0,
    verdict: "BUY",
    score: 2,
    reasoning: [
      "Price above a bullishly stacked EMA line (EMA9=68190.30, EMA21=68140.60, EMA50=68050.10)",
      "RSI(14) at 56.4 — neutral (30-70)",
      "MACD 42.10 above signal line (30.80) — bullish",
      "BOS at 68150.00 — price confirms the prevailing uptrend",
      "ATR(14) at 62.40 — typical move per candle, used to size the levels below",
      "Confidence 78/100 — confluence strength, not a win rate: trend 20/20, structure 15/20, pullback 11/15, S/R 7/10, candle 8/10, ATR/volatility 10/10, momentum 7/10, liquidity 5/5",
    ],
    // Sample Core Market Intelligence context, so the dashboard's demo
    // preview actually shows what these new fields look like rendered —
    // every other demo signal below is left null, same minimal-churn
    // precedent every prior phase's demo-data addition already followed.
    volatilityRegime: "NORMAL",
    fib: { direction: 1, f50: 68050.0, f61_8: 67990.3, f72: 67942.0, f78_6: 67906.6 },
    priceRange: { positionPct: 62.0, zone: "PREMIUM" },
    confidenceBreakdown: {
      total: 78,
      trend: { score: 20, max: 20 },
      structure: { score: 15, max: 20 },
      pullback: { score: 11, max: 15 },
      support_resistance: { score: 7, max: 10 },
      candle: { score: 8, max: 10 },
      volatility: { score: 10, max: 10 },
      momentum: { score: 7, max: 10 },
      liquidity: { score: 5, max: 5 },
    },
  },
  {
    symbol: "BTCUSDT",
    timeframe: "1h",
    generatedAt: now(),
    ...demoLineage,
    price: 68420.5,
    verdict: "BUY",
    score: 2,
    reasoning: [
      "Price above a bullishly stacked EMA line (EMA9=68210.40, EMA21=68050.10, EMA50=67820.75, EMA100=67512.30, EMA200=66890.15)",
      "RSI(14) at 58.2 — neutral (30-70)",
      "MACD 184.20 above signal line (150.40) — bullish",
      "BOS at 68150.00 — price confirms the prevailing uptrend",
      "ATR(14) at 145.30 — typical move per candle, used to size the levels below",
    ],
    aiCommentary:
      "Every trend and momentum reading here is pulling the same direction, which is the cleaner setup to catch early rather than chase — the EMA stack has been climbing in order since the 200 down through the 9, RSI still has room before overbought, and the break of structure at 68,150 is the kind of confirmation that tends to hold rather than fake out. The $145 ATR is what's sizing the stop below, so a move back through recent structure is what would actually invalidate this, not just a red candle.",
  },
  {
    symbol: "BTCUSDT",
    timeframe: "4h",
    generatedAt: now(),
    ...demoLineage,
    price: 68390.0,
    verdict: "HOLD",
    score: 0,
    reasoning: [
      "EMA stack mixed (EMA9=68320.10, EMA21=68300.50, EMA50=68310.75) — no clean trend",
      "RSI(14) at 55.1 — neutral (30-70)",
      "MACD flat against its signal line — no clear direction",
      "Market structure: range bias, no fresh break this candle",
      "ATR(14) at 210.60 — typical move per candle, used to size the levels below",
    ],
  },
  {
    symbol: "BTCUSDT",
    timeframe: "1d",
    generatedAt: now(),
    ...demoLineage,
    price: 68010.25,
    verdict: "SELL",
    score: -2,
    reasoning: [
      "Price below a bearishly stacked EMA line (EMA9=67450.20, EMA21=67680.90, EMA50=68120.40, EMA100=68550.10, EMA200=69200.75)",
      "RSI(14) at 74.8 — overbought (>70)",
      "MACD 320.10 below signal line (410.55) — bearish",
      "RSI and MACD agree — counted once as momentum, not twice",
      "Market structure: down bias, no fresh break this candle",
      "ATR(14) at 380.20 — typical move per candle, used to size the levels below",
    ],
  },
  {
    symbol: "XAUUSD",
    timeframe: "1h",
    generatedAt: now(),
    ...demoLineage,
    price: 2378.4,
    verdict: "HOLD",
    score: 1,
    reasoning: [
      "Price above a bullishly stacked EMA line (EMA9=2379.40, EMA21=2375.10, EMA50=2371.90)",
      "RSI(14) at 58.0 — neutral (30-70)",
      "MACD 1.70 above signal line (1.25) — bullish",
      "Market structure: range bias, no fresh break this candle",
      "ATR(14) at 6.80 — typical move per candle, used to size the levels below",
    ],
  },
  {
    symbol: "XAUUSD",
    timeframe: "4h",
    generatedAt: now(),
    ...demoLineage,
    price: 2381.1,
    verdict: "BUY",
    score: 2,
    reasoning: [
      "Price above a bullishly stacked EMA line (EMA9=2382.60, EMA21=2377.20, EMA50=2368.50, EMA100=2359.80, EMA200=2340.10)",
      "RSI(14) at 38.4 — neutral (30-70)",
      "MACD 2.40 above signal line (1.10) — bullish",
      "BOS at 2379.00 — price confirms the prevailing uptrend",
      "ATR(14) at 5.40 — typical move per candle, used to size the levels below",
    ],
    // A second sample, deliberately HIGH this time, so the conditional
    // header badge (only shown for HIGH/EXTREME) has a demo case too.
    volatilityRegime: "HIGH",
    priceRange: { positionPct: 18.0, zone: "DISCOUNT" },
  },
  {
    symbol: "XAUUSD",
    timeframe: "1d",
    generatedAt: now(),
    ...demoLineage,
    price: 2365.8,
    verdict: "HOLD",
    score: 0,
    reasoning: [
      "EMA stack mixed (EMA9=2366.30, EMA21=2364.80, EMA50=2361.50) — no clean trend",
      "RSI(14) at 49.6 — neutral (30-70)",
      "MACD -0.46 below signal line (-0.19) — bearish",
      "Market structure: up bias, no fresh break this candle",
      "ATR(14) at 4.90 — typical move per candle, used to size the levels below",
    ],
  },
];

export const DEMO_SIGNALS: DemoSignal[] = DEMO_SIGNAL_SEEDS.map((s) => ({
  ...s,
  patterns: s.patterns ?? [],
  levels: demoLevels(s.price, s.verdict),
  aiCommentary: s.aiCommentary ?? null,
  confluenceBias: null,
  regime: null,
  marketPhase: null,
  invalidationLevel: null,
  entryZone: null,
  lifecycle: null,
  volatilityRegime: s.volatilityRegime ?? null,
  fib: s.fib ?? null,
  priceRange: s.priceRange ?? null,
  confidenceBreakdown: s.confidenceBreakdown ?? null,
}));

// Mirrors GudaSpecialSignalView's shape independently, same reasoning
// DemoSignal above doesn't import SignalView — this file stays a
// self-contained fixture module, not dependent on the real data layer.
export interface DemoGudaSpecialSignal {
  symbol: string;
  timeframe: string;
  generatedAt: string;
  price: number;
  verdict: "BUY" | "SELL" | "NO_TRADE";
  reasoning: string;
  noTradeReason: string | null;
  strategyVersion: string;
  bosKind: "BOS" | "CHoCH";
  bosDirection: 1 | -1;
  bosPrice: number;
  breakStrength: "STRONG" | "NORMAL" | "WEAK" | null;
  impulse: { start: number; end: number; atrMultiple: number } | null;
  fib: { f50: number; f61_8: number; f72: number; f78_6: number } | null;
  retracementQuality: "SHALLOW" | "VALID" | "DEEP" | "FAILED" | null;
  retestConfirmed: boolean | null;
  confirmationPattern: string | null;
  candleQuality: "STRONG" | "NORMAL" | "WEAK" | null;
  htfBias: string | null;
  htfFilterOutcome: "ALIGNED" | "NEUTRAL" | "DOWNGRADED" | "REJECTED" | null;
  levels: { entry: number; stop: number; target: number } | null;
  riskReward: number | null;
  regime: string | null;
  volatilityRegime: VolatilityRegime | null;
  priceRange: { positionPct: number; zone: RangeZone } | null;
}

// One example, mirroring DEMO_SIGNAL_SEEDS' hand-written style — GUDA
// SPECIAL only ever runs on 15m, so unlike the confluence engine's demo set
// there's at most one row per symbol to show, not one per timeframe.
export const DEMO_GUDA_SPECIAL_SIGNALS: DemoGudaSpecialSignal[] = [
  {
    symbol: "BTCUSDT",
    timeframe: "15m",
    generatedAt: now(),
    price: 68180.5,
    verdict: "BUY",
    reasoning:
      "Bullish Engulfing (strong) confirmed inside the 50-79% retracement zone, strong break of structure at 68050.00, 1H bias (up) agrees with the call.",
    noTradeReason: null,
    strategyVersion: "demo",
    bosKind: "BOS",
    bosDirection: 1,
    bosPrice: 68050.0,
    breakStrength: "STRONG",
    impulse: { start: 67420.0, end: 68310.0, atrMultiple: 2.4 },
    fib: { f50: 67865.0, f61_8: 67760.4, f72: 67670.8, f78_6: 67613.7 },
    retracementQuality: "VALID",
    retestConfirmed: true,
    confirmationPattern: "Bullish Engulfing",
    candleQuality: "STRONG",
    htfBias: "up",
    htfFilterOutcome: "ALIGNED",
    levels: { entry: 68180.5, stop: 67540.0, target: 69461.5 },
    riskReward: 2.0,
    regime: "TRENDING",
    volatilityRegime: "NORMAL",
    priceRange: { positionPct: 54.0, zone: "EQUILIBRIUM" },
  },
];

// Offsets from "now" rather than fixed dates, so the calendar always looks
// current in demo mode instead of showing a week that has already passed.
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

export const DEMO_EVENTS: CalendarEvent[] = [
  {
    title: "Retail Sales m/m",
    country: "USD",
    eventTime: hoursFromNow(-6),
    impact: "Medium",
    forecast: "0.3%",
    previous: "0.1%",
    actual: "0.4%",
  },
  {
    title: "CPI m/m",
    country: "USD",
    eventTime: hoursFromNow(2),
    impact: "High",
    forecast: "0.3%",
    previous: "0.2%",
    actual: null,
  },
  {
    title: "ECB Press Conference",
    country: "EUR",
    eventTime: hoursFromNow(9),
    impact: "High",
    forecast: null,
    previous: null,
    actual: null,
  },
  {
    title: "Unemployment Claims",
    country: "USD",
    eventTime: hoursFromNow(30),
    impact: "Low",
    forecast: "225K",
    previous: "231K",
    actual: null,
  },
  {
    title: "FOMC Member Speech",
    country: "USD",
    eventTime: hoursFromNow(54),
    impact: "Medium",
    forecast: null,
    previous: null,
    actual: null,
  },
];

export const DEMO_NEWS: NewsItem[] = [
  {
    title: "Bitcoin holds above key support as ETF inflows resume",
    url: "https://example.com/news/bitcoin-etf-inflows",
    source: "example-news.com",
    publishedAt: hoursFromNow(-1),
  },
  {
    title: "Gold steadies near record highs ahead of Fed minutes",
    url: "https://example.com/news/gold-fed-minutes",
    source: "example-markets.com",
    publishedAt: hoursFromNow(-4),
  },
  {
    title: "Dollar index slips as rate-cut bets firm up",
    url: "https://example.com/news/dollar-index-rate-cuts",
    source: "example-finance.com",
    publishedAt: hoursFromNow(-9),
  },
];

export interface DemoUser {
  id: string;
  email: string;
  fullName: string | null;
  role: "user" | "admin";
  approved: boolean;
  createdAt: string;
  fullAccessUntil: string | null;
}

const days = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString();

export const DEMO_USERS: DemoUser[] = [
  { id: "1", email: "admin@example.com", fullName: "Demo Admin", role: "admin", approved: true, createdAt: "2026-01-04T00:00:00Z", fullAccessUntil: null },
  { id: "2", email: "trader@example.com", fullName: "Demo Trader", role: "user", approved: true, createdAt: "2026-02-11T00:00:00Z", fullAccessUntil: days(5) },
  { id: "3", email: "jane.doe@example.com", fullName: "Jane Doe", role: "user", approved: false, createdAt: "2026-03-22T00:00:00Z", fullAccessUntil: null },
  { id: "4", email: "sam.k@example.com", fullName: "Sam K.", role: "user", approved: true, createdAt: "2026-04-02T00:00:00Z", fullAccessUntil: days(-2) },
];

export interface ProviderField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
}

export interface ProviderDef {
  provider: string;
  label: string;
  fields: ProviderField[];
}

export const SETTINGS_PROVIDERS: Record<SettingsCategory, ProviderDef[]> = {
  email: [
    { provider: "resend", label: "Resend", fields: [{ key: "api_key", label: "API Key", secret: true }, { key: "from_address", label: "From address", placeholder: "alerts@yourdomain.com" }] },
    { provider: "sendgrid", label: "SendGrid", fields: [{ key: "api_key", label: "API Key", secret: true }, { key: "from_address", label: "From address", placeholder: "alerts@yourdomain.com" }] },
    { provider: "postmark", label: "Postmark", fields: [{ key: "server_token", label: "Server Token", secret: true }, { key: "from_address", label: "From address", placeholder: "alerts@yourdomain.com" }] },
    { provider: "ses", label: "Amazon SES", fields: [{ key: "access_key_id", label: "Access Key ID", secret: true }, { key: "secret_access_key", label: "Secret Access Key", secret: true }, { key: "region", label: "Region", placeholder: "us-east-1" }] },
  ],
  sms: [
    { provider: "twilio", label: "Twilio", fields: [{ key: "account_sid", label: "Account SID", secret: true }, { key: "auth_token", label: "Auth Token", secret: true }, { key: "from_number", label: "From number", placeholder: "+15551234567" }] },
    { provider: "hubtel", label: "Hubtel SMS", fields: [{ key: "client_id", label: "Client ID", secret: true }, { key: "client_secret", label: "Client Secret", secret: true }, { key: "sender_id", label: "Sender ID", placeholder: "TradeIntel" }] },
    { provider: "vonage", label: "Vonage", fields: [{ key: "api_key", label: "API Key", secret: true }, { key: "api_secret", label: "API Secret", secret: true }, { key: "from_number", label: "From number" }] },
  ],
  payments: [
    { provider: "stripe", label: "Stripe", fields: [{ key: "publishable_key", label: "Publishable Key" }, { key: "secret_key", label: "Secret Key", secret: true }, { key: "webhook_secret", label: "Webhook Signing Secret", secret: true }] },
    { provider: "paystack", label: "Paystack", fields: [{ key: "public_key", label: "Public Key" }, { key: "secret_key", label: "Secret Key", secret: true }] },
    { provider: "hubtel_payments", label: "Hubtel Payments", fields: [{ key: "client_id", label: "Client ID", secret: true }, { key: "client_secret", label: "Client Secret", secret: true }, { key: "merchant_account", label: "Merchant Account Number" }] },
  ],
  push: [
    { provider: "web_push", label: "Web Push (VAPID)", fields: [{ key: "public_key", label: "VAPID Public Key" }, { key: "private_key", label: "VAPID Private Key", secret: true }, { key: "subject", label: "Contact (mailto:)", placeholder: "mailto:you@yourdomain.com" }] },
    { provider: "fcm", label: "Firebase Cloud Messaging", fields: [{ key: "project_id", label: "Project ID" }, { key: "service_account_json", label: "Service Account JSON", secret: true }] },
  ],
  ai: [
    {
      provider: "gemini",
      label: "Google Gemini (free tier)",
      fields: [
        { key: "api_key", label: "API Key", secret: true },
        { key: "model", label: "Model", placeholder: "gemini-3.5-flash-lite" },
        // Optional, separate from api_key above: the free tier's daily quota
        // is per API key, shared by every caller using it. AI commentary
        // (generated automatically on every new signal) and the Guda chat
        // widget (user-driven, unpredictable volume) draw from the same key
        // by default, so heavy chat use can starve commentary generation or
        // vice versa. Setting this splits them onto two keys; leaving it
        // blank keeps today's behavior (chat reuses the key above) — see
        // src/lib/gemini-chat.ts.
        { key: "chat_api_key", label: "Chat API Key (optional — reuses the key above if blank)", secret: true },
      ],
    },
    { provider: "anthropic", label: "Anthropic (Claude)", fields: [{ key: "api_key", label: "API Key", secret: true }, { key: "model", label: "Model", placeholder: "claude-sonnet-5" }] },
    { provider: "openai", label: "OpenAI", fields: [{ key: "api_key", label: "API Key", secret: true }, { key: "model", label: "Model", placeholder: "gpt-5" }] },
  ],
  news: [
    { provider: "marketaux", label: "Marketaux", fields: [{ key: "api_token", label: "API Token", secret: true }] },
  ],
};

export interface DemoSetting {
  category: SettingsCategory;
  provider: string;
  isActive: boolean;
  config: Record<string, string>;
}

export const DEMO_SETTINGS: DemoSetting[] = [
  { category: "email", provider: "resend", isActive: true, config: { from_address: "alerts@signalsvaultai.com" } },
  { category: "sms", provider: "hubtel", isActive: false, config: {} },
  { category: "payments", provider: "paystack", isActive: false, config: {} },
];

// A day of system-log activity (see /admin/logs), newest first, covering
// each category and one failed sign-in, so the page and its filters have
// something to show in demo mode.
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();
const DEMO_UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
};
const demoActivity = (
  id: number,
  minutes: number,
  row: Partial<ActivityView> & Pick<ActivityView, "action">
): ActivityView => ({
  id,
  createdAt: minutesAgo(minutes),
  actorId: null,
  actorEmail: null,
  actorRole: null,
  targetType: null,
  targetId: null,
  targetLabel: null,
  details: {},
  outcome: "success",
  ip: "203.0.113.24",
  userAgent: DEMO_UA.chromeMac,
  ...row,
});
const demoTrader = { actorId: "2", actorEmail: "trader@example.com", actorRole: "user" };
const demoAdmin = { actorId: "1", actorEmail: "admin@example.com", actorRole: "admin", ip: "198.51.100.7", userAgent: DEMO_UA.edgeWindows };

export const DEMO_ACTIVITY: ActivityView[] = [
  demoActivity(14, 4, { ...demoTrader, action: "chat.message_sent", details: { message_length: 64 }, userAgent: DEMO_UA.safariIphone }),
  demoActivity(13, 9, { ...demoTrader, action: "auth.signed_in", userAgent: DEMO_UA.safariIphone }),
  demoActivity(12, 11, {
    action: "auth.sign_in_failed",
    actorEmail: "trader@example.com",
    outcome: "failure",
    details: { reason: "Invalid login credentials" },
    ip: "192.0.2.150",
    userAgent: DEMO_UA.safariIphone,
  }),
  demoActivity(11, 38, {
    ...demoAdmin,
    action: "admin.engine_settings_changed",
    targetType: "setting",
    targetLabel: "Signal engine",
    details: { changes: { "Minimum reward:risk": { from: 1.5, to: 2 } } },
  }),
  demoActivity(10, 52, {
    ...demoAdmin,
    action: "admin.access_code_generated",
    targetType: "user",
    targetId: "4",
    targetLabel: "sam.k@example.com",
    details: { code_expires: days(7).slice(0, 10) },
  }),
  demoActivity(9, 75, {
    ...demoAdmin,
    action: "admin.user_approved",
    targetType: "user",
    targetId: "2",
    targetLabel: "trader@example.com",
    details: { trial_days: 7 },
  }),
  demoActivity(8, 90, { ...demoTrader, action: "auth.email_confirmed" }),
  demoActivity(7, 96, { ...demoTrader, action: "auth.signed_up", details: { name: "Demo Trader" } }),
  demoActivity(6, 180, {
    action: "lead.access_requested",
    actorEmail: "jane.doe@example.com",
    targetType: "lead",
    targetLabel: "jane.doe@example.com",
    ip: "192.0.2.44",
  }),
  demoActivity(5, 320, {
    ...demoAdmin,
    action: "admin.access_policy_changed",
    targetType: "setting",
    targetLabel: "Access policy",
    details: { changes: { "Trial length (days)": { from: 5, to: 7 } } },
  }),
  demoActivity(4, 700, { ...demoAdmin, action: "admin.guda_special_toggled", targetType: "setting", targetLabel: "GUDA SPECIAL", details: { visible_to_users: true } }),
  demoActivity(3, 1300, { ...demoTrader, action: "account.name_changed", details: { changes: { Name: { from: "Trader", to: "Demo Trader" } } } }),
  demoActivity(2, 60 * 30, { ...demoAdmin, action: "admin.appearance_changed", targetType: "setting", targetLabel: "Site appearance", details: { changes: { Theme: { from: "default", to: "ocean" } } } }),
  demoActivity(1, 60 * 24 * 12, { ...demoAdmin, action: "auth.signed_in" }),
];

// Sample tracked trades and backtests for /admin/performance in demo mode —
// invented, mixed results, so the tables have something honest-looking to
// lay out rather than a wall of wins.
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();
const demoTrade = (
  id: number,
  row: Partial<TradeOutcomeView> & Pick<TradeOutcomeView, "timeframe" | "status" | "rNet">
): TradeOutcomeView => {
  const closed = row.status !== "OPEN";
  const trade: TradeOutcomeView = {
    id: `demo-trade-${id}`,
    source: "confluence",
    symbol: "BTCUSDT",
    // Matches the demo signals' version, so their live-record lines count these.
    strategyVersion: "demo",
    signalTime: hoursAgo(id * 7 + 10),
    direction: id % 3 === 0 ? -1 : 1,
    entry: 68_000,
    stop: 67_600,
    target: 68_600,
    bars: closed ? 6 : 2,
    exitPrice: closed ? 68_300 : null,
    exitTime: closed ? hoursAgo(id * 7) : null,
    rGross: null,
    rCost: 0.4,
    ...row,
  };
  // Exit price and gross R follow from the net result, so each row adds up.
  const rGross = trade.rNet === null ? null : trade.rNet + trade.rCost;
  const risk = Math.abs(trade.entry - trade.stop);
  return {
    ...trade,
    rGross,
    exitPrice: rGross === null ? null : Math.round(trade.entry + trade.direction * rGross * risk),
  };
};

export const DEMO_TRADE_OUTCOMES: TradeOutcomeView[] = [
  demoTrade(1, { timeframe: "1h", status: "OPEN", rNet: null }),
  demoTrade(2, { timeframe: "1h", status: "TARGET", rNet: 1.1 }),
  demoTrade(3, { timeframe: "1h", status: "STOP", rNet: -1.4 }),
  demoTrade(4, { timeframe: "1h", status: "TARGET", rNet: 1.1 }),
  demoTrade(5, { timeframe: "1h", status: "TIMEOUT", rNet: 0.2 }),
  demoTrade(6, { timeframe: "15m", status: "STOP", rNet: -2.1, rCost: 1.1 }),
  demoTrade(7, { timeframe: "15m", status: "TARGET", rNet: 0.4, rCost: 1.1 }),
  demoTrade(8, { timeframe: "15m", status: "STOP", rNet: -2.1, rCost: 1.1 }),
  demoTrade(9, { timeframe: "4h", status: "TARGET", rNet: 1.3, rCost: 0.2 }),
  demoTrade(10, { timeframe: "4h", status: "STOP", rNet: -1.2, rCost: 0.2 }),
  demoTrade(11, { source: "guda_special", strategyVersion: GUDA_SPECIAL_STRATEGY_VERSION, timeframe: "15m", status: "TARGET", rNet: 1.5, rCost: 0.3 }),
  demoTrade(12, { source: "guda_special", strategyVersion: GUDA_SPECIAL_STRATEGY_VERSION, timeframe: "15m", status: "STOP", rNet: -1.3, rCost: 0.3 }),
  demoTrade(13, { symbol: "XAUUSD", timeframe: "1h", status: "TARGET", rNet: 1.4, rCost: 0.05, entry: 3_700, stop: 3_690, target: 3_715 }),
  // A longer 4h record, so the dashboard's "Last N trades" line has enough
  // trades to show numbers rather than "too few to judge".
  ...[2.9, -1.0, -1.0, 2.9, -1.0, 0.4, -1.0, 2.9, -1.0, -1.0, 2.9, -1.0].map((r, i) =>
    demoTrade(20 + i, { timeframe: "4h", status: r > 2 ? "TARGET" : r > 0 ? "TIMEOUT" : "STOP", rNet: r, rCost: 0.02 })
  ),
];

const demoBacktest = (
  id: number,
  row: Partial<BacktestRunView> & Pick<BacktestRunView, "timeframe" | "trades" | "winRate" | "avgRNet" | "avgCostR">
): BacktestRunView => ({
  id: `demo-backtest-${id}`,
  createdAt: hoursAgo(3),
  strategy: "confluence",
  strategyVersion: "demo",
  symbol: "BTCUSDT",
  periodStart: hoursAgo(24 * 365),
  periodEnd: hoursAgo(4),
  signals: row.trades + 12,
  skipped: 12,
  costPct: 0.24,
  avgRGross: (row.avgRNet ?? 0) + (row.avgCostR ?? 0),
  totalRNet: (row.avgRNet ?? 0) * row.trades,
  profitFactor: row.avgRNet !== null && row.avgRNet > 0 ? 1.2 : 0.8,
  maxDrawdownR: 12,
  worstLosingStreak: 7,
  targetRate: row.winRate === null ? null : row.winRate * 0.8,
  calibration: null,
  ...row,
});

export const DEMO_BACKTEST_RUNS: BacktestRunView[] = [
  demoBacktest(1, { timeframe: "5m", trades: 410, winRate: 0.31, avgRNet: -0.62, avgCostR: 1.3, periodStart: hoursAgo(24 * 60) }),
  demoBacktest(2, { timeframe: "15m", trades: 380, winRate: 0.36, avgRNet: -0.28, avgCostR: 0.8, periodStart: hoursAgo(24 * 180) }),
  demoBacktest(3, {
    timeframe: "1h",
    trades: 290,
    winRate: 0.41,
    avgRNet: 0.04,
    avgCostR: 0.4,
    // Bitcoin 1h from the Stage 3 backtest: no pattern by score.
    calibration: [
      { low: 65, high: 69, trades: 36, targetRate: 0.14, winRate: 0.17, avgRNet: -0.38 },
      { low: 70, high: 74, trades: 113, targetRate: 0.24, winRate: 0.31, avgRNet: 0.07 },
      { low: 75, high: 79, trades: 92, targetRate: 0.29, winRate: 0.36, avgRNet: 0.28 },
      { low: 80, high: 100, trades: 146, targetRate: 0.23, winRate: 0.28, avgRNet: -0.02 },
    ],
  }),
  demoBacktest(4, { timeframe: "4h", trades: 140, winRate: 0.44, avgRNet: 0.12, avgCostR: 0.2 }),
  demoBacktest(5, { strategy: "guda_special", timeframe: "15m", trades: 60, winRate: 0.4, avgRNet: 0.05, avgCostR: 0.3 }),
  demoBacktest(6, { timeframe: "1d", trades: 40, winRate: 0.53, avgRNet: 0.96, avgCostR: 0.01, periodStart: hoursAgo(24 * 365 * 6) }),
];
