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
  slug: string;
  /** Categorías y etiquetas de WooCommerce: el swipe se puede filtrar por ellas (banners, ?categoria=). */
  categorias: { slug: string; nombre: string }[];
  etiquetas: { slug: string; nombre: string }[];
  nombre: string;
  resumen: string;
  /** Descripción larga, en párrafos de texto plano. */
  descripcion: string[];
  precio: string;
  /** Precio como número decimal («6500») y moneda ISO («CRC»), para los datos estructurados. */
  precioNumero: string;
  moneda: string;
  enStock: boolean;
  /** «50 disponibles», «Agotado»… tal como lo dice WooCommerce. */
  stockTexto: string;
  imagen?: { src: string; alt: string };
  imagenes: { src: string; alt: string }[];
  /** Agrega el producto al carrito de WooCommerce y abre el carrito. */
  comprarUrl: string;
  /** Ficha del producto en la tienda. */
  fichaUrl: string;
}

interface StoreApiProducto {
  id: number;
  sku: string;
  slug: string;
  categories?: { slug: string; name: string }[];
  tags?: { slug: string; name: string }[];
  name: string;
  permalink: string;
  short_description: string;
  description: string;
  stock_availability?: { text: string };
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

const parrafos = (html: string) =>
  html
    .split(/<\/p>|<br\s*\/?>|\n{2,}/i)
    .map(sinHtml)
    .filter(Boolean);

const aProducto = (p: StoreApiProducto): Producto => ({
  id: p.id,
  sku: p.sku,
  slug: p.slug,
  categorias: (p.categories ?? []).map((c) => ({ slug: c.slug, nombre: sinHtml(c.name) })),
  etiquetas: (p.tags ?? []).map((c) => ({ slug: c.slug, nombre: sinHtml(c.name) })),
  nombre: p.name,
  resumen: sinHtml(p.short_description),
  descripcion: parrafos(p.description),
  precio: formatoPrecio(p.prices.price, p.prices.currency_code, p.prices.currency_minor_unit),
  precioNumero: (Number(p.prices.price) / 10 ** p.prices.currency_minor_unit).toFixed(p.prices.currency_minor_unit),
  moneda: p.prices.currency_code,
  enStock: p.is_purchasable && p.is_in_stock,
  stockTexto: p.stock_availability?.text || (p.is_in_stock ? 'Disponible' : 'Agotado'),
  imagen: p.images[0] ? { src: p.images[0].src, alt: p.images[0].alt || p.name } : undefined,
  imagenes: p.images.map((i) => ({ src: i.src, alt: i.alt || p.name })),
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

/** Base de la Store API, para el carrito y el checkout desde el navegador. */
export const storeApiUrl = tiendaActiva ? `${tiendaUrl}/wp-json/wc/store/v1` : '';

/** Producto por SKU de WooCommerce. */
export async function getProducto(sku: string) {
  return (await getProductos()).find((p) => p.sku === sku);
}
