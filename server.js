// server.js (ESM) — chỉnh để bắt buộc auth cho API quan trọng
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { PayOS } from "@payos/node";
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

// CORS allowlist (comma separated)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || `http://localhost:${PORT}`).split(",").map(s => s.trim());
const CORS_OPTIONS = {
    origin: function (origin, cb) {
        if (!origin) return cb(null, true); // allow curl / server-side
        if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error("CORS not allowed"), false);
    },
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(helmet());
app.use(cors(CORS_OPTIONS));
app.use(express.json({ limit: "300kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
// rate limiter
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

// simple dev logging
app.use((req, res, next) => {
    console.log(new Date().toISOString(), req.ip, req.method, req.originalUrl);
    next();
});

// session (in-memory demo)
const SESSIONS = new Map();
const SESSION_TTL = 1000 * 60 * 60;

function createSession(username) {
    const sid = uuidv4();
    SESSIONS.set(sid, { username, expires: Date.now() + SESSION_TTL });
    return sid;
}
function getSession(sid) {
    const s = SESSIONS.get(sid);
    if (!s) return null;
    if (Date.now() > s.expires) {
        SESSIONS.delete(sid);
        return null;
    }
    return s;
}
function destroySession(sid) {
    SESSIONS.delete(sid);
}

app.get("/debug-ip", async (req, res) => {
    try {
        // private / internal IPs
        const nets = os.networkInterfaces();
        const privateIps = [];
        Object.keys(nets).forEach((iface) => {
            (nets[iface] || []).forEach((n) => {
                if (n && n.family === "IPv4" && !n.internal) {
                    privateIps.push({ iface, address: n.address, cidr: n.cidr || null });
                }
            });
        });

        // public/outbound IP (what others see) via ipify
        let publicIp = null;
        try {
            const r = await axios.get("https://api.ipify.org?format=json", { timeout: 5000 });
            publicIp = r?.data?.ip ?? null;
        } catch (e) {
            console.warn("get public ip failed:", e.message || e);
        }

        // optionally include forwarded ip from proxy (if behind a load balancer)
        const forwarded = req.headers["x-forwarded-for"] || req.ip || null;

        res.json({
            publicIp,
            privateIps,
            forwarded
        });
    } catch (err) {
        console.error("debug-ip error:", err);
        res.status(500).json({ error: String(err) });
    }
});

// ---------- requireAuth middleware (định nghĩa sớm để dùng cho routes) ----------
function requireAuth(req, res, next) {
    const sid = req.cookies?.sid;
    const s = getSession(sid);
    if (!s) return res.status(401).json({ error: true, message: "Không có quyền (vui lòng đăng nhập)" });
    // refresh TTL
    s.expires = Date.now() + SESSION_TTL;
    SESSIONS.set(sid, s);
    // attach username for convenience
    req.username = s.username;
    next();
}

// --- PayOS config (giữ nguyên) ---
const PAYOS_API_URL = process.env.PAYOS_API_URL || "https://api-merchant.payos.vn";
const CLIENT_ID = process.env.PAYOS_CLIENT_ID || "";
const API_KEY = process.env.PAYOS_API_KEY || "";
const CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY || "";

const TOPUP_CLIENT_ID = process.env.TOPUP_CLIENT_ID || "";
const TOPUP_API_KEY = process.env.TOPUP_API_KEY || "";
const TOPUP_CHECKSUM_KEY = process.env.TOPUP_CHECKSUM_KEY || "";

const HISTORY_CLIENT_ID = process.env.HISTORY_CLIENT_ID || "";
const HISTORY_API_KEY = process.env.HISTORY_API_KEY || "";

function short(s) { return s ? (s.slice(0, 6) + '...') : '<<missing>>'; }
console.log("PAYOS client:", short(CLIENT_ID), "topup:", short(TOPUP_CLIENT_ID));

// static
app.use(express.static("public"));

// helpers for PayOS signature
function sortObjDataByKey(obj) {
    const ordered = {};
    Object.keys(obj || {}).sort().forEach(k => ordered[k] = obj[k]);
    return ordered;
}
function convertObjToQueryStr(object) {
    return Object.keys(object || {})
        .filter(k => object[k] !== undefined)
        .map(k => {
            let value = object[k];
            if (value === null || value === undefined || value === "undefined" || value === "null") value = "";
            else if (Array.isArray(value)) value = JSON.stringify(value);
            else if (typeof value === "object") value = JSON.stringify(value);
            return `${k}=${encodeURIComponent(value)}`;
        }).join("&");
}
function createPayOSSignature(data, checksumKey) {
    const sorted = sortObjDataByKey(data);
    const q = convertObjToQueryStr(sorted);
    const hmac = crypto.createHmac("sha256", checksumKey);
    hmac.update(q);
    return hmac.digest("hex");
}
function genRandomDesc(len = 9) {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const alnum = letters + "0123456789";
    let s = letters.charAt(Math.floor(Math.random() * letters.length));
    for (let i = 1; i < len; i++) s += alnum.charAt(Math.floor(Math.random() * alnum.length));
    return s;
}

// ---------- bankcodes & vietqr (giữ nguyên) ----------
let bankcodesCache = { ts: 0, ttl: 1000 * 60 * 5, data: null };
const BANKCODES_FALLBACK_PATH = path.join(process.cwd(), "data", "bankcodes.json");
async function fetchBankcodesFromPayOS() {
    const CANDIDATES = ["/v2/gateway/api/bankcodes", "/v1/gateway/api/bankcodes", "/gateway/api/bankcodes"];
    for (const p of CANDIDATES) {
        const url = `${PAYOS_API_URL}${p}`;
        try {
            const resp = await axios.get(url, { headers: { "x-client-id": CLIENT_ID, "x-api-key": API_KEY }, timeout: 9000 });
            const data = resp.data;
            let arr = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.result) ? data.result : null));
            if (!arr) {
                const values = Object.values(data || {});
                const found = values.find(v => Array.isArray(v));
                if (found) arr = found;
            }
            if (!Array.isArray(arr) && data && (data.shortName || data.bin)) arr = [data];
            if (Array.isArray(arr)) return arr;
        } catch (e) {
            console.warn("bankcodes try failed:", url, e?.message || e);
        }
    }
    return null;
}
async function getBankcodesEither() {
    const now = Date.now();
    if (bankcodesCache.data && (now - bankcodesCache.ts) <= bankcodesCache.ttl) return bankcodesCache.data;
    const fromPayos = await fetchBankcodesFromPayOS();
    if (Array.isArray(fromPayos)) {
        bankcodesCache = { ts: Date.now(), ttl: bankcodesCache.ttl, data: fromPayos };
        return fromPayos;
    }
    try {
        const raw = await fs.readFile(BANKCODES_FALLBACK_PATH, "utf8");
        const arr = JSON.parse(raw);
        bankcodesCache = { ts: Date.now(), ttl: bankcodesCache.ttl, data: arr };
        return arr;
    } catch (e) {
        console.warn("no fallback bankcodes", e.message || e);
        return [];
    }
}

// vietqr proxy
let vietqrCache = { ts: 0, ttl: 1000 * 60 * 60 * 6, data: null };
app.get("/api/vietqr-banks", async (req, res) => {
    try {
        const now = Date.now();
        if (vietqrCache.data && (now - vietqrCache.ts) <= vietqrCache.ttl) return res.json({ source: "cache", data: vietqrCache.data });
        const url = "https://api.vietqr.io/v2/banks";
        const resp = await axios.get(url, { timeout: 10000 });
        let arr = Array.isArray(resp.data) ? resp.data : (Array.isArray(resp.data?.data) ? resp.data.data : (Array.isArray(resp.data?.result) ? resp.data.result : []));
        const normalized = (arr || []).map(item => {
            const short_name = (item.short_name ?? item.shortName ?? item.name ?? item.short ?? "").toString().trim();
            const logo = item.logo ?? item.icon ?? item.image ?? "";
            // possible fields for slug/code/acqId
            const slugCandidate = item.slug || item.code || item.id || (item.acqId ? String(item.acqId) : undefined) || item.bank_code || item.bankId;
            // derive slug fallback from name: lower-case, ascii, replace spaces with ''
            function makeSlugFromName(name) {
                if (!name) return "";
                // remove diacritics
                try {
                    // Normalize and remove accents
                    const s = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
                } catch (e) {
                    return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
                }
            }
            const slug = String(slugCandidate || makeSlugFromName(short_name)).trim();
            let bins = item.bin ?? item.bins ?? item.BIN ?? item.bic ?? item.bins ?? null;
            if (typeof bins === "string" && bins.includes(",")) bins = bins.split(",").map(s => s.trim());
            if (!bins) bins = item.banks ?? null;
            if (Array.isArray(bins)) bins = bins.map(b => String(b).trim());
            return { short_name: (short_name || "").trim(), logo: logo || "", bins: bins || [], slug };
        }).filter(i => i.short_name);
        vietqrCache = { ts: Date.now(), ttl: vietqrCache.ttl, data: normalized };
        return res.json({ source: "remote", data: normalized });
    } catch (err) {
        console.warn("vietqr fetch failed:", err?.message || err);
        const fb = await getBankcodesEither();
        const normalized = (fb || []).map(item => {
            const short_name = item.shortName ?? item.short_name ?? item.short ?? item.name ?? "";
            const logo = item.logo ?? "";
            const slugCandidate = item.slug || item.code || item.id || (item.acqId ? String(item.acqId) : undefined);
            function makeSlugFromName(name) {
                if (!name) return "";
                try { return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
                catch (e) { return String(name).toLowerCase().replace(/[^a-z0-9]+/g, ''); }
            }
            const slug = String(slugCandidate || makeSlugFromName(short_name)).trim();
            let bins = item.bin ?? item.bins ?? item.BIN ?? null;
            if (typeof bins === "string" && bins.includes(",")) bins = bins.split(",").map(s => s.trim());
            if (Array.isArray(bins)) bins = bins.map(b => String(b).trim());
            return { short_name: (short_name || "").trim(), logo, bins: bins || [], slug };
        }).filter(i => i.short_name);
        return res.json({ source: "fallback", data: normalized });
    }
});


// ---------- simple API routes ----------
// whoami stays public (client checks)
app.get("/whoami", (req, res) => {
    const sid = req.cookies?.sid;
    const s = getSession(sid);
    if (!s) return res.json({ loggedIn: false });
    return res.json({ loggedIn: true, username: s.username });
});

// login/logout (public)
app.post("/login", (req, res) => {
    const { username, password } = req.body || {};
    const OK_USER = process.env.DEMO_USER || "kh_duy_001";
    const OK_PASS = process.env.DEMO_PASS || "duy2001@";
    if (username === OK_USER && password === OK_PASS) {
        const sid = createSession(username);
        res.cookie("sid", sid, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: SESSION_TTL });
        return res.json({ ok: true, username });
    } else {
        return res.status(401).json({ ok: false, message: "Tên đăng nhập hoặc mật khẩu không đúng" });
    }
});
app.post("/logout", (req, res) => {
    const sid = req.cookies?.sid;
    if (sid) destroySession(sid);
    res.clearCookie("sid");
    res.json({ ok: true });
});

// BALANCE proxy — now protected
app.get("/api/balance", requireAuth, async (req, res) => {
    try {
        if (!CLIENT_ID || !API_KEY) return res.json({ code: "601", desc: "API key không tồn tại, vui lòng kiểm tra lại", data: null });
        const url = `${PAYOS_API_URL}/v1/payouts-account/balance`;
        const resp = await axios.get(url, { headers: { "x-client-id": CLIENT_ID, "x-api-key": API_KEY }, timeout: 10000 });
        return res.json(resp.data);
    } catch (e) {
        console.error("balance error:", e?.response?.data ?? e.message);
        const status = e?.response?.status || 500;
        return res.status(status).json({ error: true, message: e?.response?.data ?? e.message });
    }
});

// PAYOUTS proxy — now protected
app.post("/api/payouts", requireAuth, async (req, res) => {
    try {
        const body = req.body || {};
        const mapField = (o, ...keys) => {
            for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
            return undefined;
        };
        const referenceId = mapField(body, "referenceId", "reference_id", "reference");
        const amount = mapField(body, "amount", "Amount", "amt");
        const toAccountNumber = mapField(body, "toAccountNumber", "to_account_number", "accountNumber", "account");
        const toBin = mapField(body, "toBin", "to_bin", "bin");
        console.log("/api/payouts payload (received):", { referenceId, amount, toAccountNumber, toBin, originalKeys: Object.keys(body) });
        if (!referenceId || !amount || !toAccountNumber || !toBin) {
            return res.status(400).json({ error: true, message: "referenceId, amount, toBin và toAccountNumber là bắt buộc. Vui lòng kiểm tra dữ liệu gửi lên.", debug: { referenceIdExists: !!referenceId, amountExists: !!amount, toAccountNumberExists: !!toAccountNumber, toBinExists: !!toBin } });
        }
        if (!CHECKSUM_KEY) return res.status(500).json({ error: true, message: "Server missing CHECKSUM_KEY" });
        const payload = { referenceId, amount: Number(amount), toAccountNumber: String(toAccountNumber), toBin: String(toBin), description: body.description ?? "" };
        const idempotencyKey = uuidv4();
        const signature = createPayOSSignature(payload, CHECKSUM_KEY);
        const url = `${PAYOS_API_URL}/v1/payouts`;
        const resp = await axios.post(url, payload, { headers: { "x-client-id": CLIENT_ID, "x-api-key": API_KEY, "Content-Type": "application/json", "x-idempotency-key": idempotencyKey, "x-signature": signature }, timeout: 15000 });
        return res.json({ idempotencyKey, signature, payosResponse: resp.data, requestedBy: req.username });
    } catch (err) {
        console.error("payout error:", err?.response?.data ?? err.message);
        const status = err?.response?.status || 500;
        return res.status(status).json({ error: true, message: err?.response?.data ?? err.message });
    }
});

// HISTORY — now protected
app.get("/api/history", requireAuth, async (req, res) => {
    try {
        const qs = Object.keys(req.query).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(req.query[k])}`).join("&");
        const url = `${PAYOS_API_URL}/v1/payouts${qs ? `?${qs}` : ""}`;
        const xClient = HISTORY_CLIENT_ID || CLIENT_ID;
        const xApiKey = HISTORY_API_KEY || API_KEY;
        const resp = await axios.get(url, { headers: { "x-client-id": xClient, "x-api-key": xApiKey }, timeout: 15000 });
        return res.json(resp.data);
    } catch (e) {
        console.error("history error:", e?.response?.data ?? e.message);
        const status = e?.response?.status || 500;
        return res.status(status).json({ error: true, message: e?.response?.data ?? e.message });
    }
});

// PAYMENT LINK (topup) - already required auth; keep requireAuth
let payOSTopup = null;
if (TOPUP_CLIENT_ID && TOPUP_API_KEY && TOPUP_CHECKSUM_KEY) {
    try {
        payOSTopup = new PayOS({ clientId: TOPUP_CLIENT_ID, apiKey: TOPUP_API_KEY, checksumKey: TOPUP_CHECKSUM_KEY });
        console.log("PayOS topup client ready");
    } catch (e) {
        console.warn("init topup failed", e.message || e);
    }
}
app.post("/create-payment-link", requireAuth, async (req, res) => {
    try {
        if (!payOSTopup) return res.status(500).json({ error: true, message: "Topup PayOS client chưa cấu hình" });
        const amount = Number(req.body?.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: true, message: "Số tiền không hợp lệ" });
        const description = genRandomDesc(10);
        const YOUR_DOMAIN = process.env.YOUR_DOMAIN || `http://localhost:${PORT}`;
        const body = { orderCode: Number(String(Date.now()).slice(-6)), amount, description, items: [{ name: "Nạp ví demo", quantity: 1, price: amount }], returnUrl: `${YOUR_DOMAIN}/topup-success.html`, cancelUrl: `${YOUR_DOMAIN}/topup-cancel.html` };
        const paymentLinkResponse = await payOSTopup.paymentRequests.create(body);
        return res.json({ ok: true, checkoutUrl: paymentLinkResponse.checkoutUrl, description });
    } catch (err) {
        console.error("create-payment-link error:", err?.response?.data ?? err.message);
        const status = err?.response?.status || 500;
        return res.status(status).json({ error: true, message: err?.response?.data ?? err.message ?? "Lỗi server" });
    }
});

app.get("/", (req, res) => res.sendFile("index.html", { root: "./public" }));

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
