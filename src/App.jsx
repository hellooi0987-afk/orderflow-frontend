import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const SYMBOLS = [
  { id:"XAUUSD",    label:"Gold",    group:"Commod" },
  { id:"XAGUSD",    label:"Silver",  group:"Commod" },
  { id:"USOUSD",    label:"WTI Oil", group:"Commod" },
  { id:"BRTUSD",    label:"Brent",   group:"Commod" },
  { id:"NATGASUSD", label:"Nat Gas", group:"Commod" },
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

const SESSION_COLORS = {
  asia:    { bg:"rgba(30,60,100,0.18)",  border:"rgba(60,120,200,0.3)",  label:"Asia",    color:"#4a8af0" },
  london:  { bg:"rgba(20,80,40,0.18)",   border:"rgba(40,160,80,0.3)",   label:"London",  color:"#4adc8a" },
  ny:      { bg:"rgba(80,30,10,0.18)",   border:"rgba(200,80,20,0.3)",   label:"NY",      color:"#f08040" },
  overlap: { bg:"rgba(60,40,10,0.22)",   border:"rgba(220,160,20,0.35)", label:"Overlap", color:"#f0c04a" },
  off:     { bg:"transparent",           border:"transparent",           label:"Off",     color:"#3a3d48" },
};

const CORR_COLORS = [
  [1.0,  "#26a65b"], [0.7,  "#4adc8a"], [0.4,  "#2a4a2a"],
  [0.1,  "#1a1c24"], [-0.1, "#1a1c24"], [-0.4, "#4a1a1a"],
  [-0.7, "#c0392b"], [-1.0, "#8b0000"],
];

const fmt    = (n) => n==null?"—":Number(n).toFixed(2);
const fmtVol = (n) => n==null?"—":Number(n).toFixed(1);
const fmtTs  = (e)  => new Date(e*1000).toUTCString().slice(17,22);

function corrColor(v) {
  if (v==null) return "#1a1c24";
  for (let i=0; i<CORR_COLORS.length-1; i++) {
    if (v >= CORR_COLORS[i+1][0]) return CORR_COLORS[i][1];
  }
  return CORR_COLORS[CORR_COLORS.length-1][1];
}
function corrTextColor(v) {
  if (v==null) return "#3a3d48";
  return Math.abs(v)>0.5 ? "#e2e4ec" : "#7a7d88";
}

// ─── Candlestick canvas ─────────────────────────────────────────────────────
function CandleChart({ candles, summary, showSessions, showDivergence, showAbsorption }) {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !candles.length) return;
    const dpr=window.devicePixelRatio||1, W=cv.offsetWidth, H=cv.offsetHeight;
    cv.width=W*dpr; cv.height=H*dpr;
    const ctx=cv.getContext("2d"); ctx.scale(dpr,dpr);
    const PL=64,PR=10,PT=22,PB=36, cW=W-PL-PR, cH=H-PT-PB;
    const shown=candles.slice(-120);
    const prices=shown.flatMap(c=>[c.high,c.low]);
    const lo0=Math.min(...prices),hi0=Math.max(...prices);
    const pad=(hi0-lo0)*0.08||1, lo=lo0-pad, hi=hi0+pad;
    const toY=p=>PT+cH-((p-lo)/(hi-lo))*cH;
    const bW=Math.max(2,Math.floor(cW/shown.length)-1);

    // Sessions
    if (showSessions) {
      let bs=null,bsess=null;
      shown.forEach((c,i) => {
        const s=c.session||"off", x=PL+i*(bW+1);
        if (s!==bsess) {
          if (bsess&&bsess!=="off"&&SESSION_COLORS[bsess]) {
            const sc=SESSION_COLORS[bsess];
            ctx.fillStyle=sc.bg; ctx.fillRect(bs,PT,x-bs,cH);
            ctx.fillStyle=sc.border; ctx.fillRect(bs,PT,x-bs,2);
          }
          bs=x; bsess=s;
        }
        if (i===shown.length-1&&bsess&&bsess!=="off") {
          const sc=SESSION_COLORS[bsess];
          ctx.fillStyle=sc.bg; ctx.fillRect(bs,PT,(x+bW)-bs,cH);
          ctx.fillStyle=sc.border; ctx.fillRect(bs,PT,(x+bW)-bs,2);
        }
      });
      let last=null;
      shown.forEach((c,i)=>{
        const s=c.session||"off",x=PL+i*(bW+1);
        if (s!==last&&s!=="off"&&SESSION_COLORS[s]) {
          ctx.fillStyle=SESSION_COLORS[s].color;
          ctx.font="bold 9px monospace"; ctx.textAlign="left";
          ctx.fillText(SESSION_COLORS[s].label.toUpperCase(),x+2,PT-5);
          last=s;
        }
      });
    }

    // Grid
    ctx.strokeStyle="#1a1c24"; ctx.lineWidth=0.5;
    for (let i=0;i<=5;i++) {
      const y=PT+(cH/5)*i, p=hi-((hi-lo)/5)*i;
      ctx.beginPath(); ctx.moveTo(PL,y); ctx.lineTo(W-PR,y); ctx.stroke();
      ctx.fillStyle="#3a3d48"; ctx.font="10px monospace"; ctx.textAlign="right";
      ctx.fillText(p.toFixed(2),PL-5,y+4);
    }

    // POC
    if (summary?.poc) {
      const y=toY(summary.poc);
      ctx.strokeStyle="#8a6a10"; ctx.lineWidth=1; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(PL,y); ctx.lineTo(W-PR,y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle="#f0c04a";
      ctx.font="bold 9px monospace"; ctx.textAlign="left";
      ctx.fillText("POC",W-PR-28,y-3);
    }

    // VAH/VAL
    if (summary?.vah&&summary?.val) {
      [summary.vah,summary.val].forEach(p=>{
        const y=toY(p); ctx.strokeStyle="#3a2060"; ctx.lineWidth=0.8;
        ctx.setLineDash([2,4]); ctx.beginPath(); ctx.moveTo(PL,y); ctx.lineTo(W-PR,y); ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // Absorption highlight
    if (showAbsorption) shown.forEach((c,i)=>{
      if (!c.is_absorption) return;
      const x=PL+i*(bW+1);
      ctx.fillStyle="rgba(160,100,200,0.1)"; ctx.fillRect(x-2,PT,bW+4,cH);
      ctx.strokeStyle="rgba(160,100,200,0.35)"; ctx.lineWidth=0.8; ctx.strokeRect(x-2,PT,bW+4,cH);
    });

    // Candles
    shown.forEach((c,i)=>{
      const x=PL+i*(bW+1)+Math.floor(bW/2), isUp=c.close>=c.open;
      let col=isUp?"#26a65b":"#c0392b";
      if (c.is_absorption) col="#a060f0";
      if (c.is_spike)      col="#f08040";
      ctx.strokeStyle=col; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x,toY(c.high)); ctx.lineTo(x,toY(c.low)); ctx.stroke();
      const bt=toY(Math.max(c.open,c.close)), bb=toY(Math.min(c.open,c.close));
      ctx.fillStyle=col; ctx.fillRect(x-Math.floor(bW/2),bt,bW,Math.max(1,bb-bt));
    });

    // Divergence markers
    if (showDivergence) shown.forEach((c,i)=>{
      if (!c.divergence) return;
      const x=PL+i*(bW+1)+Math.floor(bW/2), bear=c.divergence==="bearish";
      const my=bear?toY(c.high)-10:toY(c.low)+10;
      ctx.fillStyle=bear?"#f06060":"#4adc8a"; ctx.beginPath();
      if (bear){ctx.moveTo(x,my);ctx.lineTo(x-5,my-8);ctx.lineTo(x+5,my-8);}
      else{ctx.moveTo(x,my);ctx.lineTo(x-5,my+8);ctx.lineTo(x+5,my+8);}
      ctx.closePath(); ctx.fill();
      ctx.fillStyle=bear?"#f06060":"#4adc8a"; ctx.font="bold 8px monospace"; ctx.textAlign="center";
      ctx.fillText(bear?"▼":"▲",x,bear?my-12:my+20);
    });

    // Time axis
    ctx.fillStyle="#3a3d48"; ctx.font="10px monospace"; ctx.textAlign="center";
    const step=Math.ceil(shown.length/8);
    shown.forEach((c,i)=>{
      if (i%step===0) ctx.fillText(fmtTs(c.time),PL+i*(bW+1)+Math.floor(bW/2),H-PB+14);
    });
  }, [candles,summary,showSessions,showDivergence,showAbsorption]);

  const onMove=(e)=>{
    const cv=ref.current; if(!cv||!candles.length) return;
    const rect=cv.getBoundingClientRect(), x=e.clientX-rect.left;
    const shown=candles.slice(-120), bW=Math.max(2,Math.floor((cv.offsetWidth-74)/shown.length)-1);
    const idx=Math.floor((x-64)/(bW+1));
    if (idx>=0&&idx<shown.length) setTip({x:e.clientX-rect.left,y:e.clientY-rect.top,c:shown[idx]});
    else setTip(null);
  };

  return (
    <div style={{position:"relative",width:"100%",height:"100%"}}>
      <canvas ref={ref} style={{width:"100%",height:"100%",display:"block"}}
        onMouseMove={onMove} onMouseLeave={()=>setTip(null)} />
      {tip && (
        <div style={{position:"absolute",left:tip.x+14,top:Math.max(10,tip.y-10),
          background:"#0d0f14",border:"1px solid #2a2d35",borderRadius:6,
          padding:"8px 12px",fontSize:11,color:"#c8cad0",pointerEvents:"none",
          zIndex:10,fontFamily:"monospace",minWidth:180}}>
          <div style={{color:"#55575f",marginBottom:3}}>{fmtTs(tip.c.time)} UTC</div>
          {tip.c.session&&<div style={{color:SESSION_COLORS[tip.c.session]?.color,fontSize:10,marginBottom:3}}>{SESSION_COLORS[tip.c.session]?.label} session</div>}
          <div>O <span style={{color:"#e2e4ec"}}>{fmt(tip.c.open)}</span></div>
          <div>H <span style={{color:"#4adc8a"}}>{fmt(tip.c.high)}</span></div>
          <div>L <span style={{color:"#f06060"}}>{fmt(tip.c.low)}</span></div>
          <div>C <span style={{color:"#e2e4ec"}}>{fmt(tip.c.close)}</span></div>
          <div style={{marginTop:3}}>Vol <span style={{color:"#f0c04a"}}>{fmtVol(tip.c.volume)}</span></div>
          <div>Δ <span style={{color:tip.c.delta>=0?"#4adc8a":"#f06060"}}>{fmt(tip.c.delta)}</span></div>
          {tip.c.is_spike&&<div style={{color:"#f08040",marginTop:3}}>⚡ SPIKE {tip.c.spike_ratio}×</div>}
          {tip.c.divergence&&<div style={{color:tip.c.divergence==="bearish"?"#f06060":"#4adc8a",marginTop:3}}>{tip.c.divergence==="bearish"?"▼ BEARISH DIV":"▲ BULLISH DIV"} str:{tip.c.divergence_strength}</div>}
          {tip.c.is_absorption&&<div style={{color:"#a060f0",marginTop:3}}>◈ ABSORPTION</div>}
        </div>
      )}
    </div>
  );
}

// ─── Volume bars ─────────────────────────────────────────────────────────────
function VolumeBars({ candles }) {
  const ref=useRef(null);
  useEffect(()=>{
    const cv=ref.current; if(!cv||!candles.length) return;
    const dpr=window.devicePixelRatio||1,W=cv.offsetWidth,H=cv.offsetHeight;
    cv.width=W*dpr; cv.height=H*dpr;
    const ctx=cv.getContext("2d"); ctx.scale(dpr,dpr);
    const PL=64,PR=10,PT=4,PB=4,cW=W-PL-PR,cH=H-PT-PB;
    const shown=candles.slice(-120), mv=Math.max(...shown.map(c=>c.volume));
    const bW=Math.max(2,Math.floor(cW/shown.length)-1);
    shown.forEach((c,i)=>{
      const x=PL+i*(bW+1), h=(c.volume/mv)*cH, isUp=c.close>=c.open;
      ctx.fillStyle=c.is_absorption?"#5a2080":c.is_spike?"#f08040":isUp?"#1a4a2a":"#4a1a1a";
      ctx.fillRect(x,H-PB-h,bW,h);
    });
    ctx.fillStyle="#3a3d48"; ctx.font="9px monospace"; ctx.textAlign="right";
    ctx.fillText(fmtVol(mv),PL-5,PT+10);
  },[candles]);
  return <canvas ref={ref} style={{width:"100%",height:"100%",display:"block"}} />;
}

// ─── Footprint chart ─────────────────────────────────────────────────────────
function FootprintChart({ candles }) {
  const ref=useRef(null);
  const [tip,setTip]=useState(null);
  const shown=candles.slice(-30); // footprint shows fewer candles for readability

  useEffect(()=>{
    const cv=ref.current; if(!cv||!shown.length) return;
    const dpr=window.devicePixelRatio||1,W=cv.offsetWidth,H=cv.offsetHeight;
    cv.width=W*dpr; cv.height=H*dpr;
    const ctx=cv.getContext("2d"); ctx.scale(dpr,dpr);
    const PL=64,PR=10,PT=20,PB=36, cW=W-PL-PR, cH=H-PT-PB;
    const prices=shown.flatMap(c=>[c.high,c.low]);
    const lo0=Math.min(...prices),hi0=Math.max(...prices);
    const pad=(hi0-lo0)*0.08||1, lo=lo0-pad, hi=hi0+pad;
    const toY=p=>PT+cH-((p-lo)/(hi-lo))*cH;
    const bW=Math.max(8,Math.floor(cW/shown.length)-4);

    // Grid
    ctx.strokeStyle="#1a1c24"; ctx.lineWidth=0.5;
    for(let i=0;i<=5;i++){
      const y=PT+(cH/5)*i,p=hi-((hi-lo)/5)*i;
      ctx.beginPath();ctx.moveTo(PL,y);ctx.lineTo(W-PR,y);ctx.stroke();
      ctx.fillStyle="#3a3d48";ctx.font="10px monospace";ctx.textAlign="right";
      ctx.fillText(p.toFixed(2),PL-5,y+4);
    }

    shown.forEach((c,i)=>{
      const x=PL+i*(bW+4);
      const fp=c.footprint||[];
      if(!fp.length) return;
      const maxTot=Math.max(...fp.map(f=>f.total||0),0.001);
      fp.forEach(f=>{
        const y1=toY(f.price_hi),y2=toY(f.price_lo),rowH=Math.max(2,y2-y1);
        const buyW=Math.floor((f.buy_vol/maxTot)*bW*0.48);
        const selW=Math.floor((f.sell_vol/maxTot)*bW*0.48);

        // Buy side (green, left half)
        ctx.fillStyle=`rgba(38,166,91,${0.3+0.7*(f.buy_vol/maxTot)})`;
        ctx.fillRect(x,y1+1,buyW,rowH-2);

        // Sell side (red, right half)
        ctx.fillStyle=`rgba(192,57,43,${0.3+0.7*(f.sell_vol/maxTot)})`;
        ctx.fillRect(x+bW-selW,y1+1,selW,rowH-2);

        // Delta label in middle
        if (rowH>10) {
          const d=f.delta;
          ctx.fillStyle=d>0?"#4adc8a":d<0?"#f06060":"#55575f";
          ctx.font=`${Math.max(7,Math.min(10,rowH-2))}px monospace`;
          ctx.textAlign="center";
          ctx.fillText(d>0?`+${d.toFixed(1)}`:d.toFixed(1),x+bW/2,y1+rowH/2+3);
        }
      });

      // Candle outline
      const isUp=c.close>=c.open;
      ctx.strokeStyle=isUp?"#26a65b":"#c0392b"; ctx.lineWidth=1;
      const bt=toY(Math.max(c.open,c.close)),bb=toY(Math.min(c.open,c.close));
      ctx.strokeRect(x,bt,bW,Math.max(1,bb-bt));

      // Time label
      ctx.fillStyle="#3a3d48"; ctx.font="9px monospace"; ctx.textAlign="center";
      ctx.fillText(fmtTs(c.time),x+bW/2,H-PB+14);
    });
  },[candles]);

  return (
    <div style={{position:"relative",width:"100%",height:"100%"}}>
      <canvas ref={ref} style={{width:"100%",height:"100%",display:"block"}} />
    </div>
  );
}

// ─── Liquidity Heatmap ───────────────────────────────────────────────────────
function LiquidityHeatmap({ heatmap, candles }) {
  const ref=useRef(null);

  useEffect(()=>{
    const cv=ref.current; if(!cv||!heatmap.length) return;
    const dpr=window.devicePixelRatio||1,W=cv.offsetWidth,H=cv.offsetHeight;
    cv.width=W*dpr; cv.height=H*dpr;
    const ctx=cv.getContext("2d"); ctx.scale(dpr,dpr);
    const PL=64,PR=10,PT=10,PB=36, cW=W-PL-PR, cH=H-PT-PB;

    // Get unique times and price buckets
    const times=[...new Set(heatmap.map(h=>h.time))].sort((a,b)=>a-b);
    const prices=[...new Set(heatmap.map(h=>h.price_lo))].sort((a,b)=>a-b);
    const nT=times.length, nP=prices.length;
    if (!nT||!nP) return;

    const cellW=Math.max(1,Math.floor(cW/nT));
    const cellH=Math.max(1,Math.floor(cH/nP));

    // Build lookup
    const lookup={};
    heatmap.forEach(h=>{ lookup[`${h.time}_${h.price_lo}`]=h.pct; });

    // Draw cells
    times.forEach((t,ti)=>{
      prices.forEach((p,pi)=>{
        const pct=lookup[`${t}_${p}`]||0;
        const alpha=0.05+0.95*(pct/100);
        // Color: dark blue→cyan→yellow→orange for increasing volume
        let r,g,b;
        if (pct<25)      { r=20;  g=40+pct*2; b=100+pct*3; }
        else if (pct<50) { r=20;  g=100+(pct-25)*4; b=180-(pct-25)*4; }
        else if (pct<75) { r=(pct-50)*8; g=200; b=80-(pct-50)*3; }
        else             { r=200+(pct-75)*2; g=200-(pct-75)*4; b=20; }
        ctx.fillStyle=`rgba(${r},${g},${b},${alpha})`;
        const x=PL+ti*cellW, y=PT+(nP-pi-1)*cellH;
        ctx.fillRect(x,y,cellW-1,cellH-1);
      });
    });

    // Price axis
    ctx.fillStyle="#3a3d48"; ctx.font="9px monospace"; ctx.textAlign="right";
    const pStep=Math.max(1,Math.floor(nP/6));
    prices.forEach((p,i)=>{
      if(i%pStep===0){
        const y=PT+(nP-i-1)*cellH+cellH/2;
        ctx.fillText(p.toFixed(2),PL-4,y+3);
      }
    });

    // Time axis
    ctx.fillStyle="#3a3d48"; ctx.font="9px monospace"; ctx.textAlign="center";
    const tStep=Math.max(1,Math.floor(nT/8));
    times.forEach((t,i)=>{
      if(i%tStep===0){
        const x=PL+i*cellW+cellW/2;
        ctx.fillText(fmtTs(t),x,H-PB+14);
      }
    });

    // Color scale legend
    const lx=W-PR-120, ly=PT;
    ctx.font="9px monospace"; ctx.textAlign="center";
    ["Low vol","","","","","High vol"].forEach((lbl,i)=>{
      const pct=i*20, alpha=0.1+0.9*(pct/100);
      let r,g,b;
      if (pct<25)      { r=20; g=40+pct*2; b=100+pct*3; }
      else if (pct<50) { r=20; g=100+(pct-25)*4; b=180-(pct-25)*4; }
      else if (pct<75) { r=(pct-50)*8; g=200; b=80-(pct-50)*3; }
      else             { r=200+(pct-75)*2; g=200-(pct-75)*4; b=20; }
      ctx.fillStyle=`rgba(${r},${g},${b},${alpha})`;
      ctx.fillRect(lx+i*20,ly,18,10);
      if (lbl) { ctx.fillStyle="#3a3d48"; ctx.fillText(lbl,lx+i*20+9,ly+20); }
    });
  },[heatmap]);

  if (!heatmap.length) return (
    <div style={{color:"#3a3d48",fontSize:13,padding:"20px"}}>No heatmap data available.</div>
  );

  return <canvas ref={ref} style={{width:"100%",height:"100%",display:"block"}} />;
}

// ─── Correlation Matrix ───────────────────────────────────────────────────────
function CorrelationMatrix({ corrData }) {
  if (!corrData) return (
    <div style={{color:"#3a3d48",fontSize:13,padding:"20px"}}>Click "Load Correlation" to fetch data.</div>
  );
  const { symbols, matrix, last_prices } = corrData;
  const labels = symbols.map(s => SYMBOLS.find(x=>x.id===s)?.label || s);

  return (
    <div style={{overflowX:"auto"}}>
      <table style={{borderCollapse:"collapse",fontSize:11,fontFamily:"monospace",minWidth:600}}>
        <thead>
          <tr>
            <th style={{padding:"6px 10px",color:"#55575f",textAlign:"left",borderBottom:"1px solid #1a1c24"}}>Symbol</th>
            {labels.map((l,i) => (
              <th key={i} style={{padding:"6px 8px",color:"#55575f",writingMode:"vertical-rl",
                textAlign:"left",borderBottom:"1px solid #1a1c24",maxHeight:80}}>{l}</th>
            ))}
            <th style={{padding:"6px 10px",color:"#55575f",textAlign:"right",borderBottom:"1px solid #1a1c24"}}>Price</th>
          </tr>
        </thead>
        <tbody>
          {symbols.map((s1, ri) => (
            <tr key={s1}>
              <td style={{padding:"4px 10px",color:"#c8cad0",borderBottom:"1px solid #13151c",
                fontWeight:600,whiteSpace:"nowrap"}}>{labels[ri]}</td>
              {symbols.map((s2, ci) => {
                const v = matrix[s1]?.[s2];
                const isSelf = s1===s2;
                return (
                  <td key={s2} style={{
                    padding:"4px 8px", textAlign:"center",
                    background:isSelf?"#1a1c24":corrColor(v),
                    color:isSelf?"#f0c04a":corrTextColor(v),
                    borderBottom:"1px solid #0d0f14",
                    fontWeight:Math.abs(v||0)>0.7?600:400,
                    minWidth:44,
                  }}>
                    {isSelf ? "—" : v!=null ? v.toFixed(2) : "—"}
                  </td>
                );
              })}
              <td style={{padding:"4px 10px",color:"#f0c04a",textAlign:"right",
                borderBottom:"1px solid #13151c",fontFamily:"monospace"}}>
                {last_prices[s1] ? `$${fmt(last_prices[s1])}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Legend */}
      <div style={{display:"flex",gap:16,marginTop:14,fontSize:11,flexWrap:"wrap"}}>
        {[["#26a65b","Strong +corr (>0.7)"],["#4adc8a","Moderate + (0.4-0.7)"],
          ["#1a1c24","No corr (±0.1)"],["#c0392b","Strong -corr (<-0.7)"],["#8b0000","Very negative"]].map(([c,l])=>(
          <span key={l} style={{display:"flex",alignItems:"center",gap:6,color:"#55575f"}}>
            <span style={{width:14,height:10,background:c,borderRadius:2,display:"inline-block"}}/>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Session bar ──────────────────────────────────────────────────────────────
function SessionBar({ sessionStats }) {
  const total=Object.values(sessionStats).reduce((a,b)=>a+(b.volume||0),0);
  return (
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      {["asia","london","overlap","ny"].map(s=>{
        const st=sessionStats[s]; if(!st) return null;
        const sc=SESSION_COLORS[s];
        const pct=total>0?((st.volume/total)*100).toFixed(1):"0";
        return (
          <div key={s} style={{flex:1,minWidth:110,background:"#13151c",
            border:`1px solid ${sc.color}40`,borderLeft:`3px solid ${sc.color}`,
            borderRadius:8,padding:"10px 14px"}}>
            <div style={{fontSize:10,color:sc.color,textTransform:"uppercase",marginBottom:5,fontWeight:600}}>{sc.label}</div>
            <div style={{fontSize:14,color:"#e2e4ec",fontFamily:"monospace",fontWeight:600}}>{pct}% vol</div>
            <div style={{fontSize:11,color:st.delta>=0?"#4adc8a":"#f06060",marginTop:3}}>
              Δ {st.delta>0?"+":""}{fmtVol(st.delta)}
            </div>
            {st.spikes>0&&<div style={{fontSize:10,color:"#f08040",marginTop:2}}>⚡ {st.spikes} spike{st.spikes>1?"s":""}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Toggle pill ──────────────────────────────────────────────────────────────
const Toggle=({label,value,onChange,color="#4a9af0"})=>(
  <button onClick={()=>onChange(!value)} style={{
    background:value?`${color}18`:"transparent",
    border:`1px solid ${value?color:"#1e2028"}`,
    color:value?color:"#3a3d48",
    borderRadius:5,padding:"3px 10px",fontSize:11,cursor:"pointer",
  }}>{label}</button>
);

const StatCard=({label,value,sub,accent})=>(
  <div style={{background:"#13151c",border:"1px solid #1e2028",borderRadius:10,padding:"11px 14px",flex:1,minWidth:110}}>
    <div style={{fontSize:10,color:"#55575f",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4}}>{label}</div>
    <div style={{fontSize:18,fontWeight:600,color:accent||"#e2e4ec",fontFamily:"monospace"}}>{value}</div>
    {sub&&<div style={{fontSize:10,color:"#55575f",marginTop:2}}>{sub}</div>}
  </div>
);

const SH=({title,sub})=>(
  <div style={{marginBottom:12}}>
    <span style={{fontSize:12,fontWeight:600,color:"#7a7d88",letterSpacing:"0.1em",textTransform:"uppercase"}}>{title}</span>
    {sub&&<span style={{fontSize:11,color:"#3a3d48",marginLeft:10}}>{sub}</span>}
  </div>
);

const DT=({active,payload,label})=>{
  if(!active||!payload?.length) return null;
  return (
    <div style={{background:"#0d0f14",border:"1px solid #2a2d35",borderRadius:6,padding:"8px 12px",fontSize:12,color:"#c8cad0"}}>
      <div style={{color:"#7a7d88",marginBottom:4}}>{label}</div>
      {payload.map((p,i)=><div key={i} style={{color:p.color||"#e2e4ec"}}>{p.name}: <strong>{fmt(p.value)}</strong></div>)}
    </div>
  );
};

// ─── Main app ─────────────────────────────────────────────────────────────────
export default function App() {
  const [symbol,      setSymbol]      = useState("XAUUSD");
  const [hoursBack,   setHoursBack]   = useState(6);
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
  const [corrData,    setCorrData]    = useState(null);
  const [corrLoading, setCorrLoading] = useState(false);
  const timerRef=useRef(null);

  const fetchData=useCallback(async()=>{
    setLoading(true); setError(null);
    try {
      const r=await fetch(`${API_BASE}/api/orderflow/${symbol}?hours_back=${hoursBack}&timeframe=${timeframe}&include_heatmap=true`);
      const j=await r.json();
      if(j.error) throw new Error(j.error);
      setData(j); setLastFetch(new Date());
    } catch(e){ setError(e.message); } finally{ setLoading(false); }
  },[symbol,hoursBack,timeframe]);

  const fetchCorr=useCallback(async()=>{
    setCorrLoading(true);
    try {
      const r=await fetch(`${API_BASE}/api/correlation?hours_back=3&timeframe=300`);
      const j=await r.json();
      setCorrData(j);
    } catch(e){ console.error(e); } finally{ setCorrLoading(false); }
  },[]);

  useEffect(()=>{ fetchData(); },[fetchData]);
  useEffect(()=>{
    if(autoRefresh) timerRef.current=setInterval(fetchData,60_000);
    else clearInterval(timerRef.current);
    return()=>clearInterval(timerRef.current);
  },[autoRefresh,fetchData]);

  // Auto-load correlation when tab opens
  useEffect(()=>{ if(activeTab==="corr"&&!corrData) fetchCorr(); },[activeTab]);

  const sum=data?.summary||{}, candles=data?.candles||[];
  const profile=data?.volume_profile||[], sess=data?.session_stats||{};
  const heatmap=data?.heatmap||[], isBull=sum.bias==="bullish";

  const deltaData=candles.slice(-80).map(c=>({
    time:fmtTs(c.time),delta:c.delta,cum:c.cum_delta,spike:c.is_spike,div:c.divergence,
  }));

  const profileSlice=[...profile].sort((a,b)=>b.volume-a.volume).slice(0,50).sort((a,b)=>a.price-b.price);

  const TABS=[
    {key:"chart",   label:"Price Chart"},
    {key:"footprint",label:"Footprint"},
    {key:"heatmap", label:"Heatmap"},
    {key:"sessions",label:"Sessions"},
    {key:"diverge", label:"Divergence"},
    {key:"delta",   label:"Order Flow"},
    {key:"profile", label:"Vol Profile"},
    {key:"corr",    label:"Correlation"},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#0a0b0f",color:"#c8cad0",
      fontFamily:"'IBM Plex Sans',sans-serif",padding:"0 0 40px"}}>

      {/* Top bar */}
      <div style={{background:"#0d0f14",borderBottom:"1px solid #1a1c24",
        padding:"10px 18px",display:"flex",alignItems:"center",gap:10,
        position:"sticky",top:0,zIndex:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:6}}>
          <span style={{fontSize:13,fontWeight:700,color:"#e2e4ec",letterSpacing:"0.12em"}}>ORDER FLOW</span>
          <span style={{fontSize:9,color:"#f08040",border:"1px solid #f0804040",padding:"1px 5px",borderRadius:3}}>PRO</span>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {SYMBOLS.map(s=>(
            <button key={s.id} onClick={()=>setSymbol(s.id)} style={{
              background:s.id===symbol?"#1e3a5f":"transparent",
              border:`1px solid ${s.id===symbol?"#2a5a9f":"#1e2028"}`,
              color:s.id===symbol?"#60a8f8":"#55575f",
              borderRadius:5,padding:"3px 8px",fontSize:10,cursor:"pointer",
              fontFamily:"monospace",display:"flex",flexDirection:"column",
              alignItems:"center",lineHeight:1.2,
            }}>
              <span style={{fontSize:7,color:s.id===symbol?"#3a7ab0":"#2a2d35"}}>{s.group}</span>
              {s.label}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:3}}>
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
          {[1,3,6,12].map(h=>(
            <button key={h} onClick={()=>setHoursBack(h)} style={{
              background:h===hoursBack?"#1a1c24":"transparent",
              border:`1px solid ${h===hoursBack?"#2a2d35":"transparent"}`,
              color:h===hoursBack?"#c8cad0":"#3a3d48",
              borderRadius:4,padding:"3px 7px",fontSize:11,cursor:"pointer",
            }}>{h}H</button>
          ))}
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
          {data?.data_from&&<span style={{fontSize:10,color:"#2a2d35"}}>{data.data_from}</span>}
          <button onClick={fetchData} disabled={loading} style={{
            background:"#1a2f4a",border:"1px solid #1e4070",
            color:loading?"#3a5070":"#4a9af0",
            borderRadius:6,padding:"5px 11px",fontSize:11,cursor:loading?"not-allowed":"pointer",
          }}>{loading?"Loading…":"↻ Refresh"}</button>
          <button onClick={()=>setAutoRefresh(v=>!v)} style={{
            background:autoRefresh?"#1a3a1a":"transparent",
            border:`1px solid ${autoRefresh?"#2a6a2a":"#1e2028"}`,
            color:autoRefresh?"#4adc4a":"#3a3d48",
            borderRadius:6,padding:"5px 11px",fontSize:11,cursor:"pointer",
          }}>{autoRefresh?"● Live":"○ Live"}</button>
        </div>
      </div>

      <div style={{padding:"14px 18px"}}>
        {error&&(
          <div style={{background:"#1a0d0d",border:"1px solid #4a1a1a",borderRadius:8,
            padding:"12px 16px",marginBottom:14,color:"#f06060",fontSize:13}}>
            ⚠ {error}
          </div>
        )}

        {/* Stats */}
        {data&&(
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            <StatCard label="Last Price"  value={`$${fmt(sum.last_price)}`} sub={symbol} />
            <StatCard label="Net Delta"   value={sum.net_delta>0?`+${fmtVol(sum.net_delta)}`:fmtVol(sum.net_delta)} sub={isBull?"Buying dominant":"Selling dominant"} accent={isBull?"#4adc8a":"#f06060"} />
            <StatCard label="Bias"        value={isBull?"BULLISH":"BEARISH"} sub={`${data.candle_count} candles`} accent={isBull?"#4adc8a":"#f06060"} />
            <StatCard label="POC"         value={`$${fmt(sum.poc)}`} sub={`Vol: ${fmtVol(sum.poc_volume)}`} accent="#f0c04a" />
            <StatCard label="Value Area"  value={`${fmt(sum.val)}–${fmt(sum.vah)}`} sub="70% of volume" accent="#a060f0" />
            <StatCard label="Spikes"      value={sum.spike_count??0} sub="Vol anomalies" accent={sum.spike_count>0?"#f08040":"#55575f"} />
            <StatCard label="Divergences" value={sum.divergence_count??0} sub="Delta vs price" accent={sum.divergence_count>0?"#f06060":"#55575f"} />
            <StatCard label="Absorptions" value={sum.absorption_count??0} sub="High vol·low rng" accent={sum.absorption_count>0?"#a060f0":"#55575f"} />
          </div>
        )}

        {/* Tabs */}
        <div style={{display:"flex",gap:0,marginBottom:14,borderBottom:"1px solid #1a1c24",flexWrap:"wrap"}}>
          {TABS.map(({key,label})=>(
            <button key={key} onClick={()=>setActiveTab(key)} style={{
              background:"transparent",border:"none",
              borderBottom:`2px solid ${activeTab===key?"#4a9af0":"transparent"}`,
              color:activeTab===key?"#e2e4ec":"#3a3d48",
              padding:"7px 14px",fontSize:11,cursor:"pointer",
              fontWeight:activeTab===key?600:400,marginBottom:-1,
            }}>{label}</button>
          ))}
        </div>

        {/* ── CHART TAB ── */}
        {data&&activeTab==="chart"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"#3a3d48"}}>Overlays:</span>
              <Toggle label="Sessions"   value={showSess} onChange={setShowSess} color="#4a8af0" />
              <Toggle label="Divergence" value={showDiv}  onChange={setShowDiv}  color="#f06060" />
              <Toggle label="Absorption" value={showAbs}  onChange={setShowAbs}  color="#a060f0" />
              <span style={{marginLeft:"auto",fontSize:10,color:"#2a2d35"}}>
                {TIMEFRAMES.find(t=>t.seconds===timeframe)?.label} · {symbol}
              </span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 260px",gap:12}}>
              <div style={{background:"#0d0f14",border:"1px solid #1a1c24",borderRadius:12,overflow:"hidden"}}>
                <div style={{padding:"12px 16px 6px"}}>
                  <SH title={`${symbol} · ${TIMEFRAMES.find(t=>t.seconds===timeframe)?.label}`}
                    sub={`POC $${fmt(sum.poc)} · VAH $${fmt(sum.vah)} · VAL $${fmt(sum.val)}`} />
                </div>
                <div style={{height:340}}><CandleChart candles={candles} summary={sum}
                  showSessions={showSess} showDivergence={showDiv} showAbsorption={showAbs}/></div>
                <div style={{height:60,borderTop:"1px solid #1a1c24"}}><VolumeBars candles={candles}/></div>
                <div style={{padding:"6px 16px",display:"flex",gap:12,fontSize:10,
                  color:"#3a3d48",flexWrap:"wrap",borderTop:"1px solid #1a1c24"}}>
                  {[["#26a65b","Bullish"],["#c0392b","Bearish"],["#f08040","Spike"],
                    ["#a060f0","Absorption"],["#f06060","Bear DIV▼"],["#4adc8a","Bull DIV▲"]].map(([c,l])=>(
                    <span key={l} style={{display:"flex",alignItems:"center",gap:3}}>
                      <span style={{width:7,height:7,background:c,borderRadius:1,display:"inline-block"}}/>
                      {l}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{background:"#0d0f14",border:"1px solid #1a1c24",borderRadius:12,padding:"14px"}}>
                <SH title="Volume Profile"/>
                <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:10,fontSize:11}}>
                  {[["POC",sum.poc,"#f0c04a"],["VAH",sum.vah,"#a060f0"],["VAL",sum.val,"#a060f0"]].map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between"}}>
                      <span style={{color:"#55575f"}}>{l}</span>
                      <span style={{color:c,fontFamily:"monospace"}}>${fmt(v)}</span>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:380,overflowY:"auto"}}>
                  {[...profileSlice].reverse().map((p,i)=>{
                    const isPoc=p.price===sum.poc, inVa=p.price>=sum.val&&p.price<=sum.vah;
                    return (
                      <div key={i} style={{display:"flex",alignItems:"center",gap:5}}>
                        <span style={{fontSize:9,fontFamily:"monospace",
                          color:isPoc?"#f0c04a":inVa?"#a060f0":"#2a2d35",
                          minWidth:54,textAlign:"right"}}>{fmt(p.price)}</span>
                        <div style={{height:7,width:`${p.pct}%`,
                          background:isPoc?"#8a6a10":inVa?"#3a2060":"#1a2030",
                          borderRadius:1,minWidth:2}}/>
                        {isPoc&&<span style={{fontSize:8,color:"#f0c04a"}}>●</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── FOOTPRINT TAB ── */}
        {data&&activeTab==="footprint"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#0d0f14",border:"1px solid #1a1c24",borderRadius:12,padding:"14px"}}>
              <SH title="Footprint Candles" sub="Buy vol (green left) vs Sell vol (red right) at each price level · last 30 candles · delta in centre"/>
              <div style={{height:420,marginTop:8}}>
                <FootprintChart candles={candles}/>
              </div>
            </div>
            <div style={{background:"#0d0f14",border:"1px solid #1a1c24",borderRadius:12,padding:"14px"}}>
              <SH title="How to read footprint candles"/>
              <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:12,color:"#7a7d88",lineHeight:1.7}}>
                <div style={{borderLeft:"3px solid #4adc8a",paddingLeft:12}}>
                  <span style={{color:"#4adc8a",fontWeight:600}}>Left side (green)</span> — buy volume at that price level. Wider = more buyers.
                </div>
                <div style={{borderLeft:"3px solid #f06060",paddingLeft:12}}>
                  <span style={{color:"#f06060",fontWeight:600}}>Right side (red)</span> — sell volume at that price level. Wider = more sellers.
                </div>
                <div style={{borderLeft:"3px solid #f0c04a",paddingLeft:12}}>
                  <span style={{color:"#f0c04a",fontWeight:600}}>Centre number</span> — delta (buy−sell) at that level. Positive = buyers won, negative = sellers won.
                </div>
                <div style={{borderLeft:"3px solid #a060f0",paddingLeft:12,color:"#55575f"}}>
                  Look for <span style={{color:"#a060f0"}}>stacked negative delta at the high</span> of a candle (sellers absorbing) or <span style={{color:"#a060f0"}}>stacked positive delta at the low</span> (buyers stepping in). These are the most reliable setups in footprint trading.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── HEATMAP TAB ── */}
        {data&&activeTab==="heatmap"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#0d0f14",border:"1px solid #1a1c24",borderRadius:12,padding:"14px"}}>
              <SH title="Liquidity Heatmap" sub="X = time · Y = price · Color intensity = volume concentration"/>
              <div style={{height:440,marginTop:8}}>
                <LiquidityHeatmap heatmap={heatmap} candles={candles}/>
              </div>
            </div>
            <div style={{background:"#0d0f14",border:"1px solid #1a1c24",borderRadius:12,padding:"14px"}}>
              <SH title="How to read the heatmap"/>
              <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:12,color:"#7a7d88",lineHeight:1.7}}>
                <div style={{borderLeft:"3px solid #f08040",paddingLeft:12}}>
                  <span style={{color:"#f08040",fontWeight:600}}>Hot zones (orange/yellow)</span> — highest volume concentration. These price levels are where institutions were most active. They act as strong support/resistance.
                </div>
                <div style={{borderLeft:"3px solid #4a8af0",paddingLeft:12}}>
                  <span style={{color:"#4a8af0",fontWeight:600}}>Cold zones (dark blue)</span> — low volume or no trading. Price moves fast through these areas — they are imbalances/fair value gaps.
                </div>
                <div style={{borderLeft:"3px solid #4adc8a",paddingLeft:12,color:"#55575f"}}>
                  When price returns to a hot zone from above, watch for buying. From below, watch for selling. The heatmap shows <span style={{color:"#4adc8a"}}>where the market agreed on value</span> in the recent session.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SESSIONS TAB ── */}
        {data&&activeTab==="sessions"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:"#0d0f14",border:"1px solid #1a1c24",borderRadius:12,padding:"18px"}}>
              <SH title="Session Breakdown" sub="Volume and delta by trading session"/>
              <SessionBar sessionStats={sess}/>
            </div>
            <div style={{background:"#0d0f14",border:"1px solid #1a1c24",borderRadius:12,padding:"18px"}}>
              <SH title="Session guide" sub="UTC times"/>
              {[["Asia","#4a8af0","00:00–07:00 UTC","Quiet range. Gold follows Asia equities."],
                ["London","#4adc8a","07:00–13:00 UTC","High liquidity. Most moves begin here."],
                ["Overlap","#f0c04a","13:00–16:00 UTC","Highest volume. Both sessions active."],
                ["NY","#f08040","13:00–21:00 UTC","US data releases. Strong directional moves."],
              ].map(([n,c,h,d])=>(
                <div key={n} style={{display:"flex",gap:12,padding:"9px 12px",borderRadius:7,
                  background:"#13151c",borderLeft:`3px solid ${c}`,marginBottom:6}}>
                  <div style={{minWidth:64,color:c,fontWeight:600,fontSize:12}}>{n}</div>
                  <div style={{minWidth:120,color:"#7a7d88",fontSize:11,fontFamily:"monospace"}}>{h}</div>
                  <div style={{color:"#55575f",fontSize:11}}>{d}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DIVERGENCE TAB ── */}
        {data&&activeTab==="diverge"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:"#0d0f14",border:"1px solid #1a1c24",borderRadius:12,padding:"18px"}}>
              <SH title="Delta Divergence Log" sub={`${sum.divergence_count??0} signals · last ${data.candle_count} candles`}/>
              {candles.filter(c=>c.divergence).length===0
                ? <div style={{color:"#3a3d48",fontSize:13}}>No divergences in this window.</div>
                : candles.filter(c=>c.divergence).slice(-12).reverse().map((d,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    background:d.divergence==="bearish"?"#1a0808":"#081a0a",
                    border:`1px solid ${d.divergence==="bearish"?"#4a1010":"#104a18"}`,
                    borderLeft:`3px solid ${d.divergence==="bearish"?"#f06060":"#4adc8a"}`,
                    borderRadius:7,padding:"9px 12px",fontSize:12,marginBottom:5}}>
                    <span style={{color:d.divergence==="bearish"?"#f06060":"#4adc8a",fontWeight:600}}>
                      {d.divergence==="bearish"?"▼ BEARISH":"▲ BULLISH"}
                    </span>
                    <span style={{color:"#7a7d88",fontFamily:"monospace"}}>{fmtTs(d.time)} UTC</span>
                    <span style={{color:"#e2e4ec"}}>${fmt(d.close)}</span>
                    <span style={{color:"#f0c04a"}}>Str: {d.divergence_strength}</span>
                    <span style={{color:SESSION_COLORS[d.session||"off"]?.color||"#55575f",fontSize:10}}>
                      {SESSION_COLORS[d.session||"off"]?.label}
                    </span>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── ORDER FLOW TAB ── */}
        {data&&activeTab==="delta"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#0d0f14",border:"1px solid #1a1c24",borderRadius:12,padding:"16px 16px 8px"}}>
              <SH title="Volume Delta" sub="Buy − Sell per candle"/>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={deltaData} margin={{top:0,right:0,bottom:0,left:0}}>
                  <XAxis dataKey="time" tick={{fill:"#3a3d48",fontSize:10}} axisLine={false} tickLine={false} interval={9}/>
                  <YAxis tick={{fill:"#3a3d48",fontSize:10}} axisLine={false} tickLine={false} width={50} tickFormatter={v=>v.toFixed(1)}/>
                  <Tooltip content={<DT/>}/>
                  <ReferenceLine y={0} stroke="#2a2d35" strokeWidth={1}/>
                  <Bar dataKey="delta" name="Delta" radius={[2,2,0,0]} maxBarSize={12}>
                    {deltaData.map((e,i)=>(
                      <Cell key={i} fill={e.spike?"#f08040":e.div?(e.div==="bearish"?"#f06060":"#4adc8a"):e.delta>=0?"#2a6a4a":"#6a2a2a"}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:"#0d0f14",border:"1px solid #1a1c24",borderRadius:12,padding:"16px 16px 8px"}}>
              <SH title="Cumulative Delta" sub="Divergence from price = exhaustion"/>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={deltaData} margin={{top:0,right:0,bottom:0,left:0}}>
                  <XAxis dataKey="time" tick={{fill:"#3a3d48",fontSize:10}} axisLine={false} tickLine={false} interval={9}/>
                  <YAxis tick={{fill:"#3a3d48",fontSize:10}} axisLine={false} tickLine={false} width={50} tickFormatter={v=>v.toFixed(0)}/>
                  <Tooltip content={<DT/>}/>
                  <ReferenceLine y={0} stroke="#2a2d35"/>
                  <Bar dataKey="cum" name="Cum. Delta" radius={[2,2,0,0]} maxBarSize={12}>
                    {deltaData.map((e,i)=><Cell key={i} fill={e.cum>=0?"#1e4a3a":"#4a1e1e"}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── VOL PROFILE TAB ── */}
        {data&&activeTab==="profile"&&(
          <div style={{background:"#0d0f14",border:"1px solid #1a1c24",borderRadius:12,padding:"18px"}}>
            <SH title="Full Volume Profile" sub={`${profile.length} levels · POC $${fmt(sum.poc)}`}/>
            <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:600,overflowY:"auto"}}>
              {[...profile].reverse().map((p,i)=>{
                const isPoc=p.price===sum.poc, inVa=p.price>=sum.val&&p.price<=sum.vah;
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:11,fontFamily:"monospace",
                      color:isPoc?"#f0c04a":inVa?"#a060f0":"#3a3d48",
                      minWidth:64,textAlign:"right"}}>{fmt(p.price)}</span>
                    <div style={{height:10,width:`${p.pct*0.7}%`,
                      background:isPoc?"#8a6a10":inVa?"#3a2060":"#1a2030",
                      borderRadius:2,minWidth:2}}/>
                    <span style={{fontSize:10,color:isPoc?"#f0c04a":inVa?"#7040a0":"#2a2d35"}}>{p.pct.toFixed(1)}%</span>
                    {isPoc&&<span style={{fontSize:10,color:"#f0c04a",fontWeight:600}}>POC</span>}
                    {inVa&&!isPoc&&<span style={{fontSize:9,color:"#5a3a80"}}>VA</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CORRELATION TAB ── */}
        {activeTab==="corr"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:"#0d0f14",border:"1px solid #1a1c24",borderRadius:12,padding:"18px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                <SH title="Correlation Matrix" sub="Pearson correlation · last 3H · 5m candles"/>
                <button onClick={fetchCorr} disabled={corrLoading} style={{
                  marginLeft:"auto",background:"#1a2f4a",border:"1px solid #1e4070",
                  color:corrLoading?"#3a5070":"#4a9af0",borderRadius:6,
                  padding:"5px 14px",fontSize:12,cursor:corrLoading?"not-allowed":"pointer",
                }}>
                  {corrLoading?"Fetching all symbols…":"↻ Load Correlation"}
                </button>
              </div>
              <CorrelationMatrix corrData={corrData}/>
            </div>
            <div style={{background:"#0d0f14",border:"1px solid #1a1c24",borderRadius:12,padding:"18px"}}>
              <SH title="How to use the correlation matrix"/>
              <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:12,color:"#7a7d88",lineHeight:1.7}}>
                <div style={{borderLeft:"3px solid #26a65b",paddingLeft:12}}>
                  <span style={{color:"#26a65b",fontWeight:600}}>+0.7 to +1.0 (green)</span> — Strong positive correlation. When one goes up the other tends to go up too. E.g. Gold and Silver often move together.
                </div>
                <div style={{borderLeft:"3px solid #1a1c24",paddingLeft:12,borderColor:"#4a9af0"}}>
                  <span style={{color:"#4a9af0",fontWeight:600}}>Near 0</span> — No meaningful relationship. Signals on both are independent.
                </div>
                <div style={{borderLeft:"3px solid #c0392b",paddingLeft:12}}>
                  <span style={{color:"#c0392b",fontWeight:600}}>-0.7 to -1.0 (red)</span> — Strong negative correlation. When one goes up the other tends to go down. E.g. Gold and USD often move inversely.
                </div>
                <div style={{borderLeft:"3px solid #f0c04a",paddingLeft:12,color:"#55575f"}}>
                  <span style={{color:"#f0c04a",fontWeight:600}}>Trading use:</span> If Gold shows a bullish spike AND Silver also spikes AND S&P shows a bearish divergence — that's multi-asset confluence, a much stronger signal than a single instrument.
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{marginTop:14,fontSize:10,color:"#1e2028",textAlign:"center"}}>
          Data: Dukascopy public feed · All times UTC
          {lastFetch&&` · Last fetch: ${lastFetch.toUTCString().slice(17,25)}`}
        </div>
      </div>
    </div>
  );
}
