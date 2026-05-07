import { forwardRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { buttonGhost, buttonPill, buttonEyebrow, cn } from '../../lib/editorial';

type Variant = 'pill' | 'ghost' | 'eyebrow';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /** Icon affordance. `default` shows ArrowUpRight on the pill variant only;
   *  `none` hides it. Custom nodes are rendered in the same slot. */
  trailingIcon?: 'default' | 'none' | React.ReactNode;
};

const VARIANT_CLASS: Record<Variant, string> = {
  pill: buttonPill,
  ghost: buttonGhost,
  eyebrow: buttonEyebrow,
};

const EditorialButton = forwardRef<HTMLButtonElement, ButtonProps>(function EditorialButton(
  { variant = 'pill', trailingIcon = 'default', className, children, ...props },
  ref,
) {
  // The arrow micro-interaction is only natural on the brand primary (pill).
  const showDefaultArrow =
    variant === 'pill' && (trailingIcon === 'default' || trailingIcon === undefined);
  const customIcon =
    trailingIcon !== 'default' && trailingIcon !== 'none' ? trailingIcon : null;

  return (
    <button ref={ref} className={cn(VARIANT_CLASS[variant], className)} {...props}>
      {children}
      {showDefaultArrow && (
        <ArrowUpRight
          className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          aria-hidden
        />
      )}
      {customIcon}
    </button>
  );
});

export default EditorialButton;
