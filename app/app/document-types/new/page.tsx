import Link from "next/link";
import { createDocumentType } from "@/lib/actions/document-types";
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

export default async function NewDocumentTypePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-lg p-8">
      <Link href="/app/document-types" className="text-sm text-muted-foreground hover:underline">
        ← Volver
      </Link>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Nuevo tipo de documento</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createDocumentType} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input id="name" name="name" placeholder="Ej. Cámara de Comercio" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Input id="description" name="description" placeholder="Opcional — qué debe incluir este documento" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="requires_expiry" />
              Tiene fecha de vencimiento
            </label>
            <ValidityFields />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full">
              Crear tipo de documento
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
