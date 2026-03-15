import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const SYMBOLS = [
  { id:"XAUUSD",    label:"Gold",    group:"Commod" },
  { id:"XAGUSD",    label:"Silver",  group:"Commod" },
  { id:"USOUSD",    label:"WTI",     group:"Commod" },
  { id:"BRTUSD",    label:"Brent",   group:"Commod" },
  { id:"NATGASUSD", label:"Gas",     group:"Commod" },
  { id:"EURUSD",    label:"EUR/USD", group:"Forex"  },
  { id:"GBPUSD",    label:"GBP/USD", group:"Forex"  },
  { id:"USDJPY",    label:"USD/JPY", group:"Forex"  },
  { id:"BTCUSD",    label:"Bitcoin", group:"Crypto" },
  { id:"SPXUSD",    label:"S&P 500", group:"Index"  },
  { id:"NDXUSD",    label:"Nasdaq",  group:"Index"  },
];

const TIMEFRAMES = [
  { label:"1m",  seconds:60   },
  { label:"5m",  seconds:300  },
  { label:"15m", seconds:900  },
  { label:"1h",  seconds:3600 },
];

const SC = {
  asia:    { bg:"rgba(30,60,100,0.18)",  label:"Asia",    color:"#4a8af0" },
  london:  { bg:"rgba(20,80,40,0.18)",   label:"London",  color:"#4adc8a" },
  ny:      { bg:"rgba(80,30,10,0.18)",   label:"NY",      color:"#f08040" },
  overlap: { bg:"rgba(60,40,10,0.22)",   label:"Overlap", color:"#f0c04a" },
  off:     { bg:"transparent",           label:"Off",     color:"#3a3d48" },
};

const fmt    = n => n==null?"—":Number(n).toFixed(2);
const fmtV   = n => n==null?"—":Number(n).toFixed(1);
const fmtTs  = e => new Date(e*1000).toUTCString().slice(17,22);
const isMob  = () => window.innerWidth < 768;

// ─── useCanvas hook ───────────────────────────────────────────────────────────
function useCanvas(draw, deps) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = window.devicePixelRatio||1;
    const W = cv.offsetWidth, H = cv.offsetHeight;
    if(!W||!H) return;
    cv.width=W*dpr; cv.height=H*dpr;
    const ctx = cv.getContext("2d"); ctx.scale(dpr,dpr);
    draw(ctx,W,H);
  }, deps);
  return ref;
}

// ─── CandleChart ──────────────────────────────────────────────────────────────
function CandleChart({ candles, summary, showSessions, showDiv, showAbs }) {
  const [tip, setTip] = useState(null);
  const shown = candles.slice(-80);

  const ref = useCanvas((ctx,W,H) => {
    if (!shown.length) return;
    const PL=isMob()?46:64, PR=8, PT=20, PB=30;
    const cW=W-PL-PR, cH=H-PT-PB;
    const prices=shown.flatMap(c=>[c.high,c.low]);
    const lo0=Math.min(...prices), hi0=Math.max(...prices);
    const pad=(hi0-lo0)*0.08||1;
    const lo=lo0-pad, hi=hi0+pad;
    const toY=p=>PT+cH-((p-lo)/(hi-lo))*cH;
    const bW=Math.max(2,Math.floor(cW/shown.length)-1);

    // Session bands
    if(showSessions){
      let bs=null,bsess=null;
      shown.forEach((c,i)=>{
        const s=c.session||"off", x=PL+i*(bW+1);
        if(s!==bsess){
          if(bsess&&bsess!=="off"&&SC[bsess]){
            ctx.fillStyle=SC[bsess].bg; ctx.fillRect(bs,PT,x-bs,cH);
            ctx.fillStyle=SC[bsess].color+"40"; ctx.fillRect(bs,PT,x-bs,2);
          }
          bs=x; bsess=s;
        }
        if(i===shown.length-1&&bsess&&bsess!=="off"){
          ctx.fillStyle=SC[bsess].bg; ctx.fillRect(bs,PT,(x+bW)-bs,cH);
          ctx.fillStyle=SC[bsess].color+"40"; ctx.fillRect(bs,PT,(x+bW)-bs,2);
        }
      });
      let last=null;
      shown.forEach((c,i)=>{
        const s=c.session||"off", x=PL+i*(bW+1);
        if(s!==last&&s!=="off"&&SC[s]){
          ctx.fillStyle=SC[s].color; ctx.font="bold 8px monospace"; ctx.textAlign="left";
          ctx.fillText(SC[s].label.slice(0,3).toUpperCase(),x+2,PT-4); last=s;
        }
      });
    }

    // Grid
    ctx.strokeStyle="#1a1c24"; ctx.lineWidth=0.5;
    for(let i=0;i<=4;i++){
      const y=PT+(cH/4)*i, p=hi-((hi-lo)/4)*i;
      ctx.beginPath(); ctx.moveTo(PL,y); ctx.lineTo(W-PR,y); ctx.stroke();
      ctx.fillStyle="#3a3d48"; ctx.font=`${isMob()?8:10}px monospace`; ctx.textAlign="right";
      ctx.fillText(p.toFixed(isMob()?1:2),PL-4,y+4);
    }

    // POC/VAH/VAL
    if(summary?.poc){
      const y=toY(summary.poc);
      ctx.strokeStyle="#8a6a10"; ctx.lineWidth=1; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(PL,y); ctx.lineTo(W-PR,y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle="#f0c04a"; ctx.font="bold 8px monospace"; ctx.textAlign="right";
      ctx.fillText("POC",W-PR-2,y-2);
    }
    if(summary?.vah&&summary?.val){
      [summary.vah,summary.val].forEach(p=>{
        const y=toY(p); ctx.strokeStyle="#3a2060"; ctx.lineWidth=0.7; ctx.setLineDash([2,4]);
        ctx.beginPath(); ctx.moveTo(PL,y); ctx.lineTo(W-PR,y); ctx.stroke(); ctx.setLineDash([]);
      });
    }

    // Absorption highlights
    if(showAbs) shown.forEach((c,i)=>{
      if(!c.is_absorption) return;
      const x=PL+i*(bW+1);
      ctx.fillStyle="rgba(160,100,200,0.1)"; ctx.fillRect(x-1,PT,bW+2,cH);
    });

    // Candles
    shown.forEach((c,i)=>{
      const x=PL+i*(bW+1)+Math.floor(bW/2);
      const isUp=c.close>=c.open;
      let col=isUp?"#26a65b":"#c0392b";
      if(c.is_absorption) col="#a060f0";
      if(c.is_spike)      col="#f08040";
      ctx.strokeStyle=col; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x,toY(c.high)); ctx.lineTo(x,toY(c.low)); ctx.stroke();
      const bt=toY(Math.max(c.open,c.close)), bb=toY(Math.min(c.open,c.close));
      ctx.fillStyle=col; ctx.fillRect(x-Math.floor(bW/2),bt,bW,Math.max(1,bb-bt));
    });

    // Divergence markers
    if(showDiv) shown.forEach((c,i)=>{
      if(!c.divergence) return;
      const x=PL+i*(bW+1)+Math.floor(bW/2);
      const bear=c.divergence==="bearish";
      const my=bear?toY(c.high)-8:toY(c.low)+8;
      ctx.fillStyle=bear?"#f06060":"#4adc8a"; ctx.beginPath();
      if(bear){ctx.moveTo(x,my);ctx.lineTo(x-4,my-7);ctx.lineTo(x+4,my-7);}
      else{ctx.moveTo(x,my);ctx.lineTo(x-4,my+7);ctx.lineTo(x+4,my+7);}
      ctx.closePath(); ctx.fill();
    });

    // Time axis
    ctx.fillStyle="#3a3d48"; ctx.font=`${isMob()?8:10}px monospace`; ctx.textAlign="center";
    const step=Math.ceil(shown.length/6);
    shown.forEach((c,i)=>{
      if(i%step===0) ctx.fillText(fmtTs(c.time),PL+i*(bW+1)+Math.floor(bW/2),H-PB+12);
    });
  }, [shown, summary, showSessions, showDiv, showAbs]);

  const onMove = e => {
    const cv=ref.current; if(!cv||!shown.length) return;
    const mob=isMob(), PL=mob?46:64;
    const rect=cv.getBoundingClientRect();
    const clientX=(e.touches?e.touches[0].clientX:e.clientX)-rect.left;
    const bW=Math.max(2,Math.floor((cv.offsetWidth-PL-8)/shown.length)-1);
    const idx=Math.floor((clientX-PL)/(bW+1));
    if(idx>=0&&idx<shown.length) setTip({x:clientX,y:(e.touches?e.touches[0].clientY:e.clientY)-rect.top,c:shown[idx]});
    else setTip(null);
  };

  return (
    <div style={{position:"relative",width:"100%",height:"100%"}}>
      <canvas ref={ref} style={{width:"100%",height:"100%",display:"block",touchAction:"none"}}
        onMouseMove={onMove} onTouchMove={onMove}
        onMouseLeave={()=>setTip(null)} onTouchEnd={()=>setTimeout(()=>setTip(null),2000)} />
      {tip&&(
        <div style={{position:"absolute",left:Math.min(tip.x+10,200),top:Math.max(4,tip.y-10),
          background:"#0d0f14",border:"1px solid #2a2d35",borderRadius:6,
          padding:"7px 10px",fontSize:11,color:"#c8cad0",pointerEvents:"none",
          zIndex:10,fontFamily:"monospace",minWidth:160,maxWidth:200}}>
          <div style={{color:"#55575f",marginBottom:2}}>{fmtTs(tip.c.time)} · {SC[tip.c.session||"off"]?.label}</div>
          <div>O{fmt(tip.c.open)} H{fmt(tip.c.high)}</div>
          <div>L{fmt(tip.c.low)} C{fmt(tip.c.close)}</div>
          <div style={{color:"#f0c04a"}}>Vol {fmtV(tip.c.volume)}</div>
          <div style={{color:tip.c.delta>=0?"#4adc8a":"#f06060"}}>Δ {fmt(tip.c.delta)}</div>
          {tip.c.is_spike&&<div style={{color:"#f08040"}}>⚡ {tip.c.spike_ratio}×</div>}
          {tip.c.divergence&&<div style={{color:tip.c.divergence==="bearish"?"#f06060":"#4adc8a"}}>{tip.c.divergence==="bearish"?"▼ Bear":"▲ Bull"} div</div>}
          {tip.c.is_absorption&&<div style={{color:"#a060f0"}}>◈ Absorption</div>}
        </div>
      )}
    </div>
  );
}

// ─── Volume bars ──────────────────────────────────────────────────────────────
function VolumeBars({ candles }) {
  const shown = candles.slice(-80);
  const ref = useCanvas((ctx,W,H) => {
    if(!shown.length) return;
    const mob=isMob(), PL=mob?46:64, PR=8, PT=3, PB=3;
    const cW=W-PL-PR, cH=H-PT-PB;
    const mv=Math.max(...shown.map(c=>c.volume));
    const bW=Math.max(2,Math.floor(cW/shown.length)-1);
    shown.forEach((c,i)=>{
      const x=PL+i*(bW+1), h=(c.volume/mv)*cH, isUp=c.close>=c.open;
      ctx.fillStyle=c.is_absorption?"#5a2080":c.is_spike?"#f08040":isUp?"#1a4a2a":"#4a1a1a";
      ctx.fillRect(x,H-PB-h,bW,h);
    });
    ctx.fillStyle="#3a3d48"; ctx.font="8px monospace"; ctx.textAlign="right";
    ctx.fillText(fmtV(mv),PL-3,PT+9);
  }, [shown]);
  return <canvas ref={ref} style={{width:"100%",height:"100%",display:"block"}} />;
}

// ─── Footprint Chart ──────────────────────────────────────────────────────────
function FootprintChart({ footprint }) {
  const ref = useCanvas((ctx,W,H) => {
    if(!footprint?.length) return;
    const shown=footprint.slice(-30);
    const allLevels=new Set(shown.flatMap(c=>c.levels.map(l=>l.price)));
    const prices=Array.from(allLevels).sort((a,b)=>b-a);
    if(!prices.length) return;

    const PL=isMob()?50:65, PR=8, PT=16, PB=20;
    const cW=W-PL-PR, cH=H-PT-PB;
    const colW=Math.max(18,Math.floor(cW/shown.length));
    const rowH=Math.max(8,Math.floor(cH/Math.min(prices.length,30)));

    const visP=prices.slice(0,Math.floor(cH/rowH));
    const maxVol=Math.max(...shown.flatMap(c=>c.levels.map(l=>l.buy+l.sell)));

    // Price axis
    ctx.fillStyle="#3a3d48"; ctx.font=`${isMob()?7:9}px monospace`; ctx.textAlign="right";
    visP.forEach((p,pi)=>{ const y=PT+pi*rowH+rowH/2+3; ctx.fillText(p.toFixed(isMob()?1:2),PL-3,y); });

    // Time axis
    ctx.textAlign="center"; ctx.font="8px monospace";
    shown.forEach((c,ci)=>{ ctx.fillText(fmtTs(c.time),PL+ci*colW+colW/2,H-PB+12); });

    // Cells
    shown.forEach((c,ci)=>{
      const lmap={};
      c.levels.forEach(l=>{ lmap[l.price]=l; });
      visP.forEach((p,pi)=>{
        const l=lmap[p]; if(!l) return;
        const x=PL+ci*colW, y=PT+pi*rowH;
        const tot=l.buy+l.sell;
        const intensity=maxVol>0?tot/maxVol:0;

        // Background intensity cell
        const alpha=Math.min(0.9,0.1+intensity*0.8);
        ctx.fillStyle=l.delta>=0?`rgba(38,166,91,${alpha})`:`rgba(192,57,43,${alpha})`;
        ctx.fillRect(x+1,y+1,colW-2,rowH-2);

        // Text (buy/sell) — only if cell is wide enough
        if(colW>=20&&rowH>=10){
          ctx.fillStyle="rgba(255,255,255,0.9)";
          ctx.font=`bold ${Math.min(8,rowH-2)}px monospace`;
          ctx.textAlign="center";
          const mid=x+colW/2;
          if(rowH>=14){
            ctx.fillText(fmtV(l.buy),mid,y+rowH*0.38);
            ctx.fillStyle="rgba(180,180,180,0.7)";
            ctx.fillText(fmtV(l.sell),mid,y+rowH*0.72);
          } else {
            ctx.fillText(l.delta>=0?fmtV(l.buy):fmtV(l.sell),mid,y+rowH*0.6);
          }
        }
      });
    });

    // Column borders
    ctx.strokeStyle="#1a1c24"; ctx.lineWidth=0.5;
    shown.forEach((_,ci)=>{
      const x=PL+ci*colW;
      ctx.beginPath(); ctx.moveTo(x,PT); ctx.lineTo(x,PT+visP.length*rowH); ctx.stroke();
    });
  }, [footprint]);

  return (
    <div style={{position:"relative",width:"100%",height:"100%"}}>
      <canvas ref={ref} style={{width:"100%",height:"100%",display:"block"}} />
    </div>
  );
}

// ─── Liquidity Heatmap ────────────────────────────────────────────────────────
function LiquidityHeatmap({ heatmap }) {
  const ref = useCanvas((ctx,W,H) => {
    if(!heatmap?.times?.length) return;
    const { times, prices, cells, max_vol } = heatmap;
    if(!max_vol) return;

    const shown_n = Math.min(times.length, 50);
    const times_s = times.slice(-shown_n);
    const ci_offset = times.length - shown_n;

    const PL=isMob()?50:65, PR=8, PT=14, PB=22;
    const cW=W-PL-PR, cH=H-PT-PB;
    const colW=Math.max(4,Math.floor(cW/shown_n));
    const rowH=Math.max(4,Math.floor(cH/Math.min(prices.length,40)));
    const visPrices=prices.slice(0,Math.floor(cH/rowH)).reverse();

    // Draw cells
    visPrices.forEach((p,pi)=>{
      const priceIdx=prices.indexOf(p);
      const row=cells[priceIdx]||[];
      times_s.forEach((t,ti)=>{
        const vol=row[ci_offset+ti]||0;
        const intensity=Math.min(1,vol/max_vol);
        if(intensity<0.02) return;
        // Color: low=deep blue, mid=teal, high=amber/orange
        let r,g,b;
        if(intensity<0.4){ r=10+intensity*100; g=30+intensity*180; b=80+intensity*100; }
        else if(intensity<0.75){ r=10+intensity*200; g=180-intensity*80; b=30; }
        else { r=200+intensity*55; g=180-intensity*120; b=10; }
        ctx.fillStyle=`rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${0.3+intensity*0.7})`;
        ctx.fillRect(PL+ti*colW,PT+pi*rowH,colW-1,rowH-1);
      });
    });

    // Price axis
    ctx.fillStyle="#3a3d48"; ctx.font=`${isMob()?7:9}px monospace`; ctx.textAlign="right";
    visPrices.forEach((p,pi)=>{
      if(pi%Math.ceil(visPrices.length/8)===0)
        ctx.fillText(p.toFixed(isMob()?1:2),PL-3,PT+pi*rowH+rowH/2+3);
    });

    // Time axis
    ctx.textAlign="center"; ctx.font="8px monospace";
    times_s.forEach((t,ti)=>{
      if(ti%Math.ceil(shown_n/6)===0)
        ctx.fillText(fmtTs(t),PL+ti*colW+colW/2,H-PB+12);
    });

    // Colour legend
    const legW=80, legH=8, legX=W-PR-legW, legY=PT-12;
    for(let i=0;i<legW;i++){
      const f=i/legW;
      let r,g,b;
      if(f<0.4){r=10+f*250;g=30+f*450;b=80+f*250;}
      else if(f<0.75){r=10+f*500;g=180-f*200;b=30;}
      else{r=200+f*55;g=180-f*300;b=10;}
      ctx.fillStyle=`rgb(${Math.round(Math.min(255,r))},${Math.round(Math.min(255,g))},${Math.round(Math.min(255,b))})`;
      ctx.fillRect(legX+i,legY,1,legH);
    }
    ctx.fillStyle="#55575f"; ctx.font="7px monospace"; ctx.textAlign="left";
    ctx.fillText("low",legX,legY+legH+8); ctx.textAlign="right";
    ctx.fillText("high",legX+legW,legY+legH+8);
  }, [heatmap]);

  return <canvas ref={ref} style={{width:"100%",height:"100%",display:"block"}} />;
}

// ─── Correlation Matrix ───────────────────────────────────────────────────────
function CorrelationMatrix({ matrix, symbols }) {
  if(!matrix||!symbols?.length) return <div style={{color:"#3a3d48",fontSize:13}}>No correlation data.</div>;
  const cell=isMob()?28:38;
  const label=isMob()?32:56;
  const W=label+symbols.length*cell, H=label+symbols.length*cell;

  const corrColor=(v)=>{
    if(v>0.7)  return "#26a65b";
    if(v>0.3)  return "#4a9af0";
    if(v>-0.3) return "#55575f";
    if(v>-0.7) return "#f0c04a";
    return "#f06060";
  };
  const corrBg=(v)=>{
    if(v>=0.99) return "#0a1a10";
    if(v>0.7)   return "#0a2010";
    if(v>0.3)   return "#0a1020";
    if(v>-0.3)  return "#13151c";
    if(v>-0.7)  return "#1a1508";
    return "#1a0808";
  };

  return (
    <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
      <div style={{display:"inline-block",minWidth:W}}>
        {/* Header row */}
        <div style={{display:"flex",paddingLeft:label}}>
          {symbols.map(s=>(
            <div key={s} style={{width:cell,textAlign:"center",fontSize:isMob()?7:9,
              color:"#55575f",fontFamily:"monospace",padding:"0 1px",
              overflow:"hidden",whiteSpace:"nowrap"}}>
              {SYMBOLS.find(x=>x.id===s)?.label||s}
            </div>
          ))}
        </div>
        {/* Rows */}
        {symbols.map(rowSym=>(
          <div key={rowSym} style={{display:"flex",alignItems:"center"}}>
            <div style={{width:label,fontSize:isMob()?7:9,color:"#55575f",
              fontFamily:"monospace",textAlign:"right",paddingRight:4,
              overflow:"hidden",whiteSpace:"nowrap",flexShrink:0}}>
              {SYMBOLS.find(x=>x.id===rowSym)?.label||rowSym}
            </div>
            {symbols.map(colSym=>{
              const v=matrix[rowSym]?.[colSym]??0;
              const isSelf=rowSym===colSym;
              return (
                <div key={colSym} style={{width:cell,height:cell,display:"flex",
                  alignItems:"center",justifyContent:"center",
                  background:isSelf?"#0a0b0f":corrBg(v),
                  border:"1px solid #13151c",fontSize:isMob()?8:10,
                  fontFamily:"monospace",fontWeight:600,
                  color:isSelf?"#2a2d35":corrColor(v)}}>
                  {isSelf?"—":v.toFixed(isMob()?1:2)}
                </div>
              );
            })}
          </div>
        ))}
        {/* Legend */}
        <div style={{display:"flex",gap:10,marginTop:12,fontSize:10,color:"#55575f",flexWrap:"wrap"}}>
          {[["#26a65b",">0.7 Strong positive"],["#4a9af0","0.3–0.7 Moderate"],
            ["#55575f","-0.3–0.3 Neutral"],["#f0c04a","-0.7–-0.3 Moderate neg"],["#f06060","<-0.7 Strong negative"]
          ].map(([c,l])=>(
            <span key={l} style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{width:8,height:8,background:c,borderRadius:2,display:"inline-block"}}/>
              {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────
const Toggle=({label,value,onChange,color="#4a9af0"})=>(
  <button onClick={()=>onChange(!value)} style={{
    background:value?`${color}18`:"transparent",
    border:`1px solid ${value?color:"#1e2028"}`,
    color:value?color:"#3a3d48",
    borderRadius:5,padding:"3px 9px",fontSize:11,cursor:"pointer",
  }}>{label}</button>
);

const StatCard=({label,value,sub,accent})=>(
  <div style={{background:"#13151c",border:"1px solid #1e2028",borderRadius:10,
    padding:"10px 12px",flex:1,minWidth:100}}>
    <div style={{fontSize:9,color:"#55575f",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:3}}>{label}</div>
    <div style={{fontSize:16,fontWeight:600,color:accent||"#e2e4ec",fontFamily:"monospace"}}>{value}</div>
    {sub&&<div style={{fontSize:9,color:"#55575f",marginTop:2}}>{sub}</div>}
  </div>
);

const SH=({title,sub})=>(
  <div style={{marginBottom:10}}>
    <span style={{fontSize:11,fontWeight:600,color:"#7a7d88",letterSpacing:"0.1em",textTransform:"uppercase"}}>{title}</span>
    {sub&&<span style={{fontSize:10,color:"#3a3d48",marginLeft:8}}>{sub}</span>}
  </div>
);

const DT=({active,payload,label})=>{
  if(!active||!payload?.length) return null;
  return(
    <div style={{background:"#0d0f14",border:"1px solid #2a2d35",borderRadius:6,padding:"7px 10px",fontSize:11,color:"#c8cad0"}}>
      <div style={{color:"#7a7d88",marginBottom:3}}>{label}</div>
      {payload.map((p,i)=><div key={i} style={{color:p.color||"#e2e4ec"}}>{p.name}: <strong>{fmt(p.value)}</strong></div>)}
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [symbol,      setSymbol]      = useState("XAUUSD");
  const [hoursBack,   setHoursBack]   = useState(3);
  const [timeframe,   setTimeframe]   = useState(60);
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [lastFetch,   setLastFetch]   = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [activeTab,   setActiveTab]   = useState("chart");
  const [showSess,    setShowSess]    = useState(true);
  const [showDiv,     setShowDiv]     = useState(true);
  const [showAbs,     setShowAbs]     = useState(true);
  const [footprint,   setFootprint]   = useState(null);
  const [heatmap,     setHeatmap]     = useState(null);
  const [corr,        setCorr]        = useState(null);
  const [corrLoading, setCorrLoading] = useState(false);
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    const ctrl=new AbortController();
    const t=setTimeout(()=>ctrl.abort(),28000);
    try {
      const r=await fetch(`${API_BASE}/api/orderflow/${symbol}?hours_back=${hoursBack}&timeframe=${timeframe}`,{signal:ctrl.signal});
      clearTimeout(t);
      if(!r.ok) throw new Error(`Server error ${r.status}`);
      const j=await r.json();
      if(j.error) throw new Error(j.error);
      setData(j); setLastFetch(new Date());
    } catch(e) {
      clearTimeout(t);
      if(e.name==="AbortError") setError("Timed out — Railway may be waking up. Wait 15s and retry.");
      else setError(e.message);
    } finally { setLoading(false); }
  },[symbol,hoursBack,timeframe]);

  const fetchFootprint = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r=await fetch(`${API_BASE}/api/orderflow/${symbol}?hours_back=${hoursBack}&timeframe=${timeframe}&include_footprint=true`);
      const j=await r.json();
      if(j.error) throw new Error(j.error);
      setFootprint(j.footprint||[]);
    } catch(e){ setError(e.message); }
    finally{ setLoading(false); }
  },[symbol,hoursBack,timeframe]);

  const fetchHeatmap = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r=await fetch(`${API_BASE}/api/orderflow/${symbol}?hours_back=${hoursBack}&timeframe=${timeframe}&include_heatmap=true`);
      const j=await r.json();
      if(j.error) throw new Error(j.error);
      setHeatmap(j.heatmap||null);
    } catch(e){ setError(e.message); }
    finally{ setLoading(false); }
  },[symbol,hoursBack,timeframe]);

  const fetchCorr = useCallback(async () => {
    setCorrLoading(true);
    try {
      const r=await fetch(`${API_BASE}/api/correlation?hours_back=${hoursBack}&timeframe=300`);
      const j=await r.json();
      if(j.error) throw new Error(j.error);
      setCorr(j);
    } catch(e){ setError(e.message); }
    finally{ setCorrLoading(false); }
  },[hoursBack]);

  useEffect(()=>{ fetchData(); },[fetchData]);
  useEffect(()=>{ if(activeTab==="footprint"&&!footprint) fetchFootprint(); },[activeTab]);
  useEffect(()=>{ if(activeTab==="heatmap"&&!heatmap) fetchHeatmap(); },[activeTab]);
  useEffect(()=>{ if(activeTab==="corr"&&!corr) fetchCorr(); },[activeTab]);
  useEffect(()=>{ setFootprint(null); setHeatmap(null); },[symbol,hoursBack,timeframe]);

  useEffect(()=>{
    if(autoRefresh) timerRef.current=setInterval(fetchData,60_000);
    else clearInterval(timerRef.current);
    return ()=>clearInterval(timerRef.current);
  },[autoRefresh,fetchData]);

  const sum=data?.summary||{}, candles=data?.candles||[];
  const profile=data?.volume_profile||[], sess=data?.session_stats||{};
  const isBull=sum.bias==="bullish";
  const deltaData=candles.slice(-60).map(c=>({time:fmtTs(c.time),delta:c.delta,cum:c.cum_delta,spike:c.is_spike,div:c.divergence}));
  const profSlice=[...profile].sort((a,b)=>b.volume-a.volume).slice(0,40).sort((a,b)=>a.price-b.price);

  const TABS=[
    {key:"chart",    label:"Chart"      },
    {key:"footprint",label:"Footprint"  },
    {key:"heatmap",  label:"Heatmap"    },
    {key:"sessions", label:"Sessions"   },
    {key:"diverge",  label:"Divergence" },
    {key:"delta",    label:"Flow"       },
    {key:"profile",  label:"Profile"    },
    {key:"corr",     label:"Correlation"},
  ];

  const card=(bg,border)=>({background:bg||"#0d0f14",border:`1px solid ${border||"#1a1c24"}`,borderRadius:12,padding:16});

  return (
    <div style={{minHeight:"100vh",background:"#0a0b0f",color:"#c8cad0",fontFamily:"'IBM Plex Sans',sans-serif",paddingBottom:40}}>

      {/* ── Top bar ── */}
      <div style={{background:"#0d0f14",borderBottom:"1px solid #1a1c24",
        padding:"9px 14px",position:"sticky",top:0,zIndex:10}}>
        {/* Row 1: brand + controls */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"baseline",gap:5,flexShrink:0}}>
            <span style={{fontSize:12,fontWeight:700,color:"#e2e4ec",letterSpacing:"0.1em"}}>ORDER FLOW</span>
            <span style={{fontSize:8,color:"#f08040",border:"1px solid #f0804040",padding:"1px 4px",borderRadius:3}}>PRO</span>
          </div>

          <div style={{display:"flex",gap:3,marginLeft:"auto"}}>
            {TIMEFRAMES.map(tf=>(
              <button key={tf.label} onClick={()=>setTimeframe(tf.seconds)} style={{
                background:tf.seconds===timeframe?"#1a2a1a":"transparent",
                border:`1px solid ${tf.seconds===timeframe?"#2a5a2a":"#1e2028"}`,
                color:tf.seconds===timeframe?"#4adc8a":"#3a3d48",
                borderRadius:4,padding:"3px 7px",fontSize:11,cursor:"pointer",
              }}>{tf.label}</button>
            ))}
          </div>

          <div style={{display:"flex",gap:3}}>
            {[1,3,6].map(h=>(
              <button key={h} onClick={()=>setHoursBack(h)} style={{
                background:h===hoursBack?"#1a1c24":"transparent",
                border:`1px solid ${h===hoursBack?"#2a2d35":"transparent"}`,
                color:h===hoursBack?"#c8cad0":"#3a3d48",
                borderRadius:4,padding:"3px 7px",fontSize:11,cursor:"pointer",
              }}>{h}H</button>
            ))}
          </div>

          <button onClick={fetchData} disabled={loading} style={{
            background:"#1a2f4a",border:"1px solid #1e4070",
            color:loading?"#3a5070":"#4a9af0",
            borderRadius:6,padding:"4px 10px",fontSize:11,cursor:loading?"not-allowed":"pointer",
          }}>{loading?"…":"↻"}</button>
          <button onClick={()=>setAutoRefresh(v=>!v)} style={{
            background:autoRefresh?"#1a3a1a":"transparent",
            border:`1px solid ${autoRefresh?"#2a6a2a":"#1e2028"}`,
            color:autoRefresh?"#4adc4a":"#3a3d48",
            borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer",
          }}>{autoRefresh?"●":"○"}</button>
        </div>

        {/* Row 2: symbols — scrollable on mobile */}
        <div style={{display:"flex",gap:4,overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:2}}>
          {SYMBOLS.map(s=>(
            <button key={s.id} onClick={()=>setSymbol(s.id)} style={{
              background:s.id===symbol?"#1e3a5f":"transparent",
              border:`1px solid ${s.id===symbol?"#2a5a9f":"#1e2028"}`,
              color:s.id===symbol?"#60a8f8":"#55575f",
              borderRadius:5,padding:"3px 8px",fontSize:10,cursor:"pointer",
              fontFamily:"monospace",flexShrink:0,
              display:"flex",flexDirection:"column",alignItems:"center",lineHeight:1.2,
            }}>
              <span style={{fontSize:7,color:s.id===symbol?"#3a7ab0":"#2a2d35"}}>{s.group}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"12px 14px"}}>
        {/* Error */}
        {error&&(
          <div style={{background:"#1a0d0d",border:"1px solid #4a1a1a",borderRadius:8,
            padding:"10px 14px",marginBottom:12,color:"#f06060",fontSize:12,
            display:"flex",alignItems:"center",gap:10}}>
            <span style={{flex:1}}>⚠ {error}</span>
            <button onClick={fetchData} style={{background:"#2a1010",border:"1px solid #6a2020",
              color:"#f08080",borderRadius:5,padding:"3px 10px",fontSize:11,cursor:"pointer"}}>↻ Retry</button>
          </div>
        )}

        {/* Loading */}
        {loading&&!data&&(
          <div style={{...card(),padding:"32px",textAlign:"center",marginBottom:12}}>
            <div style={{color:"#3a3d48",fontSize:12,marginBottom:4}}>Fetching {symbol}…</div>
            <div style={{color:"#2a2d35",fontSize:10}}>Backend may take 10–15s to wake up on first request</div>
          </div>
        )}

        {/* Stats */}
        {data&&(
          <div style={{display:"flex",gap:8,marginBottom:12,overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:2}}>
            <StatCard label="Price"      value={`$${fmt(sum.last_price)}`} sub={symbol} />
            <StatCard label="Net Δ"      value={sum.net_delta>0?`+${fmtV(sum.net_delta)}`:fmtV(sum.net_delta)} sub={isBull?"Buying":"Selling"} accent={isBull?"#4adc8a":"#f06060"} />
            <StatCard label="Bias"       value={isBull?"BULL":"BEAR"} sub={`${data.candle_count}c`} accent={isBull?"#4adc8a":"#f06060"} />
            <StatCard label="POC"        value={`$${fmt(sum.poc)}`} sub="Point of control" accent="#f0c04a" />
            <StatCard label="VA"         value={`${fmt(sum.val)}–${fmt(sum.vah)}`} sub="70% volume" accent="#a060f0" />
            <StatCard label="Spikes"     value={sum.spike_count??0} sub="Vol anomalies" accent={sum.spike_count>0?"#f08040":"#55575f"} />
            <StatCard label="Diverg"     value={sum.divergence_count??0} sub="Δ vs price" accent={sum.divergence_count>0?"#f06060":"#55575f"} />
            <StatCard label="Absorb"     value={sum.absorption_count??0} sub="High vol·low rng" accent={sum.absorption_count>0?"#a060f0":"#55575f"} />
          </div>
        )}

        {/* Tabs — scrollable */}
        <div style={{display:"flex",gap:0,marginBottom:12,borderBottom:"1px solid #1a1c24",
          overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          {TABS.map(({key,label})=>(
            <button key={key} onClick={()=>setActiveTab(key)} style={{
              background:"transparent",border:"none",
              borderBottom:`2px solid ${activeTab===key?"#4a9af0":"transparent"}`,
              color:activeTab===key?"#e2e4ec":"#3a3d48",
              padding:"7px 12px",fontSize:11,cursor:"pointer",
              fontWeight:activeTab===key?600:400,marginBottom:-1,flexShrink:0,
            }}>{label}</button>
          ))}
        </div>

        {/* ── CHART TAB ── */}
        {data&&activeTab==="chart"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:10,color:"#3a3d48"}}>Overlays:</span>
              <Toggle label="Sessions"   value={showSess} onChange={setShowSess}  color="#4a8af0"/>
              <Toggle label="Divergence" value={showDiv}  onChange={setShowDiv}   color="#f06060"/>
              <Toggle label="Absorption" value={showAbs}  onChange={setShowAbs}   color="#a060f0"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:isMob()?"1fr":"1fr 240px",gap:10}}>
              <div style={{...card(),padding:0,overflow:"hidden"}}>
                <div style={{padding:"10px 14px 6px"}}>
                  <SH title={`${symbol} · ${TIMEFRAMES.find(t=>t.seconds===timeframe)?.label}`}
                      sub={`POC $${fmt(sum.poc)} · VAH $${fmt(sum.vah)} · VAL $${fmt(sum.val)}`}/>
                </div>
                <div style={{height:isMob()?260:340}}>
                  <CandleChart candles={candles} summary={sum} showSessions={showSess} showDiv={showDiv} showAbs={showAbs}/>
                </div>
                <div style={{height:50,borderTop:"1px solid #1a1c24"}}>
                  <VolumeBars candles={candles}/>
                </div>
                <div style={{padding:"6px 14px",display:"flex",gap:10,fontSize:9,color:"#3a3d48",
                  flexWrap:"wrap",borderTop:"1px solid #1a1c24"}}>
                  {[["#26a65b","Bull"],["#c0392b","Bear"],["#f08040","Spike"],["#a060f0","Absorb"],
                    ["#f06060","▼Div"],["#4adc8a","▲Div"]].map(([c,l])=>(
                    <span key={l} style={{display:"flex",alignItems:"center",gap:3}}>
                      <span style={{width:7,height:7,background:c,borderRadius:1,display:"inline-block"}}/>
                      {l}
                    </span>
                  ))}
                </div>
              </div>
              {/* Vol Profile sidebar — hidden on mobile for chart tab */}
              {!isMob()&&(
                <div style={{...card(),overflowY:"hidden"}}>
                  <SH title="Volume Profile"/>
                  <div style={{fontSize:11,marginBottom:8}}>
                    {[["POC",sum.poc,"#f0c04a"],["VAH",sum.vah,"#a060f0"],["VAL",sum.val,"#a060f0"]].map(([l,v,c])=>(
                      <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                        <span style={{color:"#55575f"}}>{l}</span>
                        <span style={{color:c,fontFamily:"monospace"}}>${fmt(v)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:320,overflowY:"auto"}}>
                    {[...profSlice].reverse().map((p,i)=>{
                      const isPoc=p.price===sum.poc, inVa=p.price>=sum.val&&p.price<=sum.vah;
                      return(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:5}}>
                          <span style={{fontSize:9,fontFamily:"monospace",
                            color:isPoc?"#f0c04a":inVa?"#a060f0":"#2a2d35",minWidth:50,textAlign:"right"}}>{fmt(p.price)}</span>
                          <div style={{height:7,width:`${p.pct}%`,
                            background:isPoc?"#8a6a10":inVa?"#3a2060":"#1a2030",
                            borderRadius:1,minWidth:2}}/>
                          {isPoc&&<span style={{fontSize:7,color:"#f0c04a"}}>●</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── FOOTPRINT TAB ── */}
        {activeTab==="footprint"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{...card()}}>
              <SH title="Footprint Candles" sub="Buy vol (top) · Sell vol (bottom) per price level"/>
              <div style={{fontSize:11,color:"#55575f",marginBottom:10,lineHeight:1.6}}>
                Green cells = buyers dominant at that price tick · Red = sellers · Intensity = volume concentration
              </div>
              {loading&&<div style={{color:"#3a3d48",fontSize:12}}>Loading footprint data…</div>}
              {!loading&&(!footprint||!footprint.length)&&(
                <div style={{display:"flex",flexDirection:"column",gap:8,alignItems:"flex-start"}}>
                  <div style={{color:"#3a3d48",fontSize:12}}>Click to load footprint candles for {symbol}.</div>
                  <button onClick={fetchFootprint} style={{background:"#1a2f4a",border:"1px solid #1e4070",
                    color:"#4a9af0",borderRadius:6,padding:"6px 14px",fontSize:12,cursor:"pointer"}}>
                    Load Footprint
                  </button>
                </div>
              )}
              {footprint?.length>0&&(
                <div style={{height:isMob()?300:440,width:"100%"}}>
                  <FootprintChart footprint={footprint}/>
                </div>
              )}
            </div>
            <div style={{...card()}}>
              <SH title="How to read footprint candles"/>
              <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:12,color:"#7a7d88",lineHeight:1.65}}>
                <div style={{borderLeft:"3px solid #4adc8a",paddingLeft:10}}>
                  <span style={{color:"#4adc8a",fontWeight:600}}>Dark green cell</span> — heavy buying at this exact price. Institutions aggressively absorbing offers.
                </div>
                <div style={{borderLeft:"3px solid #f06060",paddingLeft:10}}>
                  <span style={{color:"#f06060",fontWeight:600}}>Dark red cell</span> — heavy selling at this exact price. Look for rejection signals when price returns here.
                </div>
                <div style={{borderLeft:"3px solid #f0c04a",paddingLeft:10}}>
                  <span style={{color:"#f0c04a",fontWeight:600}}>Unfinished auction</span> — if the top or bottom of a candle has very low volume, price may return to "finish" trading at those levels.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── HEATMAP TAB ── */}
        {activeTab==="heatmap"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{...card()}}>
              <SH title="Liquidity Heatmap" sub="X=time · Y=price · colour intensity=volume"/>
              <div style={{fontSize:11,color:"#55575f",marginBottom:10,lineHeight:1.6}}>
                Blue = low volume · Teal = moderate · Orange/Amber = high institutional activity
              </div>
              {loading&&<div style={{color:"#3a3d48",fontSize:12}}>Loading heatmap…</div>}
              {!loading&&!heatmap&&(
                <div style={{display:"flex",flexDirection:"column",gap:8,alignItems:"flex-start"}}>
                  <div style={{color:"#3a3d48",fontSize:12}}>Click to build the liquidity heatmap for {symbol}.</div>
                  <button onClick={fetchHeatmap} style={{background:"#1a2f4a",border:"1px solid #1e4070",
                    color:"#4a9af0",borderRadius:6,padding:"6px 14px",fontSize:12,cursor:"pointer"}}>
                    Load Heatmap
                  </button>
                </div>
              )}
              {heatmap&&(
                <div style={{height:isMob()?280:420,width:"100%"}}>
                  <LiquidityHeatmap heatmap={heatmap}/>
                </div>
              )}
            </div>
            <div style={{...card()}}>
              <SH title="How to read the heatmap"/>
              <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:12,color:"#7a7d88",lineHeight:1.65}}>
                <div style={{borderLeft:"3px solid #f08040",paddingLeft:10}}>
                  <span style={{color:"#f08040",fontWeight:600}}>Bright orange/amber bands</span> — horizontal bands of high intensity show strong support or resistance zones. Price will often react when it returns to these levels.
                </div>
                <div style={{borderLeft:"3px solid #4a9af0",paddingLeft:10}}>
                  <span style={{color:"#4a9af0",fontWeight:600}}>Vertical columns</span> — a single bright column means one time period had unusually high activity across many prices. This usually marks a news event or institutional entry.
                </div>
                <div style={{borderLeft:"3px solid #55575f",paddingLeft:10}}>
                  Dark areas = low liquidity — price can move quickly through these zones with little resistance.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SESSIONS TAB ── */}
        {data&&activeTab==="sessions"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{...card()}}>
              <SH title="Session Breakdown" sub="Volume and delta by session"/>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {["asia","london","overlap","ny"].map(s=>{
                  const st=sess[s]; if(!st) return null;
                  const sc=SC[s];
                  const total=Object.values(sess).reduce((a,b)=>a+(b.volume||0),0);
                  const pct=total>0?((st.volume/total)*100).toFixed(1):"0";
                  return(
                    <div key={s} style={{flex:1,minWidth:100,background:"#13151c",
                      border:`1px solid ${sc.color}40`,borderLeft:`3px solid ${sc.color}`,
                      borderRadius:8,padding:"10px 12px"}}>
                      <div style={{fontSize:10,color:sc.color,textTransform:"uppercase",marginBottom:4,fontWeight:600}}>{sc.label}</div>
                      <div style={{fontSize:14,color:"#e2e4ec",fontFamily:"monospace",fontWeight:600}}>{pct}%</div>
                      <div style={{fontSize:11,color:st.delta>=0?"#4adc8a":"#f06060"}}>Δ {st.delta>0?"+":""}{fmtV(st.delta)}</div>
                      {st.spikes>0&&<div style={{fontSize:10,color:"#f08040"}}>⚡ {st.spikes}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── DIVERGENCE TAB ── */}
        {data&&activeTab==="diverge"&&(
          <div style={{...card()}}>
            <SH title="Delta Divergence" sub={`${sum.divergence_count??0} signals`}/>
            {candles.filter(c=>c.divergence).length===0
              ?<div style={{color:"#3a3d48",fontSize:12}}>No divergences in this window.</div>
              :candles.filter(c=>c.divergence).slice(-10).reverse().map((d,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  background:d.divergence==="bearish"?"#1a0808":"#081a0a",
                  border:`1px solid ${d.divergence==="bearish"?"#4a1010":"#104a18"}`,
                  borderLeft:`3px solid ${d.divergence==="bearish"?"#f06060":"#4adc8a"}`,
                  borderRadius:7,padding:"8px 11px",fontSize:11,marginBottom:5,flexWrap:"wrap",gap:6}}>
                  <span style={{color:d.divergence==="bearish"?"#f06060":"#4adc8a",fontWeight:600}}>
                    {d.divergence==="bearish"?"▼ Bear":"▲ Bull"}
                  </span>
                  <span style={{color:"#7a7d88",fontFamily:"monospace"}}>{fmtTs(d.time)} UTC</span>
                  <span style={{color:"#e2e4ec"}}>${fmt(d.close)}</span>
                  <span style={{color:"#f0c04a"}}>Str:{d.div_strength}</span>
                </div>
              ))
            }
          </div>
        )}

        {/* ── ORDER FLOW TAB ── */}
        {data&&activeTab==="delta"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{...card(),padding:"14px 14px 8px"}}>
              <SH title="Volume Delta" sub="Buy − Sell per candle"/>
              <ResponsiveContainer width="100%" height={isMob()?160:200}>
                <BarChart data={deltaData} margin={{top:0,right:0,bottom:0,left:0}}>
                  <XAxis dataKey="time" tick={{fill:"#3a3d48",fontSize:9}} axisLine={false} tickLine={false} interval={isMob()?14:9}/>
                  <YAxis tick={{fill:"#3a3d48",fontSize:9}} axisLine={false} tickLine={false} width={44} tickFormatter={v=>v.toFixed(1)}/>
                  <Tooltip content={<DT/>}/>
                  <ReferenceLine y={0} stroke="#2a2d35" strokeWidth={1}/>
                  <Bar dataKey="delta" name="Delta" radius={[2,2,0,0]} maxBarSize={10}>
                    {deltaData.map((e,i)=>(
                      <Cell key={i} fill={e.spike?"#f08040":e.div?(e.div==="bearish"?"#f06060":"#4adc8a"):e.delta>=0?"#2a6a4a":"#6a2a2a"}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{...card(),padding:"14px 14px 8px"}}>
              <SH title="Cumulative Delta" sub="Divergence from price = exhaustion"/>
              <ResponsiveContainer width="100%" height={isMob()?130:160}>
                <BarChart data={deltaData} margin={{top:0,right:0,bottom:0,left:0}}>
                  <XAxis dataKey="time" tick={{fill:"#3a3d48",fontSize:9}} axisLine={false} tickLine={false} interval={isMob()?14:9}/>
                  <YAxis tick={{fill:"#3a3d48",fontSize:9}} axisLine={false} tickLine={false} width={44} tickFormatter={v=>v.toFixed(0)}/>
                  <Tooltip content={<DT/>}/>
                  <ReferenceLine y={0} stroke="#2a2d35"/>
                  <Bar dataKey="cum" name="Cum.Δ" radius={[2,2,0,0]} maxBarSize={10}>
                    {deltaData.map((e,i)=><Cell key={i} fill={e.cum>=0?"#1e4a3a":"#4a1e1e"}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {data&&activeTab==="profile"&&(
          <div style={{...card()}}>
            <SH title="Volume Profile" sub={`${profile.length} levels · POC $${fmt(sum.poc)}`}/>
            <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:500,overflowY:"auto"}}>
              {[...profile].reverse().map((p,i)=>{
                const isPoc=p.price===sum.poc, inVa=p.price>=sum.val&&p.price<=sum.vah;
                return(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:10,fontFamily:"monospace",
                      color:isPoc?"#f0c04a":inVa?"#a060f0":"#3a3d48",
                      minWidth:58,textAlign:"right"}}>{fmt(p.price)}</span>
                    <div style={{height:9,width:`${p.pct*0.65}%`,
                      background:isPoc?"#8a6a10":inVa?"#3a2060":"#1a2030",
                      borderRadius:2,minWidth:2}}/>
                    <span style={{fontSize:9,color:isPoc?"#f0c04a":inVa?"#7040a0":"#2a2d35"}}>{p.pct.toFixed(1)}%</span>
                    {isPoc&&<span style={{fontSize:9,color:"#f0c04a",fontWeight:600}}>POC</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CORRELATION TAB ── */}
        {activeTab==="corr"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{...card()}}>
              <SH title="Correlation Matrix" sub="Pearson correlation of closing prices across all symbols"/>
              <div style={{fontSize:11,color:"#55575f",marginBottom:10}}>
                Correlations above +0.7 or below -0.7 are significant. If Gold and Silver diverge, one may be leading the other.
              </div>
              {corrLoading&&<div style={{color:"#3a3d48",fontSize:12}}>Computing correlations across {SYMBOLS.length} symbols…</div>}
              {!corrLoading&&!corr&&(
                <div style={{display:"flex",flexDirection:"column",gap:8,alignItems:"flex-start"}}>
                  <div style={{color:"#3a3d48",fontSize:12}}>Click to load real-time correlation matrix.</div>
                  <button onClick={fetchCorr} style={{background:"#1a2f4a",border:"1px solid #1e4070",
                    color:"#4a9af0",borderRadius:6,padding:"6px 14px",fontSize:12,cursor:"pointer"}}>
                    Load Correlation
                  </button>
                </div>
              )}
              {corr&&<CorrelationMatrix matrix={corr.matrix} symbols={corr.symbols}/>}
              {corr&&<div style={{fontSize:10,color:"#3a3d48",marginTop:8}}>{corr.candles_used} candles used · 5-min timeframe</div>}
            </div>
          </div>
        )}

        <div style={{marginTop:12,fontSize:9,color:"#1e2028",textAlign:"center"}}>
          Data: Dukascopy public feed · All times UTC
          {lastFetch&&` · ${lastFetch.toUTCString().slice(17,25)}`}
        </div>
      </div>
    </div>
  );
}
