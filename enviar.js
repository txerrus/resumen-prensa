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

// Cuántas noticias enseña el correo; el resto se lee en la web.
const ESENCIALES = 5;
const PARA_TI = 5;
const POR_SECCION = 6;
const FUENTES_MAX = 4;

// Colores (contraste suficiente sobre blanco; en modo oscuro se cambian en <style>).
const C = { fondo: "#f4f3ef", caja: "#ffffff", texto: "#1a1a1a", suave: "#5f5f5f", acento: "#b3261e", linea: "#e4e2dc" };
const FUENTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const PALABRAS_VACIAS = new Set(["los", "las", "del", "con", "por", "para", "una", "uno", "que", "sus", "sobre", "como", "mas", "entre", "tras", "ante"]);

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const palabras = (s) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
// Los titulares vienen de RSS: se escapan para que un "<" o un "&" no rompan el HTML.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const enlaceSeccion = (sec) => `${PAGES}/#sec=${encodeURIComponent(sec)}`;
const porImportancia = (a, b) => (b.importancia || 0) - (a.importancia || 0) || a._i - b._i;

// Un enlace por medio (antes salía "elDiario.es · elDiario.es · elDiario.es").
function fuentesUnicas(h) {
  const vistos = new Map();
  for (const f of h.fuentes || []) if (f.medio && f.enlace && !vistos.has(f.medio)) vistos.set(f.medio, f);
  return [...vistos.values()];
}

// "Para ti": una palabra que aparece en más de un cuarto de las noticias (p. ej. "España")
// no distingue nada, así que por sí sola no basta para recomendar una noticia.
function paraTi(todas, prefs) {
  if (!prefs || !prefs.length || !todas.length) return [];
  const textos = todas.map((h) => palabras(`${h.titular} ${h.resumen}`));
  const aparece = (i, t) => textos[i].some((w) => w.startsWith(t));
  const limite = Math.max(3, todas.length * 0.25);
  const temas = prefs
    .map((p) => palabras(p).filter((t) => t.length >= 3 && !PALABRAS_VACIAS.has(t)))
    .filter((ts) => ts.length)
    .map((ts) => ({ ts, utiles: ts.filter((t) => textos.filter((_, i) => aparece(i, t)).length <= limite) }))
    .filter((x) => x.utiles.length);
  const out = [];
  todas.forEach((h, i) => {
    let score = 0;
    for (const { ts, utiles } of temas) {
      if (utiles.some((t) => aparece(i, t))) score += ts.filter((t) => aparece(i, t)).length / ts.length;
    }
    if (score > 0) out.push({ ...h, _score: score });
  });
  out.sort((a, b) => b._score - a._score || porImportancia(a, b));
  return out.slice(0, PARA_TI);
}

// Decide qué va en el correo. Lo comparten la versión HTML y la de texto plano.
function prepararCorreo(digest, prefs, porSeccion = POR_SECCION) {
  const todas = [];
  for (const sec of digest.secciones || []) for (const h of sec.historias || []) todas.push({ ...h, _sec: sec.seccion, _i: todas.length });
  const esenciales = [...todas].sort(porImportancia).slice(0, ESENCIALES);
  const usadas = new Set(esenciales.map((h) => h._i));
  const tuyas = paraTi(todas.filter((h) => !usadas.has(h._i)), prefs);
  tuyas.forEach((h) => usadas.add(h._i));
  const secciones = (digest.secciones || [])
    .map((sec) => {
      const delaSec = todas.filter((h) => h._sec === sec.seccion);
      return {
        nombre: sec.seccion,
        total: delaSec.length,
        historias: delaSec.filter((h) => !usadas.has(h._i)).sort(porImportancia).slice(0, porSeccion),
      };
    })
    .filter((s) => s.total > 0);
  const avance = "Hoy: " + esenciales.slice(0, 3).map((h) => h.titular).join(" · ");
  return {
    fecha: digest.fecha,
    total: todas.length,
    medios: (digest.medios || []).length,
    avance: avance.length > 150 ? avance.slice(0, 147) + "…" : avance,
    esenciales, tuyas, secciones,
  };
}

// ---------- Versión HTML ----------
// Tablas y estilos en línea: es lo único que Outlook (motor de Word) pinta bien.
function emailHtml(digest, prefs, token, porSeccion = POR_SECCION) {
  const m = prepararCorreo(digest, prefs, porSeccion);
  const unsub = `${SB_URL}/functions/v1/unsubscribe?token=${encodeURIComponent(token)}`;

  const historia = (h, { conSeccion }) => {
    const fs_ = fuentesUnicas(h);
    const visibles = fs_.slice(0, FUENTES_MAX);
    const resto = fs_.length - visibles.length;
    const etiquetas = [];
    if (!conSeccion && (h.importancia || 0) >= 4) etiquetas.push("Destacado");
    if (conSeccion) etiquetas.push(h._sec);
    const principal = visibles[0] ? visibles[0].enlace : PAGES;
    return `<tr><td style="padding:0 0 22px">
      ${etiquetas.length ? `<p class="ac" style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${C.acento}">${esc(etiquetas.join(" · "))}</p>` : ""}
      <a href="${esc(principal)}" class="txt tit" style="font-size:18px;line-height:1.3;font-weight:700;color:${C.texto};text-decoration:none">${esc(h.titular)}</a>
      <p class="txt" style="margin:6px 0 6px;font-size:15px;line-height:1.55;color:#333333">${esc(h.resumen)}</p>
      <p class="sub" style="margin:0;font-size:13px;line-height:1.6;color:${C.suave}">Leer en: ${visibles
        .map((f) => `<a href="${esc(f.enlace)}" class="ac" style="color:${C.acento};text-decoration:underline">${esc(f.medio)}</a>`)
        .join(" &middot; ")}${resto > 0 ? ` y ${resto} más` : ""}</p>
    </td></tr>`;
  };

  const bloque = (titulo, historias, opciones = {}) => `
    <tr><td style="padding:28px 0 14px">
      <h2 class="txt" style="margin:0;font-size:20px;line-height:1.3;color:${C.texto}">${esc(titulo)}</h2>
      ${opciones.nota ? `<p class="sub" style="margin:4px 0 0;font-size:13px;color:${C.suave}">${esc(opciones.nota)}</p>` : ""}
    </td></tr>
    ${historias.map((h) => historia(h, opciones)).join("")}
    ${opciones.verMas ? `<tr><td style="padding:0 0 8px"><a href="${esc(opciones.verMas.url)}" class="ac" style="font-size:14px;font-weight:700;color:${C.acento};text-decoration:none">${esc(opciones.verMas.texto)} &rarr;</a></td></tr>` : ""}
    <tr><td class="linea" style="border-bottom:1px solid ${C.linea};font-size:0;line-height:0">&nbsp;</td></tr>`;

  const cuerpo = [
    bloque("Lo esencial", m.esenciales, { conSeccion: true, nota: "Las noticias más importantes del día" }),
    m.tuyas.length ? bloque("Para ti", m.tuyas, { conSeccion: true, nota: "Coinciden con los temas que elegiste" }) : "",
    ...m.secciones.map((s) =>
      bloque(s.nombre, s.historias, {
        verMas: { url: enlaceSeccion(s.nombre), texto: `Ver las ${s.total} noticias de ${s.nombre} en la web` },
      })
    ),
  ].join("");

  const html = `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>Resumen de prensa — ${esc(m.fecha)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .fondo { background:#121212 !important; } .caja { background:#1c1c1c !important; }
    .txt { color:#ececec !important; } .sub { color:#b4b4b4 !important; }
    .ac { color:#ff8a7a !important; } .linea { border-color:#333333 !important; }
  }
  @media (max-width:600px) { .pad { padding:20px 16px !important; } .tit { font-size:17px !important; } }
</style>
</head>
<body class="fondo" style="margin:0;padding:0;background:${C.fondo}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(m.avance)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="fondo" style="background:${C.fondo}">
<tr><td align="center" style="padding:16px 8px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="caja" style="max-width:640px;background:${C.caja};border-radius:8px;font-family:${FUENTE}">
  <tr><td class="pad" style="padding:28px 32px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:0 0 18px;border-bottom:3px solid ${C.acento}">
        <p class="ac" style="margin:0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.acento}">Resumen de prensa</p>
        <h1 class="txt" style="margin:4px 0 6px;font-size:24px;line-height:1.25;color:${C.texto}">${esc(m.fecha.charAt(0).toUpperCase() + m.fecha.slice(1))}</h1>
        <p class="sub" style="margin:0;font-size:14px;color:${C.suave}">${m.total} noticias de ${m.medios} medios &middot; <a href="${esc(PAGES)}" class="ac" style="color:${C.acento}">Ver en la web</a></p>
      </td></tr>
      ${cuerpo}
      <tr><td class="sub" style="padding:24px 0 0;font-size:12px;line-height:1.6;color:${C.suave}">
        Resumen hecho a partir de titulares públicos; cada enlace lleva al medio original.<br>
        Recibes este correo porque te suscribiste en <a href="${esc(PAGES)}" class="sub" style="color:${C.suave}">${esc(PAGES.replace(/^https?:\/\//, ""))}</a>.<br>
        <a href="${esc(unsub)}" class="ac" style="color:${C.acento}">Darte de baja</a> &middot;
        <a href="${esc(PAGES)}/privacidad.html" class="sub" style="color:${C.suave}">Privacidad</a>
      </td></tr>
    </table>
  </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
  // Gmail recorta los correos de más de 102 KB (y con ellos el enlace de baja): quitamos la sangría.
  return html.replace(/\n\s+/g, "\n");
}

// Gmail recorta los correos de más de 102 KB y oculta el final (con el enlace de baja).
// Si el HTML se pasa de este límite, se enseñan menos noticias por sección hasta que quepa.
const MAX_BYTES = 95_000;
function construirCorreo(digest, prefs, token) {
  let porSeccion = POR_SECCION;
  let html = emailHtml(digest, prefs, token, porSeccion);
  while (Buffer.byteLength(html) > MAX_BYTES && porSeccion > 1) {
    porSeccion--;
    html = emailHtml(digest, prefs, token, porSeccion);
  }
  return { html, texto: emailTexto(digest, prefs, token, porSeccion), porSeccion };
}

// ---------- Versión en texto plano ----------
// Va siempre en el mismo correo que el HTML; el programa de correo elige cuál mostrar.
function emailTexto(digest, prefs, token, porSeccion = POR_SECCION) {
  const m = prepararCorreo(digest, prefs, porSeccion);
  const unsub = `${SB_URL}/functions/v1/unsubscribe?token=${encodeURIComponent(token)}`;
  const raya = "=".repeat(40);
  const historia = (h, n, conSeccion) => {
    const fs_ = fuentesUnicas(h);
    const visibles = fs_.slice(0, 3);
    const lineas = [`${n}. ${h.titular}${conSeccion ? `  [${h._sec}]` : ""}`, `   ${h.resumen}`];
    for (const f of visibles) lineas.push(`   - ${f.medio}: ${f.enlace}`);
    if (fs_.length > visibles.length) { const n = fs_.length - visibles.length; lineas.push(`   - y ${n} ${n === 1 ? "medio" : "medios"} más en la web`); };
    return lineas.join("\n");
  };
  const bloque = (titulo, historias, conSeccion, pie) =>
    [raya, titulo.toUpperCase(), raya, "", historias.map((h, i) => historia(h, i + 1, conSeccion)).join("\n\n"), pie ? `\n>> ${pie}` : "", ""].join("\n");

  return [
    `RESUMEN DE PRENSA`,
    m.fecha.charAt(0).toUpperCase() + m.fecha.slice(1),
    `${m.total} noticias de ${m.medios} medios. Versión web: ${PAGES}`,
    "",
    bloque("Lo esencial", m.esenciales, true),
    m.tuyas.length ? bloque("Para ti", m.tuyas, true) : "",
    ...m.secciones.map((s) => bloque(`${s.nombre} (${s.total} noticias)`, s.historias, false, `Todas las de ${s.nombre}: ${enlaceSeccion(s.nombre)}`)),
    "--",
    "Resumen hecho a partir de titulares públicos; cada enlace lleva al medio original.",
    `Recibes este correo porque te suscribiste en ${PAGES}`,
    `Darte de baja: ${unsub}`,
    `Privacidad: ${PAGES}/privacidad.html`,
  ]
    .filter((x) => x !== "")
    .join("\n");
}

async function getSubscribers() {
  const r = await fetch(`${SB_URL}/rest/v1/suscriptores?estado=eq.activo&select=email,preferencias,token`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error("Supabase: " + (await r.text()).slice(0, 200));
  return r.json();
}

async function sendOne(to, subject, html, texto, unsubUrl) {
  const auth = Buffer.from(`${MJ_KEY}:${MJ_SECRET}`).toString("base64");
  const r = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST", headers: { Authorization: `Basic ${auth}`, "content-type": "application/json" },
    body: JSON.stringify({ Messages: [{
      From: { Email: SENDER, Name: SENDER_NAME }, To: [{ Email: to }], Subject: subject, HTMLPart: html, TextPart: texto,
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

// Vista previa: genera el correo en output/ sin tocar Supabase ni Mailjet.
// Uso: node enviar.js --vista-previa [--prefs "economía, Ceuta"]
async function vistaPrevia(digest) {
  const i = process.argv.indexOf("--prefs");
  const prefs = i > -1 && process.argv[i + 1] ? process.argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean) : [];
  const dir = path.join(__dirname, "output");
  await fs.mkdir(dir, { recursive: true });
  const c = construirCorreo(digest, prefs, "TOKEN-DE-PRUEBA");
  await fs.writeFile(path.join(dir, "correo.html"), c.html, "utf8");
  await fs.writeFile(path.join(dir, "correo.txt"), c.texto, "utf8");
  console.log(`Vista previa en output/correo.html y output/correo.txt (preferencias: ${prefs.join(" | ") || "ninguna"})`);
  console.log(`Tamaño HTML: ${Math.round(Buffer.byteLength(c.html) / 1024)} KB · ${c.porSeccion} noticias por sección`);
}

async function main() {
  const iDigest = process.argv.indexOf("--digest"); // solo para probar la vista previa con otro resumen
  const rutaDigest = iDigest > -1 && process.argv.includes("--vista-previa") ?process.argv[iDigest + 1] : path.join(__dirname, "docs", "digest-latest.json");
  const digest = JSON.parse(await fs.readFile(rutaDigest, "utf8"));
  if (process.argv.includes("--vista-previa")) return vistaPrevia(digest);
  const subs = await getSubscribers();
  console.log(`Suscriptores activos: ${subs.length}`);
  // Diagnóstico: qué cuenta de Mailjet se está usando (solo los primeros caracteres de la API key pública).
  console.log(`Mailjet: API key en uso empieza por "${(MJ_KEY || "").slice(0, 6)}" | remitente SENDER_EMAIL="${SENDER}"`);
  const subject = `📰 Resumen de prensa — ${digest.fecha}`;
  let ok = 0, fail = 0;
  for (const s of subs) {
    try {
      const c = construirCorreo(digest, s.preferencias || [], s.token);
      await sendOne(s.email, subject, c.html, c.texto, `${SB_URL}/functions/v1/unsubscribe?token=${s.token}`);
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
