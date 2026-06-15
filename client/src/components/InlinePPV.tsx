'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Ticket, Plus, Trash2, RefreshCw, IndianRupee, TrendingUp, Loader2, AlertCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface TicketTier { id:string; name:string; description?:string; price:number; currency:string; maxQuantity?:number; soldCount:number; isActive:boolean; revenue:number; }
interface Stats { totalRevenue:number; totalTickets:number; byGateway:Record<string,number>; tiers:TicketTier[]; recentTickets:{id:string;ticketCode:string;buyerName:string;buyerEmail:string;amount:number;currency:string;gateway:string;status:string;paidAt:string}[]; }

const sym=(c:string)=>c==='INR'?'₹':'$';
const fmtDate=(s:string)=>new Date(s).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});

interface Props { roomId:string; hostToken:string; onBack:()=>void; }

export default function InlinePPV({roomId,hostToken,onBack}:Props){
  const [stats,setStats]=useState<Stats|null>(null);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [saving,setSaving]=useState(false);
  const [refunding,setRefunding]=useState<string|null>(null);
  const [tierError,setTierError]=useState('');
  const [tierName,setTierName]=useState('Standard');
  const [tierDesc,setTierDesc]=useState('');
  const [tierPrice,setTierPrice]=useState('');
  const [tierCurrency,setTierCurrency]=useState('INR');
  const [tierMax,setTierMax]=useState('');

  const load=useCallback(async()=>{
    if(!hostToken){setLoading(false);return;}
    setLoading(true);
    try{
      const res=await fetch(`${API}/api/ppv/${roomId}/stats?hostToken=${encodeURIComponent(hostToken)}`);
      if(res.ok)setStats(await res.json());
    }finally{setLoading(false);}
  },[roomId,hostToken]);

  useEffect(()=>{load();},[load]);

  const createTier=async()=>{
    if(!tierName||!tierPrice)return;
    if(!hostToken){setTierError('Host session not found. Please close and reopen PPV Manager.');return;}
    setSaving(true);setTierError('');
    try{
      const res=await fetch(`${API}/api/ppv/${roomId}/tiers`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hostToken,name:tierName,description:tierDesc||undefined,price:Math.round(parseFloat(tierPrice)*100),currency:tierCurrency,maxQuantity:tierMax?parseInt(tierMax):undefined})});
      let body:any={};try{body=await res.json();}catch{}
      if(!res.ok){setTierError(body.error||`Failed to create tier (HTTP ${res.status}). Please try again.`);return;}
      setShowForm(false);setTierName('Standard');setTierDesc('');setTierPrice('');setTierMax('');
      await load();
    }catch{setTierError('Network error. Please check your connection.');}
    finally{setSaving(false);}
  };

  const deactivateTier=async(id:string)=>{
    await fetch(`${API}/api/ppv/tiers/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({hostToken,isActive:false})});
    await load();
  };

  const refund=async(ticketId:string)=>{
    setRefunding(ticketId);
    try{await fetch(`${API}/api/ppv/tickets/${ticketId}/refund`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hostToken,reason:'Host-initiated refund'})});await load();}
    finally{setRefunding(null);}
  };

  return(
    <motion.div initial={{x:'100%'}}animate={{x:0}}exit={{x:'100%'}}transition={{type:'spring',damping:30,stiffness:280}}
      className="fixed inset-0 z-[200] overflow-y-auto bg-zinc-950"style={{fontFamily:"'DM Sans','Inter',sans-serif"}}>
      <nav className="sticky top-0 z-10 flex items-center justify-between px-4 py-4 border-b border-zinc-800/60"style={{background:'rgba(9,9,11,0.95)',backdropFilter:'blur(16px)'}}>
        <div className="flex items-center gap-3"><button onClick={onBack}className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"><ArrowLeft className="w-4 h-4"/></button><div><h1 className="text-sm font-bold text-zinc-100">Pay-Per-View</h1><p className="text-xs text-zinc-500">{roomId}</p></div></div>
        <div className="flex items-center gap-2">
          <button onClick={load}className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"><RefreshCw className="w-4 h-4"/></button>
          <button onClick={()=>{setTierError('');setShowForm(true);}}className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white"style={{background:'linear-gradient(135deg,#ff3520,#c81405)'}}><Plus className="w-3 h-3"/>Add Tier</button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {!loading&&!hostToken&&(
          <div className="flex items-center gap-3 p-4 rounded-2xl text-amber-400"style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)'}}>
            <AlertCircle className="w-4 h-4 shrink-0"/>
            <p className="text-sm">Host session not found. Please close and reopen PPV Manager from your stream dashboard.</p>
          </div>
        )}

        {loading?<div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-500"/></div>:(<>
          <div className="grid grid-cols-3 gap-3">
            {[{icon:IndianRupee,label:'Total Revenue',value:`${sym(stats?.tiers[0]?.currency??'INR')}${(stats?.totalRevenue??0).toLocaleString()}`,color:'#ff3520'},{icon:Ticket,label:'Tickets Sold',value:String(stats?.totalTickets??0),color:'#3b82f6'},{icon:TrendingUp,label:'Active Tiers',value:String(stats?.tiers.filter(t=>t.isActive).length??0),color:'#22c55e'}].map(c=>(
              <motion.div key={c.label}initial={{opacity:0,y:12}}animate={{opacity:1,y:0}}className="rounded-2xl p-4"style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
                <div className="flex justify-between mb-2"><span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{c.label}</span><c.icon className="w-3.5 h-3.5"style={{color:c.color}}/></div>
                <p className="text-xl font-black text-zinc-100">{c.value}</p>
              </motion.div>
            ))}
          </div>

          <div className="rounded-2xl overflow-hidden"style={{border:'1px solid rgba(255,255,255,0.07)'}}>
            <div className="px-5 py-4 border-b border-zinc-800"><h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Ticket Tiers</h2></div>
            {(stats?.tiers.length??0)===0?(
              <div className="py-10 text-center"><Ticket className="w-8 h-8 mx-auto text-zinc-700 mb-3"/><p className="text-sm text-zinc-600">No tiers yet. Click Add Tier to get started.</p></div>
            ):(
              <div className="divide-y divide-zinc-800/60">
                {stats?.tiers.map(tier=>(
                  <div key={tier.id}className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><p className="text-sm font-bold text-zinc-200">{tier.name}</p>{!tier.isActive&&<span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full">inactive</span>}</div>
                      {tier.description&&<p className="text-xs text-zinc-500 mt-0.5">{tier.description}</p>}
                      <p className="text-xs text-zinc-600 mt-1">{tier.soldCount} sold{tier.maxQuantity?` / ${tier.maxQuantity} max`:''}</p>
                    </div>
                    <div className="text-right shrink-0"><p className="text-sm font-black text-zinc-100">{sym(tier.currency)}{(tier.price/100).toLocaleString()}</p><p className="text-xs text-green-400 font-semibold">{sym(tier.currency)}{tier.revenue.toLocaleString()} earned</p></div>
                    {tier.isActive&&<button onClick={()=>deactivateTier(tier.id)}className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {(stats?.recentTickets.length??0)>0&&(
            <div className="rounded-2xl overflow-hidden"style={{border:'1px solid rgba(255,255,255,0.07)'}}>
              <div className="px-5 py-4 border-b border-zinc-800"><h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Recent Tickets</h2></div>
              <div className="divide-y divide-zinc-800/60">
                {stats?.recentTickets.map(t=>(
                  <div key={t.id}className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"style={{background:'rgba(255,53,32,0.08)',border:'1px solid rgba(255,53,32,0.12)'}}><Ticket className="w-3.5 h-3.5 text-[#ff3520]"/></div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-zinc-200">{t.buyerName}</p><p className="text-xs text-zinc-500">{t.buyerEmail} · {t.ticketCode}</p></div>
                    <div className="text-right shrink-0"><p className="text-sm font-black text-zinc-100">{sym(t.currency)}{t.amount}</p><p className="text-xs text-zinc-600">{fmtDate(t.paidAt)}</p></div>
                    <button onClick={()=>refund(t.id)}disabled={refunding===t.id||t.status==='refunded'}className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"style={{background:'rgba(239,68,68,0.08)',color:'#ef4444',border:'1px solid rgba(239,68,68,0.15)'}}>
                      {refunding===t.id?<Loader2 className="w-3 h-3 animate-spin"/>:t.status==='refunded'?'✓ Refunded':'Refund'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>)}
      </div>

      <AnimatePresence>
        {showForm&&(
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div initial={{opacity:0,scale:0.9}}animate={{opacity:1,scale:1}}exit={{opacity:0,scale:0.9}}className="w-full max-w-sm rounded-2xl overflow-hidden"style={{background:'#111113',border:'1px solid rgba(255,255,255,0.1)'}}>
              <div style={{height:2,background:'linear-gradient(90deg,transparent,#ff3520,transparent)'}}/>
              <div className="p-6 space-y-4">
                <h3 className="font-bold text-zinc-100">New Ticket Tier</h3>
                {tierError&&(<div className="flex items-start gap-2 p-3 rounded-xl text-red-400"style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)'}}><AlertCircle className="w-4 h-4 mt-0.5 shrink-0"/><p className="text-xs">{tierError}</p></div>)}
                {[{label:'Tier Name',value:tierName,set:setTierName,placeholder:'e.g. Standard, VIP'},{label:'Description (optional)',value:tierDesc,set:setTierDesc,placeholder:'What does this tier include?'}].map(f=>(
                  <div key={f.label}><label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">{f.label}</label><input value={f.value}onChange={e=>f.set(e.target.value)}placeholder={f.placeholder}className="w-full px-4 py-2.5 rounded-xl text-sm text-zinc-200 focus:outline-none placeholder-zinc-600"style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}/></div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Price</label><input value={tierPrice}onChange={e=>setTierPrice(e.target.value)}placeholder="299"type="number"min="1"className="w-full px-4 py-2.5 rounded-xl text-sm text-zinc-200 focus:outline-none"style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',colorScheme:'dark'}}/></div>
                  <div><label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Currency</label><select value={tierCurrency}onChange={e=>setTierCurrency(e.target.value)}className="w-full px-4 py-2.5 rounded-xl text-sm text-zinc-200 focus:outline-none"style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',colorScheme:'dark'}}><option value="INR">₹ INR</option><option value="USD">$ USD</option></select></div>
                </div>
                <div><label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Max Tickets (optional)</label><input value={tierMax}onChange={e=>setTierMax(e.target.value)}placeholder="Leave blank for unlimited"type="number"min="1"className="w-full px-4 py-2.5 rounded-xl text-sm text-zinc-200 focus:outline-none placeholder-zinc-600"style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',colorScheme:'dark'}}/></div>
                <div className="flex gap-2 pt-2">
                  <button onClick={()=>{setShowForm(false);setTierError('');}}className="flex-1 py-3 rounded-xl text-sm font-semibold text-zinc-500"style={{border:'1px solid rgba(255,255,255,0.08)'}}>Cancel</button>
                  <button onClick={createTier}disabled={saving||!tierName||!tierPrice}className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"style={{background:'linear-gradient(135deg,#ff3520,#c81405)'}}>
                    {saving?<Loader2 className="w-4 h-4 animate-spin mx-auto"/>:'Create Tier'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
