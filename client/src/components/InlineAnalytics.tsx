'use client';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Eye, TrendingUp, Clock, MessageSquare,
  BarChart2, ArrowLeft, RefreshCw, Activity,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const API    = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const BRAND  = '#ff3520';
const COLORS = ['#ff3520','#ff6b61','#ff9f97','#ffc7c2','#3b82f6','#8b5cf6','#22c55e','#f59e0b'];

interface DashboardData {
  totalJoins:number; uniqueViewers:number; peakConcurrent:number;
  totalWatchSeconds:number; avgWatchSeconds:number; totalChatMessages:number;
  totalReactions:number; totalPollVotes:number; chatEngagementRate:number;
  deviceBreakdown:Record<string,number>; countryBreakdown:Record<string,number>;
  browserBreakdown:Record<string,number>; retentionCurve:number[];
  concurrentTimeline:{ts:string;count:number}[]; durationSeconds:number;
}

function fmtTime(sec:number){if(sec<60)return`${sec}s`;if(sec<3600)return`${Math.floor(sec/60)}m ${sec%60}s`;return`${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}m`;}
function fmtNum(n:number){if(n>=1e6)return`${(n/1e6).toFixed(1)}M`;if(n>=1e3)return`${(n/1e3).toFixed(1)}K`;return String(n);}

const CT=({active,payload,label}:any)=>{if(!active||!payload?.length)return null;return(<div className="px-3 py-2 rounded-xl text-xs"style={{background:'#18181b',border:'1px solid rgba(255,255,255,0.08)'}}><p className="text-zinc-400 mb-1">{label}</p>{payload.map((p:any,i:number)=>(<p key={i}style={{color:p.color??BRAND}}>{p.name}:<strong>{p.value}</strong></p>))}</div>);};

function StatCard({icon:Icon,label,value,sub,color=BRAND}:{icon:any;label:string;value:string;sub?:string;color?:string}){
  return(<motion.div initial={{opacity:0,y:12}}animate={{opacity:1,y:0}}className="rounded-2xl p-4 flex flex-col gap-2"style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
    <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</span><div className="w-7 h-7 rounded-lg flex items-center justify-center"style={{background:`${color}18`,border:`1px solid ${color}30`}}><Icon className="w-3.5 h-3.5"style={{color}}/></div></div>
    <div><p className="text-xl font-black text-zinc-100 tabular-nums">{value}</p>{sub&&<p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}</div>
  </motion.div>);
}

interface Props { roomId:string; hostToken:string; onBack:()=>void; }

export default function InlineAnalytics({roomId,hostToken,onBack}:Props){
  const [data,setData]=useState<DashboardData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [isLive,setIsLive]=useState(false);

  const load=useCallback(async()=>{
    if(!hostToken){setError('Host session not found.');setLoading(false);return;}
    setLoading(true);setError('');
    try{
      const res=await fetch(`${API}/api/analytics/${roomId}/dashboard?hostToken=${encodeURIComponent(hostToken)}`);
      if(!res.ok){
        let msg='Could not load analytics.';
        if(res.status===404)msg='No analytics data yet — start streaming to collect data.';
        else if(res.status===401||res.status===403)msg='Authentication failed.';
        else{try{const b=await res.json();if(b.error)msg=b.error;}catch{}}
        setError(msg);setLoading(false);return;
      }
      const json=await res.json();setData(json);
      const sr=await fetch(`${API}/api/streams/${roomId}`);
      if(sr.ok){const s=await sr.json();setIsLive(s.isLive);}
    }catch{setError('Network error — please check your connection.');}
    finally{setLoading(false);}
  },[roomId,hostToken]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{if(!isLive)return;const id=setInterval(load,10000);return()=>clearInterval(id);},[isLive,load]);

  const timelineData=(data?.concurrentTimeline??[]).slice(-60).map(p=>({name:new Date(p.ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}),count:p.count}));
  const retentionData=(data?.retentionCurve??[]).map((v,i)=>({name:`${i}m`,retention:v}));
  const deviceData=Object.entries(data?.deviceBreakdown??{}).map(([k,v])=>({name:k,value:v}));
  const countryData=Object.entries(data?.countryBreakdown??{}).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>({name:k,viewers:v}));
  const browserData=Object.entries(data?.browserBreakdown??{}).map(([k,v])=>({name:k,value:v}));
  const engTotal=(data?.totalChatMessages??0)+(data?.totalReactions??0)+(data?.totalPollVotes??0);

  return(
    <motion.div initial={{x:'100%'}}animate={{x:0}}exit={{x:'100%'}}transition={{type:'spring',damping:30,stiffness:280}}
      className="fixed inset-0 z-[200] overflow-y-auto bg-zinc-950" style={{fontFamily:"'DM Sans','Inter',sans-serif"}}>
      <nav className="sticky top-0 z-10 flex items-center justify-between px-4 py-4 border-b border-zinc-800/60"style={{background:'rgba(9,9,11,0.95)',backdropFilter:'blur(16px)'}}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"><ArrowLeft className="w-4 h-4"/></button>
          <div><h1 className="text-sm font-bold text-zinc-100">Stream Analytics</h1><p className="text-xs text-zinc-500">{roomId}</p></div>
        </div>
        <div className="flex items-center gap-2">
          {isLive&&<span className="flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"/>LIVE</span>}
          <button onClick={load} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"><RefreshCw className="w-4 h-4"/></button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {loading&&<div className="flex items-center justify-center py-20"><Activity className="w-5 h-5 animate-pulse text-[#ff3520]"/><span className="ml-3 text-sm text-zinc-400">Loading analytics…</span></div>}
        {error&&!loading&&<div className="py-16 text-center"><p className="text-red-400 text-sm mb-3">{error}</p><button onClick={load} className="text-xs text-zinc-500 underline">Try again</button></div>}

        {data&&!loading&&(<>
          <section>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Overview</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={Users}        label="Total Joins"     value={fmtNum(data.totalJoins)}       sub="all-time joins"/>
              <StatCard icon={Eye}          label="Unique Viewers"  value={fmtNum(data.uniqueViewers)}    sub="distinct sessions"  color="#3b82f6"/>
              <StatCard icon={TrendingUp}   label="Peak Concurrent" value={fmtNum(data.peakConcurrent)}   sub="at one time"        color="#8b5cf6"/>
              <StatCard icon={Clock}        label="Avg Watch Time"  value={fmtTime(data.avgWatchSeconds)} sub="per viewer"         color="#22c55e"/>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <StatCard icon={MessageSquare} label="Chat"     value={fmtNum(data.totalChatMessages)} sub={`${data.chatEngagementRate.toFixed(1)} msg/viewer`} color="#f59e0b"/>
              <StatCard icon={Activity}      label="Reactions" value={fmtNum(data.totalReactions)}   sub="emoji reactions" color="#ec4899"/>
              <StatCard icon={BarChart2}     label="Poll Votes" value={fmtNum(data.totalPollVotes)}  sub="votes cast"      color="#06b6d4"/>
              <StatCard icon={Clock}         label="Duration"   value={fmtTime(data.durationSeconds)} sub="total stream"  color="#a78bfa"/>
            </div>
          </section>

          {timelineData.length>0&&(<section>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Concurrent Viewers</p>
            <div className="rounded-2xl p-5"style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
              <ResponsiveContainer width="100%"height={200}>
                <AreaChart data={timelineData}margin={{top:4,right:4,left:-20,bottom:0}}>
                  <defs><linearGradient id="cg"x1="0"y1="0"x2="0"y2="1"><stop offset="5%"stopColor={BRAND}stopOpacity={0.25}/><stop offset="95%"stopColor={BRAND}stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3"stroke="rgba(255,255,255,0.05)"/>
                  <XAxis dataKey="name"tick={{fill:'#71717a',fontSize:10}}tickLine={false}axisLine={false}interval="preserveStartEnd"/>
                  <YAxis tick={{fill:'#71717a',fontSize:10}}tickLine={false}axisLine={false}/>
                  <Tooltip content={<CT/>}/>
                  <Area type="monotone"dataKey="count"name="Viewers"stroke={BRAND}strokeWidth={2}fill="url(#cg)"dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>)}

          {retentionData.length>1&&(<section>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Viewer Retention</p>
            <div className="rounded-2xl p-5"style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
              <ResponsiveContainer width="100%"height={180}>
                <AreaChart data={retentionData}margin={{top:4,right:4,left:-20,bottom:0}}>
                  <defs><linearGradient id="rg"x1="0"y1="0"x2="0"y2="1"><stop offset="5%"stopColor="#3b82f6"stopOpacity={0.25}/><stop offset="95%"stopColor="#3b82f6"stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3"stroke="rgba(255,255,255,0.05)"/>
                  <XAxis dataKey="name"tick={{fill:'#71717a',fontSize:10}}tickLine={false}axisLine={false}/>
                  <YAxis tick={{fill:'#71717a',fontSize:10}}tickLine={false}axisLine={false}unit="%"domain={[0,100]}/>
                  <Tooltip content={<CT/>}/>
                  <Area type="monotone"dataKey="retention"name="Retention %"stroke="#3b82f6"strokeWidth={2}fill="url(#rg)"dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>)}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <section>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Devices</p>
              <div className="rounded-2xl p-5 h-60 flex flex-col"style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
                {deviceData.length===0?<p className="text-xs text-zinc-600 m-auto">No data yet</p>:(<>
                  <ResponsiveContainer width="100%"height={130}><PieChart><Pie data={deviceData}cx="50%"cy="50%"innerRadius={35}outerRadius={58}dataKey="value"paddingAngle={3}>{deviceData.map((_,i)=><Cell key={i}fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip content={<CT/>}/></PieChart></ResponsiveContainer>
                  <div className="space-y-1.5 mt-1">{deviceData.map((d,i)=>(<div key={d.name}className="flex items-center justify-between text-xs"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full"style={{background:COLORS[i%COLORS.length]}}/><span className="text-zinc-400 capitalize">{d.name}</span></div><span className="text-zinc-300 font-semibold">{d.value}</span></div>))}</div>
                </>)}
              </div>
            </section>
            <section>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Browsers</p>
              <div className="rounded-2xl p-5 h-60"style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
                {browserData.length===0?<p className="text-xs text-zinc-600 flex items-center justify-center h-full">No data yet</p>:(
                  <ResponsiveContainer width="100%"height="100%"><BarChart data={browserData}layout="vertical"margin={{left:0,right:20}}><CartesianGrid strokeDasharray="3 3"stroke="rgba(255,255,255,0.05)"horizontal={false}/><XAxis type="number"tick={{fill:'#71717a',fontSize:10}}tickLine={false}axisLine={false}/><YAxis type="category"dataKey="name"tick={{fill:'#a1a1aa',fontSize:11}}tickLine={false}axisLine={false}width={55}/><Tooltip content={<CT/>}/><Bar dataKey="value"name="Viewers"fill="#8b5cf6"radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>
                )}
              </div>
            </section>
            <section>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Engagement</p>
              <div className="rounded-2xl p-5 h-60 flex flex-col gap-3"style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
                {[{label:'Chat',value:data.totalChatMessages,color:'#f59e0b',icon:'💬'},{label:'Reactions',value:data.totalReactions,color:'#ec4899',icon:'❤️'},{label:'Poll votes',value:data.totalPollVotes,color:'#06b6d4',icon:'📊'}].map(item=>(<div key={item.label}className="flex items-center gap-3"><span className="text-lg">{item.icon}</span><div className="flex-1"><div className="flex justify-between text-xs mb-1"><span className="text-zinc-400">{item.label}</span><span className="text-zinc-200 font-semibold">{fmtNum(item.value)}</span></div><div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full rounded-full"style={{background:item.color,width:engTotal>0?`${Math.round((item.value/engTotal)*100)}%`:'0%'}}/></div></div></div>))}
                <div className="mt-auto pt-3 border-t border-zinc-800"><div className="flex justify-between text-xs"><span className="text-zinc-500">Engagement rate</span><span className="text-zinc-200 font-bold">{data.uniqueViewers>0?`${Math.round((engTotal/data.uniqueViewers)*100)/100}x`:'—'}</span></div></div>
              </div>
            </section>
          </div>

          {countryData.length>0&&(<section>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Top Countries</p>
            <div className="rounded-2xl p-5"style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)'}}>
              <ResponsiveContainer width="100%"height={160}><BarChart data={countryData}margin={{top:4,right:4,left:-20,bottom:0}}><CartesianGrid strokeDasharray="3 3"stroke="rgba(255,255,255,0.05)"vertical={false}/><XAxis dataKey="name"tick={{fill:'#71717a',fontSize:11}}tickLine={false}axisLine={false}/><YAxis tick={{fill:'#71717a',fontSize:10}}tickLine={false}axisLine={false}/><Tooltip content={<CT/>}/><Bar dataKey="viewers"name="Viewers"fill={BRAND}radius={[4,4,0,0]}>{countryData.map((_,i)=><Cell key={i}fill={COLORS[i%COLORS.length]}/>)}</Bar></BarChart></ResponsiveContainer>
            </div>
          </section>)}

          <div className="h-6"/>
        </>)}
      </div>
    </motion.div>
  );
}
