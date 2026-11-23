// Datos estructurados (schema.org) para Google: productos, migas y organización.
import type { Producto } from './tienda';

export const MARCA = 'CK Oído';
export const FABRICANTE = 'Roleisa Farmacéutica';

/** URL absoluta a partir de una ruta del sitio (ya con el prefijo). */
export const absoluta = (ruta: string, site: URL | undefined, actual: URL) => new URL(ruta, site ?? actual).href;

/** Product + Offer con el precio y la disponibilidad de WooCommerce (al compilar). */
export function productoLd(p: Producto, paginaUrl: string, descripcion?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.nombre,
    description: descripcion || p.resumen || p.descripcion.join(' '),
    sku: p.sku || undefined,
    image: p.imagenes.map((i) => i.src),
    url: paginaUrl,
    brand: { '@type': 'Brand', name: MARCA },
    manufacturer: { '@type': 'Organization', name: FABRICANTE },
    offers: {
      '@type': 'Offer',
      url: paginaUrl,
      price: p.precioNumero,
      priceCurrency: p.moneda,
      availability: p.enStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    },
  };
}

/** BreadcrumbList a partir de pares [nombre, URL absoluta]. */
export function migasLd(items: [string, string][]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
  };
}
