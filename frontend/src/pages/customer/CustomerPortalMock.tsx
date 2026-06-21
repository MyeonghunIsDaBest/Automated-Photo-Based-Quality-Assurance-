// CustomerPortalMock — TEMPORARY full-mock view of the customer portal.
//
// Renders the complete design mock (public/customer-portal-mock.html) in an
// iframe so the entire dashboard — navy sidebar, KPI tiles, Active Projects,
// the Chart.js budget chart, activity feed, invoices, documents, messages — is
// visible/usable as a visual reference, with its STATIC demo content (no real
// data, no real actions).
//
// The dev view-switcher survives this swap: a dev gets a floating "Switch to
// staff app" button overlaid on the mock, and the Settings → "Switch view" card
// (staff side) is unaffected.
//
// REVERT: point the `/customer` route's lazy import back to
// './pages/customer/CustomerPortal' in App.tsx (one line) — this file and the
// public mock can then be deleted.

import { Navigate, useNavigate } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { useAppStore } from '../../store';

export default function CustomerPortalMock() {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const navigate = useNavigate();

  const sg = currentProfile?.securityGroup;
  // Same access rule as the real portal: customers + the dev superuser only.
  if (sg !== 'customer' && sg !== 'dev') {
    return <Navigate to="/" replace />;
  }
  const isDev = sg === 'dev';

  return (
    <div className="relative min-h-dvh w-full bg-[#F4F3EF]">
      <iframe
        src="/customer-portal-mock.html"
        title="Customer portal (mock preview)"
        className="block h-dvh w-full border-0"
      />
      {isDev && (
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="fixed right-4 top-4 z-[60] inline-flex items-center gap-2 rounded-full bg-[#1A1A1A] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(20,20,20,0.25)] transition-colors hover:bg-black"
        >
          <LayoutGrid className="h-4 w-4" />
          Switch to staff app
        </button>
      )}
    </div>
  );
}
