// App instalable (PWA): nombre, colores e íconos PNG generados al compilar desde public/favicon.svg.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const app = {
  nombre: 'CK Oído',
  nombreCorto: 'CK Oído',
  descripcion: 'Gotas para secar el agua atrapada en el oído y prevenir infecciones del oído externo.',
  icono: 'favicon.svg',
  /** Fondo detrás de la gota en los íconos de Android/iPhone. */
  fondoIcono: '#ffffff',
  /** Fondo mientras abre la app y color de la barra. */
  fondo: '#ffffff',
  tema: '#0a4383',
  /** Prefijo de la caché del service worker. */
  prefijo: 'ckoido',
};

export const iconos = {
  'icono-192': { tam: 192, borde: 0.12 },
  'icono-512': { tam: 512, borde: 0.12 },
  // «maskable»: Android lo recorta en círculo o gota; el dibujo va dentro de la zona segura.
  'maskable-512': { tam: 512, borde: 0.22 },
  // iPhone / iPad (pantalla de inicio).
  'apple-180': { tam: 180, borde: 0.15 },
} as const;
export type NombreIcono = keyof typeof iconos;

/** PNG cuadrado: la gota centrada sobre el fondo. */
export async function iconoPng(nombre: NombreIcono): Promise<Uint8Array> {
  const { default: sharp } = await import('sharp');
  const { tam, borde } = iconos[nombre];
  const origen = await readFile(join(process.cwd(), 'public', app.icono));
  const interior = Math.round(tam * (1 - 2 * borde));
  const dibujo = await sharp(origen, { density: 600 })
    .resize(interior, interior, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const pos = Math.round((tam - interior) / 2);
  const salida = await sharp({ create: { width: tam, height: tam, channels: 4, background: app.fondoIcono } })
    .composite([{ input: dibujo, top: pos, left: pos }])
    .png()
    .toBuffer();
  return new Uint8Array(salida);
}
