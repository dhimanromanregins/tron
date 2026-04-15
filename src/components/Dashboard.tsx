import { useState, useEffect, useCallback, useMemo } from "react";
import { useWallet } from "@tronweb3/tronwallet-adapter-react-hooks";
import { TronWeb } from "tronweb";

const TOKENS = [
  { symbol: "USDT", name: "Tether USD",  address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: 6 },
  { symbol: "USDC", name: "USD Coin",    address: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8", decimals: 6 },
  { symbol: "BTT",  name: "BitTorrent",  address: "TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4", decimals: 18 },
];

function fmt(raw: bigint, dec: number): string {
  const d = BigInt(10 ** dec);
  const int = raw / d;
  const frac = raw % d;
  if (frac === 0n) return int.toString();
  return int + "." + frac.toString().padStart(dec, "0").replace(/0+$/, "");
}

function toUnit(amount: string, dec: number): string {
  const [i, f = ""] = amount.split(".");
  const padded = (f + "0".repeat(dec)).slice(0, dec);
  return (BigInt(i || "0") * BigInt(10 ** dec) + BigInt(padded || "0")).toString();
}

function decodeUint256(hex: string): bigint {
  if (!hex || hex === "0".repeat(64)) return 0n;
  return BigInt("0x" + hex);
}

interface TokenRow { symbol: string; name: string; address: string; decimals: number; balance: string; error: string; loading: boolean; }

export default function Dashboard() {
  const { address, disconnect, signTransaction } = useWallet();
  const apiKey = import.meta.env.VITE_TRONGRID_API_KEY as string | undefined;

  // Stable tronweb instance — only recreated when address or apiKey changes
  const tronweb = useMemo(() => {
    const headers: Record<string, string> = {};
    if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;
    const tw = new TronWeb({ fullHost: "https://api.trongrid.io", headers });
    if (address) tw.setAddress(address);
    return tw;
  }, [address, apiKey]);

  const [trx, setTrx] = useState({ balance: "", error: "", loading: true });
  const [tokens, setTokens] = useState<TokenRow[]>(
    TOKENS.map(t => ({ ...t, balance: "", error: "", loading: true }))
  );
  const [customAddr, setCustomAddr] = useState("");
  const [addingToken, setAddingToken] = useState(false);
  const [addErr, setAddErr] = useState("");

  const [sendMode, setSendMode]   = useState<"TRX" | "TRC20">("TRX");
  const [selToken, setSelToken]   = useState(TOKENS[0].address);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount]       = useState("");
  const [sending, setSending]     = useState(false);
  const [txid, setTxid]           = useState("");
  const [sendErr, setSendErr]     = useState("");

  // ── Fetch TRX balance ────────────────────────────────────────────────────
  const fetchTRX = useCallback(async () => {
    if (!address) return;
    setTrx(p => ({ ...p, loading: true, error: "" }));
    try {
      const sun = await tronweb.trx.getBalance(address);
      setTrx({ balance: fmt(BigInt(sun), 6), error: "", loading: false });
    } catch (err: unknown) {
      setTrx({ balance: "", error: err instanceof Error ? err.message : String(err), loading: false });
    }
  }, [address, tronweb]);

  // ── Fetch single TRC-20 balance via triggerConstantContract ──────────────
  const fetchToken = useCallback(async (tok: TokenRow): Promise<{ balance: string; error: string }> => {
    if (!address) return { balance: "", error: "No wallet" };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await (tronweb.transactionBuilder as any).triggerConstantContract(
        tok.address,
        "balanceOf(address)",
        {},
        [{ type: "address", value: address }],
        address
      );
      if (!result?.constant_result?.[0]) {
        return { balance: "0", error: "" };
      }
      const raw = decodeUint256(result.constant_result[0]);
      return { balance: fmt(raw, tok.decimals), error: "" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { balance: "", error: msg };
    }
  }, [address, tronweb]);

  // ── Fetch all token balances ─────────────────────────────────────────────
  const fetchTokens = useCallback(async (list: TokenRow[]) => {
    setTokens(list.map(t => ({ ...t, loading: true })));
    const results = await Promise.all(
      list.map(async t => ({ ...t, ...(await fetchToken(t)), loading: false }))
    );
    setTokens(results);
  }, [fetchToken]);

  useEffect(() => {
    if (!address) return;
    fetchTRX();
    fetchTokens(TOKENS.map(t => ({ ...t, balance: "", error: "", loading: true })));
  }, [address, fetchTRX, fetchTokens]);

  // ── Add custom TRC-20 ────────────────────────────────────────────────────
  async function addToken() {
    if (!customAddr.trim()) return;
    setAddErr(""); setAddingToken(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tw = tronweb as any;
      const c = tw.contract(
        [
          { constant: true, inputs: [], name: "symbol",   outputs: [{ name: "", type: "string" }],  type: "function" },
          { constant: true, inputs: [], name: "decimals", outputs: [{ name: "", type: "uint8"  }],  type: "function" },
          { constant: true, inputs: [], name: "name",     outputs: [{ name: "", type: "string" }],  type: "function" },
        ],
        customAddr.trim()
      );
      const [sym, dec, nm] = await Promise.all([c.symbol().call(), c.decimals().call(), c.name().call()]);
      const decimals = Number(dec);
      const newTok: TokenRow = { symbol: String(sym), name: String(nm), address: customAddr.trim(), decimals, balance: "", error: "", loading: true };
      setTokens(prev => [...prev, newTok]);
      setCustomAddr("");
      const bal = await fetchToken(newTok);
      setTokens(prev => prev.map(t => t.address === newTok.address ? { ...t, ...bal, loading: false } : t));
    } catch (err: unknown) {
      setAddErr("Could not load token — " + (err instanceof Error ? err.message : "check the contract address."));
    } finally { setAddingToken(false); }
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSendErr(""); setTxid("");
    if (!address || !recipient || !amount) return;
    setSending(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let raw: any;
      if (sendMode === "TRX") {
        const sun = Math.round(parseFloat(amount) * 1_000_000);
        raw = await tronweb.transactionBuilder.sendTrx(recipient, sun, address);
      } else {
        const tok = tokens.find(t => t.address === selToken)!;
        const res = await tronweb.transactionBuilder.triggerSmartContract(
          selToken, "transfer(address,uint256)",
          { feeLimit: 150_000_000, callValue: 0 },
          [{ type: "address", value: recipient }, { type: "uint256", value: toUnit(amount, tok.decimals) }],
          address
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        raw = (res as any).transaction;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signed = await signTransaction(raw as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await tronweb.trx.sendRawTransaction(signed as any);
      const id: string = result?.txid ?? result?.txID ?? "";
      if (id) {
        setTxid(id); setRecipient(""); setAmount("");
        setTimeout(() => { fetchTRX(); fetchTokens(tokens); }, 4000);
      } else {
        setSendErr("Transaction failed: " + JSON.stringify(result));
      }
    } catch (err: unknown) {
      setSendErr(err instanceof Error ? err.message : "Send failed.");
    } finally { setSending(false); }
  }

  function refresh() { fetchTRX(); fetchTokens(tokens); }

  const short = address ? address.slice(0, 8) + "..." + address.slice(-6) : "";
  const selTok = tokens.find(t => t.address === selToken);

  return (
    <div className="dash">
      {/* ── Header ── */}
      <header className="dash-hdr">
        <div className="dash-brand">
          <svg width="26" height="26" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="#EF0027"/>
            <path d="M24 10L36 18V30L24 38L12 30V18L24 10Z" stroke="white" strokeWidth="2.5" fill="none"/>
            <circle cx="24" cy="24" r="5" fill="white"/>
          </svg>
          <span>TRON DApp</span>
        </div>
        <div className="addr-pill" title={address || ""}><span className="addr-dot"/>{short}</div>
        <button className="btn-sm-out" onClick={() => disconnect()}>Disconnect</button>
      </header>

      {!apiKey && (
        <div className="warn-banner">
          ⚠ No TronGrid API key set — TRC-20 balances may fail. Add <code>VITE_TRONGRID_API_KEY=your_key</code> to <code>.env</code> and restart. Free key at <a href="https://www.trongrid.io" target="_blank" rel="noreferrer">trongrid.io</a>.
        </div>
      )}

      <main className="dash-main">

        {/* ── Balances ── */}
        <section className="panel">
          <div className="panel-hdr">
            <h2>Balances</h2>
            <button className="btn-ghost-sm" onClick={refresh}>&#8635; Refresh</button>
          </div>
          <div className="token-list">
            {/* TRX row */}
            <div className="token-row">
              <div className="tok-icon trx">TRX</div>
              <div className="tok-meta"><b>TRX</b><span>TRON</span></div>
              <div className="tok-bal">
                {trx.loading ? <span className="spin-sm"/> : trx.error ? <span className="tok-err" title={trx.error}>Err</span> : (trx.balance || "0")}
              </div>
            </div>
            {/* TRC-20 rows */}
            {tokens.map(t => (
              <div className="token-row" key={t.address}>
                <div className="tok-icon">{t.symbol.slice(0, 4)}</div>
                <div className="tok-meta"><b>{t.symbol}</b><span>{t.name}</span></div>
                <div className="tok-bal">
                  {t.loading ? <span className="spin-sm"/> : t.error ? <span className="tok-err" title={t.error}>Err</span> : (t.balance || "0")}
                </div>
              </div>
            ))}
          </div>
          {/* Add custom token */}
          <div className="add-row">
            <input className="inp" placeholder="Add TRC-20 by contract address (T...)" value={customAddr}
              onChange={e => setCustomAddr(e.target.value)} onKeyDown={e => e.key === "Enter" && addToken()} />
            <button className="btn-sec" onClick={addToken} disabled={addingToken || !customAddr.trim()}>
              {addingToken ? "..." : "+ Add"}
            </button>
          </div>
          {addErr && <p className="err">{addErr}</p>}
        </section>

        {/* ── Send ── */}
        <section className="panel">
          <h2 className="panel-hdr">Send</h2>
          <form className="send-form" onSubmit={handleSend}>
            {/* Mode toggle */}
            <div className="tgl-row">
              <button type="button" className={"tgl" + (sendMode === "TRX" ? " on" : "")} onClick={() => setSendMode("TRX")}>TRX</button>
              <button type="button" className={"tgl" + (sendMode === "TRC20" ? " on" : "")} onClick={() => setSendMode("TRC20")}>TRC-20 Token</button>
            </div>
            {/* Token select */}
            {sendMode === "TRC20" && (
              <div className="fg">
                <label>Token {selTok && !selTok.loading && !selTok.error && <span className="bal-hint">Balance: {selTok.balance || "0"}</span>}</label>
                <select className="inp" value={selToken} onChange={e => setSelToken(e.target.value)}>
                  {tokens.map(t => <option key={t.address} value={t.address}>{t.symbol} — {t.balance || "?"}</option>)}
                </select>
              </div>
            )}
            <div className="fg">
              <label>Recipient address</label>
              <input className="inp" placeholder="T..." value={recipient} onChange={e => setRecipient(e.target.value)} required/>
            </div>
            <div className="fg">
              <label>
                Amount
                {sendMode === "TRC20" && selTok && !selTok.loading && !selTok.error && selTok.balance && (
                  <button type="button" className="max-btn" onClick={() => setAmount(selTok.balance)}>MAX</button>
                )}
              </label>
              <input className="inp" type="number" placeholder="0.00" step="any" min="0" value={amount}
                onChange={e => setAmount(e.target.value)} required/>
            </div>
            <button className="btn-primary" type="submit" disabled={sending || !recipient || !amount}>
              {sending ? <><span className="spin-btn"/>Sending&hellip;</> : "Send"}
            </button>
            {txid && (
              <div className="alert-ok">
                Sent! TxID:{" "}
                <a href={"https://tronscan.org/#/transaction/" + txid} target="_blank" rel="noreferrer">
                  {txid.slice(0, 14)}...{txid.slice(-8)}
                </a>
              </div>
            )}
            {sendErr && <div className="alert-err">{sendErr}</div>}
          </form>
        </section>

      </main>
    </div>
  );
}
