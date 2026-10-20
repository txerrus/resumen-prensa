// Función "confirm": activa la suscripción al pulsar el enlace del correo (doble opt-in).
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SB_SECRET_KEY")!;
const SITE = Deno.env.get("SITE_URL") ?? "https://txerrus.github.io/resumen-prensa/qa.html";
const REST = `${SB_URL}/rest/v1/suscriptores`;
const db = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" };

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return page("Falta el identificador. Enlace no válido.", false);
  try {
    const rows = await fetch(`${REST}?token=eq.${token}&select=id,estado`, { headers: db }).then((r) => r.json());
    if (!rows.length) return page("Este enlace no es válido o ya se ha utilizado.", false);
    if (rows[0].estado !== "activo") {
      await fetch(`${REST}?id=eq.${rows[0].id}`, {
        method: "PATCH", headers: db,
        body: JSON.stringify({ estado: "activo", confirmado: new Date().toISOString() }),
      });
    }
    return page("¡Suscripción confirmada! Recibirás el resumen de prensa cada mañana.", true);
  } catch (e) {
    return page("Ha ocurrido un error: " + String((e as Error).message || e), false);
  }
});

function page(msg: string, ok: boolean) {
  const color = ok ? "#059669" : "#c0392b";
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width, initial-scale=1">
     <title>Resumen de prensa</title></head>
     <body style="font-family:system-ui,Arial,sans-serif;background:#f7f6f3;color:#1a1a1a;margin:0">
       <div style="max-width:520px;margin:10vh auto;padding:24px;background:#fff;border-radius:14px;border:1px solid #e3e1dc;text-align:center">
         <div style="font-size:42px">${ok ? "✅" : "⚠️"}</div>
         <h1 style="color:${color};font-size:1.3rem">${msg}</h1>
         <p><a href="${SITE}" style="color:#c0392b;font-weight:600">Ir al resumen de prensa →</a></p>
       </div>
     </body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
