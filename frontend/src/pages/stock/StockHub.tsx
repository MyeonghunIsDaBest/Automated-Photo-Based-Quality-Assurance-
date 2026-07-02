// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/StockHub.tsx — the /stock section shell (Stock & Inventory, Phase 1).
//
// Field workers land on their own van; managers get a tabbed hub (Overview +
// Locations). Built on the ledger design system so Stock reads as one product
// with Jobs + Sales.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Boxes } from "lucide-react";

import { useAppStore } from "../../store";
import { canManageStock } from "../../lib/permissions";
import { LedgerHeader } from "../gantt/components/ledger";
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
    <div className="flex min-h-screen flex-col bg-[#F5F2E9]">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
        <LedgerHeader
          kicker="STK"
          icon={Boxes}
          eyebrow="OPERATIONS · LIVE"
          title="Stock"
          meta={isManager ? "Factory + vans · live running tallies" : "What's in your van right now"}
        />

        {!isManager ? (
          <MyVanView />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-1 border-b border-[#E6E1D4]">
              {MGR_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                    tab === t.key
                      ? "border-[#2F8F5C] text-[#1A1A1A]"
                      : "border-transparent text-[#6B6B6B] hover:bg-[#EFEBE0] hover:text-[#1A1A1A]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tab === "overview" && <StockOverview onGoToRestock={() => setTab("restock")} />}
            {tab === "locations" && <LocationsManager />}
            {tab === "restock" && <RestockDashboard />}
            {tab === "orders" && <OrdersView />}
            {tab === "reports" && <ReportsView />}
            {tab === "settings" && <StockSettingsView />}
          </>
        )}
      </div>
    </div>
  );
}
