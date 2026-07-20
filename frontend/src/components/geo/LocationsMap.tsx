// ─────────────────────────────────────────────────────────────────────────────
// components/geo/LocationsMap.tsx — the all-pins map: every stock location with
// coordinates (factory, van home bases, sites, storage) on one Leaflet map,
// with popups that jump into the location's detail view or open directions.
// ALWAYS import lazily (React.lazy) — Leaflet stays out of the main bundle,
// exactly like MapPicker.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { SizeFix } from "./MapPicker"; // shares the icon-path fix + invalidateSize recipe
import { directionsUrl } from "../../lib/geo";

export interface MapLocation {
  id: string;
  name: string;
  type: string;
  address: string | null;
  lat: number;
  lng: number;
  isActive: boolean;
}

interface Props {
  locations: MapLocation[];
  onOpen: (id: string) => void;
  heightClass?: string;
}

const TYPE_LABEL: Record<string, string> = { factory: "Factory", van: "Van", site: "Site", storage: "Storage" };
const DEFAULT_CENTER: [number, number] = [-37.8136, 144.9631]; // Melbourne

/** Fit the view around every pin once per pin-set change. */
function FitAll({ locations }: { locations: MapLocation[] }) {
  const map = useMap();
  useEffect(() => {
    if (locations.length === 0) return;
    if (locations.length === 1) {
      map.setView([locations[0].lat, locations[0].lng], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(locations.map((l) => [l.lat, l.lng] as [number, number])), { padding: [32, 32] });
  }, [map, locations]);
  return null;
}

export default function LocationsMap({ locations, onOpen, heightClass = "h-72" }: Props) {
  return (
    // `isolate` traps Leaflet's z-indexes so drawers/dropdowns still paint on top.
    <div className={`isolate overflow-hidden rounded-[12px] border border-[#E6E1D4] ${heightClass}`}>
      <MapContainer center={DEFAULT_CENTER} zoom={10} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <SizeFix />
        <FitAll locations={locations} />
        {locations.map((l) => {
          const dir = directionsUrl({ lat: l.lat, lng: l.lng, address: l.address });
          return (
            <Marker key={l.id} position={[l.lat, l.lng]} opacity={l.isActive ? 1 : 0.5}>
              <Popup>
                <div style={{ minWidth: 160 }}>
                  <p style={{ margin: 0, fontWeight: 600, color: "#1A1A1A" }}>{l.name}</p>
                  <p style={{ margin: "2px 0 8px", fontSize: 11, color: "#6B6B6B" }}>
                    {TYPE_LABEL[l.type] ?? l.type}{l.isActive ? "" : " · inactive"}
                  </p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => onOpen(l.id)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#2F8F5C" }}
                    >
                      Open
                    </button>
                    {dir && (
                      <a href={dir} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: "#2A6F9E" }}>
                        Directions
                      </a>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
