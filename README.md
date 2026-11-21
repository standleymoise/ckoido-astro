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
