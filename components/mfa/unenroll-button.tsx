"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function MfaUnenrollButton({ factorId }: { factorId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unenroll() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
    setLoading(false);

    if (unenrollError) {
      setError(unenrollError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button variant="warning" onClick={unenroll} disabled={loading}>
        {loading ? "Desactivando..." : "Desactivar verificación en dos pasos"}
      </Button>
    </div>
  );
}
