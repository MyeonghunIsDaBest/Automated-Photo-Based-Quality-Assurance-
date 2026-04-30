import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Gallery from './pages/Gallery';
import Gantt from './pages/Gantt';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Messages from './pages/Messages';
import Files from './pages/Files';
import Projects from './pages/Projects';
import Safety from './pages/Safety';
import Admin from './pages/Admin';
import BootstrapAdmin from './pages/admin/BootstrapAdmin';
import RequireAuth from './components/RequireAuth';
import QuickActionsSidebar from './components/layout/QuickActionsSidebar';
import { Toaster } from './components/ui/Toaster';

function App() {
  const { notification, setNotification, isAuthenticated } = useAppStore();

  return (
    <BrowserRouter>
      {isAuthenticated && <QuickActionsSidebar />}
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />

        {/* Protected Routes */}
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="upload" element={<Upload />} />
            <Route path="gallery" element={<Gallery />} />
            <Route path="files" element={<Files />} />
            <Route path="projects" element={<Projects />} />
            <Route path="gantt" element={<Gantt />} />
            <Route path="messages" element={<Messages />} />
            <Route path="reports" element={<Reports />} />
            <Route path="safety" element={<Safety />} />
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

      {/* Notification Toast */}
      {notification && (
        <Toaster
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
    </BrowserRouter>
  );
}

export default App;
