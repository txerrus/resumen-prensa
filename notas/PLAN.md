# Plan del proyecto

## Dónde lo dejamos

**Fecha:** 23/10/2026

**Último trabajo terminado:**
- Rediseño del correo a suscriptores (`enviar.js`): «Lo esencial» → «Para ti» → secciones recortadas con enlace a la web; HTML + texto plano; tamaño limitado para que Gmail no lo recorte. **Ya está en GitHub**: el envío de mañana sale con el diseño nuevo.
- Revisión técnica hecha y casi todas sus tareas resueltas (ver abajo). Todo subido a GitHub.

**A medias (necesita al usuario):** desplegar las 3 Edge Functions nuevas en Supabase y ejecutar `supabase/seguridad.sql`. Hasta entonces, la baja y la confirmación siguen funcionando como antes (sin botón) y el formulario sin límites.

**Siguiente paso concreto (por orden):**
1. **Anthropic → nueva clave**: console.anthropic.com → API Keys → crear una nueva, ponerla en GitHub (repo → Settings → Secrets and variables → Actions → `ANTHROPIC_API_KEY`) y en tu `.env`, y **borrar la antigua** (la que estaba en `APIs.docx`). Si en ese documento había claves de Mailjet o Supabase, cambiarlas también.
2. **Anthropic → límite de gasto**: console.anthropic.com → Settings → Limits → poner un límite mensual bajo (p. ej. 5 $) y un aviso por correo.
3. **Supabase → SQL Editor**: pegar `supabase/seguridad.sql` y pulsar Run. Debe salir `rowsecurity = true` y ninguna regla.
4. **Supabase → Edge Functions**: volver a desplegar `subscribe`, `confirm` y `unsubscribe` pegando su `index.ts` (con «Verify JWT» desactivado). Instrucciones en `supabase/functions/README.md`.
5. **Probar**: darse de alta con un correo propio → confirmar con el botón → recibir el correo → darse de baja con el botón.
6. Revisar el correo de mañana en Outlook y Gmail (móvil y escritorio).

**Dudas y tareas abiertas:**
1. **Dominio propio** para el remitente (R3), pendiente de decidir: ~10 €/año.
2. **Clasificación en secciones**: el resumen del 22/10/2026 salió con una sola sección. Revisar el prompt de `digest.js` si se repite.
3. **Historias duplicadas**: a veces Claude no fusiona la misma noticia de dos medios. Mejorable en el prompt.
4. **Elegir formato por suscriptor** («solo texto»): aplazado; solo si alguien lo pide.
5. **Copia de seguridad de la tabla de suscriptores**: el plan gratuito de Supabase no la incluye. Con pocos suscriptores basta con exportar a CSV de vez en cuando (Table Editor → Export).
6. **Sin pruebas automáticas**: con el proyecto creciendo, convendría una prueba mínima de `prepararCorreo` y de `construirDigest`.

## Tareas de la revisión técnica (23/10/2026)

- [x] R1. Clave de Anthropic en `APIs.docx` dentro de copias ocultas `refs/agents/...`: copias borradas del git local (nunca llegaron a GitHub). **Falta (usuario):** crear una clave nueva y revocar la antigua → paso 1.
- [ ] R2. Proteger la tabla `suscriptores` (RLS): script listo en `supabase/seguridad.sql` → paso 3. (Claude no pudo comprobarlo: no tiene permiso para consultar la base de datos real.)
- [ ] R3. Remitente con dominio propio: pendiente de decisión (cuesta dinero).
- [x] R4. Baja y confirmación con botón (páginas `docs/baja.html` y `docs/confirmar.html` publicadas). **Falta:** desplegar funciones → paso 4.
- [x] R5. Límites anti-abuso en `subscribe` y campo trampa en el formulario (publicado). **Falta:** desplegar funciones → paso 4.
- [x] R6. `nodemailer` actualizado a la 10.x; `npm audit` sin avisos.
- [x] R7. Política de privacidad corregida y publicada.
- [ ] R8. Límite de gasto en Anthropic (usuario) → paso 2.
