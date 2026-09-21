// Hand-written to match supabase/migrations/0001_init.sql. If the schema
// changes, either update this by hand or generate it with the Supabase CLI:
//   supabase gen types typescript --linked > src/lib/supabase/types.ts

export type Role = "user" | "admin";
export type SettingsCategory = "email" | "sms" | "payments" | "push" | "ai";
export type Verdict = "BUY" | "SELL" | "HOLD";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: Role;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: Role;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: Role;
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
          reasoning: string;
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
          reasoning: string;
        };
        Update: Partial<Database["public"]["Tables"]["signals"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
