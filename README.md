# Resumen de prensa diario

Recoge titulares de fuentes **RSS** legales, los **resume con Claude** y te envía un
**correo** con el resumen de prensa del día. (La página de preguntas se añade en un segundo paso.)

> Solo usa **titulares, extractos y enlaces** públicos. No descarga ni redistribuye los
> artículos completos: para leerlos, se enlaza al medio original.

## 1. Requisitos
- Node.js 18+ (tienes v24 ✔)
- Una **clave de API de Claude** (https://console.anthropic.com → *API Keys*)
- Un **Gmail** con **contraseña de aplicación** (ver abajo)

## 2. Configuración (una sola vez)
1. Instala dependencias:
   ```powershell
   npm install
   ```
2. Copia `.env.example` a `.env` y rellena tus datos:
   ```powershell
   Copy-Item .env.example .env
   ```
   - `ANTHROPIC_API_KEY`: tu clave de Claude.
   - `GMAIL_USER`: tu correo de Gmail.
   - `GMAIL_APP_PASSWORD`: contraseña de aplicación (16 letras). Se crea en
     *Cuenta de Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones*.
     (Requiere tener activada la verificación en 2 pasos.)
   - `MAIL_TO`: a quién enviar (puede ser tu propio correo).

## 3. Elegir tus fuentes y temas
Edita `feeds.json`. Cada tema tiene una lista de URLs RSS. Añade o quita las que quieras.

## 4. Probar
- Solo titulares (no gasta clave ni envía correo):
  ```powershell
  npm run feeds
  ```
- Generar el resumen sin enviar correo (sí usa la clave de Claude):
  ```powershell
  node digest.js --sin-correo
  ```
  Mira el resultado en `output/resumen-AAAA-MM-DD.html`.
- Proceso completo (resumen + correo):
  ```powershell
  npm start
  ```

## 5. Automatizar cada mañana (Programador de tareas de Windows)
1. Abre **Programador de tareas** → *Crear tarea básica*.
2. Desencadenador: **Diariamente**, p. ej. 07:30.
3. Acción: **Iniciar un programa**
   - Programa: `node`
   - Argumentos: `digest.js`
   - Iniciar en: `D:\Personal\Visual Studio Code\Resumen_Prensa`
4. Requiere que el PC esté encendido a esa hora.

## Archivos
- `digest.js` — el programa principal.
- `feeds.json` — tus fuentes RSS por tema.
- `.env` — tus claves (NO compartir).
- `output/` — resúmenes (HTML) y datos del día (JSON).

## Notas legales
Se trabaja solo con titulares/extractos/enlaces de RSS públicos. No se almacenan ni
reenvían los textos completos de los medios.
