import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMembership } from "@/lib/auth/session";
import { humanizeAuditAction } from "@/lib/labels";
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

const PAGE_SIZE = 200;

export default async function AuditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");

  // RLS (audit_logs_select_admins) ya solo deja ver esto a owner/admin — este
  // chequeo es nada más para mostrar un mensaje claro en vez de una tabla
  // vacía sin explicación a un reviewer.
  if (!["owner", "admin"].includes(membership.role)) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <p className="text-sm text-muted-foreground">Solo owner/admin pueden ver el registro de auditoría.</p>
      </div>
    );
  }

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("id, actor_id, actor_type, action, entity_type, entity_id, created_at")
    .eq("organization_id", membership.organizationId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  // Resolver actor_id -> email es una operación privilegiada (auth.users no
  // se expone vía PostgREST) — se hace acá, ya revalidado que quien pide
  // esto es admin/owner de la organización. Deduplicado: como mucho N
  // llamadas por N actores distintos en la página, no una por fila.
  const admin = createAdminClient();
  const distinctActorIds = [...new Set((logs ?? []).map((l) => l.actor_id).filter((id): id is string => Boolean(id)))];
  const emailByActorId = new Map<string, string>();
  await Promise.all(
    distinctActorIds.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      if (data.user?.email) emailByActorId.set(id, data.user.email);
    })
  );

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Card>
        <CardHeader>
          <CardTitle>Auditoría</CardTitle>
          <CardDescription>
            Quién accedió, subió, revisó o descargó qué y cuándo. Se muestran las {PAGE_SIZE} entradas más recientes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuándo</TableHead>
                <TableHead>Quién</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Entidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logs ?? []).map((log) => {
                const who = log.actor_id
                  ? (emailByActorId.get(log.actor_id) ?? "(usuario eliminado)")
                  : "Sistema (cron)";
                return (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("es-CO")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {who}
                      <span className="ml-1 text-muted-foreground">({log.actor_type})</span>
                    </TableCell>
                    <TableCell className="text-xs">{humanizeAuditAction(log.action)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.entity_type}
                      {log.entity_id ? (
                        <span className="ml-1 font-mono" title={log.entity_id}>
                          ({log.entity_id.slice(0, 8)}…)
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(logs ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Sin actividad registrada todavía.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
