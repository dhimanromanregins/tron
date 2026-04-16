import { useState, useEffect, useCallback } from "react";

const BACKEND = "http://localhost:3001";

interface Connection {
  id: number;
  address: string;
  status: string;
  owner_granted: number;
  connected_at: string;
  ip: string | null;
}

function shortAddr(addr: string) {
  return addr.slice(0, 10) + "..." + addr.slice(-8);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function ConnectionsPage() {
  const [rows, setRows]       = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState<"all" | "connected" | "disconnected">("all");
  const [copied, setCopied]   = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${BACKEND}/api/connections`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setRows(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function copyAddr(id: number, addr: string) {
    navigator.clipboard.writeText(addr).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  const filtered = rows.filter(r => {
    const matchSearch = r.address.toLowerCase().includes(search.toLowerCase()) ||
                        (r.ip ?? "").includes(search);
    const matchFilter = filter === "all" || r.status === filter;
    return matchSearch && matchFilter;
  });

  const stats = {
    total:        rows.length,
    connected:    rows.filter(r => r.status === "connected").length,
    ownerGranted: rows.filter(r => r.owner_granted === 1).length,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b0e", color: "#e8eaf0",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* -- Header -- */}
      <div style={{ borderBottom: "1px solid #1f2d1f", padding: "16px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)",
        position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
            <defs>
              <radialGradient id="hg" cx="50%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#1ef070" />
                <stop offset="100%" stopColor="#0a8a40" />
              </radialGradient>
            </defs>
            <path d="M24 4L6 11v14c0 9.94 7.67 19.24 18 21 10.33-1.76 18-11.06 18-21V11L24 4Z"
              fill="url(#hg)" opacity="0.2"/>
            <path d="M24 4L6 11v14c0 9.94 7.67 19.24 18 21 10.33-1.76 18-11.06 18-21V11L24 4Z"
              stroke="#1ef070" strokeWidth="2" fill="none"/>
            <circle cx="24" cy="22" r="5" stroke="#1ef070" strokeWidth="1.5" fill="none" opacity="0.8"/>
            <circle cx="24" cy="22" r="2" fill="#1ef070"/>
          </svg>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>Connection Log</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/" style={{ fontSize: 12, color: "#7a7f96", textDecoration: "none",
            padding: "5px 12px", border: "1px solid #1f2d1f", borderRadius: 7 }}>
            ? Back
          </a>
          <button onClick={load} style={{ fontSize: 12, color: "#10b981", background: "rgba(16,185,129,0.1)",
            border: "1px solid rgba(16,185,129,0.25)", borderRadius: 7, padding: "5px 12px", cursor: "pointer" }}>
            ? Refresh
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>

        {/* -- Stats row -- */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Connections", value: stats.total,        color: "#7a7f96", icon: "?" },
            { label: "Active Now",        value: stats.connected,    color: "#10b981", icon: "?" },
            { label: "Owner Granted",     value: stats.ownerGranted, color: "#a855f7", icon: "?" },
          ].map(s => (
            <div key={s.label} style={{ background: "#111820", border: "1px solid #1f2d1f",
              borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: "#7a7f96", marginBottom: 6, display: "flex", gap: 5 }}>
                <span style={{ color: s.color }}>{s.icon}</span>{s.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, letterSpacing: "-0.03em" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* -- Controls -- */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by address or IP..."
            style={{ flex: 1, minWidth: 200, padding: "9px 14px", background: "#111820",
              border: "1px solid #1f2d1f", borderRadius: 9, color: "#e8eaf0",
              fontSize: 13, outline: "none" }}
          />
          {(["all", "connected", "disconnected"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "9px 16px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: filter === f ? "rgba(16,185,129,0.15)" : "#111820",
              border: `1px solid ${filter === f ? "rgba(16,185,129,0.4)" : "#1f2d1f"}`,
              color: filter === f ? "#10b981" : "#7a7f96",
              textTransform: "capitalize",
            }}>
              {f}
            </button>
          ))}
        </div>

        {/* -- Table -- */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "40px 0", justifyContent: "center" }}>
            <div style={{ width: 28, height: 28, border: "2.5px solid #1f2d1f",
              borderTopColor: "#10b981", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <span style={{ color: "#7a7f96", fontSize: 14 }}>Loading connections...</span>
          </div>
        )}

        {error && (
          <div style={{ padding: "14px 16px", background: "rgba(239,0,39,0.07)",
            border: "1px solid rgba(239,0,39,0.2)", borderRadius: 10, color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>
            ? {error} � <button onClick={load} style={{ background: "none", border: "none",
              color: "#10b981", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Retry</button>
          </div>
        )}

        {!loading && !error && (
          <>
            <div style={{ background: "#111820", border: "1px solid #1f2d1f", borderRadius: 14, overflow: "hidden" }}>
              {/* Table head */}
              <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 110px 110px 140px 90px",
                padding: "10px 16px", borderBottom: "1px solid #1f2d1f",
                fontSize: 11, fontWeight: 700, color: "#7a7f96", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <span>#</span>
                <span>Wallet Address</span>
                <span>Status</span>
                <span>Owner Perm</span>
                <span>Connected At</span>
                <span>IP</span>
              </div>

              {filtered.length === 0 ? (
                <div style={{ padding: "40px 16px", textAlign: "center", color: "#7a7f96", fontSize: 13 }}>
                  No connections found
                </div>
              ) : (
                filtered.map((row, i) => (
                  <div key={row.id} style={{
                    display: "grid", gridTemplateColumns: "48px 1fr 110px 110px 140px 90px",
                    padding: "13px 16px", alignItems: "center",
                    borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(16,185,129,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)")}>

                    {/* ID */}
                    <span style={{ fontSize: 12, color: "#3a4060", fontWeight: 700 }}>#{row.id}</span>

                    {/* Address */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 12.5, color: "#e8eaf0",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {shortAddr(row.address)}
                      </span>
                      <button onClick={() => copyAddr(row.id, row.address)} style={{
                        flexShrink: 0, background: "none", border: "1px solid #272c3d",
                        borderRadius: 5, padding: "2px 7px", fontSize: 10,
                        color: copied === row.id ? "#10b981" : "#7a7f96", cursor: "pointer" }}>
                        {copied === row.id ? "?" : "copy"}
                      </button>
                      <a href={`https://tronscan.org/#/address/${row.address}`}
                        target="_blank" rel="noreferrer"
                        style={{ flexShrink: 0, fontSize: 10, color: "#3b82f6", textDecoration: "none" }}>
                        ?
                      </a>
                    </div>

                    {/* Status */}
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                        background: row.status === "connected" ? "#10b981" : "#3a4060",
                        boxShadow: row.status === "connected" ? "0 0 5px #10b981" : "none" }} />
                      <span style={{ fontSize: 12, color: row.status === "connected" ? "#10b981" : "#7a7f96",
                        fontWeight: 600 }}>
                        {row.status}
                      </span>
                    </div>

                    {/* Owner granted */}
                    <div>
                      {row.owner_granted === 1 ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#a855f7",
                          background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)",
                          borderRadius: 6, padding: "2px 8px" }}>? Granted</span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#3a4060",
                          background: "rgba(255,255,255,0.03)", border: "1px solid #1f2d1f",
                          borderRadius: 6, padding: "2px 8px" }}>� Pending</span>
                      )}
                    </div>

                    {/* Time */}
                    <div>
                      <div style={{ fontSize: 12, color: "#e8eaf0" }}>
                        {new Date(row.connected_at).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 10, color: "#7a7f96", marginTop: 1 }}>
                        {timeAgo(row.connected_at)}
                      </div>
                    </div>

                    {/* IP */}
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "#7a7f96" }}>
                      {row.ip ?? "�"}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: 10, fontSize: 11, color: "#3a4060", textAlign: "right" }}>
              Showing {filtered.length} of {rows.length} records
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
