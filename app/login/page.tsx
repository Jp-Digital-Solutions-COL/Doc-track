import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { login } from "@/lib/actions/auth";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordInput } from "@/components/ui/password-input";
import { DocumentTrackingAnimation } from "@/components/document-tracking-animation";
import { Mail } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen">
      {/* Panel de marca — oculto en mobile */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[linear-gradient(135deg,var(--primary),color-mix(in_oklch,var(--primary),black_45%))] p-12 text-primary-foreground lg:flex">
        <div className="absolute -top-24 -right-24 size-72 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-16 size-80 rounded-full bg-white/5" />

        <BrandLogo className="h-9 w-auto self-start brightness-0 invert" />

        <div className="relative z-10 space-y-6">
          <div className="max-w-md space-y-3">
            <h1 className="font-heading text-3xl leading-tight font-semibold">
              Gestión documental simple, segura y eficiente.
            </h1>
            <p className="text-primary-foreground/80">
              Centraliza los documentos de tus proveedores, controla vencimientos y mantén tu operación en cumplimiento.
            </p>
          </div>

          {/* Ilustración: animación de seguimiento de vencimiento de documentos */}
          <div className="overflow-hidden rounded-2xl shadow-2xl">
            <DocumentTrackingAnimation />
          </div>

          <div className="flex max-w-md items-start gap-3 rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
            <ShieldCheck className="size-5 shrink-0 text-primary-foreground/90" />
            <div>
              <p className="text-sm font-medium">Seguro y confiable</p>
              <p className="text-xs text-primary-foreground/75">
                Cifrado en tránsito y en reposo, con control de acceso por organización.
              </p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-primary-foreground/60">© {new Date().getFullYear()} Doc-Track — JP Digital Solutions</p>
      </div>

      {/* Formulario */}
      <div className="flex w-full flex-1 items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm space-y-6">
          <BrandLogo className="h-9 w-auto lg:hidden" />

          <div className="space-y-1">
            <h2 className="font-heading text-2xl font-semibold">Inicia sesión</h2>
            <p className="text-sm text-muted-foreground">Accede a tu cuenta de Doc-Track.</p>
          </div>

          <form action={login} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="h-11 pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <PasswordInput id="password" name="password" required autoComplete="current-password" />
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-muted-foreground">
                <Checkbox name="remember" />
                Recordarme
              </label>
              <Link href="/login/forgot-password" className="text-primary hover:underline">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="h-11 w-full">
              Entrar
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">o</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <p className="text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Crea tu empresa
            </Link>
          </p>

          <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
            <ShieldCheck className="size-5 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Tu información está protegida y solo es visible para tu organización.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
