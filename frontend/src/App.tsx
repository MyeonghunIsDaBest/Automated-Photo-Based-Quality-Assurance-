import { Suspense, useEffect } from 'react';
import { lazyWithRetry, clearChunkReloadGuard } from './lib/lazyWithRetry';
import { PageSkeleton } from './components/ui/skeleton';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MotionConfig, motion } from 'framer-motion';
import { useAppStore } from './store';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import RequireAuth from './components/RequireAuth';
import QuickActionsSidebar from './components/layout/QuickActionsSidebar';
import { Toaster } from './components/ui/Toaster';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { pageTransition } from './lib/motion/variants';
import { canViewJobsBoard } from './lib/permissions';

// Code-split every authenticated page. Login stays eager (it's the very first
// paint for unauthed users, so lazy-loading it just adds an extra round-trip
// before the form appears). Layout + RequireAuth are also eager because every
// authed page renders inside them â€” splitting them buys nothing.
//
// Vite picks up the dynamic-import call sites automatically and emits one
// chunk per page; the route's first visit fetches the chunk, then it's
// cached. SPA navigation between already-visited routes stays instant.
//
// `lazyWithRetry` (lib/lazyWithRetry.ts) wraps `lazy()` so a failed dynamic
// import is retried once, then falls back to a one-shot full reload for stale
// chunk hashes. Shared with nested lazy views (JobsHub's Board/Projects).

const Dashboard      = lazyWithRetry(() => import('./pages/Dashboard'));
const Gantt          = lazyWithRetry(() => import('./pages/Gantt'));
const Settings       = lazyWithRetry(() => import('./pages/Settings'));
const Messages       = lazyWithRetry(() => import('./pages/Messages'));
const Projects       = lazyWithRetry(() => import('./pages/Projects'));
// ProjectsRouteSwitch is defined below and uses Projects inline.
const Safety         = lazyWithRetry(() => import('./pages/Safety'));
const Admin          = lazyWithRetry(() => import('./pages/Admin'));
const BootstrapAdmin = lazyWithRetry(() => import('./pages/admin/BootstrapAdmin'));
const Pricing        = lazyWithRetry(() => import('./pages/Pricing'));
const RoleHome         = lazyWithRetry(() => import('./pages/home/RoleHome'));
const RoleHomeRedirect = lazyWithRetry(() => import('./pages/home/RoleHomeRedirect'));
const SupplierWorkspace = lazyWithRetry(() => import('./pages/supplier/SupplierWorkspace'));
const SponsorCockpit     = lazyWithRetry(() => import('./pages/sponsor/SponsorCockpit'));
const Maintenance        = lazyWithRetry(() => import('./pages/maintenance/Maintenance'));
const JobsHub            = lazyWithRetry(() => import('./pages/jobs/JobsHub'));
const CustomerPortal     = lazyWithRetry(() => import('./pages/customer/CustomerPortal'));
const Catalogue          = lazyWithRetry(() => import('./pages/catalogue/Catalogue'));
const Sales              = lazyWithRetry(() => import('./pages/sales/Sales'));

// Route-chunk fallback: a page-shaped skeleton (masthead band + content
// blocks) instead of a spinner â€” navigation keeps a stable, on-palette layout
// while the next page's code loads, never a blank flash.
function RouteFallback() {
  return <PageSkeleton />;
}

// D3 â€” /projects route switcher. Internal staff (canViewJobsBoard) are sent to
// the hub's Projects view so they never see a standalone Projects page;
// suppliers and stakeholders who lack Jobs-Board access keep the standalone page.
function ProjectsRouteSwitch() {
  const { currentProfile, currentUser } = useAppStore();
  if (canViewJobsBoard(currentProfile ?? currentUser)) {
    return <Navigate to="/jobs?view=projects" replace />;
  }
  return <ErrorBoundary label="Projects"><Projects /></ErrorBoundary>;
}

// Routes live inside an inner component so `useLocation` can read the active
// path. The route-level <motion.div> is keyed by pathname so each navigation
// re-runs the ENTER fade only.
//
// WHY no AnimatePresence/mode="wait" here: the app is full of redirect routes
// (/projects, /maintenance, /reports, /finance, /, â€¦) that fire a second
// navigation the instant they mount. mode="wait" holds the new page hostage
// until the old page's exit animation completes, and back-to-back key changes
// during that window can drop the incoming child entirely â€” the "white page
// until manual reload" bug. Enter-only transitions cannot strand the user:
// the new page mounts immediately, worst case without its fade.
function AppRoutes() {
  const location = useLocation();
  // Clear the one-shot reload guard after any successful navigation, so a
  // chunk-load failure later in the session can still trigger one reload.
  useEffect(() => {
    clearChunkReloadGuard();
  }, [location.pathname]);
  return (
      <motion.div
        key={location.pathname}
        variants={pageTransition}
        initial="hidden"
        animate="visible"
        className="min-h-screen"
      >
        <Suspense fallback={<RouteFallback />}>
          <Routes location={location}>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            {/* /pricing is the marketing landing for prospects â€” public so a
                stakeholder can review tiers and run the ROI calculator without
                creating an account. */}
            <Route path="/pricing" element={<Pricing />} />

            {/* Protected Routes */}
            <Route element={<RequireAuth />}>
              <Route path="/" element={<Layout />}>
                {/* Smart redirect: field roles â†’ /home (editorial landing),
                    admins / PMs â†’ /dashboard (data-dense panel). */}
                <Route index element={<RoleHomeRedirect />} />
                <Route path="home" element={<ErrorBoundary label="Home"><RoleHome /></ErrorBoundary>} />
                <Route path="dashboard" element={<ErrorBoundary label="Dashboard"><Dashboard /></ErrorBoundary>} />
                {/* Supplier cockpit â€” vendors land here (role-experiences). */}
                <Route path="supplier" element={<ErrorBoundary label="Supplier"><SupplierWorkspace /></ErrorBoundary>} />
                {/* Sponsor cockpit â€” stakeholders (finance sponsors) land here. */}
                <Route path="sponsor" element={<ErrorBoundary label="Sponsor"><SponsorCockpit /></ErrorBoundary>} />
                {/* Customer portal â€” external property owners land here (maintenance only). */}
                <Route path="customer" element={<ErrorBoundary label="Customer"><CustomerPortal /></ErrorBoundary>} />
                {/* Upload + Gallery retired as standalone pages â€” UploadsTab on
                    the Gantt covers project-scoped capture + a recent-photos
                    grid. Old links + Dashboard / Safety / Tasks click-throughs
                    using ?photo= or ?task= deep-links resolve to the tab; the
                    per-photo focus is a known follow-up. */}
                <Route path="upload"  element={<Navigate to="/gantt?tab=uploads" replace />} />
                <Route path="gallery" element={<Navigate to="/gantt?tab=uploads" replace />} />
                {/* /files retired â€” files now live as a tab inside each project's */}
                {/* Gantt overview. Soft-redirect so existing bookmarks land there. */}
                <Route path="files" element={<Navigate to="/gantt" replace />} />
                {/* /projects: internal staff (who can see the Jobs Board) get the hub's
                    Projects view; suppliers/stakeholders keep the standalone Projects page. */}
                <Route path="projects" element={<ProjectsRouteSwitch />} />
                <Route path="gantt" element={<ErrorBoundary label="Gantt"><Gantt /></ErrorBoundary>} />
                <Route path="messages" element={<ErrorBoundary label="Messages"><Messages /></ErrorBoundary>} />
                {/* /reports retired â€” Progress/Financial/Sign-offs live in the
                    Gantt reports tab; Audit lives on Dashboard. Legacy bookmarks
                    land on the Gantt reports tab automatically. */}
                <Route path="reports" element={<Navigate to="/gantt?tab=reports" replace />} />
                <Route path="safety" element={<ErrorBoundary label="Safety"><Safety /></ErrorBoundary>} />
                {/* Legacy /maintenance â€” now lives at /customers. Redirect preserves old bookmarks. */}
                <Route path="maintenance" element={<Navigate to="/customers" replace />} />
                <Route path="customers" element={<ErrorBoundary label="Customers"><Maintenance /></ErrorBoundary>} />
                <Route path="jobs" element={<ErrorBoundary label="Jobs"><JobsHub /></ErrorBoundary>} />
                <Route path="catalogue" element={<ErrorBoundary label="Catalogue"><Catalogue /></ErrorBoundary>} />
                <Route path="sales" element={<ErrorBoundary label="Sales"><Sales /></ErrorBoundary>} />
                {/* Review queue is now a Gantt tab; redirect preserves any
                    old bookmarks + the Dashboard's Pending Review tile path. */}
                <Route path="review-queue" element={<Navigate to="/gantt?tab=review" replace />} />
                {/* Audit page retired â€” system-wide audit log with CSV export
                    has no current Gantt equivalent. Redirect to Dashboard; rebuild
                    as an Admin section if compliance reporting comes back into scope. */}
                <Route path="audit" element={<Navigate to="/dashboard" replace />} />
                <Route path="finance" element={<Navigate to="/gantt?tab=finance" replace />} />
                <Route path="settings" element={<ErrorBoundary label="Settings"><Settings /></ErrorBoundary>} />
              </Route>
            </Route>

            {/* Admin-only routes */}
            <Route element={<RequireAuth requireAdmin />}>
              <Route path="/" element={<Layout />}>
                <Route path="admin" element={<ErrorBoundary label="Admin"><Admin /></ErrorBoundary>} />
              </Route>
            </Route>

            {/* First-run bootstrap. Authenticated but NOT requireAdmin â€” the
                whole point of this screen is to mint the very first admin. */}
            <Route element={<RequireAuth />}>
              <Route path="/bootstrap-admin" element={<ErrorBoundary label="Bootstrap Admin"><BootstrapAdmin /></ErrorBoundary>} />
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </motion.div>
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
