'use client';

import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

const MAX_LOGO_BYTES = 1_048_576;
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function BillLogoField({
  logoUrl,
  disabled,
  busy,
  onUpload,
  onRemove,
}: {
  logoUrl: string | null;
  disabled: boolean;
  busy: boolean;
  onUpload: (image: string) => Promise<void>;
  onRemove: () => Promise<void>;
}): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Shop logo"
          disabled={disabled || busy}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) {
              return;
            }
            if (!ACCEPTED.has(file.type) || file.size > MAX_LOGO_BYTES) {
              setError(
                file.size > MAX_LOGO_BYTES
                  ? 'The logo must be under 1 MB.'
                  : 'Use a PNG, JPG, or WebP logo.',
              );
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const image = reader.result;
              if (typeof image !== 'string') {
                setError('The logo could not be read.');
                return;
              }
              setError(null);
              void onUpload(image).catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : 'The logo could not be saved');
              });
            };
            reader.onerror = () => setError('The logo could not be read.');
            reader.readAsDataURL(file);
          }}
        />
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm text-ink2 disabled:bg-canvas"
        >
          <ImagePlus size={16} className="text-action" aria-hidden="true" />
          {busy ? 'Saving logo…' : logoUrl ? 'Replace logo' : 'Upload logo'}
        </button>
        {logoUrl ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => {
              setError(null);
              void onRemove().catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'The logo could not be removed',
                );
              });
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-danger disabled:opacity-50"
          >
            <Trash2 size={16} aria-hidden="true" />
            Remove logo
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
