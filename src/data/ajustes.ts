// Ajustes de la tienda que el dueño elige en WordPress (Ajustes → Tindershop, plugin
// wordpress/mu-plugins/tindershop-ajustes.php). Se leen al compilar; al cambiarlos, WordPress pide
// un build nuevo y el sitio se actualiza en 1–2 minutos.
import { tiendaUrl, tiendaActiva } from './tienda';

export type Experiencia = 'tarjetas' | '3d';

let cache: Promise<Experiencia> | undefined;

/**
 * Qué ve el cliente en el inicio: las tarjetas deslizables o la tienda 3D.
 * EXPERIENCIA=3d (variable del build) la fuerza, para probar sin tocar WordPress.
 * Si el plugin no está o WordPress no responde: tarjetas (lo de siempre).
 */
export function getExperiencia(): Promise<Experiencia> {
  const forzada = process.env.EXPERIENCIA;
  if (forzada === '3d' || forzada === 'tarjetas') return Promise.resolve(forzada);
  if (!tiendaActiva) return Promise.resolve('tarjetas');
  cache ??= fetch(`${tiendaUrl}/wp-json/tindershop/v1/ajustes`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d?.experiencia === '3d' ? '3d' : 'tarjetas'))
    .catch(() => 'tarjetas' as const);
  return cache;
}
