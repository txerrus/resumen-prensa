# Plan: boletín diario personalizado con RGPD (prueba personal / pocos usuarios)

## Objetivo
1. Generar las noticias cada día (ya existe: `digest.js`).
2. Página donde un usuario deja su email para recibir el boletín.
3. Página donde fija hasta 10 preferencias libres (ej.: "Barça de basket", "barrio de La Latina, Madrid").
4. Envío diario del boletín a cada suscriptor, cumpliendo RGPD/LOPD.

## Stack (todo gratis, UE)
- **Supabase** (Postgres + Edge Functions, región UE): datos de suscriptores + lógica de alta/confirmación/baja.
- **Mailjet** (UE): envío de correos (confirmación y boletín diario), bajas y rebotes.
- **GitHub Actions** (cron gratis): ejecuta el envío diario (genera + personaliza + envía).
- **GitHub Pages** (ya en uso): formulario de alta, preferencias, política de privacidad, y la web de lectura.
- **Claude API** (clave del usuario): genera el resumen y puntúa las noticias según preferencias.

## Modelo de datos (Supabase)
Tabla `suscriptores`:
- `id` (uuid), `email` (único), `estado` ('pendiente'|'activo'|'baja'),
- `preferencias` (text[] hasta 10), `token` (uuid, para confirmar/baja/editar),
- `consentimiento_texto`, `consentimiento_fecha`, `consentimiento_ip`,
- `creado`, `confirmado`, `baja_fecha`.

## Flujo RGPD (doble opt-in)
1. Usuario rellena email + preferencias + acepta política → se guarda como `pendiente` con registro de consentimiento (texto, fecha, IP).
2. Se envía correo de confirmación con enlace único (`token`). Al pulsarlo → `activo`.
3. Cada correo del boletín lleva enlace de **baja en 1 clic** y de **editar preferencias**.
4. Página/endpoint para **ejercer derechos** (acceso, rectificación, supresión). Supresión = borrado real de la fila.
5. **Minimización**: solo email + preferencias. **Conservación**: hasta baja/retirada de consentimiento.
6. Política de privacidad con responsable, finalidad, base jurídica (consentimiento), encargados (Supabase, Mailjet), derechos y reclamación ante la AEPD.

> Nota legal: los mecanismos los provee el sistema; el usuario es el **responsable del tratamiento**,
> debe completar su identidad/contacto, firmar los DPA de Supabase y Mailjet y, idealmente, revisar los
> textos con un profesional antes de abrir a terceros.

## Personalización (eficiente en coste)
- El resumen general se genera **una vez al día** (una llamada de agrupado, como ahora).
- Para cada usuario: se puntúan las noticias del día frente a sus preferencias y se **ordena** primero lo
  que le interesa. Para empezar, puntuación por **palabras clave + una sola llamada ligera a Claude** por
  usuario (o por lotes) para captar preferencias abiertas tipo "La Latina". Se puede desactivar si el coste sube.

## Fases de construcción
- **F1 (ahora):** política de privacidad + formulario de alta/preferencias (front-end) + este plan. [front-end visible]
- **F2:** Supabase (tabla + Edge Functions: alta, confirmar, baja, editar, derechos) + conectar el formulario.
- **F3:** Mailjet (plantillas de confirmación y boletín) + prueba de envío real.
- **F4:** GitHub Action diaria: generar + personalizar + enviar + actualizar web.
- **F5:** repaso de cumplimiento RGPD de punta a punta.

## Cuentas que debe crear el usuario (gratis)
- Supabase (supabase.com) — proyecto en región UE (p. ej. Frankfurt).
- Mailjet (mailjet.com) — y verificar un remitente/dominio.
- Secretos en GitHub Actions: ANTHROPIC_API_KEY, claves de Mailjet y de Supabase.
