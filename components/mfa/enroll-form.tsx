"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "start" | "verify";

export function MfaEnrollForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("start");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function startEnrollment() {
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setLoading(false);

    if (enrollError || !data) {
      setError(enrollError?.message ?? "No se pudo iniciar el enrolamiento.");
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setStep("verify");
  }

  async function verifyEnrollment(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError || !challenge) {
      setLoading(false);
      setError(challengeError?.message ?? "No se pudo iniciar la verificación.");
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    setLoading(false);

    if (verifyError) {
      setError("Código incorrecto. Intenta de nuevo.");
      return;
    }

    router.refresh();
    router.push(redirectTo);
  }

  if (step === "start") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Escanea un código QR con una app autenticadora (Google Authenticator, 1Password,
          Authy...) para activar la verificación en dos pasos.
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button onClick={startEnrollment} disabled={loading} className="w-full">
          {loading ? "Generando código..." : "Empezar"}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={verifyEnrollment} className="space-y-4">
      {qrCode ? (
        // qr_code ya viene como data URI (SVG) desde Supabase.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrCode} alt="Código QR para configurar el autenticador" className="mx-auto" />
      ) : null}
      {secret ? (
        <p className="break-all rounded bg-muted p-2 text-center text-xs text-muted-foreground">
          O ingresa esta clave manualmente: {secret}
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="code">Código de 6 dígitos</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Verificando..." : "Activar"}
      </Button>
    </form>
  );
}
