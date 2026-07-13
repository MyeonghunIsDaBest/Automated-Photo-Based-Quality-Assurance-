// ─────────────────────────────────────────────────────────────────────────────
// components/ui/Field.tsx — the shared labelled-form-control wrapper (P9.A).
//
// Replaces the ~15 divergent local `Field` copies across admin/gantt/sales.
// Ledger register styling: eyebrow label, red error line (role="alert"),
// muted hint; wires id/aria-describedby/aria-invalid onto the child control.
//
//   <Field label="Unit price" htmlFor="price" required error={err} hint="ex GST">
//     <FieldInput id="price" inputMode="decimal" … />
//   </Field>
// ─────────────────────────────────────────────────────────────────────────────

import { cloneElement, isValidElement, type ReactNode, type ReactElement } from 'react';
import { cn } from '../../lib/cn';
import { inputField } from '../../pages/gantt/components/ledger';

interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: string | null;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, required, error, hint, className, children }: FieldProps) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;

  // Wire accessibility attributes onto a single element child when we can.
  let control = children;
  if (isValidElement(children)) {
    const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;
    control = cloneElement(children as ReactElement<Record<string, unknown>>, {
      ...(htmlFor && { id: htmlFor }),
      ...(describedBy && { 'aria-describedby': describedBy }),
      ...(error && { 'aria-invalid': true }),
    });
  }

  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={htmlFor} className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
        {label}
        {required && <span aria-hidden className="ml-0.5 text-[#C44545]">*</span>}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-[11px] text-[#A0A0A0]">{hint}</p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-[#C44545]">{error}</p>
      )}
    </div>
  );
}

// Thin control wrappers: ledger inputField skin + comfortable touch height.

export function FieldInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputField, 'min-h-11', className)} />;
}

export function FieldSelect({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputField, 'min-h-11', className)}>{children}</select>;
}

export function FieldTextarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputField, 'resize-y', className)} />;
}
