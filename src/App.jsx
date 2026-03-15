import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from "recharts";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const SYMBOLS = [
  { id: "XAUUSD",    label: "Gold",    group: "Commod" },
  { id: "XAGUSD",    label: "Silver",  group: "Commod" },
  { id: "USOUSD",    label: "Oil",     group: "Commod" },
  { id: "NATGASUSD", label: "Gas",     group: "Commod" },
  { id: "EURUSD",    label: "EUR/USD", group: "Forex"  },
  { id: "GBPUSD",    label: "GBP/USD", group: "Forex"  },
  { id: "USDJPY",    label: "USD/JPY", group: "Forex"  },
  { id: "BTCUSD",    label: "Bitcoin", group: "Crypto" },
  { id: "SPXUSD",    label: "S&P 500", group: "Index"  },
];

const TIMEFRAMES = [
  { label: "1m",  seconds: 60   },
  { label: "5m",  seconds: 300  },
  { label: "15m", seconds: 900  },
  { label: "1h",  seconds: 3600 },
];

// Session colors and labels
const SESSION_COLORS = {
  asia:    { bg: "rgba(30,60,100,0.18)",  border: "rgba(60,120,200,0.25)",  label: "Asia",    color: "#4a8af0" },
  london:  { bg: "rgba(20,80,40,0.18)",   border: "rgba(40,160,80,0.25)",   label: "London",  color: "#4adc8a" },
  ny:      { bg: "rgba(80,30,10,0.18)",   border: "rgba(200,80,20,0.25)",   label: "NY",      color: "#f08040" },
  overlap: { bg: "rgba(60,40,10,0.22)",   border: "rgba(220,160,20,0.30)",  label: "Overlap", color: "#f0c04a" },
  off:     { bg: "transparent",           border: "transparent",            label: "Off",     color: "#3a3d48" },
};

const fmt    = (n) => (n == null ? "—" : Number(n).toFixed(2));
const fmtVol = (n) => (n == null ? "—" : Number(n).toFixed(1));
const fmtTs  = (epoch) => new Date(epoch * 1000).toUTCString().slice(17, 22);

// ─── Candlestick chart ──────────────────────────────────────────────────────
function CandleChart({ candles, summary, showSessions, showDivergence, showAbsorption }) {
  const canvasRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const PAD_L = 62, PAD_R = 10, PAD_T = 20, PAD_B = 36;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    const shown = candles.slice(-120);
    const prices = shown.flatMap(c => [c.high, c.low]);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const padP = (maxP - minP) * 0.08 || 1;
    const lo = minP - padP, hi = maxP + padP;
    const toY  = (p) => PAD_T + chartH - ((p - lo) / (hi - lo)) * chartH;
    const barW = Math.max(2, Math.floor(chartW / shown.length) - 1);

    // ── Session background bands ──
    if (showSessions) {
      let bandStart = null;
      let bandSession = null;
      shown.forEach((c, i) => {
        const sess = c.session || "off";
        const xLeft = PAD_L + i * (barW + 1);
        if (sess !== bandSession) {
          if (bandSession && bandSession !== "off" && SESSION_COLORS[bandSession]) {
            const sc = SESSION_COLORS[bandSession];
            ctx.fillStyle = sc.bg;
            ctx.fillRect(bandStart, PAD_T, xLeft - bandStart, chartH);
            // Top border stripe
            ctx.fillStyle = sc.border;
            ctx.fillRect(bandStart, PAD_T, xLeft - bandStart, 2);
          }
          bandStart = xLeft;
          bandSession = sess;
        }
        // Last candle — close the band
        if (i === shown.length - 1 && bandSession && bandSession !== "off") {
          const sc = SESSION_COLORS[bandSession];
          ctx.fillStyle = sc.bg;
          ctx.fillRect(bandStart, PAD_T, (xLeft + barW) - bandStart, chartH);
          ctx.fillStyle = sc.border;
          ctx.fillRect(bandStart, PAD_T, (xLeft + barW) - bandStart, 2);
        }
      });

      // Session labels at top
      let lastSess = null, labelX = PAD_L;
      shown.forEach((c, i) => {
        const sess = c.session || "off";
        const xLeft = PAD_L + i * (barW + 1);
        if (sess !== lastSess && sess !== "off" && SESSION_COLORS[sess]) {
          ctx.fillStyle = SESSION_COLORS[sess].color;
          ctx.font = "bold 9px 'JetBrains Mono', monospace";
          ctx.textAlign = "left";
          ctx.fillText(SESSION_COLORS[sess].label.toUpperCase(), xLeft + 3, PAD_T - 5);
          lastSess = sess;
          labelX = xLeft;
        }
      });
    }

    // ── Grid lines ──
    ctx.strokeStyle = "#1a1c24";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = PAD_T + (chartH / 5) * i;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
      const price = hi - ((hi - lo) / 5) * i;
      ctx.fillStyle = "#3a3d48";
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText(price.toFixed(2), PAD_L - 6, y + 4);
    }

    // ── POC line ──
    if (summary?.poc) {
      const pocY = toY(summary.poc);
      ctx.strokeStyle = "#8a6a10";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(PAD_L, pocY); ctx.lineTo(W - PAD_R, pocY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#f0c04a";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "left";
      ctx.fillText("POC", W - PAD_R - 28, pocY - 3);
    }

    // ── VAH / VAL lines ──
    if (summary?.vah && summary?.val) {
      [summary.vah, summary.val].forEach(p => {
        const y = toY(p);
        ctx.strokeStyle = "#3a2060";
        ctx.lineWidth = 0.8;
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // ── Absorption highlight (background glow before candle) ──
    if (showAbsorption) {
      shown.forEach((c, i) => {
        if (!c.is_absorption) return;
        const x = PAD_L + i * (barW + 1);
        ctx.fillStyle = "rgba(160,100,200,0.12)";
        ctx.fillRect(x - 2, PAD_T, barW + 4, chartH);
        ctx.strokeStyle = "rgba(160,100,200,0.4)";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x - 2, PAD_T, barW + 4, chartH);
      });
    }

    // ── Candles ──
    shown.forEach((c, i) => {
      const x    = PAD_L + i * (barW + 1) + Math.floor(barW / 2);
      const isUp = c.close >= c.open;

      let color = isUp ? "#26a65b" : "#c0392b";
      if (c.is_spike)      color = "#f08040";
      if (c.is_absorption) color = "#a060f0";

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, toY(c.high));
      ctx.lineTo(x, toY(c.low));
      ctx.stroke();

      // Body
      const bodyTop = toY(Math.max(c.open, c.close));
      const bodyBot = toY(Math.min(c.open, c.close));
      const bodyH   = Math.max(1, bodyBot - bodyTop);
      ctx.fillStyle = color;
      ctx.fillRect(x - Math.floor(barW / 2), bodyTop, barW, bodyH);
    });

    // ── Divergence markers ──
    if (showDivergence) {
      shown.forEach((c, i) => {
        if (!c.divergence) return;
        const x  = PAD_L + i * (barW + 1) + Math.floor(barW / 2);
        const isBear = c.divergence === "bearish";
        const markerY = isBear ? toY(c.high) - 10 : toY(c.low) + 10;

        // Triangle marker
        ctx.fillStyle = isBear ? "#f06060" : "#4adc8a";
        ctx.beginPath();
        if (isBear) {
          ctx.moveTo(x, markerY);
          ctx.lineTo(x - 5, markerY - 8);
          ctx.lineTo(x + 5, markerY - 8);
        } else {
          ctx.moveTo(x, markerY);
          ctx.lineTo(x - 5, markerY + 8);
          ctx.lineTo(x + 5, markerY + 8);
        }
        ctx.closePath();
        ctx.fill();

        // Label
        ctx.fillStyle = isBear ? "#f06060" : "#4adc8a";
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.fillText(isBear ? "DIV▼" : "DIV▲", x, isBear ? markerY - 12 : markerY + 20);
      });
    }

    // ── Time axis ──
    ctx.fillStyle = "#3a3d48";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    const step = Math.ceil(shown.length / 8);
    shown.forEach((c, i) => {
      if (i % step === 0) {
        const x = PAD_L + i * (barW + 1) + Math.floor(barW / 2);
        ctx.fillText(fmtTs(c.time), x, H - PAD_B + 14);
      }
    });
  }, [candles, summary, showSessions, showDivergence, showAbsorption]);

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const PAD_L = 62;
    const shown = candles.slice(-120);
    const barW = Math.max(2, Math.floor((canvas.offsetWidth - PAD_L - 10) / shown.length) - 1);
    const idx = Math.floor((x - PAD_L) / (barW + 1));
    if (idx >= 0 && idx < shown.length) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, c: shown[idx] });
    else setTooltip(null);
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)} />
      {tooltip && (
        <div style={{ position: "absolute", left: tooltip.x + 14, top: Math.max(10, tooltip.y - 10),
          background: "#0d0f14", border: "1px solid #2a2d35", borderRadius: 6,
          padding: "8px 12px", fontSize: 11, color: "#c8cad0", pointerEvents: "none",
          zIndex: 10, fontFamily: "'JetBrains Mono', monospace", minWidth: 170 }}>
          <div style={{ color: "#55575f", marginBottom: 4 }}>{fmtTs(tooltip.c.time)} UTC</div>
          {tooltip.c.session && (
            <div style={{ color: SESSION_COLORS[tooltip.c.session]?.color || "#55575f", fontSize: 10, marginBottom: 4 }}>
              {SESSION_COLORS[tooltip.c.session]?.label || ""} session
            </div>
          )}
          <div>O <span style={{ color: "#e2e4ec" }}>{fmt(tooltip.c.open)}</span></div>
          <div>H <span style={{ color: "#4adc8a" }}>{fmt(tooltip.c.high)}</span></div>
          <div>L <span style={{ color: "#f06060" }}>{fmt(tooltip.c.low)}</span></div>
          <div>C <span style={{ color: "#e2e4ec" }}>{fmt(tooltip.c.close)}</span></div>
          <div style={{ marginTop: 4 }}>Vol <span style={{ color: "#f0c04a" }}>{fmtVol(tooltip.c.volume)}</span></div>
          <div>Δ <span style={{ color: tooltip.c.delta >= 0 ? "#4adc8a" : "#f06060" }}>{fmt(tooltip.c.delta)}</span></div>
          {tooltip.c.is_spike && <div style={{ color: "#f08040", marginTop: 4 }}>⚡ SPIKE {tooltip.c.spike_ratio}×</div>}
          {tooltip.c.divergence && (
            <div style={{ color: tooltip.c.divergence === "bearish" ? "#f06060" : "#4adc8a", marginTop: 4 }}>
              {tooltip.c.divergence === "bearish" ? "▼ BEARISH DIV" : "▲ BULLISH DIV"} (str: {tooltip.c.divergence_strength})
            </div>
          )}
          {tooltip.c.is_absorption && <div style={{ color: "#a060f0", marginTop: 4 }}>◈ ABSORPTION</div>}
        </div>
      )}
    </div>
  );
}

// ─── Volume bars ────────────────────────────────────────────────────────────
function VolumeBars({ candles }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const PAD_L = 62, PAD_R = 10, PAD_T = 4, PAD_B = 4;
    const chartW = W - PAD_L - PAD_R, chartH = H - PAD_T - PAD_B;
    const shown = candles.slice(-120);
    const maxVol = Math.max(...shown.map(c => c.volume));
    const barW = Math.max(2, Math.floor(chartW / shown.length) - 1);
    shown.forEach((c, i) => {
      const x = PAD_L + i * (barW + 1);
      const h = (c.volume / maxVol) * chartH;
      const isUp = c.close >= c.open;
      ctx.fillStyle = c.is_absorption ? "#5a2080"
                    : c.is_spike      ? "#f08040"
                    : isUp            ? "#1a4a2a"
                                      : "#4a1a1a";
      ctx.fillRect(x, H - PAD_B - h, barW, h);
    });
    ctx.fillStyle = "#3a3d48";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText(fmtVol(maxVol), PAD_L - 6, PAD_T + 10);
  }, [candles]);
  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}

// ─── Session bar ─────────────────────────────────────────────────────────────
function SessionBar({ sessionStats }) {
  const sessions = ["asia", "london", "overlap", "ny"];
  const total = Object.values(sessionStats).reduce((a, b) => a + (b.volume || 0), 0);
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {sessions.map(s => {
        const st = sessionStats[s];
        if (!st) return null;
        const sc = SESSION_COLORS[s];
        const pct = total > 0 ? ((st.volume / total) * 100).toFixed(1) : "0";
        return (
          <div key={s} style={{ flex: 1, minWidth: 110, background: "#13151c",
            border: `1px solid ${sc.border.replace("0.25", "0.5")}`,
            borderLeft: `3px solid ${sc.color}`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, color: sc.color, letterSpacing: "0.08em",
              textTransform: "uppercase", marginBottom: 5, fontWeight: 600 }}>
              {sc.label}
            </div>
            <div style={{ fontSize: 13, color: "#e2e4ec", fontFamily: "monospace", fontWeight: 600 }}>
              {pct}% vol
            </div>
            <div style={{ fontSize: 11, color: st.delta >= 0 ? "#4adc8a" : "#f06060", marginTop: 3 }}>
              Δ {st.delta > 0 ? "+" : ""}{fmtVol(st.delta)}
            </div>
            {st.spikes > 0 && (
              <div style={{ fontSize: 10, color: "#f08040", marginTop: 2 }}>⚡ {st.spikes} spike{st.spikes > 1 ? "s" : ""}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Divergence list ─────────────────────────────────────────────────────────
function DivergenceList({ candles }) {
  const divs = candles.filter(c => c.divergence).slice(-12).reverse();
  if (!divs.length) return (
    <div style={{ color: "#3a3d48", fontSize: 13, padding: "16px 0" }}>
      No divergences detected in this window. Divergences appear when price makes a new extreme but cumulative delta does not confirm it.
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {divs.map((d, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          background: d.divergence === "bearish" ? "#1a0808" : "#081a0a",
          border: `1px solid ${d.divergence === "bearish" ? "#4a1010" : "#104a18"}`,
          borderLeft: `3px solid ${d.divergence === "bearish" ? "#f06060" : "#4adc8a"}`,
          borderRadius: 7, padding: "10px 14px", fontSize: 12 }}>
          <span style={{ color: d.divergence === "bearish" ? "#f06060" : "#4adc8a", fontWeight: 600 }}>
            {d.divergence === "bearish" ? "▼ BEARISH" : "▲ BULLISH"}
          </span>
          <span style={{ color: "#7a7d88", fontFamily: "monospace" }}>{fmtTs(d.time)} UTC</span>
          <span style={{ color: "#e2e4ec" }}>${fmt(d.close)}</span>
          <span style={{ color: "#f0c04a" }}>Strength: {d.divergence_strength}</span>
          <span style={{ color: "#55575f", fontSize: 10 }}>
            {SESSION_COLORS[d.session || "off"]?.label || "—"} session
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0d0f14", border: "1px solid #2a2d35", borderRadius: 6,
      padding: "8px 12px", fontSize: 12, color: "#c8cad0" }}>
      <div style={{ color: "#7a7d88", marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "#e2e4ec" }}>
          {p.name}: <strong>{fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  );
};

const StatCard = ({ label, value, sub, accent }) => (
  <div style={{ background: "#13151c", border: "1px solid #1e2028", borderRadius: 10,
    padding: "12px 16px", flex: 1, minWidth: 120 }}>
    <div style={{ fontSize: 10, color: "#55575f", letterSpacing: "0.06em",
      textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 600, color: accent || "#e2e4ec",
      fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: "#55575f", marginTop: 3 }}>{sub}</div>}
  </div>
);

const SectionHead = ({ title, sub }) => (
  <div style={{ marginBottom: 12 }}>
    <span style={{ fontSize: 12, fontWeight: 600, color: "#7a7d88",
      letterSpacing: "0.1em", textTransform: "uppercase" }}>{title}</span>
    {sub && <span style={{ fontSize: 11, color: "#3a3d48", marginLeft: 10 }}>{sub}</span>}
  </div>
);

// ─── Toggle pill ──────────────────────────────────────────────────────────────
const Toggle = ({ label, value, onChange, color = "#4a9af0" }) => (
  <button onClick={() => onChange(!value)} style={{
    background: value ? `${color}18` : "transparent",
    border: `1px solid ${value ? color : "#1e2028"}`,
    color: value ? color : "#3a3d48",
    borderRadius: 5, padding: "3px 10px", fontSize: 11,
    cursor: "pointer", transition: "all 0.15s",
  }}>{label}</button>
);

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
  // Overlay toggles
  const [showSessions,   setShowSessions]   = useState(true);
  const [showDivergence, setShowDivergence] = useState(true);
  const [showAbsorption, setShowAbsorption] = useState(true);
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`${API_BASE}/api/orderflow/${symbol}?hours_back=${hoursBack}&timeframe=${timeframe}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json); setLastFetch(new Date());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [symbol, hoursBack, timeframe]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (autoRefresh) timerRef.current = setInterval(fetchData, 60_000);
    else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, fetchData]);

  const summary      = data?.summary || {};
  const candles      = data?.candles || [];
  const profile      = data?.volume_profile || [];
  const sessionStats = data?.session_stats || {};
  const isBullish    = summary.bias === "bullish";

  const deltaData = candles.slice(-80).map(c => ({
    time:  fmtTs(c.time),
    delta: c.delta,
    cum:   c.cum_delta,
    spike: c.is_spike,
    div:   c.divergence,
  }));

  const profileSlice = [...profile]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 50)
    .sort((a, b) => a.price - b.price);

  const TABS = [
    { key: "chart",    label: "Price Chart"  },
    { key: "sessions", label: "Sessions"     },
    { key: "diverge",  label: "Divergence"   },
    { key: "delta",    label: "Order Flow"   },
    { key: "profile",  label: "Vol Profile"  },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b0f", color: "#c8cad0",
      fontFamily: "'IBM Plex Sans', sans-serif", padding: "0 0 40px" }}>

      {/* ── Top bar ── */}
      <div style={{ background: "#0d0f14", borderBottom: "1px solid #1a1c24",
        padding: "10px 20px", display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e4ec", letterSpacing: "0.12em" }}>ORDER FLOW</span>
          <span style={{ fontSize: 9, color: "#f08040", letterSpacing: "0.1em", border: "1px solid #f0804040", padding: "1px 5px", borderRadius: 3 }}>PRO</span>
        </div>

        {/* Symbols */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {SYMBOLS.map(s => (
            <button key={s.id} onClick={() => setSymbol(s.id)} style={{
              background: s.id === symbol ? "#1e3a5f" : "transparent",
              border: `1px solid ${s.id === symbol ? "#2a5a9f" : "#1e2028"}`,
              color: s.id === symbol ? "#60a8f8" : "#55575f",
              borderRadius: 5, padding: "3px 9px", fontSize: 11,
              cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
              display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.2,
            }}>
              <span style={{ fontSize: 8, color: s.id === symbol ? "#3a7aB0" : "#2a2d35" }}>{s.group}</span>
              {s.label}
            </button>
          ))}
        </div>

        {/* Timeframes */}
        <div style={{ display: "flex", gap: 3 }}>
          {TIMEFRAMES.map(tf => (
            <button key={tf.label} onClick={() => setTimeframe(tf.seconds)} style={{
              background: tf.seconds === timeframe ? "#1a2a1a" : "transparent",
              border: `1px solid ${tf.seconds === timeframe ? "#2a5a2a" : "#1e2028"}`,
              color: tf.seconds === timeframe ? "#4adc8a" : "#3a3d48",
              borderRadius: 4, padding: "3px 8px", fontSize: 11, cursor: "pointer",
            }}>{tf.label}</button>
          ))}
        </div>

        {/* Hours */}
        <div style={{ display: "flex", gap: 3 }}>
          {[1, 3, 6, 12].map(h => (
            <button key={h} onClick={() => setHoursBack(h)} style={{
              background: h === hoursBack ? "#1a1c24" : "transparent",
              border: `1px solid ${h === hoursBack ? "#2a2d35" : "transparent"}`,
              color: h === hoursBack ? "#c8cad0" : "#3a3d48",
              borderRadius: 4, padding: "3px 8px", fontSize: 11, cursor: "pointer",
            }}>{h}H</button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {data?.data_from && (
            <span style={{ fontSize: 10, color: "#2a2d35", fontStyle: "italic" }}>{data.data_from}</span>
          )}
          <button onClick={fetchData} disabled={loading} style={{
            background: "#1a2f4a", border: "1px solid #1e4070",
            color: loading ? "#3a5070" : "#4a9af0",
            borderRadius: 6, padding: "5px 12px", fontSize: 12,
            cursor: loading ? "not-allowed" : "pointer",
          }}>{loading ? "Loading…" : "↻ Refresh"}</button>
          <button onClick={() => setAutoRefresh(v => !v)} style={{
            background: autoRefresh ? "#1a3a1a" : "transparent",
            border: `1px solid ${autoRefresh ? "#2a6a2a" : "#1e2028"}`,
            color: autoRefresh ? "#4adc4a" : "#3a3d48",
            borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer",
          }}>{autoRefresh ? "● Live" : "○ Live"}</button>
        </div>
      </div>

      <div style={{ padding: "16px 20px" }}>

        {error && (
          <div style={{ background: "#1a0d0d", border: "1px solid #4a1a1a", borderRadius: 8,
            padding: "12px 16px", marginBottom: 16, color: "#f06060", fontSize: 13 }}>
            ⚠ {error}
          </div>
        )}

        {/* Stats row */}
        {data && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <StatCard label="Last Price"   value={`$${fmt(summary.last_price)}`} sub={symbol} />
            <StatCard label="Net Delta"    value={summary.net_delta > 0 ? `+${fmtVol(summary.net_delta)}` : fmtVol(summary.net_delta)} sub={isBullish ? "Buying dominant" : "Selling dominant"} accent={isBullish ? "#4adc8a" : "#f06060"} />
            <StatCard label="Bias"         value={isBullish ? "BULLISH" : "BEARISH"} sub={`${data.candle_count} candles`} accent={isBullish ? "#4adc8a" : "#f06060"} />
            <StatCard label="POC"          value={`$${fmt(summary.poc)}`} sub={`Vol: ${fmtVol(summary.poc_volume)}`} accent="#f0c04a" />
            <StatCard label="Value Area"   value={`${fmt(summary.val)}–${fmt(summary.vah)}`} sub="70% of volume" accent="#a060f0" />
            <StatCard label="Spikes"       value={summary.spike_count ?? 0} sub="Vol anomalies" accent={summary.spike_count > 0 ? "#f08040" : "#55575f"} />
            <StatCard label="Divergences"  value={summary.divergence_count ?? 0} sub="Delta vs price" accent={summary.divergence_count > 0 ? "#f06060" : "#55575f"} />
            <StatCard label="Absorptions"  value={summary.absorption_count ?? 0} sub="High vol·low range" accent={summary.absorption_count > 0 ? "#a060f0" : "#55575f"} />
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0, marginBottom: 14,
          borderBottom: "1px solid #1a1c24", flexWrap: "wrap" }}>
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)} style={{
              background: "transparent", border: "none",
              borderBottom: `2px solid ${activeTab === key ? "#4a9af0" : "transparent"}`,
              color: activeTab === key ? "#e2e4ec" : "#3a3d48",
              padding: "8px 16px", fontSize: 12, cursor: "pointer",
              fontWeight: activeTab === key ? 600 : 400, marginBottom: -1,
            }}>{label}</button>
          ))}
        </div>

        {/* ── CHART TAB ── */}
        {data && activeTab === "chart" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Overlay toggles */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#3a3d48" }}>Overlays:</span>
              <Toggle label="Sessions"   value={showSessions}   onChange={setShowSessions}   color="#4a8af0" />
              <Toggle label="Divergence" value={showDivergence} onChange={setShowDivergence} color="#f06060" />
              <Toggle label="Absorption" value={showAbsorption} onChange={setShowAbsorption} color="#a060f0" />
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#2a2d35" }}>
                {TIMEFRAMES.find(t => t.seconds === timeframe)?.label} · {symbol}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12 }}>
              {/* Left: candle + volume */}
              <div style={{ background: "#0d0f14", border: "1px solid #1a1c24",
                borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px 6px" }}>
                  <SectionHead
                    title={`${symbol} · ${TIMEFRAMES.find(t => t.seconds === timeframe)?.label}`}
                    sub={`POC $${fmt(summary.poc)} · VAH $${fmt(summary.vah)} · VAL $${fmt(summary.val)}`}
                  />
                </div>
                <div style={{ height: 360 }}>
                  <CandleChart candles={candles} summary={summary}
                    showSessions={showSessions} showDivergence={showDivergence}
                    showAbsorption={showAbsorption} />
                </div>
                <div style={{ height: 60, borderTop: "1px solid #1a1c24" }}>
                  <VolumeBars candles={candles} />
                </div>
                {/* Legend */}
                <div style={{ padding: "8px 16px", display: "flex", gap: 14,
                  fontSize: 10, color: "#3a3d48", flexWrap: "wrap",
                  borderTop: "1px solid #1a1c24" }}>
                  {[
                    ["#26a65b", "Bullish"], ["#c0392b", "Bearish"],
                    ["#f08040", "Spike"], ["#a060f0", "Absorption"],
                    ["#f06060", "Bear DIV▼"], ["#4adc8a", "Bull DIV▲"],
                  ].map(([col, lbl]) => (
                    <span key={lbl} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 8, height: 8, background: col, borderRadius: 1, display: "inline-block" }} />
                      {lbl}
                    </span>
                  ))}
                  {showSessions && Object.entries(SESSION_COLORS).filter(([k]) => k !== "off").map(([k, sc]) => (
                    <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 8, height: 4, background: sc.color, opacity: 0.6, display: "inline-block" }} />
                      {sc.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Right: volume profile */}
              <div style={{ background: "#0d0f14", border: "1px solid #1a1c24",
                borderRadius: 12, padding: "14px" }}>
                <SectionHead title="Volume Profile" />
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, fontSize: 11 }}>
                  {[["POC", summary.poc, "#f0c04a"], ["VAH", summary.vah, "#a060f0"], ["VAL", summary.val, "#a060f0"]].map(([l, v, c]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#55575f" }}>{l}</span>
                      <span style={{ color: c, fontFamily: "monospace" }}>${fmt(v)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 400, overflowY: "auto" }}>
                  {[...profileSlice].reverse().map((p, i) => {
                    const isPoc = p.price === summary.poc;
                    const inVa  = p.price >= summary.val && p.price <= summary.vah;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 9, fontFamily: "monospace",
                          color: isPoc ? "#f0c04a" : inVa ? "#a060f0" : "#2a2d35",
                          minWidth: 54, textAlign: "right" }}>{fmt(p.price)}</span>
                        <div style={{ height: 8, width: `${p.pct}%`,
                          background: isPoc ? "#8a6a10" : inVa ? "#3a2060" : "#1a2030",
                          borderRadius: 1, minWidth: 2 }} />
                        {isPoc && <span style={{ fontSize: 8, color: "#f0c04a" }}>●</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SESSIONS TAB ── */}
        {data && activeTab === "sessions" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "20px" }}>
              <SectionHead title="Session Breakdown" sub="Volume and delta by trading session" />
              <SessionBar sessionStats={sessionStats} />
            </div>
            <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "20px" }}>
              <SectionHead title="Session guide" sub="UTC hours" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  ["Asia",    "#4a8af0", "00:00 – 07:00 UTC", "Quiet, range-bound. Gold follows Asia equities."],
                  ["London",  "#4adc8a", "07:00 – 13:00 UTC", "High liquidity. Most FX and metals moves start here."],
                  ["Overlap", "#f0c04a", "13:00 – 16:00 UTC", "Highest volume. London + NY both active simultaneously."],
                  ["NY",      "#f08040", "13:00 – 21:00 UTC", "US data releases. Strong directional moves on news."],
                ].map(([name, color, hours, note]) => (
                  <div key={name} style={{ display: "flex", gap: 12, alignItems: "flex-start",
                    padding: "10px 14px", borderRadius: 8,
                    background: "#13151c", borderLeft: `3px solid ${color}` }}>
                    <div style={{ minWidth: 70, color, fontWeight: 600, fontSize: 12 }}>{name}</div>
                    <div style={{ minWidth: 130, color: "#7a7d88", fontSize: 11, fontFamily: "monospace" }}>{hours}</div>
                    <div style={{ color: "#55575f", fontSize: 11 }}>{note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── DIVERGENCE TAB ── */}
        {data && activeTab === "diverge" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "20px" }}>
              <SectionHead title="Delta Divergence Log"
                sub={`${summary.divergence_count ?? 0} signals detected · last ${data.candle_count} candles`} />
              <DivergenceList candles={candles} />
            </div>
            <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "20px" }}>
              <SectionHead title="How to read divergence" />
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, color: "#7a7d88", lineHeight: 1.7 }}>
                <div style={{ borderLeft: "3px solid #f06060", paddingLeft: 12 }}>
                  <span style={{ color: "#f06060", fontWeight: 600 }}>▼ Bearish divergence</span> — Price makes a new high but cumulative delta fails to confirm. Buyers are exhausted. Potential reversal downward. Best used near resistance or POC.
                </div>
                <div style={{ borderLeft: "3px solid #4adc8a", paddingLeft: 12 }}>
                  <span style={{ color: "#4adc8a", fontWeight: 600 }}>▲ Bullish divergence</span> — Price makes a new low but cumulative delta fails to confirm. Sellers are exhausted. Potential reversal upward. Best used near support, VAL or previous lows.
                </div>
                <div style={{ borderLeft: "3px solid #f0c04a", paddingLeft: 12, color: "#55575f" }}>
                  <span style={{ color: "#f0c04a", fontWeight: 600 }}>Strength score</span> — Combines price move magnitude with delta non-confirmation magnitude. Higher = stronger signal. Scores above 30 are worth watching.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ORDER FLOW TAB ── */}
        {data && activeTab === "delta" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "18px 18px 10px" }}>
              <SectionHead title="Volume Delta" sub="Buy pressure − Sell pressure per candle" />
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={deltaData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="time" tick={{ fill: "#3a3d48", fontSize: 10 }} axisLine={false} tickLine={false} interval={9} />
                  <YAxis tick={{ fill: "#3a3d48", fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={v => v.toFixed(1)} />
                  <Tooltip content={<DarkTooltip />} />
                  <ReferenceLine y={0} stroke="#2a2d35" strokeWidth={1} />
                  <Bar dataKey="delta" name="Delta" radius={[2,2,0,0]} maxBarSize={12}>
                    {deltaData.map((e, i) => (
                      <Cell key={i} fill={e.spike ? "#f08040" : e.div ? (e.div === "bearish" ? "#f06060" : "#4adc8a") : e.delta >= 0 ? "#2a6a4a" : "#6a2a2a"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "18px 18px 10px" }}>
              <SectionHead title="Cumulative Delta" sub="Divergence from price = exhaustion signal" />
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={deltaData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="time" tick={{ fill: "#3a3d48", fontSize: 10 }} axisLine={false} tickLine={false} interval={9} />
                  <YAxis tick={{ fill: "#3a3d48", fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={v => v.toFixed(0)} />
                  <Tooltip content={<DarkTooltip />} />
                  <ReferenceLine y={0} stroke="#2a2d35" />
                  <Bar dataKey="cum" name="Cum. Delta" radius={[2,2,0,0]} maxBarSize={12}>
                    {deltaData.map((e, i) => <Cell key={i} fill={e.cum >= 0 ? "#1e4a3a" : "#4a1e1e"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Spike log */}
            <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "18px" }}>
              <SectionHead title="Spike Log" sub={`${summary.spike_count ?? 0} detected`} />
              {candles.filter(c => c.is_spike).length === 0
                ? <div style={{ color: "#3a3d48", fontSize: 13 }}>No spikes in this window.</div>
                : candles.filter(c => c.is_spike).slice(-10).reverse().map((s, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "center", background: "#120d08", border: "1px solid #2a1a08",
                    borderRadius: 7, padding: "8px 12px", fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: "#7a7d88", fontFamily: "monospace" }}>{fmtTs(s.time)} UTC</span>
                    <span style={{ color: SESSION_COLORS[s.session || "off"]?.color || "#55575f", fontSize: 10 }}>
                      {SESSION_COLORS[s.session || "off"]?.label}
                    </span>
                    <span style={{ color: "#e2e4ec" }}>${fmt(s.close)}</span>
                    <span style={{ color: "#f0c04a" }}>Vol {fmtVol(s.volume)}</span>
                    <span style={{ color: "#f08040" }}>{s.spike_ratio}× avg</span>
                    <span style={{ color: s.delta >= 0 ? "#4adc8a" : "#f06060" }}>{s.delta >= 0 ? "▲ Buy" : "▼ Sell"}</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {data && activeTab === "profile" && (
          <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "20px" }}>
            <SectionHead title="Full Volume Profile" sub={`${profile.length} price levels · POC $${fmt(summary.poc)}`} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 600, overflowY: "auto" }}>
              {[...profile].reverse().map((p, i) => {
                const isPoc = p.price === summary.poc;
                const inVa  = p.price >= summary.val && p.price <= summary.vah;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, fontFamily: "monospace",
                      color: isPoc ? "#f0c04a" : inVa ? "#a060f0" : "#3a3d48",
                      minWidth: 66, textAlign: "right" }}>{fmt(p.price)}</span>
                    <div style={{ height: 10, width: `${p.pct * 0.7}%`,
                      background: isPoc ? "#8a6a10" : inVa ? "#3a2060" : "#1a2030",
                      borderRadius: 2, minWidth: 2 }} />
                    <span style={{ fontSize: 10, color: isPoc ? "#f0c04a" : inVa ? "#7040a0" : "#2a2d35" }}>{p.pct.toFixed(1)}%</span>
                    {isPoc && <span style={{ fontSize: 10, color: "#f0c04a", fontWeight: 600 }}>POC</span>}
                    {inVa && !isPoc && <span style={{ fontSize: 9, color: "#5a3a80" }}>VA</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 10, color: "#1e2028", textAlign: "center" }}>
          Data: Dukascopy public feed · All times UTC
          {lastFetch && ` · Last fetch: ${lastFetch.toUTCString().slice(17, 25)}`}
        </div>
      </div>
    </div>
  );
}
