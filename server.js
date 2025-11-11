import express from "express";

// Config
const PORT = process.env.PORT || 3000;
// Whitelist stretta: serviamo SOLO immagini del CDN immobiliare
const ALLOWED_HOSTS = new Set([
  "ppr.im-cdn.it",
  "image.immobiliare.it" // opzionale, se mai servisse
]);

const app = express();

// piccola homepage per sanity check
app.get("/", (req, res) => {
  res.type("text/plain").send("Florio Image Proxy is up.\nUse /img?url=...");
});

// proxy di immagine con CORS aperto
app.get("/img", async (req, res) => {
  try {
    const src = req.query.url;
    if (!src) return res.status(400).send("Missing url");

    let u;
    try {
      u = new URL(src);
    } catch {
      return res.status(400).send("Invalid url");
    }

    // sicurezza: host whitelist
    if (!ALLOWED_HOSTS.has(u.hostname)) {
      return res.status(403).send("Host not allowed");
    }

    // fetch server-side (Node 18 ha fetch nativo)
    const upstream = await fetch(u.toString(), {
      // niente credenziali/cookie
      redirect: "follow",
      // timeout "a mano"
      signal: AbortSignal.timeout(20000)
    });

    if (!upstream.ok) {
      return res.status(502).send("Upstream " + upstream.status);
    }

    // contenuto + headers base
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await upstream.arrayBuffer());

    // CORS e cache (opzionale)
    res.set({
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400"
    });

    res.send(buf);
  } catch (e) {
    res.status(500).type("text/plain").send(String(e?.message || e));
  }
});

// avvio
app.listen(PORT, () => {
  console.log("Florio proxy listening on :" + PORT);
});
