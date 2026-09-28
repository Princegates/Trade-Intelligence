"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { actorOf, logActivity } from "@/lib/activity-log";
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

  // A visitor, usually not signed in — the email they gave is the only
  // identity there is.
  logActivity({
    action: kind === "waitlist" ? "lead.waitlist_joined" : "lead.access_requested",
    actor: { id: null, email: parsed.data.email },
    target: { type: "lead", label: parsed.data.email },
    details: name ? { name } : {},
  });

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
  const admin = await requireAdmin();

  if (!isSupabaseConfigured()) return { error: "Demo mode: changes aren't persisted." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { data: lead, error } = await supabase
    .from("leads")
    .update({ handled })
    .eq("id", leadId)
    .select("email")
    .maybeSingle();
  if (error) return { error: error.message };

  logActivity({
    action: handled ? "admin.lead_marked_handled" : "admin.lead_reopened",
    actor: actorOf(admin),
    target: { type: "lead", id: leadId, label: lead?.email ?? null },
  });

  revalidatePath("/admin/leads");
  return { success: true };
}
