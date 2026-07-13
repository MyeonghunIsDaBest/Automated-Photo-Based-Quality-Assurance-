import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Ledger-toned variants (P9.A): same API, warm TONE washes instead of the
// Tailwind emerald/slate palette. blue/purple have no ledger equivalent —
// they map to the slate/ink washes so legacy call sites stay coherent.
const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#2F8F5C] focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-[#E5F2EA] text-[#246F47]',
        secondary: 'bg-[#EEF1F4] text-[#5B6B7B]',
        destructive: 'bg-[#FBE5E5] text-[#C44545]',
        outline: 'border border-[#E6E1D4] text-[#3A3A3A]',
        warning: 'bg-[#F9EFD9] text-[#9A6B12]',
        blue: 'bg-[#EEF1F4] text-[#5B6B7B]',
        purple: 'bg-[#ECE8DE] text-[#1A1A1A]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants, cn };
