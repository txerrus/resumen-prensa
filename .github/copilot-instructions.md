# Instrucciones del proyecto

## Arquitectura

- `digest.js` recoge titulares y extractos de los RSS definidos en `feeds.json`, los agrupa por noticia con Claude y genera el JSON y el HTML del resumen. `--sin-correo` omite el correo; `--pool` y `--solo-feeds` solo recogen artículos.
- `enviar.js` es el envío diario para suscriptores: lee `docs/digest-latest.json`, obtiene suscriptores activos de Supabase, ordena las noticias según sus preferencias y envía un correo individual por Mailjet. En cambio, `digest.js` envía por Gmail en su modo normal.
- `docs/` contiene la web estática publicada en GitHub Pages. El formulario de `docs/suscribirse.html` llama a la función pública `subscribe`; las funciones Supabase en `supabase/functions/` gestionan el doble opt-in y la baja con eliminación de los datos.
- `.github/workflows/diario.yml` ejecuta a diario `digest.js --sin-correo` y después `enviar.js`; finalmente publica `docs/digest-latest.json`. Ese archivo lo genera el proceso, no lo edites a mano.

## Comandos

Node.js 18+; el workflow usa Node.js 24. Instala dependencias con `npm ci`.

| Objetivo | Comando |
| --- | --- |
| Recoger y listar titulares (consulta RSS en vivo; no usa Claude ni envía correo) | `npm run feeds` |
| Generar resumen sin enviar correo (requiere `ANTHROPIC_API_KEY`) | `node digest.js --sin-correo` |
| Ejecutar el resumen y enviar correo por Gmail | `npm start` |
| Comprobar sintaxis de un archivo Node.js | `node --check digest.js` o `node --check enviar.js` |

No hay scripts de lint o de test ni archivos de pruebas; por tanto, no existe un comando para ejecutar un test individual. `npm run feeds` sirve como comprobación de integración de la recogida, pero necesita acceso a los RSS y escribe en `output/`.

## Convenciones específicas

- Los scripts raíz son JavaScript ESM (`"type": "module"`); las funciones Supabase son TypeScript para Deno. Respeta el runtime correspondiente y no añadas dependencias de Node a las funciones Edge sin adaptar su despliegue.
- Mantén `feeds.json` como configuración de secciones con fuentes `{ "medio", "url" }`. El formato compartido del resumen es `{ fecha, generado, medios, secciones }`, con historias que contienen titular, resumen, importancia y fuentes enlazables. La web y `enviar.js` dependen de ese formato.
- La automatización diaria usa secretos de GitHub Actions y las funciones Edge usan secretos de Supabase. Consulta `.env.example` y `supabase/functions/README.md` para nombres/configuración; nunca incluyas valores secretos en el frontend ni en el código.
- El contenido editorial debe derivarse de titulares, extractos y enlaces RSS públicos: enlaza al medio original y no descargues ni redistribuyas artículos completos. Conserva los textos y la interfaz en español, como el resto del proyecto.
