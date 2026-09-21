// Fallback data used whenever Supabase isn't configured (see
// src/lib/supabase/env.ts#isSupabaseConfigured), so the UI — dashboard,
// admin panel, settings — is fully browsable before a real project is wired
// up. None of this is persisted; edits in demo mode are visual-only.

import type { SessionUser } from "@/lib/auth";
import type { SettingsCategory } from "@/lib/supabase/types";

export const DEMO_USER: SessionUser = {
  id: "demo-user",
  email: "trader@example.com",
  fullName: "Demo Trader",
  role: "user",
};

export const DEMO_ADMIN: SessionUser = {
  id: "demo-admin",
  email: "admin@example.com",
  fullName: "Demo Admin",
  role: "admin",
};

export interface DemoSignal {
  symbol: string;
  timeframe: string;
  generatedAt: string;
  price: number;
  verdict: "BUY" | "SELL" | "HOLD";
  score: number;
  reasoning: string[];
}

const now = () => new Date().toISOString();

export const DEMO_SIGNALS: DemoSignal[] = [
  {
    symbol: "BTCUSDT",
    timeframe: "1h",
    generatedAt: now(),
    price: 68420.5,
    verdict: "BUY",
    score: 2,
    reasoning: [
      "RSI(14) at 42.3 — neutral (30-70)",
      "MACD 184.20 above signal line (150.40) — bullish",
      "SMA20 (68110.00) above SMA50 (67420.00) — uptrend",
    ],
  },
  {
    symbol: "BTCUSDT",
    timeframe: "4h",
    generatedAt: now(),
    price: 68390.0,
    verdict: "HOLD",
    score: 0,
    reasoning: [
      "RSI(14) at 55.1 — neutral (30-70)",
      "MACD flat against its signal line — no clear direction",
      "SMA20 (68300.00) above SMA50 (68250.00) — uptrend",
    ],
  },
  {
    symbol: "BTCUSDT",
    timeframe: "1d",
    generatedAt: now(),
    price: 68010.25,
    verdict: "SELL",
    score: -2,
    reasoning: [
      "RSI(14) at 74.8 — overbought (>70), bearish",
      "MACD 320.10 below signal line (410.55) — bearish",
      "SMA20 (67200.00) below SMA50 (67650.00) — downtrend",
    ],
  },
  {
    symbol: "XAUUSD",
    timeframe: "1h",
    generatedAt: now(),
    price: 2378.4,
    verdict: "HOLD",
    score: 1,
    reasoning: [
      "RSI(14) at 58.0 — neutral (30-70)",
      "MACD 1.70 above signal line (1.25) — bullish",
      "SMA20 (2371.00) below SMA50 (2374.50) — downtrend",
    ],
  },
  {
    symbol: "XAUUSD",
    timeframe: "4h",
    generatedAt: now(),
    price: 2381.1,
    verdict: "BUY",
    score: 2,
    reasoning: [
      "RSI(14) at 38.4 — neutral (30-70)",
      "MACD 2.40 above signal line (1.10) — bullish",
      "SMA20 (2379.00) above SMA50 (2365.00) — uptrend",
    ],
  },
  {
    symbol: "XAUUSD",
    timeframe: "1d",
    generatedAt: now(),
    price: 2365.8,
    verdict: "HOLD",
    score: 0,
    reasoning: [
      "RSI(14) at 49.6 — neutral (30-70)",
      "MACD -0.46 below signal line (-0.19) — bearish",
      "SMA20 (2368.00) above SMA50 (2360.00) — uptrend",
    ],
  },
];

export interface DemoUser {
  id: string;
  email: string;
  fullName: string | null;
  role: "user" | "admin";
  createdAt: string;
}

export const DEMO_USERS: DemoUser[] = [
  { id: "1", email: "admin@example.com", fullName: "Demo Admin", role: "admin", createdAt: "2026-01-04T00:00:00Z" },
  { id: "2", email: "trader@example.com", fullName: "Demo Trader", role: "user", createdAt: "2026-02-11T00:00:00Z" },
  { id: "3", email: "jane.doe@example.com", fullName: "Jane Doe", role: "user", createdAt: "2026-03-22T00:00:00Z" },
  { id: "4", email: "sam.k@example.com", fullName: "Sam K.", role: "user", createdAt: "2026-04-02T00:00:00Z" },
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
