import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { updateDocumentType } from "@/lib/actions/document-types";
import { ValidityFields } from "@/components/document-types/validity-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function EditDocumentTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");

  const { data: docType } = await supabase
    .from("document_types")
    .select("id, name, description, requires_expiry, default_validity_days, default_validity_month, default_validity_day")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (!docType) notFound();

  return (
    <div className="mx-auto max-w-lg p-8">
      <Link href="/app/document-types" className="text-sm text-muted-foreground hover:underline">
        ← Volver
      </Link>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{docType.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateDocumentType} className="space-y-4">
            <input type="hidden" name="id" value={docType.id} />
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" defaultValue={docType.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Input id="description" name="description" defaultValue={docType.description ?? ""} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="requires_expiry" defaultChecked={docType.requires_expiry} />
              Tiene fecha de vencimiento
            </label>
            <ValidityFields
              defaultDays={docType.default_validity_days}
              defaultMonth={docType.default_validity_month}
              defaultDay={docType.default_validity_day}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full">
              Guardar cambios
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
