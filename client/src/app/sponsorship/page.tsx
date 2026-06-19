'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Handshake, Mail, BadgeCheck } from 'lucide-react';
import SiteHeader from '@/components/discover/SiteHeader';
import { apiGet, apiPost, apiPatch } from '@/lib/api';

interface Listing {
  id: string; title: string; description: string; audienceSize: number;
  categories: string[]; minBudget: number; currency: string; contactEmail?: string;
  creator: { id: string; name: string | null; username: string | null; avatarUrl: string | null; isVerified: boolean };
}

export default function SponsorshipPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? session?.user?.email ?? '';

  const [listings, setListings] = useState<Listing[]>([]);
  const [myListing, setMyListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', description: '', minBudget: '', contactEmail: '', categories: '' });
  const [tab, setTab] = useState<'browse' | 'manage'>('browse');

  useEffect(() => {
    apiGet<{ listings: Listing[] }>('/api/sponsorship').then(d => setListings(d.listings)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!userId) return;
    apiGet<any>(`/api/sponsorship/creator/${userId}`).then(setMyListing).catch(() => {});
  }, [userId]);

  const saveListing = async () => {
    const payload = {
      creatorId: userId, title: form.title, description: form.description,
      minBudget: form.minBudget ? parseInt(form.minBudget) * 100 : 0,
      contactEmail: form.contactEmail || undefined,
      categories: form.categories.split(',').map(s => s.trim()).filter(Boolean),
    };
    if (myListing?.id) {
      const updated = await apiPatch(`/api/sponsorship/${myListing.id}`, payload);
      setMyListing(updated);
    } else {
      const created = await apiPost('/api/sponsorship', payload);
      setMyListing(created);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <SiteHeader />

      <div className="px-4 sm:px-8 pt-6 pb-12 max-w-4xl">
        <h1 className="text-xl font-bold flex items-center gap-2 mb-2"><Handshake className="w-5 h-5" /> Sponsorship Marketplace</h1>
        <p className="text-sm text-gray-400 mb-6">Brands and creators connect here for sponsorship deals.</p>

        <div className="flex gap-1 p-1 mb-6 rounded-xl bg-gray-100 dark:bg-gray-800 w-fit">
          {(['browse', 'manage'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={['px-4 py-2 rounded-lg text-sm font-semibold capitalize', tab === t ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'].join(' ')}>
              {t === 'browse' ? 'Browse creators' : 'My listing'}
            </button>
          ))}
        </div>

        {tab === 'browse' ? (
          loading ? (
            <div className="flex items-center justify-center py-16"><div className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-900 animate-spin" /></div>
          ) : listings.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">No active listings yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {listings.map(l => (
                <div key={l.id} className="p-5 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                      {l.creator?.avatarUrl ? <img src={l.creator.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-xs font-bold">{(l.creator?.name ?? '?').charAt(0)}</span>}
                    </div>
                    <span className="text-sm font-semibold">{l.creator?.name ?? l.creator?.username}</span>
                    {l.creator?.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500" />}
                  </div>
                  <h3 className="font-bold mb-1">{l.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-3">{l.description}</p>
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                    <span>{l.audienceSize.toLocaleString()} followers</span>
                    {l.minBudget > 0 && <span>From ₹{(l.minBudget / 100).toFixed(0)}</span>}
                  </div>
                  {l.contactEmail && (
                    <a href={`mailto:${l.contactEmail}`} className="flex items-center justify-center gap-1.5 w-full py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-lg hover:opacity-90">
                      <Mail className="w-3.5 h-3.5" /> Contact
                    </a>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="max-w-lg space-y-4">
            <input value={form.title || myListing?.title || ''} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Listing title" className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
            <textarea value={form.description || myListing?.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe your audience and what you offer" rows={4} className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 resize-none" />
            <input value={form.minBudget} onChange={e => setForm(p => ({ ...p, minBudget: e.target.value }))} placeholder="Minimum budget (₹)" type="number" className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
            <input value={form.categories} onChange={e => setForm(p => ({ ...p, categories: e.target.value }))} placeholder="Categories (comma separated)" className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
            <input value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} placeholder="Contact email" type="email" className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900" />
            <button onClick={saveListing} className="w-full py-3 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600">
              {myListing?.id ? 'Update listing' : 'Publish listing'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
