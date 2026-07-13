"use client";

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitive.Provider;
export const useToastManager = ToastPrimitive.useToastManager;

function Toaster() {
  const { toasts } = useToastManager();
  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport className="fixed top-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 outline-none">
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            toast={toast}
            className={cn(
              "relative rounded-xl border bg-card p-4 text-sm text-card-foreground shadow-lg transition-all",
              "data-[type=error]:border-destructive/40",
              "data-[type=success]:border-success/40",
              "data-[starting-style]:translate-x-[calc(100%+1rem)] data-[starting-style]:opacity-0",
              "data-[ending-style]:opacity-0"
            )}
          >
            {toast.title ? (
              <ToastPrimitive.Title className="font-medium">{toast.title}</ToastPrimitive.Title>
            ) : null}
            {toast.description ? (
              <ToastPrimitive.Description className="mt-0.5 text-muted-foreground">
                {toast.description}
              </ToastPrimitive.Description>
            ) : null}
            <ToastPrimitive.Close
              className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="size-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  );
}

export { ToastProvider, Toaster };
