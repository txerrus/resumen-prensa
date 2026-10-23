# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Proyecto personal en español: resumen de prensa diario a partir de RSS públicos, agrupado con Claude y enviado por correo a suscriptores (doble opt-in, RGPD). Mantén código, comentarios, textos de interfaz y mensajes de commit en español.

## Comandos

Node.js 18+ (el workflow usa Node 24). Dependencias: `npm ci`. Variables locales en `.env` (plantilla en `.env.example`).

| Objetivo | Comando |
| --- | --- |
| Solo recoger RSS y volcar `output/pool.json` (sin Claude ni correo) | `npm run feeds` (= `node digest.js --solo-feeds`, alias `--pool`) |
| Generar resumen sin enviar correo (necesita `ANTHROPIC_API_KEY`) | `node digest.js --sin-correo` |
| Resumen + correo personal por Gmail | `npm start` |
| Envío a suscriptores (Supabase + Mailjet; lo normal es dejarlo al workflow) | `node enviar.js` |
| Ver el correo sin enviar nada → `output/correo.html` y `output/correo.txt` | `node enviar.js --vista-previa [--prefs "tema1, tema2"] [--digest ruta.json]` |
| Comprobar sintaxis | `node --check digest.js` / `node --check enviar.js` |

No hay lint, tests ni build. `npm run feeds` es la comprobación de integración más barata (consulta RSS en vivo). Ojo: `node enviar.js` en local envía correos reales a todos los suscriptores activos si el `.env` tiene las claves de Supabase/Mailjet.

## Arquitectura

Flujo diario (`.github/workflows/diario.yml`, 09:30 hora de Madrid: crons 07:30 y 08:30 UTC filtrados por el job `hora` según verano/invierno, + `workflow_dispatch`):

1. **`digest.js --sin-correo`** — recoge RSS de `feeds.json` (ventana de 28 h, topes por feed/sección/global definidos al principio del archivo), deduplica y manda a Claude **una sola llamada** con la lista numerada de titulares. Claude devuelve JSON `{secciones:[{seccion, historias:[{titular, resumen, importancia, fuente_ids}]}]}`; `construirDigest` resuelve los `fuente_ids` a fuentes reales y descarta historias sin fuentes válidas. Escribe `output/` (ignorado por git) y `docs/digest-latest.json`.
2. **`enviar.js`** — lee `docs/digest-latest.json`, pide a la REST de Supabase los suscriptores con `estado=activo`, arma el correo con `prepararCorreo` (5 «Lo esencial», hasta 5 «Para ti» por coincidencia de palabras con sus `preferencias` ignorando términos que salen en >25 % de noticias, y 6 por sección con enlace a `PAGES/#sec=…`; sin llamadas a Claude) y envía un correo por suscriptor vía Mailjet v3.1 con HTML (`emailHtml`, tablas + estilos en línea, modo oscuro) **y** texto plano (`emailTexto` → `TextPart`), más cabeceras `List-Unsubscribe`. Los topes están en constantes al principio del archivo. Si cambias el contenido del correo, cambia las dos versiones.
3. El workflow hace commit de `docs/digest-latest.json` con `[skip ci]` ("Actualiza noticias del día"). No edites ese archivo a mano.

Piezas relacionadas:
- **Formato del digest** `{ fecha, generado, medios, secciones }` (historias con `titular`, `resumen`, `importancia` 1–5, `fuentes[{medio, titulo, enlace, entradilla}]`) es el contrato compartido entre `digest.js`, `enviar.js` y la web. Si lo cambias, actualiza los tres.
- **Lista de secciones**: está en la constante `SECCIONES` de `digest.js` (y en el prompt); las claves de `feeds.json` son solo una pista (`seccionHint`) y Claude puede recolocar noticias.
- **Modelo**: `ANTHROPIC_MODEL` (por defecto `claude-haiku-5-5`). `agruparConClaude` ajusta `thinking` según la familia del modelo para que todo el presupuesto de tokens vaya al JSON; si cambias de modelo, revisa esa lógica.
- **`docs/`** = web estática en GitHub Pages (`https://txerrus.github.io/resumen-prensa`). `index.html` es la web principal: lee `digest-latest.json`, muestra portada, secciones, búsqueda y filtro por medio, y tiene un panel de preguntas que llama al proveedor de IA directamente desde el navegador con la clave del usuario (guardada en `localStorage`). `qa.html` solo redirige a `index.html#preguntar` (lo enlazan correos y Supabase). Estilos comunes en `estilo.css` y tema claro/oscuro en `tema.js`; si los cambias, sube el `?v=` de sus enlaces en todas las páginas. `suscribirse.html` llama a la Edge Function `subscribe` (URL del proyecto Supabase fijada en `window.API_BASE`).
- **`supabase/functions/`** — Edge Functions en TypeScript para Deno (`subscribe`, `confirm`, `unsubscribe`), públicas (`--no-verify-jwt`), sobre la tabla `suscriptores` vía REST. `unsubscribe` borra la fila (derecho de supresión). Despliegue y secretos en `supabase/functions/README.md`; esquema de la tabla y flujo RGPD en `PLAN-newsletter.md`.
- Hay dos vías de correo: Gmail/nodemailer en `digest.js` (uso personal, `npm start`) y Mailjet en `enviar.js` y en las Edge Functions (suscriptores).

## Convenciones

- Scripts raíz en ESM (`"type": "module"`); las Edge Functions son Deno, no añadas dependencias de Node ahí.
- Secretos: GitHub Actions para el workflow, Supabase para las Edge Functions. Nunca en `docs/` (es público).
- Contenido solo a partir de titulares, extractos y enlaces RSS públicos: enlazar al medio original, no descargar ni redistribuir artículos completos. El prompt pide no inventar datos que no estén en los titulares; mantén esa restricción.
- El HTML de los correos usa estilos en línea (compatibilidad con clientes de correo).

## Notas del proyecto

Plan, «Dónde lo dejamos», decisiones y producto están en `notas/` (`PLAN.md`, `DECISIONES.md`, `PRODUCTO.md`), **no** en `docs/`, porque `docs/` es la web pública.
