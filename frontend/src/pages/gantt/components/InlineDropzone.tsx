import { useCallback } from 'react';
import { useDropzone, type Accept } from 'react-dropzone';
import { Upload as UploadIcon } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';

// Accepted by both the standalone /upload page and the Gantt Uploads tab.
// Image MIME types match the original Upload.tsx; videos added so a short
// site walkthrough fits.
export const DEFAULT_ACCEPT: Accept = {
  'image/*':         ['.jpeg', '.jpg', '.png', '.webp', '.heic'],
  'video/mp4':       ['.mp4'],
  'video/quicktime': ['.mov'],
};

interface InlineDropzoneProps {
  onFiles: (files: File[]) => void;
  accept?: Accept;
  maxFiles?: number;
  maxSize?: number;     // bytes
  badges?: string[];    // e.g. ['JPG','PNG','MP4'] shown under the dropzone copy
  helperText?: string;
}

// Reusable dropzone block extracted from Upload.tsx. Styling matches the
// original so visuals don't drift; the only callsite differences are the
// accept config and the surrounding layout.
export function InlineDropzone({
  onFiles,
  accept = DEFAULT_ACCEPT,
  maxFiles = 20,
  maxSize = 50 * 1024 * 1024,
  badges = ['JPG', 'PNG', 'WebP', 'HEIC', 'MP4', 'MOV'],
  helperText,
}: InlineDropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => onFiles(acceptedFiles),
    [onFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles,
    maxSize,
  });

  return (
    <div
      {...getRootProps()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
        isDragActive
          ? 'border-emerald-500 bg-emerald-50'
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <input {...getInputProps()} />
      <div className="mb-4 rounded-full bg-slate-100 p-4">
        <UploadIcon className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="text-base font-medium text-slate-900">
        {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
      </h3>
      <p className="mt-1.5 text-xs text-slate-500">
        {helperText ?? `or click to browse (max ${maxFiles} files, ${Math.round(maxSize / 1024 / 1024)}MB each)`}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {badges.map((b) => (
          <Badge key={b} variant="secondary" className="text-[10px]">
            {b}
          </Badge>
        ))}
      </div>
    </div>
  );
}
