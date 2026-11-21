// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages publica el sitio en https://standleymoise.github.io/ckoido-astro/.
// Con un dominio propio: SITE_URL=https://ckoido.com BASE_PATH=/ (variables de entorno del build).
// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://standleymoise.github.io',
  base: process.env.BASE_PATH ?? '/ckoido-astro',
});
