'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { ArrowLeft, CreditCard, CheckCircle, Clock, XCircle, Loader2, ChevronRight } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const BRAND = '#ff3520';

interface Invoice { id:string; amount:number; currency:string; status:string; planName:string; billingCycle:string; createdAt:string; invoiceUrl?:string; }
interface SubInfo { planName:string; displayName:string; status:string; currentPeriodEnd:string; billingCycle:string; cancelAtPeriodEnd:boolean; }

const fmt=(n:number,cur:string)=>`${cur==='INR'?'₹':'$'}${n.toLocaleString()}`;
const fmtDate=(s:string)=>new Date(s).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});

interface Props { hostToken:string; onBack:()=>void; onUpgrade:()=>void; }

export default function InlineBilling({hostToken,onBack,onUpgrade}:Props){
  const {data:session}=useSession();
  const [sub,setSub]=useState<SubInfo|null>(null);
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [loading,setLoading]=useState(true);

  const userId=session?.user?.id??session?.user?.email??'';

  useEffect(()=>{
    if(!userId){setLoading(false);return;}
    const ht = encodeURIComponent(hostToken);
    const uid = encodeURIComponent(userId);
    Promise.all([
      fetch(`${API}/api/subscriptions/me?userId=${uid}&hostToken=${ht}`).then(r=>r.ok?r.json():null),
      fetch(`${API}/api/subscriptions/billing?userId=${uid}&hostToken=${ht}`).then(r=>r.ok?r.json():[]),
    ]).then(([s,inv])=>{if(s)setSub(s);if(Array.isArray(inv))setInvoices(inv);}).finally(()=>setLoading(false));
  },[userId]);

  const cancel=async()=>{
    if(!userId||!sub)return;
    if(!confirm('Cancel subscription? You keep access until the period ends.'))return;
    await fetch(`${API}/api/subscriptions/cancel`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,hostToken})});
    setSub(s=>s?{...s,cancelAtPeriodEnd:true}:s);
  };

  const planColor=(name:string)=>{const m:Record<string,string>={free:'#71717a',starter:'#3b82f6',pro:BRAND,business:'#8b5cf6',enterprise:'#f59e0b'};return m[name?.toLowerCase()]??BRAND;};

  return(
    <motion.div initial={{x:'100%'}}animate={{x:0}}exit={{x:'100%'}}transition={{type:'spring',damping:30,stiffness:280}}
      className="fixed inset-0 z-[200] overflow-y-auto bg-zinc-950" style={{fontFamily:"'DM Sans','Inter',sans-serif"}}>
      <nav className="sticky top-0 z-10 flex items-center justify-between px-4 py-4 border-b border-zinc-800/60"style={{background:'rgba(9,9,11,0.95)',backdropFilter:'blur(16px)'}}>
        <div className="flex items-center gap-3">
          <button onClick={onBack}className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"><ArrowLeft className="w-4 h-4"/></button>
          <div><h1 className="text-sm font-bold text-zinc-100">Plan & Billing</h1><p className="text-xs text-zinc-500">Manage your subscription</p></div>
        </div>
      </nav>

      {loading?(<div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-zinc-500"/></div>):(
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Current Plan */}
        <div className="rounded-2xl overflow-hidden"style={{border:'1px solid rgba(255,255,255,0.08)'}}>
          <div style={{height:2,background:`linear-gradient(90deg,transparent,${planColor(sub?.planName??'')},transparent)`}}/>
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Current Plan</p>
                <p className="text-2xl font-black"style={{color:planColor(sub?.planName??'')}}>{sub?.displayName??'Free'}</p>
                <p className="text-xs text-zinc-500 mt-1 capitalize">{sub?.billingCycle??'monthly'} billing</p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                style={{background:sub?.status==='active'?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',color:sub?.status==='active'?'#22c55e':'#ef4444',border:`1px solid ${sub?.status==='active'?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)'}`}}>
                {sub?.status==='active'?<CheckCircle className="w-3 h-3"/>:<XCircle className="w-3 h-3"/>}
                {sub?.status==='active'?'Active':'Inactive'}
              </div>
            </div>

            {sub?.currentPeriodEnd&&(
              <div className="flex items-center gap-2 text-xs text-zinc-500 mb-5">
                <Clock className="w-3.5 h-3.5"/>
                {sub.cancelAtPeriodEnd?<span className="text-amber-400">Cancels on {fmtDate(sub.currentPeriodEnd)}</span>:<span>Renews {fmtDate(sub.currentPeriodEnd)}</span>}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={onUpgrade}className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"style={{background:`linear-gradient(135deg,${BRAND},#c81405)`}}>
                Upgrade Plan <ChevronRight className="w-3.5 h-3.5"/>
              </button>
              {sub?.status==='active'&&!sub.cancelAtPeriodEnd&&sub.planName!=='free'&&(
                <button onClick={cancel}className="px-4 py-2.5 rounded-xl text-sm font-semibold text-zinc-400 hover:text-red-400 transition-colors"style={{border:'1px solid rgba(255,255,255,0.08)'}}>Cancel</button>
              )}
            </div>
          </div>
        </div>

        {/* Invoices */}
        <div className="rounded-2xl overflow-hidden"style={{border:'1px solid rgba(255,255,255,0.07)'}}>
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
            <CreditCard className="w-3.5 h-3.5 text-zinc-500"/>
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Billing History</h2>
          </div>
          {invoices.length===0?(
            <div className="py-10 text-center"><CreditCard className="w-8 h-8 mx-auto text-zinc-700 mb-3"/><p className="text-sm text-zinc-600">No invoices yet.</p></div>
          ):(
            <div className="divide-y divide-zinc-800/60">
              {invoices.map(inv=>(
                <div key={inv.id}className="flex items-center gap-4 px-5 py-4">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)'}}>
                    <CreditCard className="w-3.5 h-3.5 text-zinc-500"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-200">{inv.planName} Plan</p>
                    <p className="text-xs text-zinc-500 capitalize">{inv.billingCycle} · {fmtDate(inv.createdAt)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-zinc-100">{fmt(inv.amount,inv.currency)}</p>
                    <span className="text-xs font-semibold"style={{color:inv.status==='paid'?'#22c55e':inv.status==='failed'?'#ef4444':'#f59e0b'}}>{inv.status}</span>
                  </div>
                  {inv.invoiceUrl&&(
                    <a href={inv.invoiceUrl}target="_blank"rel="noreferrer"className="text-xs text-[#ff3520] hover:underline shrink-0">PDF</a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="h-6"/>
      </div>)}
    </motion.div>
  );
}
