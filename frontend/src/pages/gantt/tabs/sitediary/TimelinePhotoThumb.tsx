// frontend/src/pages/gantt/tabs/sitediary/TimelinePhotoThumb.tsx
//
// Async-resolving photo thumb. Looks up the storage_path for a photoId,
// signs a short-lived URL, then renders the image. Survives the date-switch
// race via the `alive` cleanup flag — no setState on unmounted components.

import { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { supabase, supabaseConfigured } from '../../../../lib/supabase';
import { getPhotoUrl } from '../../../../lib/api/photos';

interface TimelinePhotoThumbProps {
  photoId: string;
  large?: boolean;
}

export function TimelinePhotoThumb({ photoId, large = false }: TimelinePhotoThumbProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!supabaseConfigured()) return () => { alive = false; };
    (async () => {
      const { data, error } = await supabase
        .from('photos')
        .select('storage_path')
        .eq('id', photoId)
        .maybeSingle();
      if (!alive || error || !data?.storage_path) return;
      const signed = await getPhotoUrl(data.storage_path);
      if (alive) setUrl(signed);
    })();
    return () => { alive = false; };
  }, [photoId]);

  const cls = large
    ? 'w-full aspect-square rounded-[7px] border border-slate-200 bg-slate-100 overflow-hidden grid place-items-center'
    : 'w-[54px] h-[54px] rounded-[7px] border border-[#E6E1D4] bg-[#FAF8F2] overflow-hidden grid place-items-center';

  return (
    <div className={cls}>
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <ImageIcon className="h-4 w-4 text-slate-300" />
      )}
    </div>
  );
}
