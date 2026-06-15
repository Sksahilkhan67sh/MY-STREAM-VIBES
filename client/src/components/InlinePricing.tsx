'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { Check, X, Zap, Star, Building2, Sparkles, ArrowLeft, ArrowRight, Loader2, Shield, CheckCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const BRAND = '#ff3520';

interface Plan { id:string; name:string; displayName:string; description:string; priceMonthlyINR:number; priceYearlyINR:number; priceMonthlyUSD:number; priceYearlyUSD:number; maxStreamsPerMonth:number; maxViewersPerStream:number; maxStreamDuration:number; maxStorageGB:number; maxCoHosts:number; canRecord:boolean; canGoRTMP:boolean; canRunPolls:boolean; canAccessAnalytics:boolean; canAcceptDonations:boolean; canCustomBranding:boolean; canScheduleStreams:boolean; hasAIFeatures:boolean; hasPrioritySupport:boolean; hasWhiteLabel:boolean; sortOrder:number; }
const PLAN_ICONS:Record<string,any>={free:Zap,basic:Star,premium:Sparkles,enterprise:Building2};
const PLAN_COLORS:Record<string,string>={free:'#71717a',basic:'#3b82f6',premium:BRAND,enterprise:'#8b5cf6'};
const fmt=(p:number,c:'INR'|'USD')=>p===0?'Free':c==='INR'?`₹${(p/100).toLocaleString('en-IN')}`:`$${(p/100).toFixed(2)}`;
const limitLabel=(n:number,unit:string)=>n===-1?`Unlimited ${unit}`:`${n} ${unit}`;
const FEATURE_ROWS=[
  {key:'maxStreamsPerMonth',label:'Streams / month',format:(n:number)=>n===-1?'Unlimited':String(n)},
  {key:'maxViewersPerStream',label:'Viewers / stream',format:(n:number)=>n===-1?'Unlimited':String(n)},
  {key:'maxStreamDuration',label:'Stream duration',format:(n:number)=>n===-1?'Unlimited':`${n} min`},
  {key:'maxStorageGB',label:'Storage',format:(n:number)=>n===-1?'Unlimited':`${n} GB`},
  {key:'maxCoHosts',label:'Co-hosts',format:(n:number)=>n===-1?'Unlimited':n===0?'None':String(n)},
  {key:'canRecord',label:'Recording',format:null},
  {key:'canGoRTMP',label:'RTMP streaming',format:null},
  {key:'canRunPolls',label:'Live polls',format:null},
  {key:'canAccessAnalytics',label:'Analytics',format:null},
  {key:'canAcceptDonations',label:'Donations',format:null},
  {key:'canCustomBranding',label:'Custom branding',format:null},
  {key:'hasAIFeatures',label:'AI features',format:null},
  {key:'hasPrioritySupport',label:'Priority support',format:null},
  {key:'hasWhiteLabel',label:'White label',format:null},
];

interface Props { hostToken:string; onBack:()=>void; onSuccess:()=>void; }

export default function InlinePricing({hostToken,onBack,onSuccess}:Props){
  const {data:session}=useSession();
  const [plans,setPlans]=useState<Plan[]>([]);
  const [loading,setLoading]=useState(true);
  const [billing,setBilling]=useState<'monthly'|'yearly'>('monthly');
  const [currency,setCurrency]=useState<'INR'|'USD'>('INR');
  const [subscribing,setSubscribing]=useState<string|null>(null);
  const [successPlan,setSuccessPlan]=useState('');

  const userId=session?.user?.id??session?.user?.email??'';

  useEffect(()=>{fetch(`${API}/api/subscriptions/plans`).then(r=>r.json()).then(setPlans).finally(()=>setLoading(false));},[]);

  const handleSubscribe=async(plan:Plan)=>{
    if(plan.name==='free')return;
    if(!session){return;}
    if(!userId){return;}
    setSubscribing(plan.id);
    try{
      const gateway=currency==='INR'?'razorpay':'stripe';
      const res=await fetch(`${API}/api/subscriptions/subscribe`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,hostToken,planId:plan.id,billingCycle:billing,gateway,currency})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||`Server error ${res.status}`);

      if(gateway==='razorpay'&&data.subscriptionId){
        if(!(window as any).Razorpay){
          await new Promise<void>((resolve,reject)=>{const s=document.createElement('script');s.src='https://checkout.razorpay.com/v1/checkout.js';s.onload=()=>resolve();s.onerror=()=>reject(new Error('Failed to load Razorpay.'));document.body.appendChild(s);});
        }
        const RazorpayClass=(window as any).Razorpay;
        if(!RazorpayClass)throw new Error('Razorpay not available.');
        new RazorpayClass({key:data.razorpayKeyId,subscription_id:data.subscriptionId,name:'Stream Vault',description:`${plan.displayName} Plan`,theme:{color:BRAND},handler:()=>{setSuccessPlan(plan.displayName);setTimeout(()=>onSuccess(),2500);}}).open();
      } else if(gateway==='stripe'&&data.clientSecret){
        const {loadStripe}=await import('@stripe/stripe-js');
        const stripeKey=process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
        if(!stripeKey)throw new Error('Stripe is not configured.');
        const stripe=await loadStripe(stripeKey);
        if(!stripe)throw new Error('Failed to initialize Stripe.');
        await stripe.confirmPayment({clientSecret:data.clientSecret,confirmParams:{return_url:`${APP_URL}/billing?success=true`}});
      } else {
        setSuccessPlan(plan.displayName);
        setTimeout(()=>onSuccess(),2000);
      }
    }catch(e:unknown){alert(e instanceof Error?e.message:'Failed to subscribe. Please try again.');}
    finally{setSubscribing(null);}
  };

  if(successPlan) return(
    <motion.div initial={{x:'100%'}}animate={{x:0}}exit={{x:'100%'}}transition={{type:'spring',damping:30,stiffness:280}}
      className="fixed inset-0 z-[300] bg-zinc-950 flex items-center justify-center"style={{fontFamily:"'DM Sans','Inter',sans-serif"}}>
      <div className="text-center p-8"><CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400"/><h2 className="text-2xl font-black text-zinc-100 mb-2">You're on {successPlan}!</h2><p className="text-zinc-400 text-sm">Taking you back to your stream…</p></div>
    </motion.div>
  );

  return(
    <motion.div initial={{x:'100%'}}animate={{x:0}}exit={{x:'100%'}}transition={{type:'spring',damping:30,stiffness:280}}
      className="fixed inset-0 z-[300] overflow-y-auto bg-zinc-950" style={{fontFamily:"'DM Sans','Inter',sans-serif"}}>
      <nav className="sticky top-0 z-10 flex items-center justify-between px-4 py-4 border-b border-zinc-800/60"style={{background:'rgba(9,9,11,0.95)',backdropFilter:'blur(16px)'}}>
        <div className="flex items-center gap-3"><button onClick={onBack}className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"><ArrowLeft className="w-4 h-4"/></button><div><h1 className="text-sm font-bold text-zinc-100">Choose a Plan</h1><p className="text-xs text-zinc-500">7-day free trial on all paid plans</p></div></div>
        <div className="flex gap-1 p-1 rounded-xl"style={{background:'rgba(255,255,255,0.04)'}}>
          {(['monthly','yearly']as const).map(c=>(<button key={c}onClick={()=>setBilling(c)}className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all capitalize"style={{background:billing===c?'white':'transparent',color:billing===c?'#09090b':'#71717a'}}>{c}{c==='yearly'&&<span className="ml-1 text-green-500 font-black">-20%</span>}</button>))}
        </div>
      </nav>

      {loading?<div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-zinc-500"/></div>:(
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center gap-1 p-1 rounded-xl w-fit mx-auto mb-8"style={{background:'rgba(255,255,255,0.04)'}}>
          {(['INR','USD']as const).map(c=>(<button key={c}onClick={()=>setCurrency(c)}className="px-4 py-2 text-sm font-semibold rounded-lg transition-all"style={{background:currency===c?'white':'transparent',color:currency===c?'#09090b':'#71717a'}}>{c==='INR'?'₹ INR':'$ USD'}</button>))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {plans.map((plan,i)=>{
            const Icon=PLAN_ICONS[plan.name]??Star;
            const color=PLAN_COLORS[plan.name]??BRAND;
            const price=currency==='INR'?(billing==='yearly'?plan.priceYearlyINR:plan.priceMonthlyINR):(billing==='yearly'?plan.priceYearlyUSD:plan.priceMonthlyUSD);
            const isPopular=plan.name==='premium';
            const isFree=plan.name==='free';
            const isLoading=subscribing===plan.id;
            return(
              <motion.div key={plan.id}initial={{opacity:0,y:16}}animate={{opacity:1,y:0}}transition={{delay:i*0.07}}
                className="relative rounded-2xl p-5 flex flex-col"
                style={{background:isPopular?'linear-gradient(160deg,rgba(255,53,32,0.1),rgba(255,53,32,0.04))':'rgba(255,255,255,0.03)',border:isPopular?'1px solid rgba(255,53,32,0.35)':'1px solid rgba(255,255,255,0.08)'}}>
                {isPopular&&<div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="px-3 py-1 text-xs font-black text-white rounded-full"style={{background:'linear-gradient(135deg,#ff3520,#c81405)'}}>Most popular</span></div>}
                <div className="flex items-center gap-2 mb-3"><div className="w-8 h-8 rounded-xl flex items-center justify-center"style={{background:`${color}18`,border:`1px solid ${color}30`}}><Icon className="w-3.5 h-3.5"style={{color}}/></div><h3 className="font-bold text-zinc-100 text-sm">{plan.displayName}</h3></div>
                <div className="mb-3"><span className="text-2xl font-black text-zinc-100">{fmt(price,currency)}</span>{!isFree&&<span className="text-xs text-zinc-500 ml-1">/{billing==='yearly'?'yr':'mo'}</span>}</div>
                <p className="text-xs text-zinc-500 mb-4 leading-relaxed flex-1">{plan.description}</p>
                <div className="space-y-1.5 mb-4">
                  {[limitLabel(plan.maxStreamsPerMonth,'streams/mo'),limitLabel(plan.maxViewersPerStream,'viewers'),plan.maxStorageGB===-1?'Unlimited storage':`${plan.maxStorageGB} GB storage`,...(plan.canRecord?['Recording']:[]),...(plan.canGoRTMP?['RTMP']:[]),...(plan.hasAIFeatures?['AI features']:[])].map((f,j)=>(<div key={j}className="flex items-center gap-1.5 text-xs"><Check className="w-3 h-3 shrink-0"style={{color}}/><span className="text-zinc-300">{f}</span></div>))}
                </div>
                <button onClick={()=>handleSubscribe(plan)}disabled={isFree||isLoading}
                  className="w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                  style={{background:isFree?'rgba(255,255,255,0.05)':isPopular?'linear-gradient(135deg,#ff3520,#c81405)':`${color}22`,color:isFree?'#52525b':isPopular?'white':color,border:isFree?'1px solid rgba(255,255,255,0.08)':'none',cursor:isFree?'default':'pointer'}}>
                  {isLoading?<Loader2 className="w-4 h-4 animate-spin"/>:isFree?'Current plan':<>Start free trial <ArrowRight className="w-3.5 h-3.5"/></>}
                </button>
              </motion.div>
            );
          })}
        </div>

        <div className="rounded-2xl overflow-hidden"style={{border:'1px solid rgba(255,255,255,0.08)'}}>
          <div className="grid"style={{gridTemplateColumns:`1fr repeat(${plans.length},1fr)`}}>
            <div className="px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800"style={{background:'rgba(255,255,255,0.03)'}}>Feature</div>
            {plans.map(p=><div key={p.id}className="px-3 py-3 text-center border-b border-zinc-800"style={{background:'rgba(255,255,255,0.03)'}}><span className="text-xs font-black"style={{color:PLAN_COLORS[p.name]??'#71717a'}}>{p.displayName}</span></div>)}
            {FEATURE_ROWS.map((row,ri)=>[
              <div key={`l${ri}`}className="px-4 py-3 text-xs text-zinc-400 border-b border-zinc-800/40"style={{background:ri%2?'rgba(255,255,255,0.01)':'transparent'}}>{row.label}</div>,
              ...plans.map(p=>{const val=(p as any)[row.key];const color=PLAN_COLORS[p.name]??'#71717a';return(<div key={`${p.id}${ri}`}className="px-3 py-3 flex items-center justify-center border-b border-zinc-800/40"style={{background:ri%2?'rgba(255,255,255,0.01)':'transparent'}}>{row.format?<span className="text-xs font-bold text-zinc-300">{row.format(val as number)}</span>:val?<Check className="w-3.5 h-3.5"style={{color}}/>:<X className="w-3 h-3 text-zinc-700"/>}</div>);})
            ])}
          </div>
        </div>
        <div className="h-8"/>
      </div>)}
    </motion.div>
  );
}
