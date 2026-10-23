# Decisiones

## 23/10/2026 — Rediseño del correo a suscriptores

- **El correo es un aperitivo; la web, el plato completo.** Se muestran 5 esenciales y 6 noticias por sección, con un enlace a la sección en la web (`#sec=Nombre`). *Por qué:* con más de 130 noticias al día, el correo era interminable en el móvil. *Descartado:* mandarlas todas, mejor ordenadas.
- **Sin repeticiones:** lo que sale en «Lo esencial» o en «Para ti» no se repite en las secciones.
- **Texto plano siempre dentro del mismo correo** (`TextPart`), no como opción del suscriptor. *Por qué:* lo agradecen los lectores de texto y algunos filtros antispam, sin tocar Supabase. *Descartado por ahora:* una preferencia «solo texto» por suscriptor.
- **«Para ti» ignora palabras demasiado generales.** Si un término aparece en más del 25 % de las noticias del día, no basta por sí solo para recomendar una noticia. *Por qué:* temas como «España» lo llenaban todo. Se compara por palabras completas o por su comienzo («renovable» encuentra «renovables»), no por trozos de texto.
- **Sin estrellas.** Se ha sustituido por la etiqueta «Destacado» (importancia 4–5). El titular enlaza al primer medio. Cada medio sale una sola vez.
- **Maquetación con tablas y estilos en línea**, más `<style>` solo para el modo oscuro y el móvil (si un cliente lo ignora, el correo sigue viéndose bien). *Por qué:* Outlook de escritorio pinta el HTML con el motor de Word.
- **Notas del proyecto en `notas/`, no en `docs/`**, porque `docs/` es la web publicada en GitHub Pages.

## 23/10/2026 — Revisión técnica

- **Tamaño máximo del correo (95 KB).** Gmail recorta los correos de más de 102 KB y esconde el final, que es donde está el enlace de baja. `construirCorreo` reduce las noticias por sección hasta que el correo quepa, y el texto plano usa la misma cifra.
- **Baja y confirmación en dos pasos**: abrir el enlace solo enseña una página con un botón; la acción se hace al pulsarlo (POST). *Por qué:* los escáneres de enlaces (Outlook, antivirus) abren los enlaces solos. Se mantiene el «darse de baja en un clic» de Gmail y Outlook (RFC 8058). *Descartado:* enlazar el correo directamente a `baja.html`; el enlace sigue apuntando a la función, para que los correos ya enviados sigan funcionando.
- **Anti-abuso sin servicios externos**: campo trampa + límites contando filas en la propia tabla (5 por IP y hora, 30 pendientes por hora, sin reenvío en 10 min). *Descartado por ahora:* un captcha (Cloudflare Turnstile), que exige otra cuenta y añade fricción; se puede añadir si llega abuso real.
- **RLS activado sin reglas**: la web nunca lee la tabla directamente (todo pasa por las funciones con la clave secreta), así que no hace falta ninguna regla de acceso público.
