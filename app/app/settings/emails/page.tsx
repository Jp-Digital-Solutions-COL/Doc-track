import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { getOrgEmailTemplate } from "@/lib/email/get-template-row";
import { EMAIL_TYPES, EMAIL_TYPE_LABEL } from "@/lib/email/blocks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function EmailTemplatesPage() {
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
        <p className="text-sm text-muted-foreground">Solo owner/admin pueden editar los correos de la organización.</p>
      </div>
    );
  }

  const statuses = await Promise.all(
    EMAIL_TYPES.map(async (type) => ({
      type,
      customized: (await getOrgEmailTemplate(supabase, membership.organizationId, type)) !== null,
    }))
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Correos</h1>

      <Card>
        <CardHeader>
          <CardTitle>Plantillas de correo</CardTitle>
          <CardDescription>Personaliza el texto, las imágenes y los botones de cada correo transaccional.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {statuses.map(({ type, customized }) => (
            <Link
              key={type}
              href={`/app/settings/emails/${type}`}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted"
            >
              <span>{EMAIL_TYPE_LABEL[type]}</span>
              <Badge variant={customized ? "default" : "outline"}>{customized ? "Personalizado" : "Predeterminado"}</Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
