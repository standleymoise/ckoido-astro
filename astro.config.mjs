// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// GitHub Pages publica el sitio en https://standleymoise.github.io/ckoido-astro/.
// Con un dominio propio: SITE_URL=https://ckoido.com BASE_PATH=/ (variables de entorno del build).
// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://standleymoise.github.io',
  base: process.env.BASE_PATH ?? '/ckoido-astro',
  // Permite que los artículos del panel usen imágenes por URL (https):
  // Astro las descarga al construir y las optimiza igual que las locales.
  image: {
    remotePatterns: [{ protocol: 'https' }],
  },
  // Fuentes servidas desde el propio dominio (la página no le pide nada a Google al cargar),
  // con fuentes de respaldo ajustadas para que el texto no «salte».
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--fuente-texto',
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Sarabun',
      cssVariable: '--fuente-titulos',
      weights: [500, 800],
      styles: ['normal'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
  ],
  // Al pasar el mouse por un enlace, la página siguiente se descarga antes del clic.
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  integrations: [
    // sitemap-index.xml con todas las páginas, menos las personales.
    sitemap({ filter: (pagina) => !/\/(favoritos|cuenta)\/?$/.test(pagina) }),
  ],
});
