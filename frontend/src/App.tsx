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
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="upload" element={<Upload />} />
          <Route path="gallery" element={<Gallery />} />
          <Route path="files" element={<Files />} />
          <Route path="gantt" element={<Gantt />} />
          <Route path="messages" element={<Messages />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
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
