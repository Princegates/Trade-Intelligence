"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { notifyAdminsOfNewLead } from "@/lib/notifications";
import type { LeadKind } from "@/lib/supabase/types";

export interface LeadFormState {
  error?: string;
  success?: boolean;
}

const leadSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  name: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

/** Shared by joinWaitlist and requestAccess below — same table, same
 * validation, just a different `kind`. Runs as whatever the visitor
 * actually is (anon, most of the time): the leads table's RLS policy
 * (migration 0026) allows an anonymous insert on purpose, so this uses the
 * ordinary per-request client, not the service-role one. */
async function submitLead(kind: LeadKind, formData: FormData): Promise<LeadFormState> {
  if (!isSupabaseConfigured()) {
    return { error: "Demo mode: Supabase isn't configured yet, so this can't be submitted here." };
  }

  const parsed = leadSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const name = parsed.data.name || null;
  const note = parsed.data.note || null;

  const { error } = await supabase.from("leads").insert({ kind, email: parsed.data.email, name, note });
  if (error) return { error: error.message };

  // Best-effort — the lead is already saved above regardless of whether an
  // admin gets emailed about it.
  await notifyAdminsOfNewLead(kind, parsed.data.email, name, note);

  return { success: true };
}

export async function joinWaitlist(_prevState: LeadFormState, formData: FormData): Promise<LeadFormState> {
  return submitLead("waitlist", formData);
}

export async function requestAccess(_prevState: LeadFormState, formData: FormData): Promise<LeadFormState> {
  return submitLead("access_request", formData);
}

export async function setLeadHandled(leadId: string, handled: boolean) {
  await requireAdmin();

  if (!isSupabaseConfigured()) return { error: "Demo mode: changes aren't persisted." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { error } = await supabase.from("leads").update({ handled }).eq("id", leadId);
  if (error) return { error: error.message };

  revalidatePath("/admin/leads");
  return { success: true };
}
