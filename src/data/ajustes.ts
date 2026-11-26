// Ajustes de la tienda que el dueño elige en WordPress (plugin wordpress/mu-plugins/tindershop-ajustes.php).
// Se leen al compilar; al cambiarlos, WordPress pide un build nuevo y el sitio se actualiza en 1–2 minutos.
//   Ajustes → Tindershop:            qué ve el cliente al entrar (tarjetas o tienda 3D).
//   Productos → Categorías → editar: cómo se exhibe cada categoría en la tienda 3D.
//   Productos → estrella «destacado»: aparece en el exhibidor de la entrada de la tienda 3D.
import { tiendaUrl, tiendaActiva } from './tienda';

export type Experiencia = 'tarjetas' | '3d';
export type Exhibicion = 'gondola' | 'perchero' | 'maniqui' | 'estante' | 'exhibidor';

export type Cancion = { url: string; titulo: string };
type Ajustes = {
  experiencia: Experiencia;
  exhibiciones: Record<string, Exhibicion>;
  /** Productos con exhibición propia: { id: tipo }. */
  exhibicionesProducto: Record<string, Exhibicion>;
  pasillos: string[];
  musica: Cancion[];
  sinMusica: boolean;
};
const TIPOS: Exhibicion[] = ['gondola', 'perchero', 'maniqui', 'estante', 'exhibidor'];

let cache: Promise<Ajustes> | undefined;

function getAjustes(): Promise<Ajustes> {
  const vacio: Ajustes = { experiencia: 'tarjetas', exhibiciones: {}, exhibicionesProducto: {}, pasillos: [], musica: [], sinMusica: false };
  if (!tiendaActiva) return Promise.resolve(vacio);
  cache ??= fetch(`${tiendaUrl}/wp-json/tindershop/v1/ajustes`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d): Ajustes => {
      if (!d) return vacio;
      const exhibiciones: Record<string, Exhibicion> = {};
      for (const [slug, tipo] of Object.entries(d.exhibiciones ?? {})) {
        if (TIPOS.includes(tipo as Exhibicion)) exhibiciones[slug] = tipo as Exhibicion;
      }
      const exhibicionesProducto: Record<string, Exhibicion> = {};
      for (const [id, tipo] of Object.entries(d.exhibicionesProducto ?? {})) {
        if (/^\d+$/.test(id) && TIPOS.includes(tipo as Exhibicion)) exhibicionesProducto[id] = tipo as Exhibicion;
      }
      const experiencia: Experiencia = d.experiencia === '3d' ? '3d' : 'tarjetas';
      let pasillos: string[] = Array.isArray(d.pasillos) ? d.pasillos.map((l: unknown) => String(l ?? '').slice(0, 40)) : [];
      if (pasillos.every((l) => !l.trim())) pasillos = []; // campo vacío en WordPress = sin letreros escritos
      const musica: Cancion[] = Array.isArray(d.musica)
        ? d.musica
            .filter((c: { url?: unknown }) => typeof c?.url === 'string' && /^https?:\/\//.test(c.url))
            .map((c: { url: string; titulo?: unknown }) => ({ url: c.url, titulo: String(c.titulo ?? '').slice(0, 80) }))
        : [];
      return { experiencia, exhibiciones, exhibicionesProducto, pasillos, musica, sinMusica: d.sinMusica === true };
    })
    .catch(() => vacio);
  return cache;
}

/**
 * Qué ve el cliente en el inicio: las tarjetas deslizables o la tienda 3D.
 * EXPERIENCIA=3d (variable del build) la fuerza, para probar sin tocar WordPress.
 * Si el plugin no está o WordPress no responde: tarjetas (lo de siempre).
 */
export async function getExperiencia(): Promise<Experiencia> {
  const forzada = process.env.EXPERIENCIA;
  if (forzada === '3d' || forzada === 'tarjetas') return forzada;
  return (await getAjustes()).experiencia;
}

/**
 * Cómo se exhibe cada categoría en la tienda 3D ({ slug: tipo }; las que no están, en góndola).
 * EXHIBICIONES='{"ropa":"perchero"}' (variable del build) las fuerza, para probar sin tocar WordPress.
 */
export async function getExhibiciones(): Promise<Record<string, Exhibicion>> {
  if (process.env.EXHIBICIONES) {
    try {
      return JSON.parse(process.env.EXHIBICIONES);
    } catch {
      /* JSON mal escrito: se usa lo de WordPress */
    }
  }
  return (await getAjustes()).exhibiciones;
}

/** Productos con exhibición propia en la tienda 3D: { id: tipo }. Tiene prioridad sobre la categoría. */
export async function getExhibicionesProducto(): Promise<Record<string, Exhibicion>> {
  return (await getAjustes()).exhibicionesProducto;
}

/** IDs de los productos «destacados» de WooCommerce (la estrella en la lista de productos). */
export async function getDestacados(): Promise<number[]> {
  if (!tiendaActiva) return [];
  try {
    const r = await fetch(`${tiendaUrl}/wp-json/wc/store/v1/products?featured=true&per_page=12&_fields=id`);
    return r.ok ? ((await r.json()) as { id: number }[]).map((p) => p.id) : [];
  } catch {
    return [];
  }
}

/**
 * Letreros de los pasillos de la tienda 3D escritos a mano en WordPress (Ajustes → Tindershop), uno por
 * pasillo. Vacío (o una línea vacía) = el letrero muestra las categorías que hay en ese pasillo.
 */
export async function getPasillos(): Promise<string[]> {
  return (await getAjustes()).pasillos;
}

/** Música de la tienda 3D (Ajustes → Tindershop): canciones subidas por el dueño, o las de fábrica. */
export async function getMusica(): Promise<{ canciones: Cancion[]; apagada: boolean }> {
  const a = await getAjustes();
  return { canciones: a.musica, apagada: a.sinMusica };
}
