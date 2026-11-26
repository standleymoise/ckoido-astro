// Manifiesto de la app instalable (nombre, colores, íconos y, en modo tienda, accesos directos).
import type { APIRoute } from 'astro';
import { app } from '../data/pwa';
import { url, rutas } from '../data/sitio';
import { tiendaActiva } from '../data/tienda';

export const GET: APIRoute = () => {
  const manifiesto = {
    id: url('/'),
    name: app.nombre,
    short_name: app.nombreCorto,
    description: app.descripcion,
    lang: 'es-CR',
    start_url: url('/'),
    scope: url('/'),
    display: 'standalone',
    orientation: 'portrait',
    background_color: app.fondo,
    theme_color: app.tema,
    categories: ['shopping'],
    icons: [
      { src: url('/iconos/icono-192.png'), sizes: '192x192', type: 'image/png' },
      { src: url('/iconos/icono-512.png'), sizes: '512x512', type: 'image/png' },
      { src: url('/iconos/maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: tiendaActiva
      ? [
          { name: 'Mis favoritos', url: rutas.favoritos },
          { name: 'Mi cuenta', url: rutas.cuenta },
          { name: 'Todos los productos', url: rutas.tienda },
        ]
      : [
          { name: 'Productos', url: rutas.tienda },
          { name: 'Blog', url: rutas.blog },
        ],
  };
  return new Response(JSON.stringify(manifiesto, null, 2), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  });
};
