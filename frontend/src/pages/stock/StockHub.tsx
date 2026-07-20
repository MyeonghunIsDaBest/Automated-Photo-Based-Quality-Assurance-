// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/StockHub.tsx — the /stock section shell (Stock & Inventory, Phase 1).
//
// Field workers land on their own van; managers get a tabbed hub (Overview +
// Locations). Built on the ledger design system so Stock reads as one product
// with Jobs + Sales. Header card follows the test.html stock shell: a white
// 16px-radius card with an STK-badged tile, live eyebrow, Fraunces title, and
// the tab strip inside the card bottom (ink underline = active).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Boxes } from "lucide-react";

import { useAppStore } from "../../store";
import { canManageStock } from "../../lib/permissions";
import { FRAUNCES } from "../gantt/components/ledger";
import MyVanView from "./MyVanView";
import StockOverview from "./StockOverview";
import LocationsManager from "./LocationsManager";
import RestockDashboard from "./RestockDashboard";
import OrdersView from "./OrdersView";
import ReportsView from "./ReportsView";
import StockSettingsView from "./StockSettingsView";

type ManagerTab = "overview" | "locations" | "restock" | "orders" | "reports" | "settings";

const MGR_TABS: { key: ManagerTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "locations", label: "Locations" },
  { key: "restock", label: "Restock" },
  { key: "orders", label: "Orders" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
];

export default function StockHub() {
  const principal = useAppStore((s) => s.currentProfile ?? s.currentUser);
  const isManager = canManageStock(principal);
  const [tab, setTab] = useState<ManagerTab>("overview");

  return (
    <div className="flex min-h-full flex-col bg-[#F5F2E9]">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
        {/* Header card — mock stock shell */}
        <div className="mb-5 overflow-hidden rounded-[16px] border border-[#E6E1D4] bg-white shadow-[0_1px_0_0_rgba(15,23,42,0.04),0_1px_2px_-1px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-3.5 px-4 py-[18px] sm:px-6">
            <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-[14px] border border-[#E6E1D4] bg-white text-[#6B6B6B]">
              <span className="absolute -left-[7px] -top-[7px] rounded-[6px] bg-[#1A1A1A] px-1.5 py-0.5 text-[9px] font-bold tracking-[0.05em] text-white">
                STK
              </span>
              <Boxes className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <div className="mb-[3px] flex items-center gap-[7px] text-[11px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#10B981]" />
                OPERATIONS · LIVE
              </div>
              <h1
                className="m-0 text-[27px] font-semibold leading-tight text-[#1A1A1A]"
                style={{ fontFamily: FRAUNCES, letterSpacing: "-0.01em" }}
              >
                Stock
              </h1>
              <p className="mt-0.5 text-[12.5px] text-[#6B6B6B]">
                {isManager ? "Factory + vans · live running tallies" : "What's in your van right now"}
              </p>
            </div>
          </div>
          {isManager && (
            <div className="flex items-center gap-1 overflow-x-auto border-t border-[#E6E1D4] px-4 sm:px-6">
              {MGR_TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    aria-pressed={active}
                    className={`relative whitespace-nowrap px-2.5 py-3 text-[13.5px] font-semibold transition-colors ${
                      active ? "text-[#1A1A1A]" : "text-[#6B6B6B] hover:text-[#1A1A1A]"
                    }`}
                  >
                    {t.label}
                    <span
                      aria-hidden
                      className={`absolute inset-x-2 bottom-0 h-0.5 rounded-t-[2px] ${active ? "bg-[#1A1A1A]" : "bg-transparent"}`}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!isManager ? (
          <MyVanView />
        ) : (
          <>
            {tab === "overview" && <StockOverview onGoToRestock={() => setTab("restock")} onGoToLocations={() => setTab("locations")} />}
            {tab === "locations" && <LocationsManager />}
            {tab === "restock" && <RestockDashboard onGoToOrders={() => setTab("orders")} />}
            {tab === "orders" && <OrdersView />}
            {tab === "reports" && <ReportsView />}
            {tab === "settings" && <StockSettingsView />}
          </>
        )}
      </div>
    </div>
  );
}
