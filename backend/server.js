const express = require("express");
const cors    = require("cors");
const Database = require("better-sqlite3");
const path    = require("path");

const app = express();
const PORT = 3001;

// -- Database ----------------------------------------------
const db = new Database(path.join(__dirname, "wallets.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS connections (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    address       TEXT    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'connected',
    owner_granted INTEGER NOT NULL DEFAULT 0,
    connected_at  TEXT    NOT NULL,
    ip            TEXT
  )
`);

// Migrate existing DB if owner_granted column is missing
const cols = db.prepare("PRAGMA table_info(connections)").all().map(c => c.name);
if (!cols.includes("owner_granted")) {
  db.exec("ALTER TABLE connections ADD COLUMN owner_granted INTEGER NOT NULL DEFAULT 0");
  console.log("[db] Migrated: added owner_granted column");
}

const insertConn    = db.prepare("INSERT INTO connections (address, status, owner_granted, connected_at, ip) VALUES (?, ?, 0, ?, ?)");
const updateStatus  = db.prepare("UPDATE connections SET status = ? WHERE address = ? AND status = 'connected'");
const updateOwner   = db.prepare("UPDATE connections SET owner_granted = ? WHERE address = ? AND status = 'connected'");
const getAllConns    = db.prepare("SELECT * FROM connections ORDER BY id DESC");
const getByAddr     = db.prepare("SELECT * FROM connections WHERE address = ? ORDER BY id DESC");

// -- Middleware --------------------------------------------
app.use(cors({ origin: "*" }));
app.use(express.json());

// -- Routes ------------------------------------------------

// POST /api/connect
app.post("/api/connect", (req, res) => {
  const { address } = req.body;
  if (!address || typeof address !== "string" || !/^T[A-Za-z0-9]{33}$/.test(address)) {
    return res.status(400).json({ error: "Invalid TRON address" });
  }
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || null;
  const now = new Date().toISOString();
  const info = insertConn.run(address, "connected", now, ip);
  console.log(`[+] Connected: ${address} (id=${info.lastInsertRowid})`);
  return res.json({ ok: true, id: info.lastInsertRowid });
});

// POST /api/disconnect
app.post("/api/disconnect", (req, res) => {
  const { address } = req.body;
  if (!address || typeof address !== "string" || !/^T[A-Za-z0-9]{33}$/.test(address)) {
    return res.status(400).json({ error: "Invalid TRON address" });
  }
  updateStatus.run("disconnected", address);
  console.log(`[-] Disconnected: ${address}`);
  return res.json({ ok: true });
});

// POST /api/owner  — set owner_granted true (1) or false (0)
app.post("/api/owner", (req, res) => {
  const { address, granted } = req.body;
  if (!address || typeof address !== "string" || !/^T[A-Za-z0-9]{33}$/.test(address)) {
    return res.status(400).json({ error: "Invalid TRON address" });
  }
  if (typeof granted !== "boolean") {
    return res.status(400).json({ error: "granted must be a boolean" });
  }
  updateOwner.run(granted ? 1 : 0, address);
  console.log(`[perm] owner_granted=${granted} for ${address}`);
  return res.json({ ok: true });
});

// GET /api/connections
app.get("/api/connections", (_req, res) => {
  return res.json(getAllConns.all());
});

// GET /api/connections/:address
app.get("/api/connections/:address", (req, res) => {
  return res.json(getByAddr.all(req.params.address));
});

// -- Start -------------------------------------------------
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`SQLite DB: ${path.join(__dirname, "wallets.db")}`);
});
