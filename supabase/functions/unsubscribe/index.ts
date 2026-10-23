// Función "unsubscribe": baja + eliminación de datos (RGPD).
// - GET (abrir el enlace del correo): NO borra nada; lleva a una página con el botón «Darme de baja».
//   Así los escáneres de enlaces (Outlook, antivirus) no dan de baja a nadie sin querer.
// - POST (el botón de esa página, o el «darse de baja» de un clic de Gmail/Outlook): borra la fila.
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SB_SECRET_KEY")!;
const PAGES = Deno.env.get("PAGES_URL") ?? "https://txerrus.github.io/resumen-prensa";
const REST = `${SB_URL}/rest/v1/suscriptores`;
const db = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" };
const ES_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let token = url.searchParams.get("token") || "";

  if (req.method !== "POST") {
    if (!ES_TOKEN.test(token)) return go("/baja-hecha.html?e=1");
    return go(`/baja.html?token=${token}`);
  }

  // POST: el token puede venir en la URL o en el formulario.
  const cuerpo = await req.text().catch(() => "");
  const form = new URLSearchParams(cuerpo);
  if (!token) token = form.get("token") || "";
  const unClic = form.get("List-Unsubscribe") === "One-Click"; // RFC 8058: lo envía el programa de correo
  try {
    if (!ES_TOKEN.test(token)) return unClic ? texto("Enlace no válido", 400) : go("/baja-hecha.html?e=1");
    const rows = await fetch(`${REST}?token=eq.${token}&select=id`, { headers: db }).then((r) => r.json());
    if (!Array.isArray(rows) || !rows.length) return unClic ? texto("Ya no estabas suscrito") : go("/baja-hecha.html?e=1");
    await fetch(`${REST}?id=eq.${rows[0].id}`, { method: "DELETE", headers: db });
    return unClic ? texto("Baja completada") : go("/baja-hecha.html");
  } catch (_e) {
    return unClic ? texto("Error", 500) : go("/baja-hecha.html?e=1");
  }
});

function go(path: string) {
  return Response.redirect(PAGES + path, 303);
}
function texto(t: string, status = 200) {
  return new Response(t, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}
