// Seedr.cc free-tier cloud-stream endpoint.
// No Real-Debrid / premium validation. Requires a Seedr token (free account):
//   SEEDR_TOKEN   – preferred (Settings → Account → API token)
//   SEEDR_USER / SEEDR_PASS – fallback, exchanged for a token via oauth_test
// Torrent source mapping is free (YTS for movies, EZTV for series) – no key needed.

export const config = { maxDuration: 60 };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default async function handler(req, res) {
  const { imdb, type, season, episode, quality } = req.query;
  if (!imdb) return res.status(400).json({ error: "missing imdb id" });

  const token = process.env.SEEDR_TOKEN;
  const user = process.env.SEEDR_USER;
  const pass = process.env.SEEDR_PASS;
  if (!token && !(user && pass)) {
    return res.status(500).json({
      error:
        "Seedr not configured. Set SEEDR_TOKEN (or SEEDR_USER + SEEDR_PASS) in your Vercel env vars.",
    });
  }

  // 1. Auth
  let authToken = token;
  if (!authToken) {
    const r = await fetch("https://www.seedr.cc/oauth_test", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: user, password: pass }),
    });
    const j = await r.json();
    if (!j.token) return res.status(401).json({ error: "Seedr auth failed", detail: j });
    authToken = j.token;
  }

  // 3. Pick a torrent magnet
  let magnet;
  try {
    if (type === "tv" || type === "series") {
      const r = await fetch(
        `https://eztv.re/api/get-torrents?imdb_id=${imdb}&limit=30`
      );
      const j = await r.json();
      const eps = (j.torrents || []).filter(
        (t) => String(t.season) === String(season || 1) && String(t.episode) === String(episode || 1)
      );
      magnet = (eps[0] || (j.torrents || [])[0] || {}).magnet_url;
    } else {
      const r = await fetch(`https://yts.mx/api/v2/movie_details.json?imdb_id=${imdb}`);
      const j = await r.json();
      const torrents = (j.data && j.data.movie && j.data.movie.torrents) || [];
      const q = quality || "1080p";
      const pick = torrents.find((t) => t.quality === q) || torrents[0];
      magnet = pick && pick.url;
    }
  } catch (e) {
    return res.status(502).json({ error: "torrent lookup failed: " + e.message });
  }
  if (!magnet) return res.status(404).json({ error: "no cached torrent found", imdb, type });

  // 4. Add transfer to Seedr
  const addR = await fetch("https://www.seedr.cc/api/transfer/add", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: authToken, torrent: magnet }),
  });
  const addJ = await addR.json();
  if (addJ.error) return res.status(502).json({ error: "seedr transfer failed", detail: addJ });

  // 5. Poll until the file is cached, then return its direct stream URL
  let downloadUrl;
  for (let i = 0; i < 14; i++) {
    await sleep(3500);
    const fR = await fetch(`https://www.seedr.cc/api/folder?token=${encodeURIComponent(authToken)}`);
    const fJ = await fR.json();
    const file = (fJ.files || []).find((f) => /\.(mp4|mkv|webm|m4v|avi)$/i.test(f.name));
    if (file && file.download_url) {
      downloadUrl = file.download_url;
      break;
    }
  }
  if (!downloadUrl) {
    return res.status(504).json({ error: "Seedr caching timed out (free-tier may be slow)" });
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ url: downloadUrl });
}
