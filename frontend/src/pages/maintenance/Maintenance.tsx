// Maintenance route entry point — now mounted at /customers (/maintenance
// redirects here for backwards-compatibility with old bookmarks).
//
// Guards: canManageMaintenance(profile) — redirects non-managers to /.
//
// View-state: simple useState-based stack:
//   'list'          — CustomersList
//   'customer/:id'  — CustomerDetail
//   'request/:id'   — RequestDetail (from customer detail row click)
//
// Realtime: subscribes to postgres_changes INSERT+UPDATE on
// maintenance_requests and increments a refreshKey that CustomerDetail
// watches to re-fetch its request list.

import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { canManageMaintenance } from '../../lib/permissions';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import CustomersList from './CustomersList';
import CustomerDetail from './CustomerDetail';
import RequestDetail from './RequestDetail';

// ─── view-state types ─────────────────────────────────────────────────────────

type View =
  | { kind: 'list' }
  | { kind: 'customer'; id: string }
  | { kind: 'request'; id: string; fromCustomerId: string | null };

export default function Maintenance() {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const [view, setView] = useState<View>({ kind: 'list' });
  // Incremented each time a realtime event fires so CustomerDetail can
  // re-fetch its request list cheaply without a full component remount.
  const [refreshKey, setRefreshKey] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Realtime subscription ───────────────────────────────────────────────
  useEffect(() => {
    if (!supabaseConfigured()) return;

    const ch = supabase
      .channel('maintenance-requests-mgr')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'maintenance_requests' },
        () => setRefreshKey((k) => k + 1),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'maintenance_requests' },
        () => setRefreshKey((k) => k + 1),
      )
      .subscribe();

    channelRef.current = ch;
    return () => {
      void supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, []);

  // ── Guard ───────────────────────────────────────────────────────────────
  if (!canManageMaintenance(currentProfile)) {
    return <Navigate to="/" replace />;
  }

  // ── Navigation handlers ─────────────────────────────────────────────────
  const goToCustomer = (id: string) => setView({ kind: 'customer', id });
  const goToRequest = (id: string, fromCustomerId: string | null = null) =>
    setView({ kind: 'request', id, fromCustomerId });
  const goToList = () => setView({ kind: 'list' });
  const goBackFromRequest = (fromCustomerId: string | null) => {
    if (fromCustomerId) {
      setView({ kind: 'customer', id: fromCustomerId });
    } else {
      setView({ kind: 'list' });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (view.kind === 'list') {
    return <CustomersList onSelectCustomer={goToCustomer} />;
  }

  if (view.kind === 'customer') {
    return (
      <CustomerDetail
        customerId={view.id}
        onBack={goToList}
        onSelectRequest={(reqId) => goToRequest(reqId, view.id)}
        refreshKey={refreshKey}
      />
    );
  }

  // view.kind === 'request'
  return (
    <RequestDetail
      requestId={view.id}
      onBack={() => goBackFromRequest(view.fromCustomerId)}
    />
  );
}
