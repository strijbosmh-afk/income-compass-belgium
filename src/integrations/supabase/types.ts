export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      income_goals: {
        Row: {
          amount: number
          created_at: string
          id: string
          income_type: string
          metric: string
          note: string | null
          period_end: number | null
          period_start: number | null
          period_type: string
          period_value: number | null
          sort_order: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          income_type?: string
          metric?: string
          note?: string | null
          period_end?: number | null
          period_start?: number | null
          period_type: string
          period_value?: number | null
          sort_order?: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          income_type?: string
          metric?: string
          note?: string | null
          period_end?: number | null
          period_start?: number | null
          period_type?: string
          period_value?: number | null
          sort_order?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      income_records: {
        Row: {
          aandeel_arts: number
          bouwfonds: number
          created_at: string
          description: string | null
          id: string
          income_type: string
          mif: number
          month: number
          netto: number
          nomenclature_code: string
          quantity: number
          record_date: string
          source_image_url: string | null
          total_amount: number
          unit_amount: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          aandeel_arts?: number
          bouwfonds?: number
          created_at?: string
          description?: string | null
          id?: string
          income_type: string
          mif?: number
          month: number
          netto?: number
          nomenclature_code: string
          quantity?: number
          record_date: string
          source_image_url?: string | null
          total_amount?: number
          unit_amount?: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          aandeel_arts?: number
          bouwfonds?: number
          created_at?: string
          description?: string | null
          id?: string
          income_type?: string
          mif?: number
          month?: number
          netto?: number
          nomenclature_code?: string
          quantity?: number
          record_date?: string
          source_image_url?: string | null
          total_amount?: number
          unit_amount?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      month_closures: {
        Row: {
          closed_at: string
          created_at: string
          id: string
          month: number
          note: string | null
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          closed_at?: string
          created_at?: string
          id?: string
          month: number
          note?: string | null
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          closed_at?: string
          created_at?: string
          id?: string
          month?: number
          note?: string | null
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      nomenclature_codes: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string
          id: string
          netto_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          description?: string
          id?: string
          netto_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string
          id?: string
          netto_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pension_ipt_records: {
        Row: {
          created_at: string
          gewaarborgd_rendement: number
          id: string
          jaarpremie: number
          note: string | null
          opgebouwde_reserve: number
          overlijdenskapitaal: number
          snapshot_date: string
          source_pdf_url: string | null
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          gewaarborgd_rendement?: number
          id?: string
          jaarpremie?: number
          note?: string | null
          opgebouwde_reserve?: number
          overlijdenskapitaal?: number
          snapshot_date: string
          source_pdf_url?: string | null
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          gewaarborgd_rendement?: number
          id?: string
          jaarpremie?: number
          note?: string | null
          opgebouwde_reserve?: number
          overlijdenskapitaal?: number
          snapshot_date?: string
          source_pdf_url?: string | null
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      pension_records: {
        Row: {
          created_at: string
          id: string
          note: string | null
          overlijdensdekking: number
          pensioenreserve: number
          pensioenreserve_vapz: number
          snapshot_date: string
          source_pdf_url: string | null
          updated_at: string
          user_id: string
          vap_riziv_toelage: number
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          overlijdensdekking?: number
          pensioenreserve?: number
          pensioenreserve_vapz?: number
          snapshot_date: string
          source_pdf_url?: string | null
          updated_at?: string
          user_id: string
          vap_riziv_toelage?: number
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          overlijdensdekking?: number
          pensioenreserve?: number
          pensioenreserve_vapz?: number
          snapshot_date?: string
          source_pdf_url?: string | null
          updated_at?: string
          user_id?: string
          vap_riziv_toelage?: number
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
