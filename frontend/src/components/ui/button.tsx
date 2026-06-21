import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Editorial "ledger" skin — sage primary, cream/hairline neutrals, pill radius.
// Variant + size API is unchanged so every existing <Button> call still works;
// only the look is brought onto the house palette (matches btnPrimary/btnGhost
// in pages/gantt/components/ledger.tsx).
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F8F5C] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-[#2F8F5C] text-white hover:bg-[#246F47]',
        destructive: 'bg-[#C44545] text-white hover:bg-[#A93A3A]',
        outline: 'border border-[#E6E1D4] bg-white text-[#3A3A3A] hover:bg-[#FAF8F2]',
        secondary: 'bg-[#F0EDE4] text-[#1A1A1A] hover:bg-[#E6E1D4]',
        ghost: 'text-[#3A3A3A] hover:bg-[#F0EDE4]',
        link: 'text-[#246F47] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants, cn };
