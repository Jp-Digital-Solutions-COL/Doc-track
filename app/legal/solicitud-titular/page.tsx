import { submitDataSubjectRequest } from "@/lib/actions/data-subject-requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DataSubjectRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Solicitud de derechos del titular</CardTitle>
          <CardDescription>
            Consulta, rectificación o supresión de tus datos personales (Ley 1581 de 2012). Respondemos en máximo
            10 días hábiles para consultas y 15 días hábiles para reclamos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <p className="text-sm text-muted-foreground">
              Tu solicitud fue recibida. Si la empresa indicada está registrada en la plataforma, se te contactará
              dentro del plazo legal al correo suministrado.
            </p>
          ) : (
            <form action={submitDataSubjectRequest} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nit">NIT de la empresa con la que tienes relación</Label>
                <Input id="nit" name="nit" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="requesterName">Tu nombre completo</Label>
                <Input id="requesterName" name="requesterName" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="requesterEmail">Tu correo</Label>
                <Input id="requesterEmail" name="requesterEmail" type="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="requestType">Tipo de solicitud</Label>
                <select
                  id="requestType"
                  name="requestType"
                  required
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                >
                  <option value="consulta">Consulta (¿qué datos tienen de mí?)</option>
                  <option value="rectificacion">Rectificación (corregir datos)</option>
                  <option value="supresion">Supresión (eliminar mis datos)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="details">Detalles de tu solicitud (opcional)</Label>
                <Input id="details" name="details" />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full">
                Enviar solicitud
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
