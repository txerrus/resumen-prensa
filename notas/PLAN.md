# Plan del proyecto

## Dónde lo dejamos

**Fecha:** 23/10/2026

**Último trabajo terminado:** rediseño del correo a suscriptores (`enviar.js`).
- Estructura: cabecera → «Lo esencial» (5) → «Para ti» (hasta 5) → cada sección con sus 6 más importantes + enlace «Ver las N noticias de X en la web».
- Cada correo lleva HTML **y** texto plano (`TextPart` de Mailjet).
- Vista previa sin enviar nada: `node enviar.js --vista-previa [--prefs "tema1, tema2"] [--digest ruta.json]` → `output/correo.html` y `output/correo.txt`.
- Commits: `7230b50` (vista previa) y `034ccd4` (rediseño).

**A medias:** los commits están solo en local, **sin subir a GitHub**. Hasta hacer `git push`, el envío diario sigue usando el correo antiguo.

**Siguiente paso concreto:** hacer `git push` (cambia lo que reciben los suscriptores al día siguiente). Después, revisar el correo real en Outlook y Gmail, en el móvil y en el escritorio, y ajustar si hace falta (los números están al principio de `enviar.js`: `ESENCIALES`, `PARA_TI`, `POR_SECCION`, `FUENTES_MAX`).

**Dudas y tareas abiertas:**
1. **Remitente `@gmail.com` enviado por Mailjet** → aviso «el remitente real es diferente» y riesgo de spam (falla DMARC). Solución: dominio propio (~10 €/año) verificado en Mailjet. Pendiente de decidir.
2. **Clasificación en secciones**: el resumen del 22/10/2026 salió con una sola sección (34 noticias). Revisar el prompt de `digest.js` si se repite.
3. **Elegir formato por suscriptor** (recibir solo texto plano): aplazado; solo si alguien lo pide. Implica columna nueva en Supabase, cambio en `subscribe` y una función de preferencias.
4. **Historias duplicadas**: a veces Claude no fusiona la misma noticia de dos medios (p. ej. dos sobre Marruecos y Ceuta el 23/10). Mejorable en el prompt.
5. Antes de dar el proyecto por terminado: ejecutar `/revision-tecnica`.

## Tareas de la revisión técnica (23/10/2026)

- [ ] R1. Clave de Anthropic filtrada en `APIs.docx` (copias `refs/agents/...`): borrar las copias locales (Claude) y crear una clave nueva y revocar la antigua (usuario, en la consola).
- [ ] R2. Comprobar que la tabla `suscriptores` está protegida (RLS).
- [ ] R3. Remitente con dominio propio (usuario: compra ~10 €/año; luego verificar en Mailjet).
- [ ] R4. Baja y confirmación con botón (que los escáneres de enlaces no las activen).
- [ ] R5. Límite de uso del formulario de suscripción (anti-abuso).
- [ ] R6. Actualizar `nodemailer`.
- [ ] R7. Política de privacidad: quitar «Editar preferencias», revisar encargados.
- [ ] R8. Límite de gasto en Anthropic (usuario, en la consola).
