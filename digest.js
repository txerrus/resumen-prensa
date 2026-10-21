// Resumen de prensa diario — versión "por noticia con sus fuentes"
// Flujo: recoge RSS de varios medios -> Claude agrupa artículos en NOTICIAS (con sus fuentes)
//        por secciones -> guarda JSON (lo lee la web) -> envía correo.
//
// Modos:
//   node digest.js              -> completo (agrupar + guardar + correo)
//   node digest.js --sin-correo -> agrupa y guarda, no envía correo
//   node digest.js --pool       -> solo recoge y vuelca output/pool.json (sin Claude ni correo)

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import Parser from "rss-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const SOLO_POOL = args.includes("--pool") || args.includes("--solo-feeds");
const SIN_CORREO = args.includes("--sin-correo");

const HORAS_VENTANA = 28;   // noticias de las últimas N horas
const TOP_POR_FEED = 8;     // artículos máximos por feed
const MAX_POR_SECCION = 60; // tope por sección (asegura cobertura amplia)
const MAX_ARTICULOS = 400;  // tope global que se manda a Claude
const SECCIONES = [
  "Nacional / España", "Internacional / Mundo", "Local / Madrid", "Economía", "Sociedad",
  "Opinión", "Deportes", "Cultura", "Ciencia", "Tecnología", "Salud", "Otras"
];

const parser = new Parser({ timeout: 15000, headers: { "User-Agent": "Mozilla/5.0 ResumenPrensa/0.2" } });
const log = (...a) => console.log(...a);
// Algunos RSS traen entidades o etiquetas HTML en los títulos («Barça&lt;br&gt;», «&quot;»).
const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodificar = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1))
               : ENTIDADES[e.toLowerCase()] ?? m);
const limpiar = s => decodificar(decodificar(s || "")).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// ---------- 1. Recoger artículos de todos los feeds ----------
async function recogerArticulos(feedsConfig) {
  const corte = Date.now() - HORAS_VENTANA * 3600 * 1000;
  const arts = [];
  let id = 0;
  for (const [seccionHint, fuentes] of Object.entries(feedsConfig.secciones)) {
    for (const { medio, url } of fuentes) {
      try {
        const feed = await parser.parseURL(url);
        let añadidos = 0;
        for (const it of feed.items || []) {
          if (añadidos >= TOP_POR_FEED) break;
          const t = Date.parse(it.isoDate || it.pubDate || "") || Date.now();
          if (t < corte) continue;
          const titulo = limpiar(it.title);
          if (!titulo) continue;
          arts.push({
            id: ++id, medio, seccionHint, titulo,
            enlace: limpiar(it.link),
            resumen: limpiar(it.contentSnippet).slice(0, 200),
            fecha: it.isoDate || null,
          });
          añadidos++;
        }
        log(`  ✓ ${medio} / ${seccionHint}  (+${añadidos})`);
      } catch (e) {
        log(`  ✗ ${medio} / ${seccionHint}  -> ${e.message}`);
      }
    }
  }
  // dedupe por medio+titulo
  const vistos = new Set();
  const unicos = arts.filter(a => {
    const k = a.medio + "|" + a.titulo.toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k); return true;
  });
  // cap por sección (que todas las secciones estén representadas)
  const porSec = {};
  const capados = unicos.filter(a => {
    porSec[a.seccionHint] = (porSec[a.seccionHint] || 0) + 1;
    return porSec[a.seccionHint] <= MAX_POR_SECCION;
  });
  // reindexar y capar global
  const final = capados.slice(0, MAX_ARTICULOS).map((a, i) => ({ ...a, id: i + 1 }));
  return final;
}

// ---------- 2. Agrupar en noticias con Claude ----------
async function agruparConClaude(articulos) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const modelo = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

  const lista = articulos.map(a => `[${a.id}] (${a.medio} · ${a.seccionHint}) ${a.titulo}`).join("\n");
  const prompt =
`Eres editor de un resumen de prensa en español de España. Te doy ARTÍCULOS de hoy de varios
medios, numerados [id], con su medio y una sección orientativa.

Tareas:
1. AGRUPA en NOTICIAS: junta los artículos de distintos medios que tratan el MISMO hecho.
2. Clasifica cada noticia en una de estas secciones: ${SECCIONES.join(", ")}.
   Guía: "Nacional / España" = política y actualidad del país; "Local / Madrid" = sucesos y
   actualidad de esa ciudad/comunidad; "Sociedad" = educación, medio ambiente, sucesos, tribunales;
   "Salud" = sanidad y medicina; "Ciencia" = investigación y espacio; "Tecnología" = empresas tech,
   IA, gadgets; "Opinión" = editoriales, columnas, tribunas y análisis (no noticias). Usa "Otras" solo si no encaja.
3. Para cada noticia da: un "titular" propio, breve y neutro; un "resumen" de 1-2 frases basado
   SOLO en los titulares (no inventes datos ni cifras que no aparezcan); "importancia" de 1 a 5
   (5 = lo más importante del día); y "fuente_ids": la lista de ids de los artículos que la forman.
4. Sé GENEROSO en cobertura: incluye MUCHAS noticias por sección (hasta ~10 por sección si las hay),
   no solo las 3-4 principales. Incluye también noticias secundarias de interés. Prioriza las que varios
   medios cubren y ordena cada sección por importancia (mayor primero).

Devuelve SOLO JSON válido, sin texto alrededor, con esta forma exacta:
{"secciones":[{"seccion":"Política","historias":[{"titular":"...","resumen":"...","importancia":4,"fuente_ids":[1,5]}]}]}
Usa únicamente ids que existan en la lista.

ARTÍCULOS:
${lista}`;

  const peticion = {
    model: modelo,
    max_tokens: 16000,  // margen amplio: el JSON con muchas noticias no debe cortarse
    messages: [{ role: "user", content: prompt }],
  };
  // Agrupar titulares es una tarea mecánica: no necesita "pensamiento extendido".
  // Al desactivarlo, TODO el presupuesto de tokens va al JSON (evita que se trunque)
  // y además la llamada es más barata y rápida. Cada familia de modelo lo apaga distinto.
  if (/sonnet-5-5/.test(modelo)) peticion.thinking = { type: "between_tools" };
  else if (/haiku-5-5/.test(modelo)) peticion.thinking = { type: "disabled" };

  const resp = await client.messages.create(peticion);
  const texto = resp.content.map(b => (b.type === "text" ? b.text : "")).join("");
  const ini = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  const jsonStr = ini >= 0 && fin > ini ? texto.slice(ini, fin + 1) : texto;
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`No se pudo leer el JSON de Claude: ${e.message}. ` +
      `stop_reason=${resp.stop_reason}, longitud=${texto.length} caracteres.`);
  }
}

// ---------- 3. Resolver ids -> fuentes reales ----------
function construirDigest(agrupado, articulos, fechaStr) {
  const porId = new Map(articulos.map(a => [a.id, a]));
  const mediosSet = new Set();
  const secciones = [];

  for (const sec of agrupado.secciones || []) {
    const historias = [];
    for (const h of sec.historias || []) {
      const fuentes = (h.fuente_ids || [])
        .map(id => porId.get(id))
        .filter(Boolean)
        .map(a => { mediosSet.add(a.medio); return { medio: a.medio, titulo: a.titulo, enlace: a.enlace, entradilla: a.resumen || "" }; });
      if (!fuentes.length) continue;
      historias.push({
        titular: limpiar(h.titular),
        resumen: limpiar(h.resumen),
        importancia: Number(h.importancia) || 1,
        fuentes,
      });
    }
    if (historias.length) secciones.push({ seccion: sec.seccion || "Otras", historias });
  }
  return { fecha: fechaStr, generado: new Date().toISOString(), medios: [...mediosSet].sort(), secciones };
}

// ---------- 4. Correo HTML ----------
function estrellas(n) { return "★".repeat(Math.max(1, Math.min(5, n))); }
function montarHtml(digest) {
  const qa = process.env.QA_URL;
  const boton = qa
    ? `<p style="margin:22px 0"><a href="${qa}" style="background:#c0392b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Hacer preguntas sobre las noticias de hoy →</a></p>`
    : "";
  const secciones = digest.secciones.map(sec => {
    const hist = sec.historias.map(h => {
      const fuentes = h.fuentes.map(f =>
        `<a href="${f.enlace}" style="color:#c0392b">${f.medio}</a>`).join(" · ");
      return `<div style="margin:0 0 16px">
        <div style="font-weight:600">${h.titular} <span style="color:#e0a800">${estrellas(h.importancia)}</span></div>
        <div style="color:#333;margin:3px 0">${h.resumen}</div>
        <div style="font-size:.85em;color:#666">Fuentes: ${fuentes}</div>
      </div>`;
    }).join("");
    return `<h2 style="border-bottom:2px solid #eee;padding-bottom:4px;margin-top:26px">${sec.seccion}</h2>${hist}`;
  }).join("");

  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:680px;margin:auto;color:#1a1a1a">
    <h1 style="border-bottom:3px solid #c0392b;padding-bottom:8px">Resumen de prensa — ${digest.fecha}</h1>
    ${boton}${secciones}
    <hr style="margin-top:32px;border:none;border-top:1px solid #ddd">
    <p style="color:#999;font-size:12px">Agrupado automáticamente a partir de titulares públicos (RSS) de: ${digest.medios.join(", ")}.
    Sigue los enlaces para leer cada noticia en su medio.</p>
  </div>`;
}

// ---------- 5. Enviar correo ----------
async function enviarCorreo(html, fechaStr) {
  const { default: nodemailer } = await import("nodemailer");
  const t = nodemailer.createTransport({ service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  await t.sendMail({
    from: `"Resumen de prensa" <${process.env.GMAIL_USER}>`,
    to: process.env.MAIL_TO,
    subject: `📰 Resumen de prensa — ${fechaStr}`, html });
  log("  ✓ Correo enviado a", process.env.MAIL_TO);
}

// ---------- main ----------
async function main() {
  const feedsConfig = JSON.parse(await fs.readFile(path.join(__dirname, "feeds.json"), "utf8"));
  const fechaStr = new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const outDir = path.join(__dirname, "output");
  const docsDir = path.join(__dirname, "docs");
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(docsDir, { recursive: true });

  log("1) Recogiendo artículos...");
  const articulos = await recogerArticulos(feedsConfig);
  log(`   -> ${articulos.length} artículos (de ${new Set(articulos.map(a => a.medio)).size} medios).`);
  await fs.writeFile(path.join(outDir, "pool.json"), JSON.stringify({ fecha: fechaStr, articulos }, null, 2), "utf8");

  if (SOLO_POOL) { log("   (modo pool: escrito output/pool.json; sin Claude ni correo)"); return; }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY en .env.");

  log("2) Agrupando noticias con Claude...");
  const agrupado = await agruparConClaude(articulos);
  const digest = construirDigest(agrupado, articulos, fechaStr);
  const nHist = digest.secciones.reduce((n, s) => n + s.historias.length, 0);
  log(`   -> ${nHist} noticias en ${digest.secciones.length} secciones.`);

  const data = JSON.stringify(digest, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  await fs.writeFile(path.join(outDir, `digest-${stamp}.json`), data, "utf8");
  await fs.writeFile(path.join(outDir, "digest-latest.json"), data, "utf8");
  await fs.writeFile(path.join(docsDir, "digest-latest.json"), data, "utf8");

  const html = montarHtml(digest);
  await fs.writeFile(path.join(outDir, `resumen-${stamp}.html`), html, "utf8");
  log(`   -> output/digest-latest.json y resumen-${stamp}.html`);

  if (SIN_CORREO) { log("(modo --sin-correo: no se envía)"); return; }
  log("3) Enviando correo...");
  await enviarCorreo(html, fechaStr);
  log("Listo ✔");
}

main()
  .then(() => process.exit(0))  // cierra conexiones pendientes (IA/RSS) para que el paso termine
  .catch(e => { console.error("ERROR:", e.message); process.exit(1); });
