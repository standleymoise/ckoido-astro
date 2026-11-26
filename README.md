# CK Oído — sitio web (Astro)

**Tindershop**: tienda en la que se compra deslizando tarjetas, construida con [Astro](https://astro.build) y WooCommerce (Store API).

**Sitio publicado:** https://standleymoise.github.io/tindershop/

## Publicación (GitHub Pages)

Cada push a `main` construye y publica el sitio con `.github/workflows/deploy.yml`.
El sitio vive en el subdirectorio `/tindershop`, así que todas las rutas internas y
archivos de `public/` se escriben con `url('/ruta')` de `src/data/sitio.ts`.

Para un dominio propio: configurarlo en *Settings → Pages* del repo y definir en el
workflow las variables `SITE_URL=https://dominio` y `BASE_PATH=/`.

## Prueba de e-commerce (Hostinger + WooCommerce)

El mismo código se publica también en modo tienda:

| Pieza | Dónde |
|---|---|
| Frontend (Astro) | https://taxlockedwallet.com/ |
| Backend (WordPress + WooCommerce) | https://tienda.taxlockedwallet.com/ (admin en `/wp-admin`) |

- `PUBLIC_TIENDA_URL` activa el modo tienda (`src/data/tienda.ts`). Al compilar, Astro lee la
  Store API pública de WooCommerce (`/wp-json/wc/store/v1/products`, sin claves): nombre, precio,
  foto y stock.
- **El inicio es solo una tienda con tarjetas deslizables**, a pantalla completa y sin header ni footer (`src/components/tienda/TiendaSwipe.astro`):
  → derecha agrega al carrito, ← izquierda pasa, ↑ arriba guarda en favoritos, ↓ abajo abre el
  detalle (también con botones y flechas del teclado). El carrito (panel lateral) y el checkout
  usan la Store API desde el navegador con el encabezado `Cart-Token`: el visitante **nunca sale
  de taxlockedwallet.com**. Los favoritos se guardan en el navegador. WooCommerce solo permite
  CORS desde su propio dominio, así que el carrito no funciona desde `localhost`.
- **`/favoritos`**: los productos guardados con ↑ (2 columnas en celular), con precio y stock en
  vivo, «Agregar al carrito» (mismo carrito) y «Quitar». Se abre con la ★ de la barra de la tienda.
  El cliente de la Store API compartido está en `src/scripts/tienda-api.ts`.
- **`/cuenta`**: iniciar sesión, crear cuenta, recuperar contraseña y «Mi cuenta» (avatar con
  iniciales, pedidos con su estado y datos de entrega editables). Usa el plugin
  `wordpress/mu-plugins/tindershop-cuenta.php` (token propio `X-Tindershop-Token`, 30 días). Con sesión,
  la barra de la tienda muestra las iniciales, el checkout se llena solo y el pedido queda en la
  cuenta del cliente. Los plugins de `wordpress/` se suben a mano al servidor (ver `wordpress/README.md`).
- Se genera `/productos` (catálogo; no `/tienda`, porque en Hostinger esa carpeta es la del subdominio) y las fichas de producto muestran el precio. «Comprar ahora»
  abre la tienda del inicio con ese producto primero (`/#sku`).
- Las fichas se enlazan por **SKU**: `ck-oido`, `ck-oido-suave`, `sincerax`.
- `.github/workflows/deploy-hostinger.yml` compila con `BASE_PATH=/` y publica `dist/` en la
  rama `hostinger`; hPanel → Avanzado → GIT la clona en `public_html` con despliegue automático.
- **Precios y stock en vivo:** la página trae el catálogo de la última compilación (carga
  instantánea) y al abrirse lo compara con WooCommerce: precio, stock, nombre, fotos, productos
  nuevos y borrados se actualizan solos. El carrito y el checkout siempre usan el precio actual
  porque los calcula WooCommerce. Las fichas de producto (`/nuestro-producto`) y `/productos`
  muestran el precio de la última compilación (push a `main` o Actions → Run workflow).
- Sin `PUBLIC_TIENDA_URL` (GitHub Pages) todo sigue como antes: no hay `/productos` y los botones
  llevan a «Dónde comprar».

## Comandos

| Comando           | Qué hace                                   |
| :---------------- | :----------------------------------------- |
| `npm install`     | Instala dependencias                       |
| `npm run dev`     | Servidor local en `http://localhost:4321`  |
| `npm run build`   | Genera el sitio estático en `./dist/`      |
| `npm run preview` | Sirve `./dist/` para revisarlo             |

## Páginas

| Ruta                          | Contenido                                  |
| :---------------------------- | :----------------------------------------- |
| `/`                           | Inicio                                     |
| `/nosotros`                   | Nosotros + ¿Dónde comprar? (`#donde-comprar`) |
| `/nuestro-producto`           | CK Oído                                    |
| `/nuestro-producto/sincerax`  | Sincerax                                   |
| `/otitis-externa`             | Otitis externa                             |
| `/reg-cert-pol`               | Registro, certificación y política         |
| `/blog`, `/blog/<slug>`       | Blog (artículos en `src/content/blog/*.md`) |
| `/contacto`                   | Contacto                                   |

Menú, redes sociales, teléfonos y dirección: `src/data/sitio.ts`.

## Panel de contenido del blog (/admin)

El blog se edita desde **https://standleymoise.github.io/tindershop/admin/** con
[Sveltia CMS](https://sveltiacms.app) (compatible con Decap CMS; configuración en `public/admin/config.yml`).

**Para entrar:**

1. Crear un token de GitHub (una sola vez, por persona):
   *GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*.
   - Repository access: *Only select repositories* → `tindershop`.
   - Permissions → Repository: **Contents: Read and write** (Metadata se agrega sola).
   - El botón del panel abre esa página de GitHub con los permisos ya marcados.
2. En `/admin`, «Iniciar sesión con un token de acceso» y pegar el token. Queda guardado en ese navegador.

**Qué pasa al guardar:** el panel hace un commit en `main` con el artículo (`src/content/blog/<slug>.md`)
y su imagen (`src/assets/blog/`), y GitHub Actions vuelve a publicar el sitio en 1-2 minutos.

La persona necesita acceso de escritura al repo (colaboradora en GitHub). En local (`npm run dev`)
el panel está en `http://localhost:4321/tindershop/admin/index.html` y permite «Trabajar con un repositorio local».

## Formularios (Formspree)

Los formularios de **Contacto** y **Boletín** envían a [Formspree](https://formspree.io) sin salir de la página.

Ya están creados en la cuenta de Formspree (proyecto «CK Oído») y configurados por defecto en `src/data/formularios.ts`:
`CK Oído – Contacto` → `mgaklyon` y `CK Oído – Boletín` → `mvkabrzl`. Los mensajes se ven en el panel de Formspree y llegan al correo de la cuenta.

Para usar otros formularios:

1. Crear los dos formularios abriendo estos enlaces (piden iniciar sesión o crear la cuenta en Formspree, y crean el formulario con sus campos ya validados):
   - [Contacto](https://formspree.io/claim?name=CK+O%C3%ADdo+%E2%80%93+Contacto&project=CK+O%C3%ADdo&field.nombre=text,required,maxlength:100&field.apellidos=text,maxlength:100&field.email=email,required&field.telefono=text,maxlength:30&field.mensaje=text,required,maxlength:5000&field.formulario=text,maxlength:30)
   - [Boletín](https://formspree.io/claim?name=CK+O%C3%ADdo+%E2%80%93+Bolet%C3%ADn&project=CK+O%C3%ADdo&field.email=email,required&field.formulario=text,maxlength:30)
2. Copiar el ID del formulario: es la parte final de la URL `https://formspree.io/f/<ID>`.
3. Copiar `.env.example` como `.env` y completarlo (o definir las mismas variables en el hosting):

   ```env
   PUBLIC_FORMSPREE_CONTACTO=<ID>
   PUBLIC_FORMSPREE_BOLETIN=<ID>
   ```

4. Volver a ejecutar `npm run build` (los IDs se incluyen al construir el sitio).

Mientras no haya ID, los formularios muestran «Este formulario todavía no está configurado» al enviarlos.
Cada envío incluye un asunto, un campo `formulario` («Contacto» o «Boletín») para distinguirlos y la trampa anti-spam `_gotcha`.

## Tienda 3D (segunda experiencia)

Además de las tarjetas, el sitio tiene una tienda 3D que se recorre caminando (Three.js), en
`/tienda-3d/`. En WordPress, **Ajustes → Tindershop** elige cuál se muestra en el inicio; la otra queda en
su dirección (`/tienda-3d/` o `/tarjetas/`). Para probar la 3D como inicio sin tocar WordPress:
`EXPERIENCIA=3d npm run build`.

- Código: `src/components/tienda3d/Tienda3D.astro` (interfaz), `src/scripts/tienda3d/` (escena, personaje, motor).
- Cámaras en tercera y primera persona (misma posición y orientación: cambiar no reinicia el recorrido),
  colisiones con las góndolas, la cámara de tercera persona no atraviesa estanterías.
- Computadora: WASD/flechas, mouse, clic o E, C (cámara), Shift (correr), rueda (zoom).
  Celular: joystick, arrastrar para mirar, tocar producto, pellizcar (zoom). VR (WebXR): gatillo sobre
  un producto lo agrega; sobre el piso, teletransporte; sticks para caminar y girar.
- Caminar realista: W/S adelante y atrás (retrocede sin darse vuelta), A/D o el mouse giran al
  comprador y la cámara lo sigue. El comprador tiene cara y empuja un carrito 3D que muestra lo que hay en
  el carrito real de WooCommerce.
- Levantar un producto: al elegirlo (clic, toque o E) el comprador lo toma del estante y lo tiene en la mano;
  se lo da vuelta arrastrando y se ven sus datos. «Devolver al estante» lo vuelve a su lugar; «Al carrito»
  lo deja caer en el carrito y lo agrega a WooCommerce.
- Letreros de pasillo colgados del techo: «PASILLO N» y las categorías del pasillo, o el texto escrito en
  WordPress (Ajustes → Tindershop → Letreros de los pasillos, una línea por pasillo).
- Personas con proporciones reales (codos, rodillas, manos, zapatos, peinados, tonos de piel), distintas
  para cada comprador (número guardado en el navegador).
- Multijugador: cada comprador ve a los demás (con su carrito) y no se pueden atravesar. Usa WordPress
  (`POST /wp-json/tindershop/v1/presencia`, cada ~1 s, sin datos personales); para cientos de personas a la
  vez conviene un servicio de WebSocket (solo cambia `src/scripts/tienda3d/presencia.ts`).
- «Ir a pagar»: el comprador camina solo con su carrito hasta la caja (hay un cajero); ahí «Pagar ahora»
  manda al checkout de siempre (`/tarjetas/#carrito`).
- Exhibición por categoría (WordPress → Productos → Categorías → «Exhibición en la tienda 3D»): góndola,
  perchero (ropa colgada), maniquí, estante (ropa doblada) o exhibidor (pantalla de la entrada, junto con los
  productos destacados de WooCommerce). Para probar sin WordPress: `EXHIBICIONES='{"ropa":"perchero"}'`.
- Rendimiento: geometría simple (sin modelos que descargar), InstancedMesh por producto, fotos de 384 px
  copiadas al sitio al compilar y cargadas de a poco, sombras solo en equipos potentes, Three.js se
  descarga recién al entrar. `?depurar` deja el motor en `window.tienda3d` para pruebas.
