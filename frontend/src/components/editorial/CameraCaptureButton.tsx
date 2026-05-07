import { Camera } from 'lucide-react';
import { buttonGhost, cn } from '../../lib/editorial';

interface CameraCaptureButtonProps {
  /** Called with the captured File(s). On most phones a single shot is
   *  produced per camera launch — but we surface it as an array so the
   *  consumer can reuse the same handler as drag-drop dropzones. */
  onCapture: (files: File[]) => void;
  /** Allow multiple shots in one camera session (Android Chrome supports
   *  this; iOS Safari ignores `multiple` for capture and always returns
   *  one). */
  multiple?: boolean;
  /** Override the button label. Defaults to "Take photo". */
  label?: string;
  className?: string;
  disabled?: boolean;
}

// Renders an editorial-styled `<label>` wrapping a hidden file input with
// `accept="image/*"` and `capture="environment"`. On mobile this opens the
// rear camera directly; on desktop it falls back to the file picker. Pair
// with a separate "Pick from gallery" affordance (no `capture` attr) when
// users should also be able to choose existing files.
export default function CameraCaptureButton({
  onCapture,
  multiple = false,
  label = 'Take photo',
  className,
  disabled = false,
}: CameraCaptureButtonProps) {
  return (
    <label
      className={cn(
        buttonGhost,
        'cursor-pointer',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <Camera className="h-4 w-4" aria-hidden />
      <span>{label}</span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onCapture(files);
          // Reset so re-selecting the same file fires `change` again.
          e.target.value = '';
        }}
      />
    </label>
  );
}
