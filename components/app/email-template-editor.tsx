"use client";

import { useMemo, useState } from "react";
import { saveEmailTemplate, resetEmailTemplate, uploadEmailImage } from "@/lib/actions/email-templates";
import { renderBlocks, substituteVariables } from "@/lib/email/render-blocks";
import { renderEmailHtml } from "@/lib/email/template";
import type { EmailBlock, EmailType } from "@/lib/email/blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TEXTAREA_CLASS =
  "w-full min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function newBlock(type: EmailBlock["type"], buttonHrefVar: string): EmailBlock {
  const id = crypto.randomUUID();
  if (type === "text") return { id, type, text: "" };
  if (type === "image") return { id, type, url: "", alt: "" };
  if (type === "button") return { id, type, label: "Ver más", hrefVar: buttonHrefVar };
  return { id, type };
}

export function EmailTemplateEditor({
  emailType,
  initialSubject,
  initialBlocks,
  isCustomized,
  allowedVariables,
  buttonHrefVar,
  samplePreviewSets,
  logoUrl,
  brandColor,
}: {
  emailType: EmailType;
  initialSubject: string;
  initialBlocks: EmailBlock[];
  isCustomized: boolean;
  allowedVariables: string[];
  buttonHrefVar: string;
  samplePreviewSets: { label: string; variables: Record<string, string> }[];
  logoUrl: string | null;
  brandColor: string | null;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [blocks, setBlocks] = useState<EmailBlock[]>(initialBlocks);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function updateBlock<T extends EmailBlock>(id: string, patch: Partial<T>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)));
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  function moveBlock(id: string, direction: -1 | 1) {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addBlock(type: EmailBlock["type"]) {
    setBlocks((prev) => [...prev, newBlock(type, buttonHrefVar)]);
  }

  async function handleImageUpload(id: string, file: File) {
    setUploadError(null);
    const formData = new FormData();
    formData.append("image", file);
    const result = await uploadEmailImage(formData);
    if (!result.ok) {
      setUploadError(result.error);
      return;
    }
    updateBlock<Extract<EmailBlock, { type: "image" }>>(id, { url: result.url });
  }

  const activeSample = samplePreviewSets[previewIndex]!.variables;
  const previewSubject = useMemo(() => substituteVariables(subject, activeSample), [subject, activeSample]);
  const previewHtml = useMemo(
    () => renderEmailHtml({ logoUrl, bodyHtml: renderBlocks(blocks, activeSample, brandColor) }),
    [blocks, activeSample, logoUrl, brandColor]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form action={saveEmailTemplate} className="space-y-4">
        <input type="hidden" name="emailType" value={emailType} />
        <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />

        <div className="space-y-2">
          <Label htmlFor="subject">Asunto</Label>
          <Input id="subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required />
        </div>

        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-muted-foreground">Variables:</span>
          {allowedVariables.map((v) => (
            <button
              key={v}
              type="button"
              className="rounded-full bg-muted px-2 py-0.5 text-xs hover:bg-muted/70"
              onClick={() => setSubject((s) => `${s}{{${v}}}`)}
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {blocks.map((block, index) => (
            <div key={block.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase text-muted-foreground">{block.type}</span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => moveBlock(block.id, -1)}>
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === blocks.length - 1}
                    onClick={() => moveBlock(block.id, 1)}
                  >
                    ↓
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeBlock(block.id)}>
                    ×
                  </Button>
                </div>
              </div>

              {block.type === "text" ? (
                <>
                  <textarea
                    className={TEXTAREA_CLASS}
                    value={block.text}
                    maxLength={2000}
                    onChange={(e) => updateBlock<Extract<EmailBlock, { type: "text" }>>(block.id, { text: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-1">
                    {allowedVariables.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="rounded-full bg-muted px-2 py-0.5 text-xs hover:bg-muted/70"
                        onClick={() =>
                          updateBlock<Extract<EmailBlock, { type: "text" }>>(block.id, { text: `${block.text}{{${v}}}` })
                        }
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {block.type === "image" ? (
                <div className="space-y-2">
                  {block.url ? <img src={block.url} alt={block.alt} className="max-h-24 rounded border border-border" /> : null}
                  <Input
                    type="file"
                    accept=".png,.jpg,.jpeg"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleImageUpload(block.id, file);
                    }}
                  />
                  <Input
                    placeholder="Texto alternativo"
                    value={block.alt}
                    maxLength={200}
                    onChange={(e) => updateBlock<Extract<EmailBlock, { type: "image" }>>(block.id, { alt: e.target.value })}
                  />
                </div>
              ) : null}

              {block.type === "button" ? (
                <Input
                  placeholder="Texto del botón"
                  value={block.label}
                  maxLength={200}
                  onChange={(e) => updateBlock<Extract<EmailBlock, { type: "button" }>>(block.id, { label: e.target.value })}
                />
              ) : null}
            </div>
          ))}
        </div>

        {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => addBlock("text")}>
            + Texto
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addBlock("image")}>
            + Imagen
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addBlock("button")}>
            + Botón
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addBlock("divider")}>
            + Separador
          </Button>
        </div>

        <div className="flex gap-2">
          <Button type="submit">Guardar</Button>
        </div>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Vista previa</h2>
          {samplePreviewSets.length > 1 ? (
            <div className="flex gap-1">
              {samplePreviewSets.map((set, index) => (
                <Button
                  key={set.label}
                  type="button"
                  size="sm"
                  variant={index === previewIndex ? "default" : "outline"}
                  onClick={() => setPreviewIndex(index)}
                >
                  {set.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        <p className="text-sm font-medium">{previewSubject}</p>
        <iframe title="Vista previa del correo" srcDoc={previewHtml} sandbox="" className="h-[500px] w-full rounded-lg border border-border" />

        {isCustomized ? (
          <form
            action={resetEmailTemplate}
            onSubmit={(e) => {
              if (!confirm("¿Restaurar la plantilla predeterminada? Se perderá tu personalización.")) e.preventDefault();
            }}
          >
            <input type="hidden" name="emailType" value={emailType} />
            <Button type="submit" variant="destructive" size="sm">
              Restaurar predeterminado
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
