"use client";

import { useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonVariant } from "./button";

/**
 * A submit button that opens a confirmation dialog before the enclosing form is submitted.
 * Used for sensitive actions (suspending users, revoking roles, purging data).
 */
export function ConfirmSubmit({
  children,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "danger",
  size = "sm",
}: {
  children: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { pending } = useFormStatus();

  const close = () => {
    dialogRef.current?.close();
    setOpen(false);
  };

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant={variant === "danger" ? "secondary" : variant}
        size={size}
        loading={pending}
        onClick={() => {
          dialogRef.current?.showModal();
          setOpen(true);
        }}
      >
        {children}
      </Button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="confirm-title"
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {open && (
          <div className="p-5">
            <h2 id="confirm-title" className="text-base font-semibold">
              {title}
            </h2>
            <div className="mt-2 text-sm text-muted-foreground">{description}</div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={close} autoFocus>
                Cancel
              </Button>
              <Button
                type="button"
                variant={variant}
                size="sm"
                onClick={() => {
                  close();
                  triggerRef.current?.form?.requestSubmit();
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

export function SubmitButton({ children, variant = "primary", size = "md", className }: { children: ReactNode; variant?: ButtonVariant; size?: "sm" | "md" | "lg"; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} loading={pending} className={className}>
      {children}
    </Button>
  );
}
