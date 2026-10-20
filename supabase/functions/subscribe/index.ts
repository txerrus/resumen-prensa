// Función "subscribe": da de alta (pendiente) y envía correo de confirmación (doble opt-in).
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const mail = String(body.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return json({ error: "Correo no válido" }, 400);
    const prefs = Array.isArray(body.preferencias)
      ? body.preferencias.map((p: unknown) => String(p).trim()).filter(Boolean).slice(0, 10) : [];
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const token = crypto.randomUUID();

    const existing = await fetch(
      `${REST}?email=eq.${encodeURIComponent(mail)}&select=id,estado`, { headers: db }).then((r) => r.json());
    if (existing.length && existing[0].estado === "activo") {
      return json({ ok: true, message: "Ya estabas suscrito." });
    }
    const payload = {
      email: mail, estado: "pendiente", preferencias: prefs, token,
      consentimiento_texto: String(body.consentimiento_texto || ""),
      consentimiento_fecha: new Date().toISOString(),
      consentimiento_ip: ip, confirmado: null, baja_fecha: null,
    };
    if (existing.length) {
      await fetch(`${REST}?id=eq.${existing[0].id}`, { method: "PATCH", headers: db, body: JSON.stringify(payload) });
    } else {
      await fetch(REST, { method: "POST", headers: { ...db, Prefer: "return=minimal" }, body: JSON.stringify(payload) });
    }

    const confirmUrl = `${FBASE}/confirm?token=${token}`;
    await sendMail(mail, "Confirma tu suscripción al resumen de prensa",
      `Confirma tu suscripción abriendo este enlace:\n${confirmUrl}\n\nSi no has sido tú, ignora este correo.`,
      `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1a1a1a">
        <h2>Confirma tu suscripción</h2>
        <p>Gracias por suscribirte al <strong>resumen de prensa diario</strong>. Pulsa para activarla:</p>
        <p><a href="${confirmUrl}" style="background:#c0392b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Confirmar mi suscripción</a></p>
        <p style="color:#888;font-size:13px">Si no has sido tú, ignora este correo y no se añadirá tu dirección.</p>
      </div>`);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

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
