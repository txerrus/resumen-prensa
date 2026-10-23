// Función "confirm": activa la suscripción (doble opt-in).
// - GET (abrir el enlace del correo): NO activa nada; lleva a una página con el botón «Confirmar».
//   Así un escáner de enlaces no confirma por la persona, y el consentimiento es de verdad suyo.
// - POST (el botón de esa página): activa la fila y redirige a «Suscripción confirmada».
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
    if (!ES_TOKEN.test(token)) return go("/confirmado.html?e=1");
    return go(`/confirmar.html?token=${token}`);
  }

  try {
    if (!token) token = new URLSearchParams(await req.text()).get("token") || "";
    if (!ES_TOKEN.test(token)) return go("/confirmado.html?e=1");
    const rows = await fetch(`${REST}?token=eq.${token}&select=id,estado`, { headers: db }).then((r) => r.json());
    if (!Array.isArray(rows) || !rows.length) return go("/confirmado.html?e=1");
    if (rows[0].estado !== "activo") {
      await fetch(`${REST}?id=eq.${rows[0].id}`, {
        method: "PATCH", headers: db,
        body: JSON.stringify({ estado: "activo", confirmado: new Date().toISOString() }),
      });
    }
    return go("/confirmado.html");
  } catch (_e) {
    return go("/confirmado.html?e=1");
  }
});

function go(path: string) {
  return Response.redirect(PAGES + path, 303);
}
