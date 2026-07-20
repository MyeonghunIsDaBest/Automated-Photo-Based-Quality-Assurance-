// ─────────────────────────────────────────────────────────────────────────────
// components/print/PrintLogo.tsx — the document-header brand mark. Ships the real
// Casone logo bundled with the app, so quotes/invoices print branded out of the
// box with nothing to configure. A settings-backed logo URL (Settings → Print
// identity) OVERRIDES it — for a re-brand or another tenant — and if that URL
// fails to load we fall back to the bundled logo, never a broken-image glyph.
// The styled wordmark is the last resort if even the bundled asset is missing.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { PRINT } from './printTheme';
import casoneLogo from '../../assets/casone-logo.png';

interface Props {
  logoUrl: string | null | undefined;
  businessName: string | null | undefined;
}

export default function PrintLogo({ logoUrl, businessName }: Props) {
  // Tracks failure of the SETTINGS url only — the bundled asset can't 404.
  const [remoteFailed, setRemoteFailed] = useState(false);
  // A corrected URL gets a fresh chance.
  useEffect(() => { setRemoteFailed(false); }, [logoUrl]);
  const [bundledFailed, setBundledFailed] = useState(false);

  const useRemote = !!logoUrl && !remoteFailed;
  const src = useRemote ? logoUrl : casoneLogo;

  if ((useRemote || !bundledFailed) && src) {
    return (
      <img
        src={src}
        alt={businessName ?? 'Casone Electrical'}
        onError={() => (useRemote ? setRemoteFailed(true) : setBundledFailed(true))}
        className="h-14 w-auto object-contain object-left"
      />
    );
  }
  return (
    <p className="text-[24px] font-bold uppercase tracking-[0.3em]" style={{ color: PRINT.navy }}>
      {businessName ?? 'Casone Electrical'}
    </p>
  );
}
