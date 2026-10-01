// Hand-written to match supabase/migrations/0001_init.sql. If the schema
// changes, either update this by hand or generate it with the Supabase CLI:
//   supabase gen types typescript --linked > src/lib/supabase/types.ts

export type Role = "user" | "admin";
export type SettingsCategory = "email" | "sms" | "payments" | "push" | "ai" | "news";
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

// Mirrors src/signals/lifecycle.py's ORDER + TERMINAL. Only a directional
// call with real structural entry-zone/invalidation data ever gets a row
// (lifecycle.py::tracks()) — HOLD and ATR-fallback calls never do.
export type LifecycleState = "WAIT" | "WATCH" | "READY" | "CONFIRMED" | "INVALIDATED" | "EXPIRED";
export type LeadKind = "waitlist" | "access_request";
export type ActivityOutcome = "success" | "failure";
export type TradeSource = "confluence" | "guda_special";
export type TradeStatus = "OPEN" | "TARGET" | "STOP" | "TIMEOUT";
/** One entry of backtest_runs.calibration (0030): a confidence-score band
 * and how its trades turned out. */
export interface ConfidenceBandRow {
  low: number;
  high: number;
  trades: number;
  target_rate: number | null;
  win_rate: number | null;
  avg_r_net: number | null;
}

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
          // Core Market Intelligence upgrade (0031): shared context, never
          // read by any gate — see src/signals/{volatility_regime,
          // price_range}.py and engine.py's _fibonacci_and_range_context.
          volatility_regime: string | null;
          confidence_breakdown: Record<string, unknown> | null;
          fib_50: number | null;
          fib_61_8: number | null;
          fib_72: number | null;
          fib_78_6: number | null;
          fib_direction: 1 | -1 | null;
          range_position_pct: number | null;
          range_zone: string | null;
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
          volatility_regime?: string | null;
          confidence_breakdown?: Record<string, unknown> | null;
          fib_50?: number | null;
          fib_61_8?: number | null;
          fib_72?: number | null;
          fib_78_6?: number | null;
          fib_direction?: 1 | -1 | null;
          range_position_pct?: number | null;
          range_zone?: string | null;
        };
        // Published signals are immutable; 0002 drops the update policy.
        Update: never;
        Relationships: [];
      };
      guda_special_signals: {
        Row: {
          id: number;
          symbol: string;
          timeframe: string;
          setup_id: string;
          bos_candle_time: string;
          generated_at: string;
          strategy_version: string;
          verdict: "BUY" | "SELL" | "NO_TRADE";
          price: number;
          reasoning: string;
          no_trade_reason: string | null;
          bos_kind: "BOS" | "CHoCH";
          bos_direction: 1 | -1;
          bos_price: number;
          break_strength: "STRONG" | "NORMAL" | "WEAK" | null;
          impulse_start_price: number | null;
          impulse_end_price: number | null;
          impulse_atr_multiple: number | null;
          fib_50: number | null;
          fib_61_8: number | null;
          fib_72: number | null;
          fib_78_6: number | null;
          retracement_quality: "SHALLOW" | "VALID" | "DEEP" | "FAILED" | null;
          retest_confirmed: boolean | null;
          confirmation_pattern: string | null;
          candle_quality: "STRONG" | "NORMAL" | "WEAK" | null;
          htf_bias: string | null;
          htf_filter_outcome: "ALIGNED" | "NEUTRAL" | "DOWNGRADED" | "REJECTED" | null;
          entry: number | null;
          stop: number | null;
          target: number | null;
          risk_reward: number | null;
          regime: string | null;
          confidence_score: number | null;
          // Core Market Intelligence upgrade (0031): shared with the
          // confluence engine — see src/signals/volatility_regime.py and
          // src/signals/price_range.py. No new fib_* columns here: GUDA
          // SPECIAL already has its own above, from its own pipeline.
          volatility_regime: string | null;
          range_position_pct: number | null;
          range_zone: string | null;
        };
        Insert: {
          id?: number;
          symbol: string;
          timeframe: string;
          setup_id: string;
          bos_candle_time: string;
          generated_at: string;
          strategy_version?: string;
          verdict: "BUY" | "SELL" | "NO_TRADE";
          price: number;
          reasoning: string;
          no_trade_reason?: string | null;
          bos_kind: "BOS" | "CHoCH";
          bos_direction: 1 | -1;
          bos_price: number;
          break_strength?: "STRONG" | "NORMAL" | "WEAK" | null;
          impulse_start_price?: number | null;
          impulse_end_price?: number | null;
          impulse_atr_multiple?: number | null;
          fib_50?: number | null;
          fib_61_8?: number | null;
          fib_72?: number | null;
          fib_78_6?: number | null;
          retracement_quality?: "SHALLOW" | "VALID" | "DEEP" | "FAILED" | null;
          retest_confirmed?: boolean | null;
          confirmation_pattern?: string | null;
          candle_quality?: "STRONG" | "NORMAL" | "WEAK" | null;
          htf_bias?: string | null;
          htf_filter_outcome?: "ALIGNED" | "NEUTRAL" | "DOWNGRADED" | "REJECTED" | null;
          entry?: number | null;
          stop?: number | null;
          target?: number | null;
          risk_reward?: number | null;
          regime?: string | null;
          confidence_score?: number | null;
          volatility_regime?: string | null;
          range_position_pct?: number | null;
          range_zone?: string | null;
        };
        // Append-only — 0020's trigger rejects update/delete on every role.
        Update: never;
        Relationships: [];
      };
      guda_special_settings: {
        Row: {
          id: boolean;
          swing_lookback: number;
          min_impulse_atr_multiple: number;
          fib_valid_min: number;
          fib_valid_max: number;
          fib_deep_max: number;
          structural_stop_buffer_atr: number;
          max_stop_distance_atr: number;
          min_stop_distance_atr: number;
          reward_to_risk: number;
          min_reward_to_risk: number;
          max_entry_extension_atr: number;
          setup_expiry_candles: number;
          htf_filter_mode: "advisory" | "downgrade" | "strict_veto";
          target_conflict_policy: "ignore" | "downgrade" | "reject";
          enabled: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: boolean;
          swing_lookback?: number;
          min_impulse_atr_multiple?: number;
          fib_valid_min?: number;
          fib_valid_max?: number;
          fib_deep_max?: number;
          structural_stop_buffer_atr?: number;
          max_stop_distance_atr?: number;
          min_stop_distance_atr?: number;
          reward_to_risk?: number;
          min_reward_to_risk?: number;
          max_entry_extension_atr?: number;
          setup_expiry_candles?: number;
          htf_filter_mode?: "advisory" | "downgrade" | "strict_veto";
          target_conflict_policy?: "ignore" | "downgrade" | "reject";
          enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: boolean;
          swing_lookback?: number;
          min_impulse_atr_multiple?: number;
          fib_valid_min?: number;
          fib_valid_max?: number;
          fib_deep_max?: number;
          structural_stop_buffer_atr?: number;
          max_stop_distance_atr?: number;
          min_stop_distance_atr?: number;
          reward_to_risk?: number;
          min_reward_to_risk?: number;
          max_entry_extension_atr?: number;
          setup_expiry_candles?: number;
          htf_filter_mode?: "advisory" | "downgrade" | "strict_veto";
          target_conflict_policy?: "ignore" | "downgrade" | "reject";
          enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
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
          lifecycle_watch_zone_half_widths: number;
          lifecycle_confirm_move_r: number;
          lifecycle_expiry_candles: number;
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
          lifecycle_watch_zone_half_widths?: number;
          lifecycle_confirm_move_r?: number;
          lifecycle_expiry_candles?: number;
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
          lifecycle_watch_zone_half_widths?: number;
          lifecycle_confirm_move_r?: number;
          lifecycle_expiry_candles?: number;
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
      signal_lifecycle: {
        Row: {
          symbol: string;
          timeframe: string;
          candle_time: string;
          strategy_version: string;
          state: LifecycleState;
          entered_at: string;
          updated_at: string;
          last_price: number | null;
          last_checked_candle_time: string | null;
        };
        Insert: {
          symbol: string;
          timeframe: string;
          candle_time: string;
          strategy_version: string;
          state?: LifecycleState;
          entered_at?: string;
          updated_at?: string;
          last_price?: number | null;
          last_checked_candle_time?: string | null;
        };
        // Genuinely mutable, unlike every other table here — the cron
        // job's service_role key re-upserts this row on every re-check
        // (src/run.py::recheck_lifecycles()).
        Update: {
          state?: LifecycleState;
          entered_at?: string;
          updated_at?: string;
          last_price?: number | null;
          last_checked_candle_time?: string | null;
        };
        Relationships: [];
      };
      chat_rate_limit: {
        Row: {
          user_id: string;
          window_start: string;
          message_count: number;
        };
        // Never written directly by app code — only through
        // chat_rate_limit_check() below (SECURITY DEFINER) or the
        // service-role key. See supabase/migrations/0024_chat_rate_limit.sql.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          kind: LeadKind;
          email: string;
          name: string | null;
          note: string | null;
          created_at: string;
          handled: boolean;
        };
        Insert: {
          id?: string;
          kind: LeadKind;
          email: string;
          name?: string | null;
          note?: string | null;
          created_at?: string;
          handled?: boolean;
        };
        // Only `handled` is ever changed after insert (see
        // components/admin/lead-handled-toggle.tsx) — a submitted lead's
        // own details are never edited by app code.
        Update: {
          handled?: boolean;
        };
        Relationships: [];
      };
      // Append-only (0027_activity_log.sql): the trigger rejects every
      // update/delete, so there's no Update shape for app code to use.
      activity_log: {
        Row: {
          id: number;
          created_at: string;
          actor_id: string | null;
          actor_email: string | null;
          actor_role: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          target_label: string | null;
          details: Record<string, unknown>;
          outcome: ActivityOutcome;
          ip: string | null;
          user_agent: string | null;
        };
        Insert: {
          created_at?: string;
          actor_id?: string | null;
          actor_email?: string | null;
          actor_role?: string | null;
          action: string;
          target_type?: string | null;
          target_id?: string | null;
          target_label?: string | null;
          details?: Record<string, unknown>;
          outcome?: ActivityOutcome;
          ip?: string | null;
          user_agent?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      // 0029_live_results_toggle.sql — singleton row; anyone reads, admins update.
      live_results_settings: {
        // show_backtest_odds: 0030.
        Row: { id: boolean; enabled: boolean; show_backtest_odds: boolean; updated_at: string };
        Insert: Record<string, never>;
        Update: { enabled?: boolean; show_backtest_odds?: boolean; updated_at?: string };
        Relationships: [];
      };
      // 0028_trade_outcomes.sql — written only by the engine (service role);
      // admins read them at /admin/performance.
      trade_outcomes: {
        Row: {
          id: string;
          source: TradeSource;
          symbol: string;
          timeframe: string;
          strategy_version: string;
          signal_time: string;
          direction: 1 | -1;
          entry: number;
          stop: number;
          target: number;
          confidence: number | null;
          cost_pct: number;
          status: TradeStatus;
          bars: number;
          last_candle_time: string;
          mfe_r: number;
          mae_r: number;
          exit_price: number | null;
          exit_time: string | null;
          r_gross: number | null;
          r_cost: number;
          r_net: number | null;
          opened_at: string;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      backtest_runs: {
        Row: {
          id: string;
          created_at: string;
          strategy: TradeSource;
          strategy_version: string;
          symbol: string;
          timeframe: string;
          period_start: string;
          period_end: string;
          candles: number;
          signals: number;
          skipped: number;
          cost_pct: number;
          settings: Record<string, unknown>;
          trades: number;
          open_trades: number;
          wins: number;
          win_rate: number | null;
          avg_r_net: number | null;
          avg_r_gross: number | null;
          avg_cost_r: number | null;
          total_r_net: number;
          profit_factor: number | null;
          max_drawdown_r: number;
          worst_losing_streak: number;
          avg_bars: number | null;
          target_rate: number | null;
          stop_rate: number | null;
          timeout_rate: number | null;
          // 0030; null on older runs and GUDA SPECIAL runs.
          calibration: ConfidenceBandRow[] | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      redeem_access_code: {
        Args: { p_code: string };
        Returns: boolean;
      };
      chat_rate_limit_check: {
        Args: { uid: string; max_per_window: number; window_seconds: number };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
