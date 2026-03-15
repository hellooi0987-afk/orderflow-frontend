import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from "recharts";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY"];
const TIMEFRAMES = [
  { label: "1m",  seconds: 60 },
  { label: "5m",  seconds: 300 },
  { label: "15m", seconds: 900 },
  { label: "1h",  seconds: 3600 },
];

const fmt    = (n) => (n == null ? "—" : Number(n).toFixed(2));
const fmtVol = (n) => (n == null ? "—" : Number(n).toFixed(1));
const fmtTs  = (epoch) => new Date(epoch * 1000).toUTCString().slice(17, 22);

// ─── Candlestick chart (canvas, no library needed) ─────────────────────────
function CandleChart({ candles, summary }) {
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

    const PAD_L = 62, PAD_R = 10, PAD_T = 16, PAD_B = 36;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    const shown = candles.slice(-120);
    const prices = shown.flatMap(c => [c.high, c.low]);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const padP = (maxP - minP) * 0.06 || 1;
    const lo = minP - padP, hi = maxP + padP;
    const toY  = (p) => PAD_T + chartH - ((p - lo) / (hi - lo)) * chartH;
    const barW = Math.max(2, Math.floor(chartW / shown.length) - 1);

    // Grid lines
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

    // POC line
    if (summary?.poc) {
      const pocY = toY(summary.poc);
      ctx.strokeStyle = "#8a6a10";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(PAD_L, pocY); ctx.lineTo(W - PAD_R, pocY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#f0c04a";
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      ctx.fillText("POC", W - PAD_R - 28, pocY - 3);
    }

    // VAH / VAL
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

    // Candles
    shown.forEach((c, i) => {
      const x = PAD_L + i * (barW + 1) + Math.floor(barW / 2);
      const isUp = c.close >= c.open;
      const color = c.is_spike ? "#f08040" : isUp ? "#26a65b" : "#c0392b";

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

    // Time axis
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
  }, [candles, summary]);

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const PAD_L = 62;
    const shown = candles.slice(-120);
    const barW = Math.max(2, Math.floor((canvas.offsetWidth - PAD_L - 10) / shown.length) - 1);
    const idx = Math.floor((x - PAD_L) / (barW + 1));
    if (idx >= 0 && idx < shown.length) {
      const c = shown[idx];
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        c,
      });
    } else {
      setTooltip(null);
    }
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div style={{
          position: "absolute",
          left: tooltip.x + 14,
          top: tooltip.y - 10,
          background: "#0d0f14",
          border: "1px solid #2a2d35",
          borderRadius: 6,
          padding: "8px 12px",
          fontSize: 11,
          color: "#c8cad0",
          pointerEvents: "none",
          zIndex: 10,
          fontFamily: "'JetBrains Mono', monospace",
          minWidth: 150,
        }}>
          <div style={{ color: "#55575f", marginBottom: 4 }}>{fmtTs(tooltip.c.time)} UTC</div>
          <div>O <span style={{ color: "#e2e4ec" }}>{fmt(tooltip.c.open)}</span></div>
          <div>H <span style={{ color: "#4adc8a" }}>{fmt(tooltip.c.high)}</span></div>
          <div>L <span style={{ color: "#f06060" }}>{fmt(tooltip.c.low)}</span></div>
          <div>C <span style={{ color: "#e2e4ec" }}>{fmt(tooltip.c.close)}</span></div>
          <div style={{ marginTop: 4 }}>Vol <span style={{ color: "#f0c04a" }}>{fmtVol(tooltip.c.volume)}</span></div>
          <div>Δ <span style={{ color: tooltip.c.delta >= 0 ? "#4adc8a" : "#f06060" }}>{fmt(tooltip.c.delta)}</span></div>
          {tooltip.c.is_spike && <div style={{ color: "#f08040", marginTop: 4 }}>⚡ SPIKE {tooltip.c.spike_ratio}×</div>}
        </div>
      )}
    </div>
  );
}

// ─── Volume bars below candle chart ────────────────────────────────────────
function VolumeBars({ candles }) {
  const canvasRef = useRef(null);

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

    const PAD_L = 62, PAD_R = 10, PAD_T = 4, PAD_B = 4;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;
    const shown  = candles.slice(-120);
    const maxVol = Math.max(...shown.map(c => c.volume));
    const barW   = Math.max(2, Math.floor(chartW / shown.length) - 1);

    shown.forEach((c, i) => {
      const x   = PAD_L + i * (barW + 1);
      const h   = (c.volume / maxVol) * chartH;
      const isUp = c.close >= c.open;
      ctx.fillStyle = c.is_spike ? "#f08040"
                    : isUp       ? "#1a4a2a"
                                 : "#4a1a1a";
      ctx.fillRect(x, H - PAD_B - h, barW, h);
    });

    // Max vol label
    ctx.fillStyle = "#3a3d48";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText(fmtVol(maxVol), PAD_L - 6, PAD_T + 10);
  }, [candles]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0d0f14", border: "1px solid #2a2d35", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#c8cad0" }}>
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
  <div style={{ background: "#13151c", border: "1px solid #1e2028", borderRadius: 10, padding: "14px 18px", flex: 1, minWidth: 130 }}>
    <div style={{ fontSize: 11, color: "#55575f", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 600, color: accent || "#e2e4ec", fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: "#55575f", marginTop: 4 }}>{sub}</div>}
  </div>
);

const SectionHead = ({ title, sub }) => (
  <div style={{ marginBottom: 12 }}>
    <span style={{ fontSize: 12, fontWeight: 600, color: "#7a7d88", letterSpacing: "0.1em", textTransform: "uppercase" }}>{title}</span>
    {sub && <span style={{ fontSize: 11, color: "#3a3d48", marginLeft: 10 }}>{sub}</span>}
  </div>
);

// ─── Main app ──────────────────────────────────────────────────────────────
export default function App() {
  const [symbol,     setSymbol]     = useState("XAUUSD");
  const [hoursBack,  setHoursBack]  = useState(6);
  const [timeframe,  setTimeframe]  = useState(60);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [lastFetch,  setLastFetch]  = useState(null);
  const [autoRefresh,setAutoRefresh]= useState(false);
  const [activeTab,  setActiveTab]  = useState("chart");
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${API_BASE}/api/orderflow/${symbol}?hours_back=${hoursBack}&timeframe=${timeframe}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setLastFetch(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [symbol, hoursBack, timeframe]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (autoRefresh) { timerRef.current = setInterval(fetchData, 60_000); }
    else             { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, fetchData]);

  const summary  = data?.summary || {};
  const candles  = data?.candles || [];
  const profile  = data?.volume_profile || [];
  const spikes   = candles.filter(c => c.is_spike);
  const isBullish = summary.bias === "bullish";

  const deltaData = candles.slice(-80).map(c => ({
    time:  fmtTs(c.time),
    delta: c.delta,
    cum:   c.cum_delta,
    spike: c.is_spike,
  }));

  const profileSlice = [...profile]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 50)
    .sort((a, b) => a.price - b.price);

  const TAB = { chart: "Price Chart", delta: "Order Flow", profile: "Vol Profile" };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b0f", color: "#c8cad0", fontFamily: "'IBM Plex Sans', sans-serif", padding: "0 0 40px" }}>

      {/* ── Top bar ── */}
      <div style={{ background: "#0d0f14", borderBottom: "1px solid #1a1c24", padding: "12px 24px", display: "flex", alignItems: "center", gap: 16, position: "sticky", top: 0, zIndex: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e4ec", letterSpacing: "0.12em" }}>ORDER FLOW</span>
          <span style={{ fontSize: 10, color: "#3a3d48", letterSpacing: "0.08em" }}>PRO</span>
        </div>

        {/* Symbols */}
        <div style={{ display: "flex", gap: 5 }}>
          {SYMBOLS.map(s => (
            <button key={s} onClick={() => setSymbol(s)} style={{
              background: s === symbol ? "#1e3a5f" : "transparent",
              border: `1px solid ${s === symbol ? "#2a5a9f" : "#1e2028"}`,
              color: s === symbol ? "#60a8f8" : "#55575f",
              borderRadius: 6, padding: "4px 11px", fontSize: 11,
              cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
            }}>{s}</button>
          ))}
        </div>

        {/* Timeframe */}
        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          {TIMEFRAMES.map(tf => (
            <button key={tf.label} onClick={() => setTimeframe(tf.seconds)} style={{
              background: tf.seconds === timeframe ? "#1a2a1a" : "transparent",
              border: `1px solid ${tf.seconds === timeframe ? "#2a5a2a" : "#1e2028"}`,
              color: tf.seconds === timeframe ? "#4adc8a" : "#3a3d48",
              borderRadius: 5, padding: "3px 9px", fontSize: 11, cursor: "pointer",
            }}>{tf.label}</button>
          ))}
        </div>

        {/* Hours back */}
        <div style={{ display: "flex", gap: 4 }}>
          {[1, 3, 6, 12].map(h => (
            <button key={h} onClick={() => setHoursBack(h)} style={{
              background: h === hoursBack ? "#1a1c24" : "transparent",
              border: `1px solid ${h === hoursBack ? "#2a2d35" : "transparent"}`,
              color: h === hoursBack ? "#c8cad0" : "#3a3d48",
              borderRadius: 5, padding: "3px 9px", fontSize: 11, cursor: "pointer",
            }}>{h}H</button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {data?.data_from && (
            <span style={{ fontSize: 10, color: "#3a3d48", fontStyle: "italic" }}>
              {data.data_from}
            </span>
          )}
          <button onClick={fetchData} disabled={loading} style={{
            background: "#1a2f4a", border: "1px solid #1e4070",
            color: loading ? "#3a5070" : "#4a9af0",
            borderRadius: 7, padding: "5px 14px", fontSize: 12, cursor: loading ? "not-allowed" : "pointer",
          }}>{loading ? "Loading…" : "↻ Refresh"}</button>
          <button onClick={() => setAutoRefresh(v => !v)} style={{
            background: autoRefresh ? "#1a3a1a" : "transparent",
            border: `1px solid ${autoRefresh ? "#2a6a2a" : "#1e2028"}`,
            color: autoRefresh ? "#4adc4a" : "#3a3d48",
            borderRadius: 7, padding: "5px 14px", fontSize: 12, cursor: "pointer",
          }}>{autoRefresh ? "● Live" : "○ Live"}</button>
        </div>
      </div>

      <div style={{ padding: "20px 24px" }}>

        {error && (
          <div style={{ background: "#1a0d0d", border: "1px solid #4a1a1a", borderRadius: 8, padding: "12px 18px", marginBottom: 20, color: "#f06060", fontSize: 13 }}>
            ⚠ {error}
          </div>
        )}

        {/* Stats row */}
        {data && (
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <StatCard label="Last Price"  value={`$${fmt(summary.last_price)}`} sub={symbol} />
            <StatCard label="Net Delta"   value={summary.net_delta > 0 ? `+${fmtVol(summary.net_delta)}` : fmtVol(summary.net_delta)} sub={isBullish ? "Buying dominant" : "Selling dominant"} accent={isBullish ? "#4adc8a" : "#f06060"} />
            <StatCard label="Bias"        value={isBullish ? "BULLISH" : "BEARISH"} sub={`${data.candle_count} candles`} accent={isBullish ? "#4adc8a" : "#f06060"} />
            <StatCard label="POC"         value={`$${fmt(summary.poc)}`} sub={`Vol: ${fmtVol(summary.poc_volume)}`} accent="#f0c04a" />
            <StatCard label="Value Area"  value={`${fmt(summary.val)} – ${fmt(summary.vah)}`} sub="70% of volume" accent="#a060f0" />
            <StatCard label="Spikes"      value={summary.spike_count ?? 0} sub="Institutional signals" accent={summary.spike_count > 0 ? "#f08040" : "#55575f"} />
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid #1a1c24", paddingBottom: 0 }}>
          {Object.entries(TAB).map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)} style={{
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${activeTab === key ? "#4a9af0" : "transparent"}`,
              color: activeTab === key ? "#e2e4ec" : "#3a3d48",
              padding: "8px 18px",
              fontSize: 12, cursor: "pointer",
              fontWeight: activeTab === key ? 600 : 400,
              marginBottom: -1,
              transition: "color 0.15s",
            }}>{label}</button>
          ))}
        </div>

        {data && activeTab === "chart" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 0, background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px 8px", borderBottom: "1px solid #1a1c24" }}>
                <SectionHead title={`${symbol} · ${TIMEFRAMES.find(t => t.seconds === timeframe)?.label}`} sub={`${candles.length} candles · POC $${fmt(summary.poc)} · VAH $${fmt(summary.vah)} · VAL $${fmt(summary.val)}`} />
              </div>
              {/* Candle chart */}
              <div style={{ height: 340, padding: "8px 0 0" }}>
                <CandleChart candles={candles} summary={summary} />
              </div>
              {/* Volume bars */}
              <div style={{ height: 64, borderTop: "1px solid #1a1c24" }}>
                <VolumeBars candles={candles} />
              </div>
              <div style={{ padding: "8px 16px", display: "flex", gap: 16, fontSize: 10, color: "#3a3d48" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, background: "#26a65b", borderRadius: 1, display: "inline-block" }} /> Bullish</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, background: "#c0392b", borderRadius: 1, display: "inline-block" }} /> Bearish</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, background: "#f08040", borderRadius: 1, display: "inline-block" }} /> Volume spike</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 20, height: 1, background: "#8a6a10", display: "inline-block", borderTop: "1px dashed #8a6a10" }} /> POC</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 20, height: 1, background: "#3a2060", display: "inline-block", borderTop: "1px dashed #3a2060" }} /> Value Area</span>
              </div>
            </div>

            {/* Right: volume profile */}
            <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "16px" }}>
              <SectionHead title="Volume Profile" />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, fontSize: 11 }}>
                {[["POC", summary.poc, "#f0c04a"], ["VAH", summary.vah, "#a060f0"], ["VAL", summary.val, "#a060f0"]].map(([lbl, val, col]) => (
                  <div key={lbl} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#55575f" }}>{lbl}</span>
                    <span style={{ color: col, fontFamily: "monospace" }}>${fmt(val)}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 420, overflowY: "auto" }}>
                {[...profileSlice].reverse().map((p, i) => {
                  const isPoc = p.price === summary.poc;
                  const inVa  = p.price >= summary.val && p.price <= summary.vah;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 9, fontFamily: "monospace", color: isPoc ? "#f0c04a" : inVa ? "#a060f0" : "#2a2d35", minWidth: 56, textAlign: "right" }}>{fmt(p.price)}</span>
                      <div style={{ height: 8, width: `${p.pct}%`, background: isPoc ? "#8a6a10" : inVa ? "#3a2060" : "#1a2030", borderRadius: 1, minWidth: 2, transition: "width 0.3s" }} />
                      {isPoc && <span style={{ fontSize: 8, color: "#f0c04a" }}>●</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {data && activeTab === "delta" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "20px 20px 10px" }}>
              <SectionHead title="Volume Delta" sub="Buy pressure − Sell pressure per candle" />
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={deltaData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="time" tick={{ fill: "#3a3d48", fontSize: 10 }} axisLine={false} tickLine={false} interval={9} />
                  <YAxis tick={{ fill: "#3a3d48", fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={v => v.toFixed(1)} />
                  <Tooltip content={<DarkTooltip />} />
                  <ReferenceLine y={0} stroke="#2a2d35" strokeWidth={1} />
                  <Bar dataKey="delta" name="Delta" radius={[2,2,0,0]} maxBarSize={12}>
                    {deltaData.map((e, i) => <Cell key={i} fill={e.spike ? "#f08040" : e.delta >= 0 ? "#2a6a4a" : "#6a2a2a"} opacity={e.spike ? 1 : 0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "20px 20px 10px" }}>
              <SectionHead title="Cumulative Delta" sub="Rising = buyers absorbing — falling = sellers dominant" />
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

            <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "20px" }}>
              <SectionHead title="Spike Log" sub={`${spikes.length} institutional signals detected`} />
              {spikes.length === 0 ? (
                <div style={{ color: "#3a3d48", fontSize: 13, padding: "12px 0" }}>No spikes in this window.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {spikes.slice(-10).reverse().map((s, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#120d08", border: "1px solid #2a1a08", borderRadius: 7, padding: "8px 14px", fontSize: 12 }}>
                      <span style={{ color: "#7a7d88", fontFamily: "monospace" }}>{fmtTs(s.time)} UTC</span>
                      <span style={{ color: "#e2e4ec" }}>${fmt(s.close)}</span>
                      <span style={{ color: "#f0c04a" }}>Vol {fmtVol(s.volume)}</span>
                      <span style={{ color: "#f08040" }}>{s.spike_ratio}× avg</span>
                      <span style={{ color: s.delta >= 0 ? "#4adc8a" : "#f06060" }}>{s.delta >= 0 ? "▲ Buy" : "▼ Sell"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {data && activeTab === "profile" && (
          <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "20px" }}>
            <SectionHead title="Full Volume Profile" sub={`${profile.length} price levels · POC $${fmt(summary.poc)}`} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 600, overflowY: "auto" }}>
              {[...profile].reverse().map((p, i) => {
                const isPoc = p.price === summary.poc;
                const inVa  = p.price >= summary.val && p.price <= summary.vah;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: isPoc ? "#f0c04a" : inVa ? "#a060f0" : "#3a3d48", minWidth: 66, textAlign: "right" }}>{fmt(p.price)}</span>
                    <div style={{ height: 10, width: `${p.pct * 0.7}%`, background: isPoc ? "#8a6a10" : inVa ? "#3a2060" : "#1a2030", borderRadius: 2, minWidth: 2, transition: "width 0.3s" }} />
                    <span style={{ fontSize: 10, color: isPoc ? "#f0c04a" : inVa ? "#7040a0" : "#2a2d35" }}>{p.pct.toFixed(1)}%</span>
                    {isPoc && <span style={{ fontSize: 10, color: "#f0c04a", fontWeight: 600 }}>POC</span>}
                    {inVa && !isPoc && <span style={{ fontSize: 9, color: "#5a3a80" }}>VA</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: 20, fontSize: 11, color: "#25272f", textAlign: "center" }}>
          Data: Dukascopy public feed · All times UTC
          {lastFetch && ` · Last fetch: ${lastFetch.toUTCString().slice(17, 25)}`}
        </div>
      </div>
    </div>
  );
}
