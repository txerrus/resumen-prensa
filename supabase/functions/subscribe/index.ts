// Función "subscribe": da de alta (pendiente) y envía correo de confirmación (doble opt-in).
// Límites anti-abuso (para que nadie use el formulario para mandar correos a terceros):
//   - trampa para robots (campo "web" invisible): si viene relleno, se responde ok sin hacer nada;
//   - mismo correo: no se reenvía la confirmación si ya se pidió hace menos de 10 minutos;
//   - misma IP: máximo 5 altas por hora;
//   - en total: máximo 30 altas pendientes por hora (protege la cuota de Mailjet).
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SB_SECRET_KEY")!;          // clave secreta de Supabase (se configura como secreto)
const MJ_KEY = Deno.env.get("MAILJET_API_KEY")!;
const MJ_SECRET = Deno.env.get("MAILJET_SECRET_KEY")!;
const SENDER = Deno.env.get("SENDER_EMAIL")!;
const SENDER_NAME = Deno.env.get("SENDER_NAME") ?? "Resumen de prensa";
const REST = `${SB_URL}/rest/v1/suscriptores`;
const FBASE = `${SB_URL}/functions/v1`;
const db = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" };

const MAX_POR_IP_HORA = 5;
const MAX_TOTAL_HORA = 30;
const REENVIO_MIN = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    if (String(body.web || "").trim()) return json({ ok: true }); // robot: no hacemos nada
    const mail = String(body.email || "").trim().toLowerCase();
    if (mail.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return json({ error: "Correo no válido" }, 400);
    const prefs = Array.isArray(body.preferencias)
      ? body.preferencias.map((p: unknown) => String(p).trim().slice(0, 60)).filter(Boolean).slice(0, 10) : [];
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64);
    const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();

    const existing = await fetch(
      `${REST}?email=eq.${encodeURIComponent(mail)}&select=id,estado,consentimiento_fecha`, { headers: db }).then((r) => r.json());
    if (existing.length && existing[0].estado === "activo") {
      return json({ ok: true, message: "Ya estabas suscrito." });
    }
    // Mismo correo pedido hace poco: no reenviamos (evita bombardear un buzón ajeno).
    const ultima = existing.length ? Date.parse(existing[0].consentimiento_fecha || "") : NaN;
    if (!Number.isNaN(ultima) && Date.now() - ultima < REENVIO_MIN * 60_000) return json({ ok: true });

    const fecha = `consentimiento_fecha=gte.${encodeURIComponent(haceUnaHora)}`;
    if (ip && (await contar(`consentimiento_ip=eq.${encodeURIComponent(ip)}&${fecha}`)) >= MAX_POR_IP_HORA) {
      return json({ error: "Demasiados intentos. Prueba de nuevo dentro de una hora." }, 429);
    }
    if ((await contar(`estado=eq.pendiente&${fecha}`)) >= MAX_TOTAL_HORA) {
      return json({ error: "Ahora mismo hay muchas altas. Prueba de nuevo dentro de un rato." }, 429);
    }

    const token = crypto.randomUUID();
    const payload = {
      email: mail, estado: "pendiente", preferencias: prefs, token,
      consentimiento_texto: String(body.consentimiento_texto || "").slice(0, 300),
      consentimiento_fecha: new Date().toISOString(),
      consentimiento_ip: ip, confirmado: null, baja_fecha: null,
    };
    if (existing.length) {
      await fetch(`${REST}?id=eq.${existing[0].id}`, { method: "PATCH", headers: db, body: JSON.stringify(payload) });
    } else {
      await fetch(REST, { method: "POST", headers: { ...db, Prefer: "return=minimal" }, body: JSON.stringify(payload) });
    }

    // El enlace abre una página con el botón «Confirmar» (ver función confirm).
    const confirmUrl = `${FBASE}/confirm?token=${token}`;
    await sendMail(mail, "Confirma tu suscripción al resumen de prensa",
      `Confirma tu suscripción abriendo este enlace y pulsando «Confirmar»:\n${confirmUrl}\n\nSi no has sido tú, ignora este correo.`,
      `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1a1a1a">
        <h2>Confirma tu suscripción</h2>
        <p>Gracias por suscribirte al <strong>resumen de prensa diario</strong>. Pulsa para activarla:</p>
        <p><a href="${confirmUrl}" style="background:#b3261e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Confirmar mi suscripción</a></p>
        <p style="color:#666;font-size:13px">Si no has sido tú, ignora este correo y no se añadirá tu dirección.</p>
      </div>`);
    return json({ ok: true });
  } catch (e) {
    console.error("subscribe:", (e as Error).message || e); // el detalle queda en los logs de Supabase, no en la web
    return json({ error: "No se pudo completar el alta. Inténtalo más tarde." }, 500);
  }
});

// Cuenta filas que cumplen un filtro, sin descargarlas.
async function contar(filtro: string): Promise<number> {
  const r = await fetch(`${REST}?${filtro}&select=id&limit=1`, { headers: { ...db, Prefer: "count=exact" } });
  const total = (r.headers.get("content-range") || "").split("/")[1];
  await r.body?.cancel();
  return Number(total) || 0;
}

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "content-type": "application/json" } });
}
async function sendMail(to: string, subject: string, text: string, html: string) {
  const auth = btoa(`${MJ_KEY}:${MJ_SECRET}`);
  const r = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST", headers: { Authorization: `Basic ${auth}`, "content-type": "application/json" },
    body: JSON.stringify({ Messages: [{ From: { Email: SENDER, Name: SENDER_NAME }, To: [{ Email: to }], Subject: subject, TextPart: text, HTMLPart: html }] }),
  });
  if (!r.ok) throw new Error("Mailjet: " + (await r.text()).slice(0, 200));
}
