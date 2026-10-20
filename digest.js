// Resumen de prensa diario
// Flujo: lee feeds RSS -> filtra últimas 24h -> resume con Claude -> guarda HTML/JSON -> envía correo.
//
// Uso:
//   node digest.js              -> proceso completo (resumen + correo)
//   node digest.js --solo-feeds -> solo recoge titulares y los imprime (prueba, sin clave ni correo)
//   node digest.js --sin-correo -> genera el resumen y los archivos, pero no envía el correo

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import Parser from "rss-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const SOLO_FEEDS = args.includes("--solo-feeds");
const SIN_CORREO = args.includes("--sin-correo");

const MAX_POR_TEMA = 8;          // titulares máximos por tema que se envían a Claude
const HORAS_VENTANA = 28;        // noticias de las últimas N horas (margen sobre 24h)

const parser = new Parser({ timeout: 15000, headers: { "User-Agent": "ResumenPrensa/0.1" } });

function log(...a) { console.log(...a); }

// ---------- 1. Recoger feeds ----------
async function recogerTitulares(feedsConfig) {
  const corte = Date.now() - HORAS_VENTANA * 3600 * 1000;
  const porTema = {};

  for (const [tema, urls] of Object.entries(feedsConfig.temas)) {
    const items = [];
    for (const url of urls) {
      try {
        const feed = await parser.parseURL(url);
        const fuente = feed.title || new URL(url).hostname;
        for (const it of feed.items || []) {
          const fecha = it.isoDate ? new Date(it.isoDate).getTime() : Date.now();
          if (fecha < corte) continue;
          items.push({
            titulo: (it.title || "").trim(),
            enlace: (it.link || "").trim(),
            fuente,
            resumen: (it.contentSnippet || "").trim().slice(0, 300),
            fecha: it.isoDate || null,
          });
        }
        log(`  ✓ ${url}  (${feed.items?.length ?? 0} entradas)`);
      } catch (e) {
        log(`  ✗ ${url}  -> ${e.message}`);
      }
    }
    // dedupe por título y recorta
    const vistos = new Set();
    const unicos = items.filter(i => {
      const k = i.titulo.toLowerCase();
      if (!i.titulo || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    }).slice(0, MAX_POR_TEMA);
    porTema[tema] = unicos;
  }
  return porTema;
}

// ---------- 2. Resumir con Claude ----------
async function resumirConClaude(porTema) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const modelo = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

  // Construimos el material (solo titulares + enlaces, nada de texto completo con derechos)
  const material = Object.entries(porTema)
    .map(([tema, items]) =>
      `## ${tema}\n` + items.map((i, n) =>
        `${n + 1}. [${i.fuente}] ${i.titulo} — ${i.enlace}`).join("\n"))
    .join("\n\n");

  const prompt =
`Eres un redactor de prensa en español de España. A partir de estos TITULARES y enlaces
(no tienes el texto completo de los artículos, solo titulares y un breve extracto),
escribe un RESUMEN DE PRENSA del día, claro y conciso, agrupado por los temas dados.

Reglas:
- Para cada tema, 2-5 frases que sinteticen lo más relevante de esos titulares.
- NO inventes datos que no estén en los titulares. Si algo no está claro, no lo afirmes.
- Al final de cada tema, lista las fuentes usadas como viñetas "- Titular (Fuente): enlace".
- Tono neutral e informativo. Devuelve SOLO HTML simple (<h2>, <p>, <ul>, <li>, <a>), sin <html> ni <body>.

TITULARES DEL DÍA:
${material}`;

  const resp = await client.messages.create({
    model: modelo,
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });
  return resp.content.map(b => (b.type === "text" ? b.text : "")).join("").trim();
}

// ---------- 3. Montar el correo HTML ----------
function montarHtml(resumenHtml, fechaStr) {
  const qa = process.env.QA_URL;
  const boton = qa
    ? `<p style="margin-top:28px"><a href="${qa}"
         style="background:#c0392b;color:#fff;padding:12px 20px;border-radius:8px;
         text-decoration:none;font-weight:bold">Hacer preguntas sobre las noticias de hoy →</a></p>`
    : `<p style="margin-top:28px;color:#888">(La página de preguntas se añadirá próximamente.)</p>`;

  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:680px;margin:auto;color:#1a1a1a">
    <h1 style="border-bottom:3px solid #c0392b;padding-bottom:8px">Resumen de prensa — ${fechaStr}</h1>
    ${resumenHtml}
    ${boton}
    <hr style="margin-top:32px;border:none;border-top:1px solid #ddd">
    <p style="color:#999;font-size:12px">Generado automáticamente a partir de titulares públicos (RSS).
    Los textos completos pertenecen a sus medios; sigue los enlaces para leerlos en origen.</p>
  </div>`;
}

// ---------- 4. Enviar correo ----------
async function enviarCorreo(html, fechaStr) {
  const { default: nodemailer } = await import("nodemailer");
  const t = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await t.sendMail({
    from: `"Resumen de prensa" <${process.env.GMAIL_USER}>`,
    to: process.env.MAIL_TO,
    subject: `📰 Resumen de prensa — ${fechaStr}`,
    html,
  });
  log("  ✓ Correo enviado a", process.env.MAIL_TO);
}

// ---------- main ----------
async function main() {
  const feedsConfig = JSON.parse(await fs.readFile(path.join(__dirname, "feeds.json"), "utf8"));
  const fechaStr = new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  log("1) Recogiendo titulares...");
  const porTema = await recogerTitulares(feedsConfig);
  const total = Object.values(porTema).reduce((n, a) => n + a.length, 0);
  log(`   -> ${total} titulares tras filtrar y deduplicar.`);

  // Guardamos el JSON del día (lo usará la página de preguntas)
  const outDir = path.join(__dirname, "output");
  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const digestData = JSON.stringify({ fecha: fechaStr, generado: new Date().toISOString(), temas: porTema }, null, 2);
  await fs.writeFile(path.join(outDir, `digest-${stamp}.json`), digestData, "utf8");
  // Copia estable que lee la página de preguntas (qa.html)
  await fs.writeFile(path.join(outDir, `digest-latest.json`), digestData, "utf8");
  // Copia publicada (GitHub Pages sirve la carpeta docs/)
  const docsDir = path.join(__dirname, "docs");
  await fs.mkdir(docsDir, { recursive: true });
  await fs.writeFile(path.join(docsDir, `digest-latest.json`), digestData, "utf8");

  if (SOLO_FEEDS) {
    for (const [tema, items] of Object.entries(porTema)) {
      log(`\n== ${tema} ==`);
      items.forEach(i => log(`  - [${i.fuente}] ${i.titulo}`));
    }
    log("\n(Modo --solo-feeds: no se llama a Claude ni se envía correo.)");
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Falta ANTHROPIC_API_KEY en .env (necesaria para el resumen).");
  }
  log("2) Resumiendo con Claude...");
  const resumenHtml = await resumirConClaude(porTema);
  const html = montarHtml(resumenHtml, fechaStr);
  await fs.writeFile(path.join(outDir, `resumen-${stamp}.html`), html, "utf8");
  log(`   -> Guardado output/resumen-${stamp}.html`);

  if (SIN_CORREO) { log("(Modo --sin-correo: no se envía.)"); return; }

  log("3) Enviando correo...");
  await enviarCorreo(html, fechaStr);
  log("Listo ✔");
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
