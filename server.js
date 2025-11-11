// server.js
import express from "express";

// ------------ Config ------------
const PORT = process.env.PORT || 3000;

// Whitelist domini sorgente (separa con virgole in RENDER -> Environment)
// es: "ppr.im-cdn.it,image.immobiliare.it,cdn.esempio.com"
const HOSTS_FROM_ENV = (process.env.ALLOWED_HOSTS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const DEFAULT_HOSTS = ["ppr.im-cdn.it", "image.immobiliare.it"];
const ALLOWED_HOSTS = new Set([...DEFAULT_HOSTS, ...HOSTS_FROM_ENV]);

// Referer da inviare al CDN (override via env se vuoi)
const DEFAULT_REFERER = "https://gestionale.immobiliare.it/";
const UPSTREAM_REFERER = process.env.UPSTREAM_REFERER || DEFAULT_REFERER;

// ------------ App ------------
const app = express();

// CORS SEMPRE (anche su errori)
app.use((req, res, next) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Vary": "Origin"
  });
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Health / info
app.get("/", (_req, res) => {
  res
    .type("text/plain")
    .send(
      [
        "Florio Image Proxy is up.",
        "Use: /img?url=<URL-ENCODED-IMAGE-URL>",
        `Allowed hosts: ${[...ALLOWED_HOSTS].join(", ") || "(none)"}`
      ].join("\n")
    );
});

// Proxy endpoint
app.get("/img", async (req, res) => {
  try {
    const src = req.query.url;
    if (!src) return res.status(400).type("text/plain").send("Missing url");

    let u;
    try { u = new URL(String(src)); }
    catch { return res.status(400).type("text/plain").send("Invalid url"); }

    if (!ALLOWED_HOSTS.has(u.hostname)) {
      return res.status(403).type("text/plain").send("Host not allowed");
    }

    // Header "umani" per alcuni CDN
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
      "Referer": UPSTREAM_REFERER
    };

    // Retry semplice con timeout
    let lastErr, r;
    for (let i = 0; i < 3; i++) {
      try {
        r = await fetch(u.toString(), {
          redirect: "follow",
          headers,
          cache: "no-store",
          // Node 18+ (su Render sei su Node 25.x): va bene AbortSignal.timeout
          signal: AbortSignal.timeout(30000)
        });
        if (r.ok) break;
        lastErr = new Error("Upstream " + r.status);
      } catch (e) {
        lastErr = e;
      }
      await new Promise(r => setTimeout(r, 500 + i * 500));
    }

    if (!r || !r.ok) {
      return res.status(502).type("text/plain").send(String(lastErr?.message || "Upstream error"));
    }

    const body = await r.arrayBuffer();
    const buf = Buffer.from(body);
    const contentType = r.headers.get("content-type") || "image/jpeg";

    res.set("Content-Type", contentType);
    // caching lato proxy (regola pure)
    res.set("Cache-Control", "public, max-age=86400");

    res.send(buf);
  } catch (e) {
    res.status(500).type("text/plain").send(String(e?.message || e));
  }
});

// Start
app.listen(PORT, () => {
  console.log("Florio proxy listening on :" + PORT);
});
