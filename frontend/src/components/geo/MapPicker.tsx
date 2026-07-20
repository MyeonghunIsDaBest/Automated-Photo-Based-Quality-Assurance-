// ─────────────────────────────────────────────────────────────────────────────
// components/geo/MapPicker.tsx — interactive OpenStreetMap pin picker (Leaflet,
// free, no API key). Click to place the pin, drag to fine-tune; recenters when
// the pin is set from outside (address search). ALWAYS import this lazily
// (React.lazy) so Leaflet stays out of the main bundle.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, type MutableRefObject } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// Bundlers break Leaflet's default icon path detection — point it at the
// packaged images explicitly (classic Leaflet + Vite fix).
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

export interface MapPickerProps {
  lat: number | null;
  lng: number | null;
  onPick: (lat: number, lng: number) => void;
  /** Tailwind height class for the map box. */
  heightClass?: string;
  /** Read-only preview (no click/drag). */
  readOnly?: boolean;
}

// Sensible AU default when there's no pin yet (Melbourne).
const DEFAULT_CENTER: [number, number] = [-37.8136, 144.9631];

function ClickToPlace({ onPick, readOnly }: { onPick: MapPickerProps["onPick"]; readOnly?: boolean }) {
  useMapEvents({
    click(e) {
      if (!readOnly) onPick(Math.round(e.latlng.lat * 1e6) / 1e6, Math.round(e.latlng.lng * 1e6) / 1e6);
    },
  });
  return null;
}

/** Leaflet computes its tile layout ONCE from the container's size at mount.
 *  Inside an animating MotionDrawer modal (scale 0.94→1 spring) that snapshot
 *  is taken mid-transform → corrupted/cut-off tiles. A CSS transform doesn't
 *  change layout size, so a ResizeObserver alone never fires during it — the
 *  timed invalidateSize calls (post-mount + after the spring settles) cover
 *  the transform case; the observer covers real resizes (breakpoint flips,
 *  container reflow). Exported for reuse by other map surfaces. */
export function SizeFix() {
  const map = useMap();
  useEffect(() => {
    const t1 = window.setTimeout(() => map.invalidateSize(), 50);
    const t2 = window.setTimeout(() => map.invalidateSize(), 400);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

/** Fly to the pin when it changes from OUTSIDE (address search) — internal
 *  picks (map click / marker drag) are skipped so the view never yanks away
 *  from where the user is working. */
function Recenter({ lat, lng, internalPickRef }: { lat: number | null; lng: number | null; internalPickRef: MutableRefObject<string | null> }) {
  const map = useMap();
  useEffect(() => {
    if (lat == null || lng == null) return;
    if (internalPickRef.current === `${lat},${lng}`) return;
    map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }, [lat, lng, map, internalPickRef]);
  return null;
}

export default function MapPicker({ lat, lng, onPick, heightClass = "h-56", readOnly = false }: MapPickerProps) {
  const hasPin = lat != null && lng != null;
  // Remembers coords chosen ON the map so Recenter can tell them apart from
  // coords set by the parent (address search picks).
  const internalPickRef = useRef<string | null>(null);
  const pick = (la: number, ln: number) => {
    internalPickRef.current = `${la},${ln}`;
    onPick(la, ln);
  };
  return (
    // `isolate` traps Leaflet's internal z-indexes (up to ~1000) inside this box
    // so dropdowns (z-30) and drawers (z-40/50) elsewhere still paint on top.
    <div className={`isolate overflow-hidden rounded-[10px] border border-[#E6E1D4] ${heightClass}`}>
      <MapContainer
        center={hasPin ? [lat, lng] : DEFAULT_CENTER}
        zoom={hasPin ? 15 : 10}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={!readOnly}
        dragging
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <SizeFix />
        <ClickToPlace onPick={pick} readOnly={readOnly} />
        <Recenter lat={lat} lng={lng} internalPickRef={internalPickRef} />
        {hasPin && (
          <Marker
            position={[lat, lng]}
            draggable={!readOnly}
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                pick(Math.round(p.lat * 1e6) / 1e6, Math.round(p.lng * 1e6) / 1e6);
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
