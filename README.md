# 🎶 Amigo Invisible · Ciclo de Conciertos UAP

Aplicación web para sortear el Amigo Invisible de un grupo grande (~50 personas) con **un único link**, diseñada con la estética nocturna del *Ciclo de Conciertos UAP* (azul marino, reflectores azul eléctrico y detalles dorados).

## ✨ Características principales

- **Accesible desde teléfono y computadora:** grilla adaptable, buscador instantáneo, *bottom sheet* en celular y modal en escritorio.
- **Acceso con PIN de 4 dígitos:** cada participante busca su nombre, crea su PIN la primera vez y puede volver a consultar quién le tocó todas las veces que quiera.
- **Revelación interactiva:** caja de regalo animada que se abre con confetti dorado/azul y muestra un ticket de gala con el nombre asignado.
- **Área de organizador oculta y blindada (`/#organizador`):**
  - No hay ningún botón de "Soy el organizador" en la vista pública.
  - Si todavía no se creó el sorteo, los participantes ven una pantalla de espera (*"El telón todavía no se abrió"*).
  - Solo quien entra a `/#organizador` con la **clave maestra (`ADMIN_KEY`)** configurada en el servidor puede crear el sorteo, ver quién ya entró, resetear PINs olvidados o borrar el sorteo.
  - **Cero spoilers:** el servidor cifra las asignaciones (`AES-256-GCM`) y jamás envía el mapa de parejas al navegador ni al panel del organizador.
- **Plan B visual incluido:** desde la barra superior del modo organizador podés alternar entre el **fondo con la foto del escenario desenfocada** o **solo luces de escenario** (también configurable en 1 línea en `public/styles.css` cambiando `--hero-photo: none;`).

---

## 💻 Probar en tu PC

```bash
npm start        # levanta en http://localhost:3000
npm test         # corre los tests automáticos
```

- **Vista de participantes:** `http://localhost:3000/`
- **Vista de organizador (secreta):** `http://localhost:3000/#organizador` (en tu PC la clave maestra por defecto es `admin`, o la que definas en la variable `ADMIN_KEY`).

---

## 🚀 Cómo publicarlo en Vercel (paso a paso)

1. **Importar el repositorio en Vercel:**
   - Entrá a [vercel.com](https://vercel.com) → **Add New… → Project** → elegí el repositorio `AmirCNet/AmigoInv`.
   - En *Framework Preset* dejá **Other** y tocá **Deploy**.
2. **Conectar la base de datos gratuita (Upstash Redis):**
   - Dentro de tu proyecto en Vercel, andá a la pestaña **Storage** → **Create Database (o Marketplace)** → elegí **Upstash (Serverless Redis)** → plan **Free** → **Connect to Project**.
   - Esto inyecta automáticamente las variables `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` (o `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
3. **Configurar tu Clave Maestra (`ADMIN_KEY`) y Secreto (`APP_SECRET`):**
   - En Vercel, andá a **Settings → Environment Variables** y agregá:
     - `ADMIN_KEY`: la contraseña secreta que vas a usar vos cuando entres a `https://tu-link.vercel.app/#organizador`.
     - `APP_SECRET`: cualquier frase larga aleatoria para cifrar los resultados en la base de datos.
4. **Redeploy:**
   - Andá a la pestaña **Deployments**, tocá los tres puntitos `⋯` del último deploy y elegí **Redeploy** para que tome las variables nuevas.
5. **Crear el sorteo:**
   - Entrá a `https://tu-link.vercel.app/#organizador`, poné tu `ADMIN_KEY`, pegá los 50 nombres, cargá las exclusiones si hace falta y tocá **Abrir el telón y sortear**.
   - Compartí el link principal (`https://tu-link.vercel.app/`) en el grupo de WhatsApp.
