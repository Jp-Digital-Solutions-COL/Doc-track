import { redirect } from "next/navigation";
import { Gavel } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { updateDataSubjectRequestStatus } from "@/lib/actions/data-subject-requests";
import { EmptyState } from "@/components/empty-state";
import {
  DATA_SUBJECT_REQUEST_STATUS_LABEL,
  humanizeDataSubjectRequestType,
  humanizeDataSubjectRequestStatus,
  dataSubjectRequestStatusVariant,
} from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUSES = Object.keys(DATA_SUBJECT_REQUEST_STATUS_LABEL);

function daysUntil(dueDate: string) {
  const diffMs = new Date(`${dueDate}T00:00:00Z`).getTime() - new Date().setUTCHours(0, 0, 0, 0);
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export default async function DataRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");

  if (!["owner", "admin"].includes(membership.role)) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <p className="text-sm text-muted-foreground">Solo owner/admin pueden ver la bandeja de solicitudes de titulares.</p>
      </div>
    );
  }

  const { data: requests } = await supabase
    .from("data_subject_requests")
    .select(
      "id, requester_name, requester_email, request_type, details, status, resolution_notes, due_date, resolved_at, created_at"
    )
    .eq("organization_id", membership.organizationId)
    .order("due_date", { ascending: true });

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Card>
        <CardHeader>
          <CardTitle>Solicitudes de derechos del titular</CardTitle>
          <CardDescription>
            Consulta, rectificación y supresión (Ley 1581). Plazo legal: 10 días para consulta, 15 días para
            reclamos (rectificación/supresión).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
          {saved ? <p className="mb-4 text-sm text-muted-foreground">Guardado.</p> : null}
          {(requests ?? []).length === 0 ? (
            <EmptyState
              icon={Gavel}
              title="Sin solicitudes registradas"
              description="Acá van a aparecer las solicitudes de consulta, rectificación o supresión que envíen los titulares desde el formulario público."
            />
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titular</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Plazo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Gestionar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(requests ?? []).map((r) => {
                const remaining = daysUntil(r.due_date);
                const isOpen = r.status === "pendiente" || r.status === "en_proceso";
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">
                      <div>{r.requester_name}</div>
                      <div className="text-muted-foreground">{r.requester_email}</div>
                      {r.details ? <div className="mt-1 text-muted-foreground">{r.details}</div> : null}
                    </TableCell>
                    <TableCell className="text-xs">{humanizeDataSubjectRequestType(r.request_type)}</TableCell>
                    <TableCell className="text-xs">
                      <div>{new Date(`${r.due_date}T00:00:00Z`).toLocaleDateString("es-CO")}</div>
                      {isOpen ? (
                        <Badge variant={remaining < 0 ? "destructive" : remaining <= 2 ? "warning" : "outline"}>
                          {remaining < 0 ? `Vencida hace ${Math.abs(remaining)}d` : `Faltan ${remaining}d`}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={dataSubjectRequestStatusVariant(r.status)}>{humanizeDataSubjectRequestStatus(r.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      <form action={updateDataSubjectRequestStatus} className="space-y-1">
                        <input type="hidden" name="requestId" value={r.id} />
                        <select
                          name="status"
                          defaultValue={r.status}
                          className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {DATA_SUBJECT_REQUEST_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                        <Input
                          name="resolutionNotes"
                          defaultValue={r.resolution_notes ?? ""}
                          placeholder="Nota de resolución"
                          className="text-xs"
                        />
                        <Button type="submit" size="sm" variant="outline" className="w-full">
                          Guardar
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
