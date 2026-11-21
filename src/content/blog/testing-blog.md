---
title: Testing blog
date: 2026-11-21
excerpt: |-
  El panel aparece en español sin configurar nada.
  Lista los 5 artículos del blog y permite crear, editar y borrar.
image: https://picsum.photos/id/371/1920/1280.webp
imageAlt: Test
---

**Lo que hace:**

- El panel aparece en español sin configurar nada.
- Lista los 5 artículos del blog y permite crear, editar y borrar.
- El formulario de cada artículo tiene título, fecha, resumen, imagen principal, descripción de la imagen y el contenido con editor visual.
- Las imágenes que se suben quedan en `src/assets/blog/` con el mismo formato que los artículos actuales, así Astro las sigue optimizando a WebP.
- Al guardar, el panel hace un commit en GitHub con un mensaje como «Blog: crear «mi-articulo»», y el sitio se vuelve a publicar solo en 1 o 2 minutos.
- Solo aparece la opción de entrar con token, porque el botón «Iniciar sesión con GitHub» necesita un servidor que GitHub Pages no tiene.
- Cambié el favicon del sitio (y el logo del panel) por la gota de CK Oído; antes era el logo de Astro. Si en tu navegador todavía ves el de Astro, es caché: se actualiza en unos minutos.
