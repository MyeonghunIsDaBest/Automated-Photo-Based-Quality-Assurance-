// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// pages/sales/Sales.tsx â€” /sales page shell.
//
// Guard: canManageSales â†’ Navigate to "/" AFTER all hooks (Catalogue pattern).
// Masthead: eyebrow OFFICE Â· COMMERCIAL, Fraunces "Sales.", count chips.
// Sub-tabs: ?tab= quotes | invoices | variations | settings (default quotes).
// Passes optional ?customer=<id> as initialCustomerFilter to Quotes/Invoices.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { Suspense, useCallback, useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { lazyWithRetry } from "../../lib/lazyWithRetry";
import { motion } from "framer-motion";
import { ReceiptText } from "lucide-react";

import { useAppStore } from "../../store";
import { canManageSales } from "../../lib/permissions";
import { FRAUNCES, TONE, cardShell } from "../gantt/components/ledger";
import { SkeletonCard } from "../../components/ui/skeleton";

import { listQuotes, listInvoices, isOverdue } from "../../lib/api/commercial";

// â”€â”€â”€ lazy sub-tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const QuotesTab     = lazyWithRetry(() => import("./QuotesTab"));
const InvoicesTab   = lazyWithRetry(() => import("./InvoicesTab"));
const VariationsTab = lazyWithRetry(() => import("./VariationsTab"));
const SettingsTab   = lazyWithRetry(() => import("./SettingsTab"));

// â”€â”€â”€ types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type TabKey = "quotes" | "invoices" | "variations" | "settings";

interface HeaderCounts {
  openQuotes: number;
  unpaidValue: number;
  overdueCount: number;
}

// â”€â”€â”€ tab strip pill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TabPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "text-white"
          : "text-[#6B6B6B] hover:bg-[#F0EDE4] hover:text-[#1A1A1A]"
      }`}
    >
      {active && (
        <motion.span
          layoutId="sales-tab-pill"
          className="absolute inset-0 rounded-xl bg-[#1A1A1A] shadow-sm"
          transition={{ type: "spring", damping: 30, stiffness: 360 }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  );
}

// â”€â”€â”€ count chip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CountChip({
  value,
  label,
  bg,
  fg,
}: {
  value: string;
  label: string;
  bg: string;
  fg: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex h-8 min-w-8 items-center justify-center rounded-full px-2.5 text-[13px] font-semibold tabular-nums"
        style={{ backgroundColor: bg, color: fg }}
      >
        {value}
      </span>
      <span className="text-[13px] font-medium text-[#3A3A3A]">{label}</span>
    </div>
  );
}

// â”€â”€â”€ tab skeleton fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TabFallback() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading tab">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}

// â”€â”€â”€ component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function Sales() {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const currentUser    = useAppStore((s) => s.currentUser);

  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab        = searchParams.get("tab");
  const customerParam = searchParams.get("customer");

  const VALID_TABS: TabKey[] = ["quotes", "invoices", "variations", "settings"];
  const activeTab: TabKey = VALID_TABS.includes(rawTab as TabKey)
    ? (rawTab as TabKey)
    : "quotes";

  // Denied flag â€” guard fires AFTER all hooks
  const denied = !canManageSales(currentProfile ?? currentUser);

  const [counts, setCounts] = useState<HeaderCounts>({
    openQuotes: 0,
    unpaidValue: 0,
    overdueCount: 0,
  });

  const fetchCounts = useCallback(async () => {
    try {
      const now = new Date();
      const todayIso = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, “0”),
        String(now.getDate()).padStart(2, “0”),
      ].join(“-”);
      const [sentQuotes, viewedQuotes, sentInvoices] = await Promise.all([
        listQuotes({ status: “sent” }),
        listQuotes({ status: “viewed” }),
        listInvoices({ status: “sent” }),
      ]);
      const openQuotes = sentQuotes.length + viewedQuotes.length;
      const unpaidValue = sentInvoices.reduce((s, inv) => s + inv.totalIncGst, 0);
      const overdueCount = sentInvoices.filter((inv) => isOverdue(inv, todayIso)).length;
      setCounts({ openQuotes, unpaidValue, overdueCount });
    } catch {
      // counts are informational â€” silent failure
    }
  }, []);

  useEffect(() => {
    if (!denied) {
      void fetchCounts();
    }
  }, [denied, fetchCounts]);

  const refreshCounts = useCallback(() => { void fetchCounts(); }, [fetchCounts]);

  // Normalize missing/invalid ?tab= to "quotes"
  useEffect(() => {
    if (!rawTab || !VALID_TABS.includes(rawTab as TabKey)) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", "quotes");
        return next;
      }, { replace: true });
    }
  }, [rawTab, setSearchParams]);

  if (denied) {
    return <Navigate to="/" replace />;
  }

  const switchTab = (tab: TabKey) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    }, { replace: true });
  };

  const TABS: { key: TabKey; label: string }[] = [
    { key: "quotes",     label: "Quotes"     },
    { key: "invoices",   label: "Invoices"   },
    { key: "variations", label: "Variations" },
    { key: "settings",   label: "Settings"   },
  ];

  const fmtCurrency = (n: number) =>
    "$" + n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div
      className="flex min-h-screen flex-col bg-[#F5F2E9]"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">

        {/* â”€â”€ Masthead â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className={`mb-5 ${cardShell}`}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5 sm:px-6">

            {/* Kicker tile */}
            <div className="w-16 min-w-16 overflow-hidden rounded-[11px] border border-[#E6E1D4] bg-white text-center">
              <div className="bg-[#1A1A1A] py-1 text-[10px] font-semibold tracking-[0.16em] text-white">
                COM
              </div>
              <div className="grid place-items-center py-2.5 text-[#1A1A1A]">
                <ReceiptText className="h-6 w-6" strokeWidth={1.5} />
              </div>
            </div>

            {/* Title block */}
            <div className="leading-tight">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B6B6B]">
                OFFICE &middot; COMMERCIAL
              </div>
              <h1
                className="m-0 text-[28px] font-medium leading-none text-[#1A1A1A] sm:text-[30px]"
                style={{ fontFamily: FRAUNCES, letterSpacing: "-0.015em" }}
              >
                Sales.
              </h1>
            </div>

            {/* Hairline divider */}
            <div className="hidden h-12 w-px bg-[#EFEBE0] sm:block" aria-hidden />

            {/* Count chips */}
            <div className="flex flex-wrap items-center gap-6 sm:gap-8">
              <CountChip
                value={String(counts.openQuotes)}
                label="open quotes"
                bg={TONE.slate.bg}
                fg={TONE.slate.fg}
              />
              <CountChip
                value={fmtCurrency(counts.unpaidValue)}
                label="unpaid invoices"
                bg={counts.unpaidValue > 0 ? TONE.amber.bg : "#F5F2E9"}
                fg={counts.unpaidValue > 0 ? TONE.amber.fg : "#A0A0A0"}
              />
              <CountChip
                value={String(counts.overdueCount)}
                label="overdue"
                bg={counts.overdueCount > 0 ? TONE.red.bg : "#F5F2E9"}
                fg={counts.overdueCount > 0 ? TONE.red.fg : "#A0A0A0"}
              />
            </div>

            {/* Right: tab strip */}
            <div className="ml-auto">
              <div className="inline-flex items-center gap-1 rounded-2xl border border-[#E6E1D4] bg-[#FAF8F2] p-1">
                {TABS.map(({ key, label }) => (
                  <TabPill
                    key={key}
                    label={label}
                    active={activeTab === key}
                    onClick={() => switchTab(key)}
                  />
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* â”€â”€ Tab body â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <Suspense fallback={<TabFallback />}>
          {activeTab === "quotes" && (
            <QuotesTab
              initialCustomerFilter={customerParam}
              onChanged={refreshCounts}
            />
          )}
          {activeTab === "invoices" && (
            <InvoicesTab
              initialCustomerFilter={customerParam}
              onChanged={refreshCounts}
            />
          )}
          {activeTab === "variations" && (
            <VariationsTab
              onChanged={refreshCounts}
            />
          )}
          {activeTab === "settings" && (
            <SettingsTab
              onChanged={refreshCounts}
            />
          )}
        </Suspense>

      </div>
    </div>
  );
}
