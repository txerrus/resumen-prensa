// Envía el boletín diario a los suscriptores activos, personalizado por sus preferencias.
// Lee docs/digest-latest.json (lo genera antes digest.js), los suscriptores de Supabase,
// y envía con Mailjet. Pensado para ejecutarse en GitHub Actions.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SB_SECRET_KEY;
const MJ_KEY = process.env.MAILJET_API_KEY;
const MJ_SECRET = process.env.MAILJET_SECRET_KEY;
const SENDER = process.env.SENDER_EMAIL;
const SENDER_NAME = process.env.SENDER_NAME || "Resumen de prensa";
const PAGES = process.env.PAGES_URL || "https://txerrus.github.io/resumen-prensa";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const estrellas = (n) => "★".repeat(Math.max(1, Math.min(5, n || 1)));

// Puntúa cuánto encaja una noticia con las preferencias (texto libre) del usuario.
function scoreStory(h, prefs) {
  const hay = norm(`${h.titular} ${h.resumen} ${h.fuentes.map((f) => f.medio).join(" ")}`);
  let score = 0;
  for (const p of prefs) {
    const terms = norm(p).split(/[\s,]+/).filter((t) => t.length >= 3);
    if (!terms.length) continue;
    const hits = terms.filter((t) => hay.includes(t)).length;
    if (hits) score += hits / terms.length;
  }
  return score;
}

function paraTi(digest, prefs) {
  if (!prefs || !prefs.length) return [];
  const out = [];
  for (const sec of digest.secciones) {
    for (const h of sec.historias) {
      const s = scoreStory(h, prefs);
      if (s > 0) out.push({ ...h, _sec: sec.seccion, _score: s });
    }
  }
  out.sort((a, b) => b._score - a._score || (b.importancia || 0) - (a.importancia || 0));
  return out.slice(0, 8);
}

function emailHtml(digest, prefs, token) {
  const unsub = `${SB_URL}/functions/v1/unsubscribe?token=${token}`;
  const fuentes = (h) => h.fuentes.map((f) => `<a href="${f.enlace}" style="color:#c0392b">${f.medio}</a>`).join(" · ");
  const story = (h) => `<div style="margin:0 0 14px">
      <div style="font-weight:600">${h.titular} <span style="color:#e0a800">${estrellas(h.importancia)}</span>${h._sec ? ` <span style="color:#999;font-size:.8em">· ${h._sec}</span>` : ""}</div>
      <div style="color:#333;margin:3px 0">${h.resumen}</div>
      <div style="font-size:.85em;color:#666">Fuentes: ${fuentes(h)}</div>
    </div>`;
  const pt = paraTi(digest, prefs);
  const ptHtml = pt.length
    ? `<h2 style="color:#c0392b">⭐ Para ti</h2>${pt.map(story).join("")}<hr style="border:none;border-top:1px solid #ddd;margin:18px 0">`
    : "";
  const secciones = digest.secciones
    .map((sec) => `<h2 style="border-bottom:2px solid #eee;padding-bottom:4px">${sec.seccion}</h2>${sec.historias.map(story).join("")}`)
    .join("");
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:680px;margin:auto;color:#1a1a1a">
    <h1 style="border-bottom:3px solid #c0392b;padding-bottom:8px">Resumen de prensa — ${digest.fecha}</h1>
    ${ptHtml}${secciones}
    <hr style="margin-top:28px;border:none;border-top:1px solid #ddd">
    <p style="color:#999;font-size:12px">Recibes este correo porque te suscribiste en ${PAGES}.
    <a href="${unsub}" style="color:#c0392b">Darte de baja</a> ·
    <a href="${PAGES}/privacidad.html" style="color:#999">Privacidad</a>.</p>
  </div>`;
}

async function getSubscribers() {
  const r = await fetch(`${SB_URL}/rest/v1/suscriptores?estado=eq.activo&select=email,preferencias,token`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error("Supabase: " + (await r.text()).slice(0, 200));
  return r.json();
}

async function sendOne(to, subject, html, unsubUrl) {
  const auth = Buffer.from(`${MJ_KEY}:${MJ_SECRET}`).toString("base64");
  const r = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST", headers: { Authorization: `Basic ${auth}`, "content-type": "application/json" },
    body: JSON.stringify({ Messages: [{
      From: { Email: SENDER, Name: SENDER_NAME }, To: [{ Email: to }], Subject: subject, HTMLPart: html,
      Headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }] }),
  });
  const cuerpo = await r.text();
  if (!r.ok) throw new Error("Mailjet " + to + " (HTTP " + r.status + "): " + cuerpo.slice(0, 300));
  // Mailjet v3.1 puede responder 200 con un estado de error por mensaje; lo comprobamos de verdad.
  let datos = null;
  try { datos = JSON.parse(cuerpo); } catch {}
  const msg = datos && datos.Messages && datos.Messages[0];
  console.log(`   Mailjet -> ${to}: Status=${msg ? msg.Status : "?"} | ${JSON.stringify(msg || cuerpo).slice(0, 400)}`);
  if (msg && msg.Status && msg.Status !== "success") {
    throw new Error("Mailjet estado no exitoso para " + to + ": " + cuerpo.slice(0, 300));
  }
}

async function main() {
  const digest = JSON.parse(await fs.readFile(path.join(__dirname, "docs", "digest-latest.json"), "utf8"));
  const subs = await getSubscribers();
  console.log(`Suscriptores activos: ${subs.length}`);
  // Diagnóstico: qué cuenta de Mailjet se está usando (solo los primeros caracteres de la API key pública).
  console.log(`Mailjet: API key en uso empieza por "${(MJ_KEY || "").slice(0, 6)}" | remitente SENDER_EMAIL="${SENDER}"`);
  const subject = `📰 Resumen de prensa — ${digest.fecha}`;
  let ok = 0, fail = 0;
  for (const s of subs) {
    try {
      const html = emailHtml(digest, s.preferencias || [], s.token);
      await sendOne(s.email, subject, html, `${SB_URL}/functions/v1/unsubscribe?token=${s.token}`);
      ok++;
    } catch (e) {
      console.error("Fallo:", s.email, e.message); fail++;
    }
  }
  console.log(`Enviado. OK=${ok} Fallos=${fail}`);
}
main()
  .then(() => process.exit(0))  // cierra conexiones pendientes (Supabase/Mailjet) para que el paso termine
  .catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
