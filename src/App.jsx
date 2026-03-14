import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, BarChart as HorizBar,
} from "recharts";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY"];

const fmt = (n) => (n == null ? "—" : Number(n).toFixed(2));
const fmtVol = (n) => (n == null ? "—" : Number(n).toFixed(1));
const fmtTs = (epoch) => {
  const d = new Date(epoch * 1000);
  return d.toUTCString().slice(17, 22);
};

// ─── Themed tooltip ────────────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0d0f14",
      border: "1px solid #2a2d35",
      borderRadius: 6,
      padding: "8px 12px",
      fontSize: 12,
      color: "#c8cad0",
    }}>
      <div style={{ color: "#7a7d88", marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "#e2e4ec" }}>
          {p.name}: <strong>{fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  );
};

// ─── Stat card ─────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, accent }) => (
  <div style={{
    background: "#13151c",
    border: "1px solid #1e2028",
    borderRadius: 10,
    padding: "14px 18px",
    flex: 1,
    minWidth: 130,
  }}>
    <div style={{ fontSize: 11, color: "#55575f", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 600, color: accent || "#e2e4ec", fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: "#55575f", marginTop: 4 }}>{sub}</div>}
  </div>
);

// ─── Section header ────────────────────────────────────────────────────────
const SectionHead = ({ title, sub }) => (
  <div style={{ marginBottom: 12 }}>
    <span style={{ fontSize: 12, fontWeight: 600, color: "#7a7d88", letterSpacing: "0.1em", textTransform: "uppercase" }}>{title}</span>
    {sub && <span style={{ fontSize: 11, color: "#3a3d48", marginLeft: 10 }}>{sub}</span>}
  </div>
);

// ─── Main app ──────────────────────────────────────────────────────────────
export default function App() {
  const [symbol, setSymbol] = useState("XAUUSD");
  const [hoursBack, setHoursBack] = useState(3);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/orderflow/${symbol}?hours_back=${hoursBack}&timeframe=60`
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setLastFetch(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [symbol, hoursBack]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(fetchData, 60_000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, fetchData]);

  const summary = data?.summary || {};
  const candles = data?.candles || [];
  const profile = data?.volume_profile || [];
  const spikes = candles.filter((c) => c.is_spike);

  // Prepare delta chart data (last 60 candles)
  const deltaData = candles.slice(-60).map((c) => ({
    time: fmtTs(c.time),
    delta: c.delta,
    cum: c.cum_delta,
    vol: c.volume,
    spike: c.is_spike,
    close: c.close,
  }));

  // Profile: top 40 levels by volume (trim noise at extremes)
  const profileSlice = [...profile]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 40)
    .sort((a, b) => a.price - b.price);

  const isBullish = summary.bias === "bullish";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0b0f",
      color: "#c8cad0",
      fontFamily: "'IBM Plex Sans', sans-serif",
      padding: "0 0 40px",
    }}>

      {/* Top bar */}
      <div style={{
        background: "#0d0f14",
        borderBottom: "1px solid #1a1c24",
        padding: "14px 28px",
        display: "flex",
        alignItems: "center",
        gap: 20,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e4ec", letterSpacing: "0.12em" }}>ORDER FLOW</span>
          <span style={{ fontSize: 11, color: "#3a3d48" }}>DASHBOARD</span>
        </div>

        {/* Symbol selector */}
        <div style={{ display: "flex", gap: 6, marginLeft: 16 }}>
          {SYMBOLS.map((s) => (
            <button key={s} onClick={() => setSymbol(s)} style={{
              background: s === symbol ? "#1e3a5f" : "transparent",
              border: `1px solid ${s === symbol ? "#2a5a9f" : "#1e2028"}`,
              color: s === symbol ? "#60a8f8" : "#55575f",
              borderRadius: 6,
              padding: "4px 12px",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              transition: "all 0.15s",
            }}>{s}</button>
          ))}
        </div>

        {/* Hours back */}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {[1, 2, 3, 6].map((h) => (
            <button key={h} onClick={() => setHoursBack(h)} style={{
              background: h === hoursBack ? "#1a1c24" : "transparent",
              border: `1px solid ${h === hoursBack ? "#2a2d35" : "transparent"}`,
              color: h === hoursBack ? "#c8cad0" : "#3a3d48",
              borderRadius: 5,
              padding: "4px 10px",
              fontSize: 11,
              cursor: "pointer",
            }}>{h}H</button>
          ))}
        </div>

        {/* Refresh controls */}
        <button onClick={fetchData} disabled={loading} style={{
          background: "#1a2f4a",
          border: "1px solid #1e4070",
          color: loading ? "#3a5070" : "#4a9af0",
          borderRadius: 7,
          padding: "5px 14px",
          fontSize: 12,
          cursor: loading ? "not-allowed" : "pointer",
        }}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>

        <button onClick={() => setAutoRefresh((v) => !v)} style={{
          background: autoRefresh ? "#1a3a1a" : "transparent",
          border: `1px solid ${autoRefresh ? "#2a6a2a" : "#1e2028"}`,
          color: autoRefresh ? "#4adc4a" : "#3a3d48",
          borderRadius: 7,
          padding: "5px 14px",
          fontSize: 12,
          cursor: "pointer",
        }}>
          {autoRefresh ? "● Live" : "○ Live"}
        </button>
      </div>

      <div style={{ padding: "24px 28px" }}>

        {/* Error banner */}
        {error && (
          <div style={{
            background: "#1a0d0d", border: "1px solid #4a1a1a",
            borderRadius: 8, padding: "12px 18px", marginBottom: 20,
            color: "#f06060", fontSize: 13,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Summary stats row */}
        {data && (
          <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
            <StatCard
              label="Last Price"
              value={`$${fmt(summary.last_price)}`}
              sub={symbol}
              accent="#e2e4ec"
            />
            <StatCard
              label="Net Delta"
              value={summary.net_delta > 0 ? `+${fmtVol(summary.net_delta)}` : fmtVol(summary.net_delta)}
              sub={isBullish ? "Buying pressure dominant" : "Selling pressure dominant"}
              accent={isBullish ? "#4adc8a" : "#f06060"}
            />
            <StatCard
              label="Bias"
              value={isBullish ? "BULLISH" : "BEARISH"}
              sub={`${data.candle_count} candles analysed`}
              accent={isBullish ? "#4adc8a" : "#f06060"}
            />
            <StatCard
              label="POC"
              value={`$${fmt(summary.poc)}`}
              sub={`Vol: ${fmtVol(summary.poc_volume)}`}
              accent="#f0c04a"
            />
            <StatCard
              label="Value Area"
              value={`${fmt(summary.val)} – ${fmt(summary.vah)}`}
              sub="70% of volume"
              accent="#a060f0"
            />
            <StatCard
              label="Spikes"
              value={summary.spike_count ?? 0}
              sub="Institutional activity"
              accent={summary.spike_count > 0 ? "#f08040" : "#55575f"}
            />
          </div>
        )}

        {data && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>

            {/* LEFT COLUMN */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Volume Delta chart */}
              <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "20px 20px 10px" }}>
                <SectionHead title="Volume Delta" sub="Buy pressure − Sell pressure per candle (last 60 bars)" />
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={deltaData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <XAxis dataKey="time" tick={{ fill: "#3a3d48", fontSize: 10 }} axisLine={false} tickLine={false} interval={9} />
                    <YAxis tick={{ fill: "#3a3d48", fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => v.toFixed(1)} />
                    <Tooltip content={<DarkTooltip />} />
                    <ReferenceLine y={0} stroke="#2a2d35" strokeWidth={1} />
                    <Bar dataKey="delta" name="Delta" radius={[2, 2, 0, 0]} maxBarSize={12}>
                      {deltaData.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={entry.spike ? "#f08040" : entry.delta >= 0 ? "#2a6a4a" : "#6a2a2a"}
                          opacity={entry.spike ? 1 : 0.85}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", gap: 18, marginTop: 8, fontSize: 11, color: "#3a3d48" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 10, height: 10, background: "#2a6a4a", borderRadius: 2, display: "inline-block" }} /> Buying
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 10, height: 10, background: "#6a2a2a", borderRadius: 2, display: "inline-block" }} /> Selling
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 10, height: 10, background: "#f08040", borderRadius: 2, display: "inline-block" }} /> Spike
                  </span>
                </div>
              </div>

              {/* Cumulative Delta chart */}
              <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "20px 20px 10px" }}>
                <SectionHead title="Cumulative Delta" sub="Running total — divergence from price signals exhaustion" />
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={deltaData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <XAxis dataKey="time" tick={{ fill: "#3a3d48", fontSize: 10 }} axisLine={false} tickLine={false} interval={9} />
                    <YAxis tick={{ fill: "#3a3d48", fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => v.toFixed(0)} />
                    <Tooltip content={<DarkTooltip />} />
                    <ReferenceLine y={0} stroke="#2a2d35" />
                    <Bar dataKey="cum" name="Cum. Delta" radius={[2, 2, 0, 0]} maxBarSize={12}>
                      {deltaData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.cum >= 0 ? "#1e4a3a" : "#4a1e1e"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Spike log */}
              <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "20px" }}>
                <SectionHead title="Spike Log" sub={`${spikes.length} anomalies detected`} />
                {spikes.length === 0 ? (
                  <div style={{ color: "#3a3d48", fontSize: 13, padding: "12px 0" }}>No volume spikes detected in this window.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {spikes.slice(-10).reverse().map((s, i) => (
                      <div key={i} style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#120d08",
                        border: "1px solid #2a1a08",
                        borderRadius: 7,
                        padding: "8px 14px",
                        fontSize: 12,
                      }}>
                        <span style={{ color: "#7a7d88", fontFamily: "monospace" }}>{fmtTs(s.time)} UTC</span>
                        <span style={{ color: "#e2e4ec" }}>${fmt(s.close)}</span>
                        <span style={{ color: "#f0c04a" }}>Vol: {fmtVol(s.volume)}</span>
                        <span style={{ color: "#f08040" }}>{s.spike_ratio}× avg</span>
                        <span style={{ color: s.delta >= 0 ? "#4adc8a" : "#f06060" }}>
                          {s.delta >= 0 ? "▲ Buy" : "▼ Sell"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN — Volume Profile */}
            <div style={{ background: "#0d0f14", border: "1px solid #1a1c24", borderRadius: 12, padding: "20px" }}>
              <SectionHead title="Volume Profile" sub="Price level histogram" />

              {/* POC / VA legend */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, fontSize: 11 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#55575f" }}>POC</span>
                  <span style={{ color: "#f0c04a", fontFamily: "monospace" }}>${fmt(summary.poc)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#55575f" }}>VAH</span>
                  <span style={{ color: "#a060f0", fontFamily: "monospace" }}>${fmt(summary.vah)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#55575f" }}>VAL</span>
                  <span style={{ color: "#a060f0", fontFamily: "monospace" }}>${fmt(summary.val)}</span>
                </div>
              </div>

              {/* Horizontal bar per price level */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 580, overflowY: "auto" }}>
                {[...profileSlice].reverse().map((p, i) => {
                  const isPoc = p.price === summary.poc;
                  const inVa = p.price >= summary.val && p.price <= summary.vah;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontSize: 10,
                        fontFamily: "monospace",
                        color: isPoc ? "#f0c04a" : inVa ? "#a060f0" : "#3a3d48",
                        minWidth: 62,
                        textAlign: "right",
                      }}>{fmt(p.price)}</span>
                      <div style={{
                        height: 9,
                        width: `${p.pct}%`,
                        background: isPoc ? "#8a6a10" : inVa ? "#3a2060" : "#1a2030",
                        borderRadius: 2,
                        minWidth: 2,
                        transition: "width 0.3s",
                      }} />
                      {isPoc && <span style={{ fontSize: 9, color: "#f0c04a" }}>POC</span>}
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 14, borderTop: "1px solid #1a1c24", paddingTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 12, height: 8, background: "#8a6a10", borderRadius: 2 }} />
                  <span style={{ fontSize: 11, color: "#55575f" }}>Point of Control (POC)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 12, height: 8, background: "#3a2060", borderRadius: 2 }} />
                  <span style={{ fontSize: 11, color: "#55575f" }}>Value Area (70% vol)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, fontSize: 11, color: "#25272f", textAlign: "center" }}>
          Data: Dukascopy public feed · All times UTC
          {lastFetch && ` · Last fetch: ${lastFetch.toUTCString().slice(17, 25)}`}
        </div>
      </div>
    </div>
  );
}
