import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeadHandledToggle } from "@/components/admin/lead-handled-toggle";
import { listLeads } from "@/lib/leads";

function kindLabel(kind: string) {
  return kind === "access_request" ? "Access request" : "Waitlist";
}

export default async function AdminLeadsPage() {
  const leads = await listLeads();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leads</CardTitle>
        <CardDescription>
          Submissions from the pricing page&apos;s access-request form and the homepage&apos;s waitlist form.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {leads.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No leads yet.</p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kind</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <Badge variant="outline">{kindLabel(lead.kind)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{lead.name || "—"}</div>
                        <div className="text-muted-foreground">{lead.email}</div>
                      </TableCell>
                      <TableCell className="max-w-xs text-muted-foreground">{lead.note || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <LeadHandledToggle leadId={lead.id} handled={lead.handled} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {leads.map((lead) => (
                <div key={lead.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Badge variant="outline">{kindLabel(lead.kind)}</Badge>
                    <LeadHandledToggle leadId={lead.id} handled={lead.handled} />
                  </div>
                  <div>
                    <div className="font-medium">{lead.name || "—"}</div>
                    <div className="text-sm text-muted-foreground">{lead.email}</div>
                  </div>
                  {lead.note && <p className="text-sm text-muted-foreground">{lead.note}</p>}
                  <div className="text-xs text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
