# Backend (Supabase Edge Functions)

Tres funciones públicas para el alta con doble opt-in:
- `subscribe` — recibe el alta, guarda "pendiente" y envía el correo de confirmación (Mailjet).
- `confirm` — el enlace del correo (GET) lleva a `docs/confirmar.html`; el botón de esa página (POST) activa la suscripción.
- `unsubscribe` — el enlace (GET) lleva a `docs/baja.html`; el botón (POST) da de baja y **elimina** los datos (derecho de supresión). También acepta el «darse de baja en un clic» de Gmail/Outlook (POST con `List-Unsubscribe=One-Click`).

Por qué en dos pasos: Outlook y los antivirus abren los enlaces de los correos para revisarlos; si abrir el enlace ya diera de baja o confirmara, ocurriría sin que la persona lo pulse.

`subscribe` limita el abuso: campo trampa para robots, no reenvía al mismo correo en 10 min, máx. 5 altas/hora por IP y 30 pendientes/hora en total (constantes al principio del archivo).

**Orden al desplegar cambios:** primero la web (`git push`, para que existan `baja.html` y `confirmar.html`) y después las funciones.

**Seguridad de la tabla:** ejecuta una vez `supabase/seguridad.sql` en Supabase → SQL Editor (activa RLS; la clave pública de la web no podrá leer la tabla).

## Secretos a configurar (Supabase → Project Settings → Edge Functions → Secrets)
| Nombre | Valor |
|---|---|
| `SB_SECRET_KEY` | tu clave secreta de Supabase (la nueva `sb_secret_...`) |
| `MAILJET_API_KEY` | API Key de Mailjet |
| `MAILJET_SECRET_KEY` | Secret Key de Mailjet |
| `SENDER_EMAIL` | el remitente verificado en Mailjet |
| `SENDER_NAME` | `Resumen de prensa` (opcional) |
| `SITE_URL` | `https://txerrus.github.io/resumen-prensa/qa.html` (opcional) |

`SUPABASE_URL` lo aporta Supabase automáticamente.

## Desplegar (opción panel web, sin instalar nada)
Por cada función (`subscribe`, `confirm`, `unsubscribe`):
1. Supabase → **Edge Functions** → **Deploy a new function** / **Create function**.
2. Nombre exactamente `subscribe` (o `confirm` / `unsubscribe`).
3. Pega el contenido de su `index.ts`.
4. **Desactiva "Verify JWT"** (son endpoints públicos del formulario).
5. **Deploy**.

## Desplegar (opción CLI)
```
npm i -g supabase
supabase login
supabase link --project-ref juzyajcwmoqrqkzwywvh
supabase functions deploy subscribe --no-verify-jwt
supabase functions deploy confirm --no-verify-jwt
supabase functions deploy unsubscribe --no-verify-jwt
```

## Probar
- Alta desde `docs/suscribirse.html` → debe llegar un correo de confirmación.
- Pulsar el enlace → "Suscripción confirmada".
- En Supabase (Table editor → suscriptores) la fila pasa a `estado = activo`.
