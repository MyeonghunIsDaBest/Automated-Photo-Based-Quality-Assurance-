import { lazy, Suspense, useEffect, type ComponentType, type LazyExoticComponent } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useAppStore } from './store';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import RequireAuth from './components/RequireAuth';
import QuickActionsSidebar from './components/layout/QuickActionsSidebar';
import { Toaster } from './components/ui/Toaster';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { pageTransition } from './lib/motion/variants';

// Code-split every authenticated page. Login stays eager (it's the very first
// paint for unauthed users, so lazy-loading it just adds an extra round-trip
// before the form appears). Layout + RequireAuth are also eager because every
// authed page renders inside them — splitting them buys nothing.
//
// Vite picks up the dynamic-import call sites automatically and emits one
// chunk per page; the route's first visit fetches the chunk, then it's
// cached. SPA navigation between already-visited routes stays instant.
//
// `lazyWithRetry` wraps `lazy()` so a failed dynamic import is re-attempted
// once before bubbling to the ErrorBoundary. Two failure modes it covers:
//   • Prod: a stale `index.html` references a chunk hash that no longer
//     exists after a redeploy — the retry still fails, so we fall through to
//     a one-shot full reload that picks up the new index.html with current
//     hashes.
//   • Dev: a Vite dev-server / HMR hiccup drops a single fetch — the silent
//     retry succeeds and the user sees nothing.
const CHUNK_RELOAD_KEY = 'chunk-reload-attempted';
const CHUNK_ERROR_RE = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i;

function lazyWithRetry<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await loader();
    } catch {
      try {
        return await loader();
      } catch (secondErr) {
        const msg = secondErr instanceof Error ? secondErr.message : String(secondErr);
        if (CHUNK_ERROR_RE.test(msg) && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
          window.location.reload();
          return await new Promise<never>(() => {});
        }
        throw secondErr;
      }
    }
  });
}

const Dashboard      = lazyWithRetry(() => import('./pages/Dashboard'));
const Gantt          = lazyWithRetry(() => import('./pages/Gantt'));
const Reports        = lazyWithRetry(() => import('./pages/Reports'));
const Settings       = lazyWithRetry(() => import('./pages/Settings'));
const Messages       = lazyWithRetry(() => import('./pages/Messages'));
const Projects       = lazyWithRetry(() => import('./pages/Projects'));
const Safety         = lazyWithRetry(() => import('./pages/Safety'));
const Admin          = lazyWithRetry(() => import('./pages/Admin'));
const BootstrapAdmin = lazyWithRetry(() => import('./pages/admin/BootstrapAdmin'));
const Pricing        = lazyWithRetry(() => import('./pages/Pricing'));
const RoleHome         = lazyWithRetry(() => import('./pages/home/RoleHome'));
const RoleHomeRedirect = lazyWithRetry(() => import('./pages/home/RoleHomeRedirect'));

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

// Routes live inside an inner component so `useLocation` can read the active
// path. AnimatePresence keys the route-level <motion.div> by pathname so each
// navigation runs the exit -> enter dance defined in `pageTransition`.
// `mode="wait"` ensures the outgoing page finishes its exit before the new one
// starts entering — prevents two pages overlapping mid-fade.
function AppRoutes() {
  const location = useLocation();
  // Clear the one-shot reload guard after any successful navigation, so a
  // chunk-load failure later in the session can still trigger one reload.
  useEffect(() => {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  }, [location.pathname]);
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={pageTransition}
        initial="hidden"
        animate="visible"
        exit="exit"
        // min-h ensures the fading-out page keeps occupying the viewport so the
        // scrollbar doesn't flash during the swap.
        className="min-h-screen"
      >
        <Suspense fallback={<RouteFallback />}>
          <Routes location={location}>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            {/* /pricing is the marketing landing for prospects — public so a
                stakeholder can review tiers and run the ROI calculator without
                creating an account. */}
            <Route path="/pricing" element={<Pricing />} />

            {/* Protected Routes */}
            <Route element={<RequireAuth />}>
              <Route path="/" element={<Layout />}>
                {/* Smart redirect: field roles → /home (editorial landing),
                    admins / PMs → /dashboard (data-dense panel). */}
                <Route index element={<RoleHomeRedirect />} />
                <Route path="home" element={<ErrorBoundary label="Home"><RoleHome /></ErrorBoundary>} />
                <Route path="dashboard" element={<ErrorBoundary label="Dashboard"><Dashboard /></ErrorBoundary>} />
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
                <Route path="projects" element={<ErrorBoundary label="Projects"><Projects /></ErrorBoundary>} />
                <Route path="gantt" element={<ErrorBoundary label="Gantt"><Gantt /></ErrorBoundary>} />
                <Route path="messages" element={<ErrorBoundary label="Messages"><Messages /></ErrorBoundary>} />
                <Route path="reports" element={<ErrorBoundary label="Reports"><Reports /></ErrorBoundary>} />
                <Route path="safety" element={<ErrorBoundary label="Safety"><Safety /></ErrorBoundary>} />
                {/* Review queue is now a Gantt tab; redirect preserves any
                    old bookmarks + the Dashboard's Pending Review tile path. */}
                <Route path="review-queue" element={<Navigate to="/gantt?tab=review" replace />} />
                {/* Audit page retired — system-wide audit log with CSV export
                    has no current Gantt equivalent. Redirect to Dashboard; rebuild
                    as an Admin section if compliance reporting comes back into scope. */}
                <Route path="audit" element={<Navigate to="/dashboard" replace />} />
                <Route path="finance" element={<Navigate to="/reports" replace />} />
                <Route path="settings" element={<ErrorBoundary label="Settings"><Settings /></ErrorBoundary>} />
              </Route>
            </Route>

            {/* Admin-only routes */}
            <Route element={<RequireAuth requireAdmin />}>
              <Route path="/" element={<Layout />}>
                <Route path="admin" element={<ErrorBoundary label="Admin"><Admin /></ErrorBoundary>} />
              </Route>
            </Route>

            {/* First-run bootstrap. Authenticated but NOT requireAdmin — the
                whole point of this screen is to mint the very first admin. */}
            <Route element={<RequireAuth />}>
              <Route path="/bootstrap-admin" element={<ErrorBoundary label="Bootstrap Admin"><BootstrapAdmin /></ErrorBoundary>} />
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  const { notification, setNotification, isAuthenticated } = useAppStore();

  return (
    <ErrorBoundary label="App root">
      {/* reducedMotion="user" honours the OS-level preference. Every motion
          variant downstream becomes a no-op for users who set that flag. */}
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          {isAuthenticated && <QuickActionsSidebar />}
          <AppRoutes />

          {/* Notification Toast */}
          {notification && (
            <Toaster
              message={notification.message}
              type={notification.type}
              onClose={() => setNotification(null)}
            />
          )}
        </BrowserRouter>
      </MotionConfig>
    </ErrorBoundary>
  );
}

export default App;
