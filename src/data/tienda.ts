// Catálogo de la tienda WooCommerce (modo e-commerce).
//
// Si PUBLIC_TIENDA_URL tiene la URL de un WordPress + WooCommerce
// (p. ej. https://tienda.taxlockedwallet.com), Astro lee los productos de su
// Store API pública al compilar: precios, fotos y stock salen de WooCommerce.
// El carrito, el checkout y el pago siguen ocurriendo en WooCommerce.
//
// Sin esa variable (GitHub Pages) el sitio funciona como antes: los botones
// «Comprar ahora» llevan a «Dónde comprar».

/** URL de la tienda sin la barra final, o "" si el modo tienda está apagado. */
export const tiendaUrl = (import.meta.env.PUBLIC_TIENDA_URL ?? '').trim().replace(/\/+$/, '');
export const tiendaActiva = tiendaUrl !== '';

export interface Producto {
  id: number;
  sku: string;
  nombre: string;
  resumen: string;
  precio: string;
  enStock: boolean;
  imagen?: { src: string; alt: string };
  /** Agrega el producto al carrito de WooCommerce y abre el carrito. */
  comprarUrl: string;
  /** Ficha del producto en la tienda. */
  fichaUrl: string;
}

interface StoreApiProducto {
  id: number;
  sku: string;
  name: string;
  permalink: string;
  short_description: string;
  is_purchasable: boolean;
  is_in_stock: boolean;
  images: { src: string; alt: string }[];
  prices: { price: string; currency_code: string; currency_minor_unit: number };
}

const sinHtml = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** «6500» en unidades menores → «₡6 500» con el formato de Costa Rica. */
export const formatoPrecio = (valor: string, moneda: string, decimales: number) =>
  new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
  }).format(Number(valor) / 10 ** decimales);

const aProducto = (p: StoreApiProducto): Producto => ({
  id: p.id,
  sku: p.sku,
  nombre: p.name,
  resumen: sinHtml(p.short_description),
  precio: formatoPrecio(p.prices.price, p.prices.currency_code, p.prices.currency_minor_unit),
  enStock: p.is_purchasable && p.is_in_stock,
  imagen: p.images[0] ? { src: p.images[0].src, alt: p.images[0].alt || p.name } : undefined,
  // WooCommerce está configurado para ir al carrito después de agregar.
  comprarUrl: `${tiendaUrl}/?add-to-cart=${p.id}`,
  fichaUrl: p.permalink,
});

let cache: Promise<Producto[]> | undefined;

/** Todos los productos publicados. Una sola petición por compilación. */
export function getProductos(): Promise<Producto[]> {
  if (!tiendaActiva) return Promise.resolve([]);
  cache ??= fetch(`${tiendaUrl}/wp-json/wc/store/v1/products?per_page=100&orderby=title&order=asc`).then(
    async (r) => {
      // Si la tienda no responde, la compilación falla a propósito:
      // así no se publica un sitio sin precios y queda la versión anterior.
      if (!r.ok) throw new Error(`La tienda respondió ${r.status} en ${r.url}`);
      return ((await r.json()) as StoreApiProducto[]).map(aProducto);
    },
  );
  return cache;
}

/** Producto por SKU (los SKU de WooCommerce: ck-oido, ck-oido-suave, sincerax). */
export async function getProducto(sku: string) {
  return (await getProductos()).find((p) => p.sku === sku);
}
