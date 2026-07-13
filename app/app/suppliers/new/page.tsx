import Link from "next/link";
import { createSupplier } from "@/lib/actions/suppliers";
import { SUPPLIER_CATEGORIES } from "@/lib/suppliers/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function NewSupplierPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-lg p-8">
      <Link href="/app/suppliers" className="text-sm text-muted-foreground hover:underline">
        ← Proveedores
      </Link>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Nuevo proveedor</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createSupplier} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="legal_name">
                Razón social <span className="text-destructive">*</span>
              </Label>
              <Input id="legal_name" name="legal_name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nit">
                NIT <span className="text-destructive">*</span>
              </Label>
              <Input id="nit" name="nit" placeholder="900123456-7" required />
              <p className="text-xs text-muted-foreground">Sin puntos, con el dígito de verificación al final.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Categoría</Label>
              <select
                id="category"
                name="category"
                defaultValue=""
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                <option value="">Sin categoría</option>
                {SUPPLIER_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="primary_contact_email">Correo de contacto</Label>
              <Input id="primary_contact_email" name="primary_contact_email" type="email" placeholder="contacto@proveedor.com" />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full">
              Crear proveedor
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
