# Backend (Supabase Edge Functions)

Tres funciones públicas para el alta con doble opt-in:
- `subscribe` — recibe el alta, guarda "pendiente" y envía el correo de confirmación (Mailjet).
- `confirm` — activa la suscripción al pulsar el enlace del correo.
- `unsubscribe` — da de baja y **elimina** los datos (derecho de supresión).

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
