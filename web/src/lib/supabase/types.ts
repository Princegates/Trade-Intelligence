// Hand-written to match supabase/migrations/0001_init.sql. If the schema
// changes, either update this by hand or generate it with the Supabase CLI:
//   supabase gen types typescript --linked > src/lib/supabase/types.ts

export type Role = "user" | "admin";
export type SettingsCategory = "email" | "sms" | "payments" | "push" | "ai";
export type Verdict = "BUY" | "SELL" | "HOLD";

// Why the engine declined to publish. Mirrors the reason codes in
// ../../../../src/run.py; the column is deliberately unconstrained in SQL so
// the engine can add one without a migration.
export type SuppressionReason =
  | "FETCH_FAILED"
  | "NO_DATA"
  | "BAD_CANDLE"
  | "INSUFFICIENT_HISTORY"
  | "STALE_DATA";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: Role;
          approved: boolean;
          full_access_until: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: Role;
          approved?: boolean;
          full_access_until?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: Role;
          approved?: boolean;
          full_access_until?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          id: string;
          category: SettingsCategory;
          provider: string;
          is_active: boolean;
          config: Record<string, unknown>;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          category: SettingsCategory;
          provider: string;
          is_active?: boolean;
          config?: Record<string, unknown>;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          category?: SettingsCategory;
          provider?: string;
          is_active?: boolean;
          config?: Record<string, unknown>;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      signals: {
        Row: {
          id: number;
          symbol: string;
          timeframe: string;
          generated_at: string;
          candle_time: string;
          price: number;
          verdict: Verdict;
          score: number;
          confidence: number | null;
          evidence_count: number;
          strategy_version: string;
          reasoning: string;
          patterns: string;
          entry: number | null;
          stop: number | null;
          target: number | null;
          buy_above: number | null;
          sell_below: number | null;
          confluence_bias: string | null;
          regime: string | null;
          market_phase: string | null;
          invalidation_level: number | null;
          entry_zone_low: number | null;
          entry_zone_high: number | null;
        };
        Insert: {
          id?: number;
          symbol: string;
          timeframe: string;
          generated_at: string;
          candle_time: string;
          price: number;
          verdict: Verdict;
          score: number;
          confidence?: number | null;
          evidence_count?: number;
          strategy_version?: string;
          reasoning: string;
          patterns?: string;
          entry?: number | null;
          stop?: number | null;
          target?: number | null;
          buy_above?: number | null;
          sell_below?: number | null;
          confluence_bias?: string | null;
          regime?: string | null;
          market_phase?: string | null;
          invalidation_level?: number | null;
          entry_zone_low?: number | null;
          entry_zone_high?: number | null;
        };
        // Published signals are immutable; 0002 drops the update policy.
        Update: never;
        Relationships: [];
      };
      engine_settings: {
        Row: {
          id: boolean;
          atr_stop_multiplier: number;
          reward_to_risk: number;
          min_reward_to_risk: number;
          min_confidence_threshold: number;
          confidence_high_threshold: number;
          confidence_very_high_threshold: number;
          require_higher_timeframe_confluence: boolean;
          structure_buffer_atr: number;
          entry_zone_width_atr: number;
          max_entry_zone_distance_atr: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: boolean;
          atr_stop_multiplier?: number;
          reward_to_risk?: number;
          min_reward_to_risk?: number;
          min_confidence_threshold?: number;
          confidence_high_threshold?: number;
          confidence_very_high_threshold?: number;
          require_higher_timeframe_confluence?: boolean;
          structure_buffer_atr?: number;
          entry_zone_width_atr?: number;
          max_entry_zone_distance_atr?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: boolean;
          atr_stop_multiplier?: number;
          reward_to_risk?: number;
          min_reward_to_risk?: number;
          min_confidence_threshold?: number;
          confidence_high_threshold?: number;
          confidence_very_high_threshold?: number;
          require_higher_timeframe_confluence?: boolean;
          structure_buffer_atr?: number;
          entry_zone_width_atr?: number;
          max_entry_zone_distance_atr?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      candles: {
        Row: {
          symbol: string;
          timeframe: string;
          open_time: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        };
        Insert: {
          symbol: string;
          timeframe: string;
          open_time: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        };
        Update: never;
        Relationships: [];
      };
      signal_suppressions: {
        Row: {
          id: number;
          symbol: string;
          timeframe: string;
          observed_at: string;
          reason: SuppressionReason;
          detail: string;
        };
        Insert: {
          id?: number;
          symbol: string;
          timeframe: string;
          observed_at: string;
          reason: SuppressionReason;
          detail?: string;
        };
        Update: never;
        Relationships: [];
      };
      economic_events: {
        Row: {
          title: string;
          country: string;
          event_time: string;
          impact: string;
          forecast: string | null;
          previous: string | null;
          actual: string | null;
          fetched_at: string;
        };
        Insert: {
          title: string;
          country: string;
          event_time: string;
          impact: string;
          forecast?: string | null;
          previous?: string | null;
          actual?: string | null;
          fetched_at?: string;
        };
        // Upserted by the cron job's service key on every fetch — a
        // forecast or actual can legitimately change, unlike a signal.
        Update: never;
        Relationships: [];
      };
      site_appearance: {
        Row: {
          id: boolean;
          theme: string;
          mode: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: boolean;
          theme?: string;
          mode?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: boolean;
          theme?: string;
          mode?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      access_policy: {
        Row: {
          id: boolean;
          trial_days: number;
          code_expiry_days: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: boolean;
          trial_days?: number;
          code_expiry_days?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: boolean;
          trial_days?: number;
          code_expiry_days?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      access_codes: {
        Row: {
          id: string;
          user_id: string;
          code: string;
          created_by: string;
          created_at: string;
          redeemed_at: string | null;
          expires_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          code: string;
          created_by: string;
          created_at?: string;
          redeemed_at?: string | null;
          expires_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          code?: string;
          created_by?: string;
          created_at?: string;
          redeemed_at?: string | null;
          expires_at?: string | null;
        };
        Relationships: [];
      };
      signal_commentary: {
        Row: {
          symbol: string;
          timeframe: string;
          candle_time: string;
          strategy_version: string;
          commentary: string;
          model: string;
          generated_at: string;
        };
        Insert: {
          symbol: string;
          timeframe: string;
          candle_time: string;
          strategy_version: string;
          commentary: string;
          model: string;
          generated_at?: string;
        };
        // Written once by the cron job's service_role key; nothing in the
        // web app ever updates a row here.
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      redeem_access_code: {
        Args: { p_code: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
