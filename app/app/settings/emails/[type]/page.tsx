import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/session";
import { getEmailTemplate } from "@/lib/actions/email-templates";
import { EMAIL_TYPES, EMAIL_TYPE_LABEL, ALLOWED_VARIABLES_BY_TYPE, BUTTON_HREF_VAR_BY_TYPE, type EmailType } from "@/lib/email/blocks";
import { getSamplePreviewSets } from "@/lib/email/sample-data";
import { EmailTemplateEditor } from "@/components/app/email-template-editor";

function isEmailType(value: string): value is EmailType {
  return (EMAIL_TYPES as readonly string[]).includes(value);
}

export default async function EmailTemplateEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { type } = await params;
  const { error, saved } = await searchParams;
  if (!isEmailType(type)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = await getCurrentMembership(supabase, user.id);
  if (!membership) redirect("/app");
  if (!["owner", "admin"].includes(membership.role)) redirect("/app/settings/emails");

  const { data: org } = await supabase
    .from("organizations")
    .select("logo_url, brand_color")
    .eq("id", membership.organizationId)
    .single();

  const template = await getEmailTemplate(type);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">{EMAIL_TYPE_LABEL[type]}</h1>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p className="text-sm text-muted-foreground">Guardado.</p> : null}
      <EmailTemplateEditor
        // saveEmailTemplate/resetEmailTemplate redirect back to this same
        // route via a client-side transition (not a hard reload), so the
        // editor's component instance survives across saves/resets — its
        // useState(initialBlocks/initialSubject) would otherwise keep
        // showing stale content after "Restaurar predeterminado". Keying on
        // the actual server-fetched content forces a remount whenever it
        // changes, re-seeding local state from the fresh DB read.
        key={`${template.subject}:${JSON.stringify(template.blocks)}`}
        emailType={type}
        initialSubject={template.subject}
        initialBlocks={template.blocks}
        isCustomized={template.isCustomized}
        allowedVariables={ALLOWED_VARIABLES_BY_TYPE[type]}
        buttonHrefVar={BUTTON_HREF_VAR_BY_TYPE[type]}
        samplePreviewSets={getSamplePreviewSets(type)}
        logoUrl={org?.logo_url ?? null}
        brandColor={org?.brand_color ?? null}
      />
    </div>
  );
}
