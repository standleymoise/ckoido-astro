# CK Oído — sitio web (Astro)

Sitio de CK Oído construido con [Astro](https://astro.build) a partir del diseño en Figma «CKOIDO».

**Sitio publicado:** https://standleymoise.github.io/ckoido-astro/

## Publicación (GitHub Pages)

Cada push a `main` construye y publica el sitio con `.github/workflows/deploy.yml`.
El sitio vive en el subdirectorio `/ckoido-astro`, así que todas las rutas internas y
archivos de `public/` se escriben con `url('/ruta')` de `src/data/sitio.ts`.

Para un dominio propio: configurarlo en *Settings → Pages* del repo y definir en el
workflow las variables `SITE_URL=https://dominio` y `BASE_PATH=/`.

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

El blog se edita desde **https://standleymoise.github.io/ckoido-astro/admin/** con
[Sveltia CMS](https://sveltiacms.app) (compatible con Decap CMS; configuración en `public/admin/config.yml`).

**Para entrar:**

1. Crear un token de GitHub (una sola vez, por persona):
   *GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*.
   - Repository access: *Only select repositories* → `ckoido-astro`.
   - Permissions → Repository: **Contents: Read and write** (Metadata se agrega sola).
   - El botón del panel abre esa página de GitHub con los permisos ya marcados.
2. En `/admin`, «Iniciar sesión con un token de acceso» y pegar el token. Queda guardado en ese navegador.

**Qué pasa al guardar:** el panel hace un commit en `main` con el artículo (`src/content/blog/<slug>.md`)
y su imagen (`src/assets/blog/`), y GitHub Actions vuelve a publicar el sitio en 1-2 minutos.

La persona necesita acceso de escritura al repo (colaboradora en GitHub). En local (`npm run dev`)
el panel está en `http://localhost:4321/ckoido-astro/admin/index.html` y permite «Trabajar con un repositorio local».

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
