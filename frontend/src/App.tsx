import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import RequireAuth from './components/RequireAuth';
import QuickActionsSidebar from './components/layout/QuickActionsSidebar';
import { Toaster } from './components/ui/Toaster';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// Code-split every authenticated page. Login stays eager (it's the very first
// paint for unauthed users, so lazy-loading it just adds an extra round-trip
// before the form appears). Layout + RequireAuth are also eager because every
// authed page renders inside them — splitting them buys nothing.
//
// Vite picks up the dynamic-import call sites automatically and emits one
// chunk per page; the route's first visit fetches the chunk, then it's
// cached. SPA navigation between already-visited routes stays instant.
const Dashboard      = lazy(() => import('./pages/Dashboard'));
const Gantt          = lazy(() => import('./pages/Gantt'));
const Reports        = lazy(() => import('./pages/Reports'));
const Settings       = lazy(() => import('./pages/Settings'));
const Messages       = lazy(() => import('./pages/Messages'));
const Projects       = lazy(() => import('./pages/Projects'));
const Safety         = lazy(() => import('./pages/Safety'));
const Admin          = lazy(() => import('./pages/Admin'));
const BootstrapAdmin = lazy(() => import('./pages/admin/BootstrapAdmin'));

// Lightweight fallback shown while a route chunk is loading. Mirrors the
// editorial background colour so the page flash isn't jarring.
function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-[#FAFAF7]">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" aria-hidden />
        <span className="text-xs font-medium uppercase tracking-[0.18em]">Loading</span>
      </div>
    </div>
  );
}

function App() {
  const { notification, setNotification, isAuthenticated } = useAppStore();

  return (
    <ErrorBoundary label="App root">
    <BrowserRouter>
      {isAuthenticated && <QuickActionsSidebar />}
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />

          {/* Protected Routes */}
          <Route element={<RequireAuth />}>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              {/* Upload + Gallery retired as standalone pages — UploadsTab on
                  the Gantt covers project-scoped capture + a recent-photos
                  grid. Old links + Dashboard / Safety / Tasks click-throughs
                  using ?photo= or ?task= deep-links resolve to the tab; the
                  per-photo focus is a known follow-up. */}
              <Route path="upload"  element={<Navigate to="/gantt?tab=uploads" replace />} />
              <Route path="gallery" element={<Navigate to="/gantt?tab=uploads" replace />} />
              {/* /files retired — files now live as a tab inside each project's */}
              {/* Gantt overview. Soft-redirect so existing bookmarks land there. */}
              <Route path="files" element={<Navigate to="/gantt" replace />} />
              <Route path="projects" element={<Projects />} />
              <Route path="gantt" element={<Gantt />} />
              <Route path="messages" element={<Messages />} />
              <Route path="reports" element={<Reports />} />
              <Route path="safety" element={<Safety />} />
              {/* Review queue is now a Gantt tab; redirect preserves any
                  old bookmarks + the Dashboard's Pending Review tile path. */}
              <Route path="review-queue" element={<Navigate to="/gantt?tab=review" replace />} />
              {/* Audit page retired — system-wide audit log with CSV export
                  has no current Gantt equivalent. Redirect to Dashboard; rebuild
                  as an Admin section if compliance reporting comes back into scope. */}
              <Route path="audit" element={<Navigate to="/dashboard" replace />} />
              <Route path="finance" element={<Navigate to="/reports" replace />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>

          {/* Admin-only routes */}
          <Route element={<RequireAuth requireAdmin />}>
            <Route path="/" element={<Layout />}>
              <Route path="admin" element={<Admin />} />
            </Route>
          </Route>

          {/* First-run bootstrap. Authenticated but NOT requireAdmin — the
              whole point of this screen is to mint the very first admin. */}
          <Route element={<RequireAuth />}>
            <Route path="/bootstrap-admin" element={<BootstrapAdmin />} />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>

      {/* Notification Toast */}
      {notification && (
        <Toaster
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
