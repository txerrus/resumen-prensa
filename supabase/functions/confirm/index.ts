// Función "confirm": activa la suscripción (doble opt-in) y redirige a una página de la web.
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SB_SECRET_KEY")!;
const PAGES = Deno.env.get("PAGES_URL") ?? "https://txerrus.github.io/resumen-prensa";
const REST = `${SB_URL}/rest/v1/suscriptores`;
const db = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" };

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token");
  try {
    if (!token) return go("/confirmado.html?e=1");
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
