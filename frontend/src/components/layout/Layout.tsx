import { Outlet, Navigate } from 'react-router-dom';
import TopNav from './TopNav';
import { useAppStore } from '../../store';

export default function Layout() {
  const { isAuthenticated } = useAppStore();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav />
      <main className="">
        <Outlet />
      </main>
    </div>
  );
}
