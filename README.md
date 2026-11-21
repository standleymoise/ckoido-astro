# CK Oído — sitio web (Astro)

Sitio de CK Oído construido con [Astro](https://astro.build) a partir del diseño en Figma «CKOIDO».

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

## Formularios (Formspree)

Los formularios de **Contacto** y **Boletín** envían a [Formspree](https://formspree.io) sin salir de la página.

1. Crear una cuenta en Formspree y un formulario (o dos: uno para contacto y otro para el boletín).
2. Copiar el ID del formulario: es la parte final de la URL `https://formspree.io/f/<ID>`.
3. Copiar `.env.example` como `.env` y completarlo (o definir las mismas variables en el hosting):

   ```env
   PUBLIC_FORMSPREE_CONTACTO=<ID>
   PUBLIC_FORMSPREE_BOLETIN=<ID>   # opcional: si se deja vacío, usa el de contacto
   ```

4. Volver a ejecutar `npm run build` (los IDs se incluyen al construir el sitio).

Mientras no haya ID, los formularios muestran «Este formulario todavía no está configurado» al enviarlos.
Cada envío incluye un asunto, un campo `formulario` («Contacto» o «Boletín») para distinguirlos y la trampa anti-spam `_gotcha`.
