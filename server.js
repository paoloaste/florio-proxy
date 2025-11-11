import express from "express";

const PORT = process.env.PORT || 3000;
const ALLOWED_HOSTS = new Set(["ppr.im-cdn.it", "image.immobiliare.it"]);

const app = express();

// CORS SEMPRE (anche sugli errori)
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

app.get("/", (req, res) => {
  res.type("text/plain").send("Florio Image Proxy is up. Use /img?url=...");
});

app.get("/img", async (req, res) => {
  try {
    const src = req.query.url;
    if (!src) return res.status(400).type("text/plain").send("Missing url");
    let u;
    try { u = new URL(src); } catch { return res.status(400).type("text/plain").send("Invalid url"); }
    if (!ALLOWED_HOSTS.has(u.hostname)) return res.status(403).type("text/plain").send("Host not allowed");

    // headers "umani" per alcuni CDN
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
      "Referer": "https://gestionale.immobiliare.it/"
    };

    // piccolo retry
    let lastErr, r;
    for (let i=0;i<3;i++){
      try {
        r = await fetch(u.toString(), {
          redirect: "follow",
          headers,
          cache: "no-store",
          signal: AbortSignal.timeout(30000)
        });
        if (r.ok) break;
        lastErr = new Error("Upstream " + r.status);
      } catch (e) { lastErr = e; }
      await new Promise(r => setTimeout(r, 500 + i*500));
    }
    if (!r || !r.ok) {
      return res.status(502).type("text/plain").send(String(lastErr?.message || "Upstream error"));
    }

    const buf = Buffer.from(await r.arrayBuffer());
    const contentType = r.headers.get("content-type") || "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(buf);
  } catch (e) {
    res.status(500).type("text/plain").send(String(e?.message || e));
  }
});

app.listen(PORT, () => {
  console.log("Florio proxy listening on :" + PORT);
});
