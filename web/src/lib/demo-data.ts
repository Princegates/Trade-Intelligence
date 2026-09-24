// Fallback data used whenever Supabase isn't configured (see
// src/lib/supabase/env.ts#isSupabaseConfigured), so the UI — dashboard,
// admin panel, settings — is fully browsable before a real project is wired
// up. None of this is persisted; edits in demo mode are visual-only.

import type { SessionUser } from "@/lib/auth";
import type { SettingsCategory } from "@/lib/supabase/types";
import type { CalendarEvent } from "@/lib/calendar-view";

export const DEMO_USER: SessionUser = {
  id: "demo-user",
  email: "trader@example.com",
  fullName: "Demo Trader",
  role: "user",
  approved: true,
  // Mid-trial in the demo, same as a freshly-approved real account would be.
  fullAccessUntil: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
};

export const DEMO_ADMIN: SessionUser = {
  id: "demo-admin",
  email: "admin@example.com",
  fullName: "Demo Admin",
  role: "admin",
  approved: true,
  fullAccessUntil: null,
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

type DemoSignalSeed = Omit<DemoSignal, "patterns" | "levels"> & { patterns?: string[] };

const DEMO_SIGNAL_SEEDS: DemoSignalSeed[] = [
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
}));

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
    { provider: "anthropic", label: "Anthropic (Claude)", fields: [{ key: "api_key", label: "API Key", secret: true }, { key: "model", label: "Model", placeholder: "claude-sonnet-5" }] },
    { provider: "openai", label: "OpenAI", fields: [{ key: "api_key", label: "API Key", secret: true }, { key: "model", label: "Model", placeholder: "gpt-5" }] },
  ],
};

export interface DemoSetting {
  category: SettingsCategory;
  provider: string;
  isActive: boolean;
  config: Record<string, string>;
}

export const DEMO_SETTINGS: DemoSetting[] = [
  { category: "email", provider: "resend", isActive: true, config: { from_address: "alerts@tradeintel.app" } },
  { category: "sms", provider: "hubtel", isActive: false, config: {} },
  { category: "payments", provider: "paystack", isActive: false, config: {} },
];
