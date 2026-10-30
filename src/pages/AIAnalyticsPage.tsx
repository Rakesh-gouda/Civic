import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Cpu,
  TrendingUp,
  Layers,
  MapPin,
  ShieldCheck,
  Clock,
  Download,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Activity,
} from 'lucide-react';
import { platformApi, type AnalyticsResponse } from '../services/api';
import { useToast } from '../context/ToastContext';
import { StatCard } from '../components/common/StatCard';
import { CategoryBadge, PriorityBadge, StatusBadge } from '../components/common/Badge';

type TrendView = 'received' | 'resolved' | 'duplicates';

const TREND_LABELS: Record<TrendView, string> = {
  received: 'Received',
  resolved: 'Resolved',
  duplicates: 'Duplicate links',
};

function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'No data';
  if (value < 24) return `${value.toFixed(1)} h`;
  return `${(value / 24).toFixed(1)} days`;
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const AIAnalyticsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [trendView, setTrendView] = useState<TrendView>('received');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await platformApi.analytics();
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load analytics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const maxTrend = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.months.map(m => Math.max(m.received, m.resolved, m.duplicates)));
  }, [data]);

  const maxCategory = useMemo(() => {
    if (!data || data.categories.length === 0) return 1;
    return Math.max(1, ...data.categories.map(c => c.count));
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    const rows: string[][] = [
      ['Section', 'Label', 'Received/Count', 'Resolved', 'Duplicate links', 'Percentage', 'Avg hours'],
    ];
    data.months.forEach(m =>
      rows.push(['Month', `${m.month} ${m.key.slice(0, 4)}`, String(m.received), String(m.resolved), String(m.duplicates), '', '']),
    );
    data.categories.forEach(c =>
      rows.push(['Category', c.label, String(c.count), '', '', String(c.percentage), '']),
    );
    data.wards.forEach(w =>
      rows.push(['Ward', w.ward, String(w.complaints), `${w.resolvedPercent}%`, '', '', w.avgHours === null ? '' : String(w.avgHours)]),
    );
    data.departments.forEach(d =>
      rows.push([
        'Department',
        d.name,
        String(d.activeComplaints),
        String(d.resolvedThisMonth),
        '',
        d.slaComplianceRate === null ? '' : `${d.slaComplianceRate}%`,
        d.avgResolutionHours === null ? '' : String(d.avgResolutionHours),
      ]),
    );

    const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `civictrack-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('The analytics snapshot was exported as a CSV file.', 'success', 'Export complete');
  };

  const hasData = Boolean(data && data.kpis.totalComplaints > 0);

  return (
    <div className="bg-slate-50 min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
              <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
              Operational analytics
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
              AI analytics &amp; civic insights
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl">
              Every figure below is calculated by the backend from stored complaint records. The analytics layer does
              not invent trends or forecasts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => load(true)}
              disabled={refreshing || loading}
              className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-60"
            >
              {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={!data}
              className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start justify-between gap-3">
            <span className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </span>
            <button type="button" onClick={() => load()} className="font-bold underline flex-shrink-0">
              Retry
            </button>
          </div>
        )}

        {data?.demoData && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            These analytics include seeded demonstration complaints. They are real database rows, not live municipal
            figures.
          </div>
        )}

        {!data?.kpis.aiConfigured && data && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-600 flex items-start gap-2">
            <Cpu className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
            <span>
              The Gemini AI service is not configured on this server, so no complaint has been classified
              automatically. Add <code className="font-mono bg-slate-100 px-1 rounded">GEMINI_API_KEY</code> to the
              server environment and re-run the analysis from complaint management.
            </span>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard
            title="Total complaints"
            value={loading || !data ? '…' : data.kpis.totalComplaints}
            subtitle="All stored records"
            icon={<Layers className="w-5 h-5 text-blue-600" />}
            accentColor="blue"
          />
          <StatCard
            title="Resolved rate"
            value={loading || !data ? '…' : `${data.kpis.resolvedRate}%`}
            subtitle="Resolved or closed"
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            accentColor="emerald"
          />
          <StatCard
            title="Avg resolution"
            value={loading || !data ? '…' : formatHours(data.kpis.avgResolutionHours)}
            subtitle="For resolved records"
            icon={<Clock className="w-5 h-5 text-amber-600" />}
            accentColor="amber"
          />
          <StatCard
            title="Active critical"
            value={loading || !data ? '…' : data.kpis.activeCritical}
            subtitle="Critical and still open"
            icon={<AlertTriangle className="w-5 h-5 text-rose-600" />}
            accentColor="rose"
          />
          <StatCard
            title="AI analysed"
            value={loading || !data ? '…' : data.kpis.aiAnalyzed}
            subtitle={data ? `Model: ${data.kpis.aiModel}` : 'Gemini results stored'}
            icon={<Cpu className="w-5 h-5 text-purple-600" />}
            accentColor="purple"
          />
          <StatCard
            title="Duplicate links"
            value={loading || !data ? '…' : data.kpis.duplicateLinks}
            subtitle="Admin-confirmed only"
            icon={<Activity className="w-5 h-5 text-slate-700" />}
            accentColor="navy"
          />
        </div>

        {!loading && !hasData && !error && (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-2">
            <BarChart3 className="w-10 h-10 text-slate-300 mx-auto" />
            <h2 className="text-base font-bold text-slate-900">No analytics data yet</h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Analytics appear once complaints exist in the database. Submit a complaint or load the demonstration
              dataset to populate this page.
            </p>
          </div>
        )}

        {hasData && data && (
          <>
            {/* Trend + AI status */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-blue-600" />
                      Six-month complaint trend
                    </h2>
                    <p className="text-xs text-slate-500">Recorded complaints, resolutions and duplicate links by month.</p>
                  </div>
                  <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden text-[11px] font-bold">
                    {(Object.keys(TREND_LABELS) as TrendView[]).map(view => (
                      <button
                        key={view}
                        type="button"
                        onClick={() => setTrendView(view)}
                        className={`px-3 py-1.5 transition-colors ${
                          trendView === view
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {TREND_LABELS[view]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-end gap-3 sm:gap-5 h-52 border-b border-slate-200 pb-2">
                  {data.months.map(month => {
                    const value = month[trendView];
                    const height = Math.max(2, (value / maxTrend) * 100);
                    const color =
                      trendView === 'received' ? 'bg-blue-500' : trendView === 'resolved' ? 'bg-emerald-500' : 'bg-amber-500';
                    return (
                      <div key={month.key} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                        <span className="text-[11px] font-bold text-slate-700 tabular-nums">{value}</span>
                        <div
                          className={`w-full rounded-t-md ${color} transition-all`}
                          style={{ height: `${height}%` }}
                          title={`${month.month} ${month.key.slice(0, 4)}: ${value}`}
                        />
                        <span className="text-[10px] text-slate-500 font-semibold">{month.month}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  {(['received', 'resolved', 'duplicates'] as TrendView[]).map(view => {
                    const total = data.months.reduce((sum, m) => sum + m[view], 0);
                    return (
                      <div key={view} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {TREND_LABELS[view]} (6 mo)
                        </span>
                        <strong className="text-lg text-slate-900 tabular-nums">{total}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-900 rounded-2xl p-6 text-white space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-blue-300" />
                    AI service status
                  </h2>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      data.kpis.aiConfigured
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    {data.kpis.aiConfigured ? 'Configured' : 'Not configured'}
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-slate-400">Model</span>
                    <strong className="font-mono">{data.kpis.aiModel}</strong>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-slate-400">Stored analyses</span>
                    <strong>{data.kpis.aiAnalyzed}</strong>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-slate-400">Overdue open</span>
                    <strong>{data.kpis.overdue}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Generated</span>
                    <strong>{new Date(data.generatedAt).toLocaleString()}</strong>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Classification, summaries, duplicate suggestions and priority scores are produced only by the
                  configured Gemini backend. If the key is missing, the API returns an explicit error instead of a
                  fabricated result, and administrators can still review complaints manually.
                </p>

                <button
                  type="button"
                  onClick={() => navigate('/complaints-table')}
                  className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Open complaint management
                </button>
              </div>
            </div>

            {/* Categories + wards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    Complaints by category
                  </h2>
                  <p className="text-xs text-slate-500">Share of all stored complaints.</p>
                </div>

                {data.categories.length === 0 ? (
                  <p className="text-xs text-slate-500">No categories recorded.</p>
                ) : (
                  <div className="space-y-3">
                    {data.categories.map(row => (
                      <div key={row.category} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <CategoryBadge category={row.category as never} showIcon={false} />
                          <span className="font-bold text-slate-700 tabular-nums">
                            {row.count} <span className="text-slate-400 font-medium">({row.percentage}%)</span>
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.max(3, (row.count / maxCategory) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    Ward performance
                  </h2>
                  <p className="text-xs text-slate-500">Complaint volume, resolution share and average resolution time.</p>
                </div>

                {data.wards.length === 0 ? (
                  <p className="text-xs text-slate-500">No ward data recorded.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2 pr-2">Ward</th>
                          <th className="py-2 px-2 text-right">Complaints</th>
                          <th className="py-2 px-2 text-right">Resolved</th>
                          <th className="py-2 pl-2 text-right">Avg time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.wards.map(ward => (
                          <tr key={ward.ward}>
                            <td className="py-2.5 pr-2 font-semibold text-slate-800">{ward.ward}</td>
                            <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">{ward.complaints}</td>
                            <td className="py-2.5 px-2 text-right tabular-nums">
                              <span
                                className={
                                  ward.resolvedPercent >= 60
                                    ? 'text-emerald-700 font-bold'
                                    : ward.resolvedPercent >= 30
                                      ? 'text-amber-700 font-bold'
                                      : 'text-rose-700 font-bold'
                                }
                              >
                                {ward.resolvedPercent}%
                              </span>
                            </td>
                            <td className="py-2.5 pl-2 text-right tabular-nums text-slate-500">
                              {ward.avgHours === null ? '—' : `${ward.avgHours} h`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Departments */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-purple-600" />
                    Department performance
                  </h2>
                  <p className="text-xs text-slate-500">Workload and SLA compliance calculated from complaint records.</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/departments')}
                  className="text-xs font-bold text-blue-600 hover:underline flex-shrink-0"
                >
                  Manage departments
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3 text-right">Active</th>
                      <th className="py-2.5 px-3 text-right">Resolved</th>
                      <th className="py-2.5 px-3 text-right">Avg resolution</th>
                      <th className="py-2.5 px-3 text-right">SLA compliance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.departments.map(dept => (
                      <tr key={dept.id}>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{dept.name}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">{dept.activeComplaints}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">{dept.resolvedThisMonth}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-slate-500">
                          {dept.avgResolutionHours === null ? '—' : `${dept.avgResolutionHours} h`}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-800">
                          {dept.slaComplianceRate === null ? '—' : `${dept.slaComplianceRate}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent complaints */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Recently stored complaints</h2>
                <p className="text-xs text-slate-500">The eight newest records in the database.</p>
              </div>

              {data.recent.length === 0 ? (
                <p className="text-xs text-slate-500">No complaints stored.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Ticket</th>
                        <th className="py-2.5 px-3">Complaint</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Priority</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Stored</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.recent.map(c => (
                        <tr
                          key={c.id}
                          className="hover:bg-slate-50 cursor-pointer"
                          onClick={() => navigate(`/track?id=${encodeURIComponent(c.ticketNumber)}`)}
                        >
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-600 whitespace-nowrap">
                            {c.ticketNumber}
                          </td>
                          <td className="py-2.5 px-3 max-w-xs">
                            <strong className="text-slate-900 block truncate">{c.title}</strong>
                            <span className="text-[11px] text-slate-500 block truncate">{c.location.address}</span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <CategoryBadge category={c.category} showIcon={false} />
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <PriorityBadge priority={c.priority} />
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <StatusBadge status={c.status} />
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-500 whitespace-nowrap">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
