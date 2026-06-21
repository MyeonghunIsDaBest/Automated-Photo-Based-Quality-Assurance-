import './customerDashboard.css';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useAppStore } from '../../store';

/**
 * Customer-facing client portal dashboard.
 *
 * This is the FINAL customer-portal design, converted faithfully from the
 * static mock at `public/customer-portal-mock.html`. All content is STATIC
 * demo data — backend wiring comes later. The whole UI is scoped under the
 * `.cust-portal` root class so its global-ish reset/styles cannot leak into
 * the rest of the app (see `customerDashboard.css`).
 */

// ── BUDGET CHART DATA (ported from the mock's Chart.js dataset) ──
interface SpendDatum {
  label: string;
  actual: number | null;
  budget: number;
  forecast: number | null;
}

const SPEND_DATA: SpendDatum[] = [
  { label: 'Q4 2025', actual: 54000, budget: 60000, forecast: null },
  { label: 'Q1 2026', actual: 82000, budget: 90000, forecast: null },
  { label: 'Q2 2026', actual: 154000, budget: 170000, forecast: null },
  { label: 'Q3 2026 (proj.)', actual: null, budget: 220000, forecast: 195000 },
];

const CHART_GREEN = '#059669';
const CHART_AMBER = '#D97706';

function formatAud(value: number): string {
  return value.toLocaleString('en-AU');
}

function yAxisTick(value: number): string {
  return `$${Math.round(value / 1000)}k`;
}

interface TooltipPayloadEntry {
  name?: string;
  value?: number | null;
  color?: string;
}

function SpendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E5E2D9',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,.08)',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} style={{ color: '#374151' }}>
          <span style={{ color: entry.color }}>● </span>
          {entry.name}:{' '}
          {entry.value === null || entry.value === undefined
            ? '—'
            : `$${formatAud(Math.round(entry.value))}`}
        </div>
      ))}
    </div>
  );
}

export default function CustomerDashboard() {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const logout = useAppStore((s) => s.logout);
  const navigate = useNavigate();

  const sg = currentProfile?.securityGroup;
  if (sg !== 'customer' && sg !== 'dev') return <Navigate to="/" replace />;
  const isDev = sg === 'dev';

  return (
    <div className="cust-portal">
      {/* DEV VIEW-SWITCHER — only for the hidden dev superuser */}
      {isDev && (
        <button
          type="button"
          className="cust-dev-switch"
          onClick={() => navigate('/dashboard')}
        >
          Switch to staff app
        </button>
      )}

      {/* ═══════════ SIDEBAR ═══════════ */}
      <aside className="sidebar" role="navigation" aria-label="Client portal navigation">

        <div className="sidebar-logo">
          <div className="logo-mark" aria-hidden="true">
            <svg viewBox="0 0 16 16"><path d="M3 8h10M8 3v10M3 5l2-2M11 5l2-2M3 11l2 2M11 11l2 2" /></svg>
          </div>
          <div>
            <div className="logo-name">Casone</div>
            <span className="logo-tag">Client Portal</span>
          </div>
        </div>

        <div className="sidebar-client">
          <div className="client-avatar" aria-hidden="true">PC</div>
          <div>
            <div className="client-name">Prestige Commercial</div>
            <div className="client-role">Stakeholder · Client</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <p className="nav-section-label">Overview</p>

          <a className="nav-item active" href="#" aria-current="page">
            <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" /><rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" /></svg>
            Dashboard
          </a>
          <a className="nav-item" href="#">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h8M2 12h5" /><circle cx="13" cy="10" r="2.5" /><path d="M13 8v-.5M13 12.5V13" /></svg>
            My Projects
            <span className="nav-badge">3</span>
          </a>
          <a className="nav-item" href="#">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 12l4-4 3 3 5-6" /></svg>
            Progress Reports
          </a>
          <a className="nav-item" href="#">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1v14M5 4h4.5a2.5 2.5 0 0 1 0 5H5M5 9h5a2.5 2.5 0 0 1 0 5H5" /></svg>
            Invoices &amp; Payments
            <span className="nav-badge amber">2</span>
          </a>

          <p className="nav-section-label">Resources</p>

          <a className="nav-item" href="#">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h8l3 3v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M11 2v3h3" /></svg>
            Documents
          </a>
          <a className="nav-item" href="#">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4zM9 8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V8z" /></svg>
            Site Photos
          </a>
          <a className="nav-item" href="#">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 3H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z" /><path d="M1 7h14" /></svg>
            Messages
            <span className="nav-badge">1</span>
          </a>
          <a className="nav-item" href="#">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 2" /></svg>
            Schedule
          </a>
        </nav>

        <div className="sidebar-footer">
          <div
            className="sidebar-footer-item"
            role="button"
            tabIndex={0}
            onClick={() => navigate('/settings')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate('/settings');
              }
            }}
          >
            <svg viewBox="0 0 15 15" aria-hidden="true"><circle cx="7.5" cy="5" r="3" /><path d="M1 14a6.5 6.5 0 0 1 13 0" /></svg>
            Account Settings
          </div>
          <div className="sidebar-footer-item">
            <svg viewBox="0 0 15 15" aria-hidden="true"><path d="M7 3H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-4M10 1l4 4-6 6H5v-3l6-6z" /></svg>
            Help &amp; Support
          </div>
          <div
            className="sidebar-footer-item"
            role="button"
            tabIndex={0}
            style={{ color: '#DC2626' }}
            onClick={() => void logout()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void logout();
              }
            }}
          >
            <svg viewBox="0 0 15 15" aria-hidden="true"><path d="M6 2H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10 10l3-3-3-3M5 7h8" /></svg>
            Sign Out
          </div>
        </div>
      </aside>

      {/* ═══════════ MAIN ═══════════ */}
      <div className="main">

        {/* TOP BAR */}
        <header className="topbar" role="banner">
          <div className="topbar-left">
            <div className="topbar-breadcrumb">
              Casone Client Portal <i>›</i> <span>Dashboard</span>
            </div>
            <div className="chip">
              <svg viewBox="0 0 11 11" aria-hidden="true"><circle cx="5.5" cy="5.5" r="4" /><path d="M5.5 3v2.5l1.5 1.5" /></svg>
              Mon, 15 Jun 2026
            </div>
          </div>
          <div className="topbar-right">
            <button className="topbar-btn" aria-label="Search">
              <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" /></svg>
            </button>
            <button className="topbar-btn" aria-label="Notifications — 2 unread">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a5 5 0 0 1 5 5v3l1.5 2.5H1.5L3 9V6a5 5 0 0 1 5-5zM6.5 13.5a1.5 1.5 0 0 0 3 0" /></svg>
              <span className="notif-dot" aria-hidden="true"></span>
            </button>
            <div className="topbar-avatar" role="img" aria-label="Prestige Commercial — logged in">PC</div>
          </div>
        </header>

        {/* CONTENT */}
        <main className="content" id="main-content">

          {/* PAGE HERO */}
          <div className="page-hero fade-up">
            <div className="page-hero-text">
              <p className="hero-greeting">Good morning, Prestige Commercial 👋</p>
              <h1 className="hero-title">Your projects are <em>on track.</em></h1>
              <p className="hero-sub">3 active sites · 2 invoices awaiting your attention · last update 2 hours ago</p>
            </div>
            <div className="hero-actions">
              <button className="btn btn-outline" aria-label="Download your latest progress report">
                <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 9V1M4 6l3 3 3-3M1 10v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" /></svg>
                Download Report
              </button>
              <button className="btn btn-emerald" aria-label="Send a message to the Casone team">
                <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M1 1h12v9H8l-4 3v-3H1z" /></svg>
                Message Casone
              </button>
            </div>
          </div>

          {/* KPI STATS */}
          <div className="grid-4 fade-up fade-up-1" role="list" aria-label="Key project metrics">
            <div className="stat-card" role="listitem">
              <div className="stat-card-top">
                <div className="stat-icon emerald" aria-hidden="true">
                  <svg viewBox="0 0 18 18"><path d="M2 9l5 5 9-9" /></svg>
                </div>
                <span className="stat-change up" aria-label="Up 12% this month">↑ 12%</span>
              </div>
              <div>
                <div className="stat-value">68<span style={{ fontSize: '18px', opacity: 0.5 }}>%</span></div>
                <div className="stat-label">Average completion across all sites</div>
              </div>
            </div>

            <div className="stat-card" role="listitem">
              <div className="stat-card-top">
                <div className="stat-icon amber" aria-hidden="true">
                  <svg viewBox="0 0 18 18"><rect x="1" y="3" width="16" height="13" rx="1.5" /><path d="M1 7h16M5 3V1M13 3V1" /></svg>
                </div>
                <span className="stat-change neutral" aria-label="14 days remaining">14 days</span>
              </div>
              <div>
                <div className="stat-value">Sep <span style={{ fontSize: '16px', fontWeight: 600 }}>30</span></div>
                <div className="stat-label">Nearest project completion</div>
              </div>
            </div>

            <div className="stat-card" role="listitem">
              <div className="stat-card-top">
                <div className="stat-icon sky" aria-hidden="true">
                  <svg viewBox="0 0 18 18"><path d="M9 1v16M4 5h7a4 4 0 0 1 0 8H4M4 13h7" /></svg>
                </div>
                <span className="stat-change up" aria-label="$12,000 cleared this month">↑ $12k</span>
              </div>
              <div>
                <div className="stat-value">$<span style={{ fontSize: '22px' }}>545k</span></div>
                <div className="stat-label">Total contract value across sites</div>
              </div>
            </div>

            <div className="stat-card" role="listitem">
              <div className="stat-card-top">
                <div className="stat-icon violet" aria-hidden="true">
                  <svg viewBox="0 0 18 18"><path d="M2 14l4-4 3 3 5-6" /><circle cx="15" cy="4" r="1.5" /></svg>
                </div>
                <span className="stat-change up" aria-label="All milestones on time">On time</span>
              </div>
              <div>
                <div className="stat-value">12<span style={{ fontSize: '16px', fontWeight: 600 }}>/15</span></div>
                <div className="stat-label">Milestones completed this quarter</div>
              </div>
            </div>
          </div>

          {/* PROJECTS */}
          <div className="section-divider fade-up fade-up-2">
            <h2 className="section-heading">Active Projects</h2>
            <a href="#" className="section-link">
              View all projects
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M6 2l4 4-4 4" /></svg>
            </a>
          </div>

          <div className="grid-3 fade-up fade-up-2">

            {/* Project 1 */}
            <div className="project-card" aria-label="CBD Office Fitout — 74% complete, active">
              <div className="project-card-accent"></div>
              <div className="project-card-body">
                <div className="project-card-header">
                  <div>
                    <div className="project-name">CBD Office Fitout</div>
                    <div className="project-client">Level 12, 200 Collins St</div>
                  </div>
                  <div className="health-pulse" aria-label="Project status: Active">
                    <div className="pulse-dot" aria-hidden="true"></div>
                    <span className="pulse-label">Active</span>
                  </div>
                </div>

                <div className="progress-stack">
                  <div className="progress-row">
                    <span className="progress-label">Overall</span>
                    <span className="progress-pct">74%</span>
                  </div>
                  <div className="progress-track" role="progressbar" aria-valuenow={74} aria-valuemin={0} aria-valuemax={100} aria-label="74% overall completion">
                    <div className="progress-fill" style={{ width: '74%' }}></div>
                  </div>
                </div>
                <div className="progress-stack">
                  <div className="progress-row">
                    <span className="progress-label" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>Electrical</span>
                    <span className="progress-pct" style={{ fontSize: '11px' }}>90%</span>
                  </div>
                  <div className="progress-track" style={{ height: '4px' }} role="progressbar" aria-valuenow={90} aria-valuemin={0} aria-valuemax={100} aria-label="90% electrical completion">
                    <div className="progress-fill" style={{ width: '90%', background: 'var(--emerald-d)' }}></div>
                  </div>
                </div>
                <div className="progress-stack" style={{ marginBottom: 0 }}>
                  <div className="progress-row">
                    <span className="progress-label" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>Fitout</span>
                    <span className="progress-pct" style={{ fontSize: '11px' }}>61%</span>
                  </div>
                  <div className="progress-track" style={{ height: '4px' }} role="progressbar" aria-valuenow={61} aria-valuemin={0} aria-valuemax={100} aria-label="61% fitout completion">
                    <div className="progress-fill" style={{ width: '61%', background: '#6EE7B7' }}></div>
                  </div>
                </div>

                <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="project-meta">
                    <span className="project-meta-item">
                      <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="2" width="10" height="9" rx="1" /><path d="M1 5h10M4 2V1M8 2V1" /></svg>
                      Due Sep 30
                    </span>
                    <span className="project-meta-item">
                      <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" /><path d="M6 4v2l1.5 1.5" /></svg>
                      8 tasks open
                    </span>
                  </div>
                  <span className="badge badge-emerald">On Schedule</span>
                </div>
              </div>
            </div>

            {/* Project 2 */}
            <div className="project-card" aria-label="Northside Warehouse — 41% complete, in progress">
              <div className="project-card-accent amber"></div>
              <div className="project-card-body">
                <div className="project-card-header">
                  <div>
                    <div className="project-name">Northside Warehouse</div>
                    <div className="project-client">14 Logistics Ave, Tullamarine</div>
                  </div>
                  <div className="health-pulse" aria-label="Project status: In progress">
                    <div className="pulse-dot amber" aria-hidden="true"></div>
                    <span className="pulse-label amber">In Progress</span>
                  </div>
                </div>

                <div className="progress-stack">
                  <div className="progress-row">
                    <span className="progress-label">Overall</span>
                    <span className="progress-pct">41%</span>
                  </div>
                  <div className="progress-track" role="progressbar" aria-valuenow={41} aria-valuemin={0} aria-valuemax={100} aria-label="41% overall completion">
                    <div className="progress-fill amber" style={{ width: '41%' }}></div>
                  </div>
                </div>
                <div className="progress-stack">
                  <div className="progress-row">
                    <span className="progress-label" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>Framing</span>
                    <span className="progress-pct" style={{ fontSize: '11px' }}>75%</span>
                  </div>
                  <div className="progress-track" style={{ height: '4px' }} role="progressbar" aria-valuenow={75} aria-valuemin={0} aria-valuemax={100} aria-label="75% framing completion">
                    <div className="progress-fill" style={{ width: '75%', background: 'var(--amber)' }}></div>
                  </div>
                </div>
                <div className="progress-stack" style={{ marginBottom: 0 }}>
                  <div className="progress-row">
                    <span className="progress-label" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>Electrical rough-in</span>
                    <span className="progress-pct" style={{ fontSize: '11px' }}>28%</span>
                  </div>
                  <div className="progress-track" style={{ height: '4px' }} role="progressbar" aria-valuenow={28} aria-valuemin={0} aria-valuemax={100} aria-label="28% electrical rough-in completion">
                    <div className="progress-fill" style={{ width: '28%', background: '#FCD34D' }}></div>
                  </div>
                </div>

                <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="project-meta">
                    <span className="project-meta-item">
                      <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="2" width="10" height="9" rx="1" /><path d="M1 5h10M4 2V1M8 2V1" /></svg>
                      Due Feb 2027
                    </span>
                    <span className="project-meta-item">
                      <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" /><path d="M6 4v2l1.5 1.5" /></svg>
                      23 tasks open
                    </span>
                  </div>
                  <span className="badge badge-amber">Slight Delay</span>
                </div>
              </div>
            </div>

            {/* Project 3 */}
            <div className="project-card" aria-label="Retail Strip Upgrade — 86% complete, finalising">
              <div className="project-card-accent sky"></div>
              <div className="project-card-body">
                <div className="project-card-header">
                  <div>
                    <div className="project-name">Retail Strip Upgrade</div>
                    <div className="project-client">Chapel St Precinct, Windsor</div>
                  </div>
                  <div className="health-pulse" aria-label="Project status: Finalising">
                    <div className="pulse-dot sky" aria-hidden="true"></div>
                    <span className="pulse-label sky">Finalising</span>
                  </div>
                </div>

                <div className="progress-stack">
                  <div className="progress-row">
                    <span className="progress-label">Overall</span>
                    <span className="progress-pct">86%</span>
                  </div>
                  <div className="progress-track" role="progressbar" aria-valuenow={86} aria-valuemin={0} aria-valuemax={100} aria-label="86% overall completion">
                    <div className="progress-fill" style={{ width: '86%', background: 'var(--sky)' }}></div>
                  </div>
                </div>
                <div className="progress-stack">
                  <div className="progress-row">
                    <span className="progress-label" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>Fit-off &amp; commissioning</span>
                    <span className="progress-pct" style={{ fontSize: '11px' }}>92%</span>
                  </div>
                  <div className="progress-track" style={{ height: '4px' }} role="progressbar" aria-valuenow={92} aria-valuemin={0} aria-valuemax={100} aria-label="92% fit-off completion">
                    <div className="progress-fill" style={{ width: '92%', background: 'var(--sky)' }}></div>
                  </div>
                </div>
                <div className="progress-stack" style={{ marginBottom: 0 }}>
                  <div className="progress-row">
                    <span className="progress-label" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>Defect rectification</span>
                    <span className="progress-pct" style={{ fontSize: '11px' }}>60%</span>
                  </div>
                  <div className="progress-track" style={{ height: '4px' }} role="progressbar" aria-valuenow={60} aria-valuemin={0} aria-valuemax={100} aria-label="60% defect rectification">
                    <div className="progress-fill" style={{ width: '60%', background: '#7DD3FC' }}></div>
                  </div>
                </div>

                <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="project-meta">
                    <span className="project-meta-item">
                      <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="2" width="10" height="9" rx="1" /><path d="M1 5h10M4 2V1M8 2V1" /></svg>
                      Due Jul 15
                    </span>
                    <span className="project-meta-item">
                      <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" /><path d="M6 4v2l1.5 1.5" /></svg>
                      4 tasks open
                    </span>
                  </div>
                  <span className="badge badge-sky">Near Completion</span>
                </div>
              </div>
            </div>
          </div>

          {/* MAIN GRID: Left (Spend + Activity) + Right (Actions + Messages + Docs) */}
          <div className="grid-main fade-up fade-up-3">

            {/* LEFT COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Spend overview chart */}
              <div className="card" aria-labelledby="spend-heading">
                <div className="card-head">
                  <div>
                    <div className="card-title" id="spend-heading">Budget Overview</div>
                    <div className="card-subtitle">Cumulative spend vs approved contract value</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn btn-sm btn-outline" aria-label="View by month">Month</button>
                    <button className="btn btn-sm btn-primary" aria-label="View by quarter — currently selected" aria-pressed="true">Quarter</button>
                  </div>
                </div>
                <div className="card-body">
                  <div className="chart-legend" aria-label="Chart legend">
                    <div className="legend-item"><div className="legend-dot" style={{ background: '#059669' }} aria-hidden="true"></div>Actual spend</div>
                    <div className="legend-item"><div className="legend-dot" style={{ background: '#D1FAE5', border: '1px solid #059669' }} aria-hidden="true"></div>Approved budget</div>
                    <div className="legend-item"><div className="legend-dot" style={{ background: '#D97706', borderStyle: 'dashed', border: '1.5px dashed #D97706' }} aria-hidden="true"></div>Forecast</div>
                  </div>
                  <div
                    className="chart-wrap chart-wrap-lg"
                    role="img"
                    aria-label="Budget overview chart showing actual spend vs approved budget per quarter. Q1: $82k spent of $90k budget. Q2: $154k of $170k. Q3: projected $210k of $220k."
                  >
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={SPEND_DATA} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
                        <CartesianGrid stroke="rgba(0,0,0,.05)" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: '#9CA3AF', fontFamily: "'Inter', sans-serif" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tickFormatter={yAxisTick}
                          tick={{ fontSize: 11, fill: '#9CA3AF', fontFamily: "'Inter', sans-serif" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip cursor={{ fill: 'rgba(0,0,0,.03)' }} content={<SpendTooltip />} />
                        <Bar
                          name="Approved budget"
                          dataKey="budget"
                          fill="rgba(5,150,105,.1)"
                          stroke={CHART_GREEN}
                          strokeWidth={1.5}
                          radius={[6, 6, 0, 0]}
                        />
                        <Bar
                          name="Actual spend"
                          dataKey="actual"
                          fill={CHART_GREEN}
                          radius={[6, 6, 0, 0]}
                        />
                        <Bar
                          name="Forecast"
                          dataKey="forecast"
                          fill="rgba(217,119,6,.15)"
                          stroke={CHART_AMBER}
                          strokeWidth={1.5}
                          strokeDasharray="5 4"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="card-footer">
                  <div style={{ display: 'flex', gap: '20px', fontSize: '12px' }}>
                    <div>
                      <div style={{ color: 'var(--ink-4)' }}>Total Spent</div>
                      <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: '18px', color: 'var(--ink)' }}>$236k</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--ink-4)' }}>Total Budget</div>
                      <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: '18px', color: 'var(--ink)' }}>$545k</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--ink-4)' }}>Remaining</div>
                      <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: '18px', color: 'var(--emerald-d)' }}>$309k</div>
                    </div>
                  </div>
                  <a href="#" className="section-link">Full budget breakdown <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M6 2l4 4-4 4" /></svg></a>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="card" aria-labelledby="activity-heading">
                <div className="card-head">
                  <div>
                    <div className="card-title" id="activity-heading">Recent Activity</div>
                    <div className="card-subtitle">Updates from your sites in the last 48 hours</div>
                  </div>
                  <button className="btn btn-sm btn-outline">View all</button>
                </div>
                <div className="timeline" role="feed" aria-label="Project activity feed">
                  <div className="timeline-item" role="article">
                    <div className="timeline-icon green" aria-hidden="true"><svg viewBox="0 0 14 14"><path d="M2 7l4 4 6-6" /></svg></div>
                    <div className="timeline-body">
                      <div className="timeline-text"><strong>CBD Office Fitout</strong> — Electrical inspection passed. Certificate of compliance issued.</div>
                      <div className="timeline-time">Today, 9:14 AM · Jordan Casone</div>
                    </div>
                    <span className="badge badge-emerald">Milestone</span>
                  </div>
                  <div className="timeline-item" role="article">
                    <div className="timeline-icon sky" aria-hidden="true"><svg viewBox="0 0 14 14"><rect x="1" y="2" width="12" height="10" rx="1.5" /><path d="M1 6h12" /></svg></div>
                    <div className="timeline-body">
                      <div className="timeline-text"><strong>Invoice #INV-2026-0188</strong> — $28,500 issued for Northside Warehouse progress claim.</div>
                      <div className="timeline-time">Today, 8:02 AM · Accounts</div>
                    </div>
                    <span className="badge badge-amber">Payment due</span>
                  </div>
                  <div className="timeline-item" role="article">
                    <div className="timeline-icon amber" aria-hidden="true"><svg viewBox="0 0 14 14"><path d="M7 1v12M3 5h5a3 3 0 0 1 0 6H3" /></svg></div>
                    <div className="timeline-body">
                      <div className="timeline-text"><strong>Retail Strip Upgrade</strong> — Final defect list submitted. 4 items flagged for rectification.</div>
                      <div className="timeline-time">Yesterday, 3:47 PM · Site Manager</div>
                    </div>
                    <span className="badge badge-sky">Action needed</span>
                  </div>
                  <div className="timeline-item" role="article">
                    <div className="timeline-icon violet" aria-hidden="true"><svg viewBox="0 0 14 14"><path d="M1 7l3.5-3.5 3 3L12 2" /></svg></div>
                    <div className="timeline-body">
                      <div className="timeline-text"><strong>Northside Warehouse</strong> — Framing phase 75% complete. Photos uploaded to site diary.</div>
                      <div className="timeline-time">Yesterday, 11:22 AM · Crew</div>
                    </div>
                    <span className="badge badge-neutral">Progress</span>
                  </div>
                  <div className="timeline-item" role="article">
                    <div className="timeline-icon green" aria-hidden="true"><svg viewBox="0 0 14 14"><path d="M3 2h8l2 2v9H1V4z" /><path d="M3 2v4h8V2" /></svg></div>
                    <div className="timeline-body">
                      <div className="timeline-text"><strong>New document available</strong> — As-built drawings for CBD fitout uploaded to your vault.</div>
                      <div className="timeline-time">Yesterday, 9:00 AM · System</div>
                    </div>
                    <span className="badge badge-neutral">Document</span>
                  </div>
                </div>
              </div>

              {/* Invoices */}
              <div className="card" aria-labelledby="invoices-heading">
                <div className="card-head">
                  <div>
                    <div className="card-title" id="invoices-heading">Invoices &amp; Payments</div>
                    <div className="card-subtitle">2 invoices awaiting payment</div>
                  </div>
                  <a href="#" className="section-link">All invoices <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M6 2l4 4-4 4" /></svg></a>
                </div>
                <div className="card-body-flush">
                  <table className="inv-table" aria-label="Invoice list">
                    <thead>
                      <tr>
                        <th scope="col">Invoice</th>
                        <th scope="col">Project</th>
                        <th scope="col">Issued</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Amount</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <div className="inv-num">#INV-2026-0188</div>
                          <div style={{ fontSize: '12px', color: 'var(--ink-3)', marginTop: '1px' }}>Progress claim · Stage 3</div>
                        </td>
                        <td>Northside Warehouse</td>
                        <td style={{ color: 'var(--ink-3)' }}>15 Jun 2026</td>
                        <td style={{ textAlign: 'right' }}><span className="inv-amount">$28,500</span></td>
                        <td><span className="badge badge-amber">Due 29 Jun</span></td>
                      </tr>
                      <tr>
                        <td>
                          <div className="inv-num">#INV-2026-0174</div>
                          <div style={{ fontSize: '12px', color: 'var(--ink-3)', marginTop: '1px' }}>Defects &amp; commissioning</div>
                        </td>
                        <td>Retail Strip Upgrade</td>
                        <td style={{ color: 'var(--ink-3)' }}>01 Jun 2026</td>
                        <td style={{ textAlign: 'right' }}><span className="inv-amount">$12,800</span></td>
                        <td><span className="badge badge-rose">Overdue</span></td>
                      </tr>
                      <tr>
                        <td>
                          <div className="inv-num">#INV-2026-0162</div>
                          <div style={{ fontSize: '12px', color: 'var(--ink-3)', marginTop: '1px' }}>Electrical fitout · Stage 2</div>
                        </td>
                        <td>CBD Office Fitout</td>
                        <td style={{ color: 'var(--ink-3)' }}>20 May 2026</td>
                        <td style={{ textAlign: 'right' }}><span className="inv-amount">$44,200</span></td>
                        <td><span className="badge badge-emerald">Paid</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="card-footer">
                  <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Total outstanding: <strong style={{ color: 'var(--rose)', fontSize: '14px' }}>$41,300</strong></div>
                  <button className="btn btn-emerald btn-sm" aria-label="Pay outstanding invoices now">Pay Now</button>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Quick Actions */}
              <div className="card" aria-labelledby="actions-heading">
                <div className="card-head">
                  <div className="card-title" id="actions-heading">Quick Actions</div>
                </div>
                <div className="quick-actions" role="list" aria-label="Quick actions">
                  <div className="quick-btn" role="listitem" tabIndex={0} aria-label="Download latest report">
                    <div className="quick-btn-icon" style={{ background: 'var(--emerald-l)', color: 'var(--emerald-d)' }} aria-hidden="true">
                      <svg viewBox="0 0 15 15"><path d="M7.5 10V2M4.5 7l3 3 3-3M2 11v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1" /></svg>
                    </div>
                    <div className="quick-btn-label">Download Report</div>
                    <div className="quick-btn-sub">Latest progress PDF</div>
                  </div>
                  <div className="quick-btn" role="listitem" tabIndex={0} aria-label="View site photos from this week">
                    <div className="quick-btn-icon" style={{ background: 'var(--sky-l)', color: 'var(--sky)' }} aria-hidden="true">
                      <svg viewBox="0 0 15 15"><rect x="1" y="3" width="13" height="10" rx="1.5" /><circle cx="7.5" cy="8" r="2.5" /><path d="M5 3l1-1.5h3L10 3" /></svg>
                    </div>
                    <div className="quick-btn-label">Site Photos</div>
                    <div className="quick-btn-sub">47 new this week</div>
                  </div>
                  <div className="quick-btn" role="listitem" tabIndex={0} aria-label="Pay outstanding invoices">
                    <div className="quick-btn-icon" style={{ background: 'var(--amber-l)', color: 'var(--amber)' }} aria-hidden="true">
                      <svg viewBox="0 0 15 15"><rect x="1" y="3" width="13" height="10" rx="1" /><path d="M1 7h13M5 7v6" /></svg>
                    </div>
                    <div className="quick-btn-label">Pay Invoices</div>
                    <div className="quick-btn-sub">$41,300 outstanding</div>
                  </div>
                  <div className="quick-btn" role="listitem" tabIndex={0} aria-label="View project schedule and Gantt chart">
                    <div className="quick-btn-icon" style={{ background: 'var(--violet-l)', color: 'var(--violet)' }} aria-hidden="true">
                      <svg viewBox="0 0 15 15"><rect x="1" y="3" width="13" height="10" rx="1" /><path d="M1 6h13M4 9h4M4 12h2" /></svg>
                    </div>
                    <div className="quick-btn-label">View Schedule</div>
                    <div className="quick-btn-sub">Gantt &amp; milestones</div>
                  </div>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="card" aria-labelledby="finance-heading">
                <div className="card-head">
                  <div className="card-title" id="finance-heading">Financial Summary</div>
                  <div className="card-subtitle">All projects · AUD excl. GST</div>
                </div>
                <div className="card-body">
                  <div className="summary-row">
                    <span className="summary-label">Total contracted</span>
                    <span className="summary-value">$545,000</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Invoiced to date</span>
                    <span className="summary-value">$236,200</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Paid to date</span>
                    <span className="summary-value green">$194,900</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Currently outstanding</span>
                    <span className="summary-value" style={{ color: 'var(--rose)' }}>$41,300</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Remaining to invoice</span>
                    <span className="summary-value" style={{ color: 'var(--ink-3)' }}>$308,800</span>
                  </div>
                  <div style={{ marginTop: '14px' }}>
                    <div className="progress-row" style={{ marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--ink-3)' }}>Contract drawn down</span>
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px' }}>43%</span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--bg)', borderRadius: 'var(--r-pill)', overflow: 'hidden', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '36%', background: 'var(--emerald)', borderRadius: 'var(--r-pill)' }}></div>
                      <div style={{ position: 'absolute', left: '36%', top: 0, height: '100%', width: '7%', background: 'var(--rose)', borderRadius: 0 }}></div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '10px', color: 'var(--ink-4)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: '7px', height: '7px', borderRadius: '2px', background: 'var(--emerald)', display: 'inline-block' }}></span>Paid</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: '7px', height: '7px', borderRadius: '2px', background: 'var(--rose)', display: 'inline-block' }}></span>Outstanding</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: '7px', height: '7px', borderRadius: '2px', background: 'var(--bg)', border: '1px solid var(--border)', display: 'inline-block' }}></span>Remaining</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Documents */}
              <div className="card" aria-labelledby="docs-heading">
                <div className="card-head">
                  <div className="card-title" id="docs-heading">Document Vault</div>
                  <a href="#" className="section-link">All docs <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M6 2l4 4-4 4" /></svg></a>
                </div>
                <div className="card-body-flush" role="list" aria-label="Recent documents">
                  <div className="doc-item" role="listitem">
                    <div className="doc-icon" style={{ background: 'var(--rose-l)' }} aria-hidden="true">
                      <svg viewBox="0 0 16 16" style={{ color: 'var(--rose)' }}><path d="M3 2h8l3 3v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M11 2v3h3" /></svg>
                    </div>
                    <div>
                      <div className="doc-name">Certificate of Compliance</div>
                      <div className="doc-meta">CBD Fitout · Added today · PDF · 1.2 MB</div>
                    </div>
                    <button className="doc-action" aria-label="Download Certificate of Compliance">
                      <svg viewBox="0 0 14 14"><path d="M7 9V1M4 6l3 3 3-3M1 10v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" /></svg>
                    </button>
                  </div>
                  <div className="doc-item" role="listitem">
                    <div className="doc-icon" style={{ background: 'var(--sky-l)' }} aria-hidden="true">
                      <svg viewBox="0 0 16 16" style={{ color: 'var(--sky)' }}><path d="M3 2h8l3 3v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M5 9h6M5 12h4M11 2v3h3" /></svg>
                    </div>
                    <div>
                      <div className="doc-name">As-Built Drawings — Level 12</div>
                      <div className="doc-meta">CBD Fitout · Yesterday · DWG · 8.7 MB</div>
                    </div>
                    <button className="doc-action" aria-label="Download As-Built Drawings">
                      <svg viewBox="0 0 14 14"><path d="M7 9V1M4 6l3 3 3-3M1 10v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" /></svg>
                    </button>
                  </div>
                  <div className="doc-item" role="listitem">
                    <div className="doc-icon" style={{ background: 'var(--amber-l)' }} aria-hidden="true">
                      <svg viewBox="0 0 16 16" style={{ color: 'var(--amber)' }}><path d="M3 2h8l3 3v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M5 7h6M5 9h6M5 11h4M11 2v3h3" /></svg>
                    </div>
                    <div>
                      <div className="doc-name">Progress Report — Week 22</div>
                      <div className="doc-meta">All projects · 8 Jun · PDF · 3.1 MB</div>
                    </div>
                    <button className="doc-action" aria-label="Download Progress Report Week 22">
                      <svg viewBox="0 0 14 14"><path d="M7 9V1M4 6l3 3 3-3M1 10v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" /></svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="card" aria-labelledby="messages-heading">
                <div className="card-head">
                  <div>
                    <div className="card-title" id="messages-heading">Messages</div>
                    <div className="card-subtitle">Direct line to your Casone team</div>
                  </div>
                  <span className="badge badge-emerald" aria-label="1 unread message">1 new</span>
                </div>
                <div className="msg-thread" role="log" aria-label="Message thread with Casone team" aria-live="polite">
                  <div className="msg incoming" role="article">
                    <div className="msg-avatar casone" aria-label="Jordan Casone">JC</div>
                    <div>
                      <div className="msg-bubble">Hi! The electrical inspection for the CBD fitout passed this morning. Cert uploaded to your vault — let me know if you need anything else before handover.</div>
                      <div className="msg-time">Today, 9:20 AM</div>
                    </div>
                  </div>
                  <div className="msg outgoing" role="article">
                    <div className="msg-avatar client" aria-label="Prestige Commercial">PC</div>
                    <div>
                      <div className="msg-bubble">That's great news! Thanks for the fast update. Can we schedule a handover walk-through for next week?</div>
                      <div className="msg-time">Today, 9:34 AM · You</div>
                    </div>
                  </div>
                  <div className="msg incoming" role="article">
                    <div className="msg-avatar casone" aria-label="Jordan Casone">JC</div>
                    <div>
                      <div className="msg-bubble">Absolutely — does Tuesday the 18th at 10am work for you? I'll bring the site manager.</div>
                      <div className="msg-time">Today, 9:41 AM</div>
                    </div>
                  </div>
                </div>
                <div className="msg-compose" role="group" aria-label="Compose a message">
                  <input type="text" className="msg-input" placeholder="Reply to Casone team…" aria-label="Message input" />
                  <button className="msg-send" aria-label="Send message">
                    <svg viewBox="0 0 15 15" aria-hidden="true"><path d="M1 7h12M8 2l6 5-6 5" /></svg>
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* FOOTER */}
          <footer style={{ marginTop: '8px', padding: '20px 0', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--ink-4)' }} role="contentinfo">
            <span>© 2026 Casone Electrical Pty Ltd · Melbourne, Australia</span>
            <span>SiteProof Client Portal v2.4 · <a href="#" style={{ color: 'var(--emerald)', textDecoration: 'none' }}>Help</a> · <a href="#" style={{ color: 'var(--emerald)', textDecoration: 'none' }}>Privacy</a></span>
          </footer>

        </main>
      </div>
    </div>
  );
}
