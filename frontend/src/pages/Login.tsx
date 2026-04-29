import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { Building2, Mail, ArrowRight, Users } from 'lucide-react';

const demoUsers = [
  { email: 'admin@siteproof.com', role: 'Admin + Finance', name: 'John Anderson', summary: 'Full access incl. Finance' },
  { email: 'supervisor@siteproof.com', role: 'Site Supervisor', name: 'Maria Garcia', summary: 'Edit Gantt, upload photos' },
  { email: 'admin@school.edu', role: 'Client', name: 'Dr. Sarah Chen', summary: 'Read-only Gantt, can leave notes' },
  { email: 'finance@school.edu', role: 'Client + Finance', name: 'Robert Lin', summary: 'Client view + Finance access' },
  { email: 'inspector@qa.com', role: 'QA Inspector', name: 'Mike Thompson', summary: 'Read + accuracy notes' },
  { email: 'finance@siteproof.com', role: 'Finance', name: 'Priya Patel', summary: 'Finance only' },
];

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAppStore();
  const [email, setEmail] = useState('admin@siteproof.com');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      await login(email);
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid email. Please try a demo account.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectDemoUser = (userEmail: string) => {
    setEmail(userEmail);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Side - Branding */}
      <div className="flex w-1/2 flex-col justify-center bg-gradient-to-br from-blue-600 to-indigo-700 p-12 text-white">
        <div className="mb-8">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
            <Building2 className="h-10 w-10" />
          </div>
          <h1 className="mb-4 text-4xl font-bold">SiteProof</h1>
          <p className="text-xl text-blue-100">
            Automated Photo-Based QA System for Construction
          </p>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 rounded-full bg-white/20 p-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold">AI-Powered Analysis</h3>
              <p className="text-blue-100">Automatic progress detection from photos</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-1 rounded-full bg-white/20 p-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold">Real-Time Gantt Updates</h3>
              <p className="text-blue-100">Timeline automatically reflects progress</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-1 rounded-full bg-white/20 p-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold">Complete Audit Trail</h3>
              <p className="text-blue-100">Every action timestamped and logged</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right Side - Login Form */}
      <div className="flex w-1/2 flex-col justify-center bg-white p-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900">Welcome back</h2>
            <p className="text-slate-500">Select a demo account to continue</p>
          </div>
          
          {/* Demo User Selection */}
          <div className="mb-8">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
              <Users className="h-4 w-4" />
              Demo Accounts
            </h3>
            <div className="grid gap-2">
              {demoUsers.map((user) => (
                <button
                  key={user.email}
                  onClick={() => selectDemoUser(user.email)}
                  className={`flex items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                    email === user.email
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{user.name}</p>
                    <p className="text-sm text-slate-500">{user.email}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{user.summary}</p>
                  </div>
                  <span className="ml-3 shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {user.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>
            
            {error && (
              <p className="mb-4 text-sm text-red-600">{error}</p>
            )}
            
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>
          
          <p className="mt-6 text-center text-sm text-slate-500">
            Demo mode - No password required
          </p>
        </div>
      </div>
    </div>
  );
}
