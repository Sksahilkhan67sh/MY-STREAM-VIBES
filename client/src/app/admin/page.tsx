'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getStoredUser } from '@/lib/auth';

type Tab = 'stats' | 'users' | 'streams' | 'reports';

interface Stats { totalUsers: number; totalStreams: number; liveStreams: number; totalRecordings: number; pendingReports: number; }
interface User  { id: string; email: string; displayName: string; role: string; provider: string; bannedAt: string | null; createdAt: string; avatarUrl?: string; _count: { streams: number; followers: number }; }
interface Stream { id: string; roomId: string; title: string; isLive: boolean; viewerCount: number; peakViewers: number; category?: string; createdAt: string; host?: { displayName: string; email: string }; _count: { recordings: number; polls: number }; }
interface Report { id: string; reason: string; details?: string; resolved: boolean; createdAt: string; reporter: { displayName: string; email: string }; stream?: { roomId: string; title: string }; }

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-5">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${accent || 'text-gray-900 dark:text-gray-100'}`}>{value.toLocaleString()}</p>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab]       = useState<Tab>('stats');
  const [stats, setStats]   = useState<Stats | null>(null);
  const [users, setUsers]   = useState<User[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast]   = useState('');

  // Guard: admin only
  useEffect(() => {
    const user = getStoredUser();
    if (!user) { router.replace('/auth/login'); return; }
    if (user.role !== 'ADMIN') { router.replace('/'); return; }
    loadStats();
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const loadStats = async () => {
    const res = await apiFetch('/api/admin/stats');
    if (res.ok) setStats(await res.json());
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch(`/api/admin/users?search=${encodeURIComponent(search)}&limit=30`);
    if (res.ok) { const d = await res.json(); setUsers(d.users); }
    setLoading(false);
  }, [search]);

  const loadStreams = async () => {
    setLoading(true);
    const res = await apiFetch('/api/admin/streams?limit=30');
    if (res.ok) { const d = await res.json(); setStreams(d.streams); }
    setLoading(false);
  };

  const loadReports = async () => {
    setLoading(true);
    const res = await apiFetch('/api/admin/reports?resolved=false');
    if (res.ok) { const d = await res.json(); setReports(d.reports); }
    setLoading(false);
  };

  useEffect(() => {
    if (tab === 'users')   loadUsers();
    if (tab === 'streams') loadStreams();
    if (tab === 'reports') loadReports();
  }, [tab]);

  useEffect(() => {
    if (tab === 'users') { const t = setTimeout(loadUsers, 300); return () => clearTimeout(t); }
  }, [search, tab]);

  const banUser = async (id: string, action: 'ban' | 'unban') => {
    const res = await apiFetch(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) });
    if (res.ok) { showToast(action === 'ban' ? 'User banned' : 'User unbanned'); loadUsers(); }
  };

  const setRole = async (id: string, role: string) => {
    const res = await apiFetch(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'set_role', role }) });
    if (res.ok) { showToast('Role updated'); loadUsers(); }
  };

  const deleteStream = async (roomId: string) => {
    if (!confirm('Delete this stream permanently?')) return;
    const res = await apiFetch(`/api/admin/streams/${roomId}`, { method: 'DELETE' });
    if (res.ok) { showToast('Stream deleted'); loadStreams(); }
  };

  const resolveReport = async (id: string) => {
    const res = await apiFetch(`/api/admin/reports/${id}/resolve`, { method: 'PATCH' });
    if (res.ok) { showToast('Report resolved'); loadReports(); loadStats(); }
  };

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'stats',   label: 'Overview' },
    { key: 'users',   label: 'Users' },
    { key: 'streams', label: 'Streams' },
    { key: 'reports', label: 'Reports', badge: stats?.pendingReports },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="font-bold text-sm text-gray-900 dark:text-gray-100">StreamVault</span>
          </a>
          <span className="text-gray-300 dark:text-gray-700">/</span>
          <span className="text-sm font-medium text-gray-500">Admin</span>
        </div>
        <span className="text-xs px-2 py-1 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg font-medium">Admin Panel</span>
      </nav>

      {/* Tab bar */}
      <div className="flex gap-1 px-6 pt-6 pb-0">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`relative px-4 py-2 text-sm font-medium rounded-xl transition-colors ${tab === t.key ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full flex items-center justify-center">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

        {/* ── Stats ── */}
        {tab === 'stats' && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard label="Total users"      value={stats.totalUsers} />
              <StatCard label="Total streams"    value={stats.totalStreams} />
              <StatCard label="Live now"         value={stats.liveStreams} accent="text-red-500" />
              <StatCard label="Recordings"       value={stats.totalRecordings} />
              <StatCard label="Pending reports"  value={stats.pendingReports} accent={stats.pendingReports > 0 ? 'text-amber-500' : undefined} />
            </div>
            <p className="text-xs text-gray-400 text-center pt-4">Switch to Users, Streams, or Reports tabs to take action.</p>
          </div>
        )}

        {/* ── Users ── */}
        {tab === 'users' && (
          <div className="space-y-4">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…"
              className="w-full max-w-sm px-3.5 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300" />
            {loading ? (
              <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800">
                      {['User', 'Role', 'Provider', 'Streams', 'Joined', 'Actions'].map(h => (
                        <th key={h} className="pb-3 pr-4 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {users.map(u => (
                      <tr key={u.id} className={`${u.bannedAt ? 'opacity-50' : ''}`}>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            {u.avatarUrl
                              ? <img src={u.avatarUrl} className="w-7 h-7 rounded-full object-cover" alt="" />
                              : <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-500">{u.displayName[0]}</div>}
                            <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">{u.displayName}</p>
                              <p className="text-xs text-gray-400">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <select value={u.role} onChange={e => setRole(u.id, e.target.value)}
                            className="text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-700 dark:text-gray-300 focus:outline-none">
                            <option>VIEWER</option><option>HOST</option><option>ADMIN</option>
                          </select>
                        </td>
                        <td className="py-3 pr-4 text-xs text-gray-400">{u.provider}</td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">{u._count.streams}</td>
                        <td className="py-3 pr-4 text-xs text-gray-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="py-3">
                          <button onClick={() => banUser(u.id, u.bannedAt ? 'unban' : 'ban')}
                            className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${u.bannedAt ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200'}`}>
                            {u.bannedAt ? 'Unban' : 'Ban'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!users.length && <p className="text-center py-12 text-sm text-gray-400">No users found</p>}
              </div>
            )}
          </div>
        )}

        {/* ── Streams ── */}
        {tab === 'streams' && (
          <div>
            {loading ? (
              <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800">
                      {['Title', 'Host', 'Status', 'Viewers', 'Category', 'Created', 'Actions'].map(h => (
                        <th key={h} className="pb-3 pr-4 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {streams.map(s => (
                      <tr key={s.id}>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-gray-900 dark:text-gray-100 max-w-[180px] truncate">{s.title}</p>
                          <p className="text-xs text-gray-400 font-mono">{s.roomId}</p>
                        </td>
                        <td className="py-3 pr-4 text-xs text-gray-500">{s.host?.displayName || '—'}</td>
                        <td className="py-3 pr-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.isLive ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                            {s.isLive ? '🔴 Live' : 'Ended'}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">{s.viewerCount} / {s.peakViewers} peak</td>
                        <td className="py-3 pr-4 text-xs text-gray-400">{s.category || '—'}</td>
                        <td className="py-3 pr-4 text-xs text-gray-400">{new Date(s.createdAt).toLocaleDateString()}</td>
                        <td className="py-3">
                          <button onClick={() => deleteStream(s.roomId)}
                            className="text-xs px-3 py-1 rounded-lg font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 transition-colors">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!streams.length && <p className="text-center py-12 text-sm text-gray-400">No streams found</p>}
              </div>
            )}
          </div>
        )}

        {/* ── Reports ── */}
        {tab === 'reports' && (
          <div className="space-y-3">
            {loading ? (
              <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" /></div>
            ) : reports.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-4xl mb-3">✅</p>
                <p className="text-sm text-gray-400">No pending reports</p>
              </div>
            ) : reports.map(r => (
              <div key={r.id} className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-5 flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full">{r.reason}</span>
                    <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  {r.details && <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">{r.details}</p>}
                  <p className="text-xs text-gray-400">
                    Reported by <span className="font-medium">{r.reporter.displayName}</span>
                    {r.stream && <> · Stream: <span className="font-medium">{r.stream.title}</span></>}
                  </p>
                </div>
                <button onClick={() => resolveReport(r.id)}
                  className="flex-shrink-0 text-xs px-3 py-1.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-xl font-medium hover:bg-green-200 transition-colors">
                  Resolve
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
