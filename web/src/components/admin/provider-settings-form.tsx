"use client";

import { useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { saveProviderSettings, type SettingsFormState } from "@/lib/actions/settings";
import type { ProviderField } from "@/lib/demo-data";
import type { ProviderState } from "@/lib/settings";
import type { SettingsCategory } from "@/lib/supabase/types";

const initialState: SettingsFormState = {};

export function ProviderSettingsForm({
  category,
  provider,
  label,
  fields,
  state,
}: {
  category: SettingsCategory;
  provider: string;
  label: string;
  fields: ProviderField[];
  state: ProviderState;
}) {
  const boundAction = saveProviderSettings.bind(null, category, provider);
  const [formState, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{label}</CardTitle>
            <CardDescription>{fields.length} field{fields.length === 1 ? "" : "s"}</CardDescription>
          </div>
          {state.isActive && <Badge variant="success">Active</Badge>}
        </div>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Enabled</p>
              <p className="text-xs text-muted-foreground">Use this provider for {category} delivery.</p>
            </div>
            <Switch name="is_active" defaultChecked={state.isActive} />
          </div>

          {fields.map((field) => {
            const saved = field.secret && state.hasSecret[field.key];
            return (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`${category}-${provider}-${field.key}`}>{field.label}</Label>
                <Input
                  id={`${category}-${provider}-${field.key}`}
                  name={field.key}
                  type={field.secret ? "password" : "text"}
                  defaultValue={field.secret ? "" : state.values[field.key] ?? ""}
                  placeholder={saved ? "Saved — leave blank to keep" : field.placeholder}
                  autoComplete="off"
                />
              </div>
            );
          })}

          {formState.error && <p className="text-sm text-destructive">{formState.error}</p>}
          {formState.success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
