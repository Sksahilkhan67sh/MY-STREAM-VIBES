'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { DollarSign, TrendingUp, ArrowLeft, Settings, Check, Loader2, IndianRupee, Heart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const BRAND = '#ff3520';

interface DonationSummary { totalAmount:number; monthlyTotal:number; totalCount:number; byGateway:Record<string,number>; recentDonations:{id:string;donorName:string;amount:number;currency:string;message?:string;gateway:string;status:string;createdAt:string}[]; }
interface DonationConfig { razorpayKeyId?:string; razorpayKeySecret?:string; stripePublishableKey?:string; stripeSecretKey?:string; upiId?:string; upiName?:string; minimumAmount?:number; currency?:string; alertDuration?:number; thankYouMessage?:string; }

const fmt=(n:number,cur:string)=>`${cur==='INR'?'₹':'$'}${n.toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2})}`;
const fmtDate=(s:string)=>new Date(s).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const gatewayColors:Record<string,string>={razorpay:'#3b82f6',stripe:'#8b5cf6',upi:'#22c55e'};

function CfgSection({title,emoji,children}:{title:string;emoji:string;children:React.ReactNode}){return(<div className="rounded-2xl overflow-hidden"style={{border:'1px solid rgba(255,255,255,0.07)'}}><div className="px-5 py-3 flex items-center gap-2 border-b border-zinc-800/60"><span className="text-base">{emoji}</span><span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{title}</span></div><div className="px-5 py-4 space-y-3">{children}</div></div>);}
function CfgInput({label,value,onChange,placeholder,type='text',masked=false}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;type?:string;masked?:boolean}){return(<div><label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">{label}</label><input type={type}value={masked?'••••••••':value}onChange={e=>!masked&&onChange(e.target.value)}onFocus={()=>{if(masked)onChange('');}}placeholder={placeholder}className="w-full px-4 py-2.5 rounded-xl text-sm text-zinc-200 focus:outline-none placeholder-zinc-600"style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',fontSize:'16px'}}/></div>);}

interface Props { hostToken:string; onBack:()=>void; }

export default function InlineEarnings({hostToken,onBack}:Props){
  const {data:session}=useSession();
  const [summary,setSummary]=useState<DonationSummary|null>(null);
  const [config,setConfig]=useState<DonationConfig>({});
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<'overview'|'settings'>('overview');
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);

  const userId=session?.user?.id??session?.user?.email??'';

  useEffect(()=>{
    if(!userId||!hostToken){setLoading(false);return;}
    Promise.all([
      fetch(`${API}/api/donations/creator/${userId}/summary?hostToken=${encodeURIComponent(hostToken)}`).then(r=>r.ok?r.json():null),
      fetch(`${API}/api/donations/config?userId=${userId}&hostToken=${encodeURIComponent(hostToken)}`).then(r=>r.ok?r.json():{}),
    ]).then(([s,c])=>{if(s)setSummary(s);if(c)setConfig(c);}).finally(()=>setLoading(false));
  },[userId,hostToken]);

  const saveConfig=async()=>{
    if(!userId||!hostToken)return;
    setSaving(true);
    try{
      await fetch(`${API}/api/donations/config`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,hostToken,...config})});
      setSaved(true);setTimeout(()=>setSaved(false),2500);
    }finally{setSaving(false);}
  };

  const currency=config.currency??'INR';
  const gatewayData=Object.entries(summary?.byGateway??{}).map(([k,v])=>({name:k,amount:v}));
  const monthlyMap:Record<string,number>={};
  for(const d of summary?.recentDonations??[]){const key=new Date(d.createdAt).toLocaleDateString('en-IN',{month:'short',year:'2-digit'});monthlyMap[key]=(monthlyMap[key]??0)+d.amount;}
  const monthlyData=Object.entries(monthlyMap).map(([name,amount])=>({name,amount})).slice(-6);

  return(
    <motion.div initial={{opacity:0}}animate={{opacity:1}}exit={{opacity:0}}transition={{duration:0.2}}
      className="min-h-screen bg-zinc-950 overflow-y-auto" style={{fontFamily:"'DM Sans','Inter',sans-serif"}}>
      <nav className="sticky top-0 z-10 flex items-center justify-between px-4 py-4 border-b border-zinc-800/60"style={{background:'rgba(9,9,11,0.95)',backdropFilter:'blur(16px)'}}>
        <div className="flex items-center gap-3"><button onClick={onBack}className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"><ArrowLeft className="w-4 h-4"/></button><div><h1 className="text-sm font-bold text-zinc-100">Earnings</h1><p className="text-xs text-zinc-500">Donation revenue</p></div></div>
        <div className="flex gap-1 p-1 rounded-xl"style={{background:'rgba(255,255,255,0.04)'}}>
          {(['overview','settings']as const).map(t=>(<button key={t}onClick={()=>setTab(t)}className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all capitalize"style={{background:tab===t?BRAND:'transparent',color:tab===t?'white':'#71717a'}}>{t}</button>))}
        </div>
      </nav>

      {loading?(<div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-zinc-500"/></div>):(
      <div className="max-w-4xl mx-auto px-4 py-6">
        {tab==='overview'?(<div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[{icon:IndianRupee,label:'Total Earned',value:fmt(summary?.totalAmount??0,currency),color:BRAND},{icon:TrendingUp,label:'This Month',value:fmt(summary?.monthlyTotal??0,currency),color:'#22c55e'},{icon:Heart,label:'Donations',value:String(summary?.totalCount??0),color:'#8b5cf6'}].map(c=>(
              <motion.div key={c.label}initial={{opacity:0,y:12}}animate={{opacity:1,y:0}}className="rounded-2xl p-5"style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
                <div className="flex justify-between items-start mb-3"><span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{c.label}</span><div className="w-7 h-7 rounded-lg flex items-center justify-center"style={{background:`${c.color}18`}}><c.icon className="w-3.5 h-3.5"style={{color:c.color}}/></div></div>
                <p className="text-2xl font-black text-zinc-100">{c.value}</p>
              </motion.div>
            ))}
          </div>

          {monthlyData.length>0&&(<div className="rounded-2xl p-5"style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Monthly Revenue</h2>
            <ResponsiveContainer width="100%"height={160}><BarChart data={monthlyData}margin={{left:-20,right:4}}><CartesianGrid strokeDasharray="3 3"stroke="rgba(255,255,255,0.05)"vertical={false}/><XAxis dataKey="name"tick={{fill:'#71717a',fontSize:11}}tickLine={false}axisLine={false}/><YAxis tick={{fill:'#71717a',fontSize:10}}tickLine={false}axisLine={false}/><Tooltip contentStyle={{background:'#18181b',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,fontSize:12}}/><Bar dataKey="amount"name="Revenue"fill={BRAND}radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>
          </div>)}

          {gatewayData.length>0&&(<div className="rounded-2xl p-5"style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">By Gateway</h2>
            <div className="space-y-3">{gatewayData.map(g=>{const total=gatewayData.reduce((s,x)=>s+x.amount,0);const pct=total>0?(g.amount/total)*100:0;const color=gatewayColors[g.name]??BRAND;return(<div key={g.name}><div className="flex justify-between text-xs mb-1.5"><span className="text-zinc-400 capitalize font-semibold">{g.name}</span><span className="text-zinc-300 font-bold">{fmt(g.amount,currency)}</span></div><div className="h-2 rounded-full bg-zinc-800 overflow-hidden"><motion.div initial={{width:0}}animate={{width:`${pct}%`}}transition={{duration:1,ease:'easeOut'}}className="h-full rounded-full"style={{background:color}}/></div></div>);})}</div>
          </div>)}

          {(summary?.recentDonations?.length??0)>0&&(<div className="rounded-2xl overflow-hidden"style={{border:'1px solid rgba(255,255,255,0.07)'}}>
            <div className="px-5 py-4 border-b border-zinc-800"><h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Recent Transactions</h2></div>
            <div className="divide-y divide-zinc-800/60">{summary!.recentDonations.slice(0,20).map((d,i)=>(<motion.div key={d.id}initial={{opacity:0}}animate={{opacity:1}}transition={{delay:i*0.03}}className="flex items-center gap-4 px-5 py-3.5"><div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"style={{background:'rgba(255,53,32,0.1)',border:'1px solid rgba(255,53,32,0.15)'}}><Heart className="w-3.5 h-3.5 text-[#ff3520]"/></div><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-zinc-200 truncate">{d.donorName}</p>{d.message&&<p className="text-xs text-zinc-500 truncate italic">&quot;{d.message}&quot;</p>}</div><div className="text-right shrink-0"><p className="text-sm font-black text-zinc-100">{fmt(d.amount,d.currency)}</p><p className="text-xs text-zinc-600">{fmtDate(d.createdAt)}</p></div><span className="text-xs text-zinc-600 capitalize shrink-0 hidden sm:block">{d.gateway}</span></motion.div>))}</div>
          </div>)}

          {!summary?.totalCount&&(<div className="text-center py-16 text-zinc-600"><Heart className="w-10 h-10 mx-auto mb-3 opacity-30"/><p className="text-sm">No donations yet.</p><p className="text-xs mt-1">Set up your payment gateways in Settings.</p></div>)}
        </div>):(
        <div className="space-y-5 max-w-lg">
          <p className="text-xs text-zinc-500">Configure your payment gateways. Secret keys are masked after saving.</p>
          <CfgSection title="Razorpay"emoji="🪙"><CfgInput label="Key ID"value={config.razorpayKeyId??''}onChange={v=>setConfig(c=>({...c,razorpayKeyId:v}))}placeholder="rzp_live_..."/><CfgInput label="Key Secret"value={config.razorpayKeySecret??''}onChange={v=>setConfig(c=>({...c,razorpayKeySecret:v}))}placeholder="Enter secret key"type="password"masked={config.razorpayKeySecret==='••••••••'}/></CfgSection>
          <CfgSection title="Stripe"emoji="💳"><CfgInput label="Publishable Key"value={config.stripePublishableKey??''}onChange={v=>setConfig(c=>({...c,stripePublishableKey:v}))}placeholder="pk_live_..."/><CfgInput label="Secret Key"value={config.stripeSecretKey??''}onChange={v=>setConfig(c=>({...c,stripeSecretKey:v}))}placeholder="sk_live_..."type="password"masked={config.stripeSecretKey==='••••••••'}/></CfgSection>
          <CfgSection title="UPI"emoji="📱"><CfgInput label="UPI ID"value={config.upiId??''}onChange={v=>setConfig(c=>({...c,upiId:v}))}placeholder="yourname@upi"/><CfgInput label="Display Name"value={config.upiName??''}onChange={v=>setConfig(c=>({...c,upiName:v}))}placeholder="Your Name"/></CfgSection>
          <CfgSection title="General"emoji="⚙️"><div><label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Currency</label><select value={config.currency??'INR'}onChange={e=>setConfig(c=>({...c,currency:e.target.value}))}className="w-full px-4 py-2.5 rounded-xl text-sm text-zinc-200 focus:outline-none"style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',colorScheme:'dark'}}><option value="INR">INR — Indian Rupee</option><option value="USD">USD — US Dollar</option><option value="EUR">EUR — Euro</option><option value="GBP">GBP — British Pound</option></select></div><CfgInput label="Thank You Message"value={config.thankYouMessage??''}onChange={v=>setConfig(c=>({...c,thankYouMessage:v}))}placeholder="Thank you for your support!"/></CfgSection>
          <button onClick={saveConfig}disabled={saving}className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all"style={{background:saved?'linear-gradient(135deg,#22c55e,#16a34a)':'linear-gradient(135deg,#ff3520,#c81405)',opacity:saving?0.7:1}}>
            {saving?<Loader2 className="w-4 h-4 animate-spin"/>:saved?<Check className="w-4 h-4"/>:<Settings className="w-4 h-4"/>}
            {saving?'Saving…':saved?'Saved!':'Save Settings'}
          </button>
        </div>)}
      </div>)}
    </motion.div>
  );
}
