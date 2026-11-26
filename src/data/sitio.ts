// Datos compartidos del sitio (marca, rutas, menú, redes).
import { tiendaActiva } from './tienda';

/** La marca del sitio: un solo lugar para el nombre y los textos que la describen. */
export const marca = {
  nombre: 'Tindershop',
  lema: 'Comprá deslizando',
  descripcion:
    'Tindershop: la tienda en la que se compra deslizando. Derecha para el carrito, arriba para favoritos, izquierda para pasar.',
  dominio: 'taxlockedwallet.com',
  color: '#0a4383',
  acento: '#ed2853',
};

/** Prefijo del sitio (p. ej. "/repo" en GitHub Pages, "" en un dominio propio). */
export const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Convierte una ruta absoluta del sitio ("/nosotros", "/img/x.svg") en una URL con el prefijo. */
export const url = (path: string) => (path.startsWith('/') ? `${base}${path}` : path);

export const rutas = {
  inicio: url('/'),
  nosotros: url('/nosotros'),
  blog: url('/blog'),
  contacto: url('/contacto'),
  // Sin tienda conectada (vista previa) no hay lista de productos: los botones van a Contacto.
  tienda: tiendaActiva ? url('/productos') : url('/contacto'),
  favoritos: url('/favoritos'),
  cuenta: url('/cuenta'),
};

/** Destino de los botones «Comprar ahora»: la tienda con tarjetas (el inicio) o la lista de productos. */
export const comprarHref = tiendaActiva ? rutas.inicio : rutas.tienda;

/** En modo tienda: abre la tienda con ese producto primero (sin salir del sitio). */
export const comprarProducto = (sku: string) => `${rutas.inicio}#${encodeURIComponent(sku)}`;

export const menu = [
  { label: 'Inicio', href: rutas.inicio },
  ...(tiendaActiva ? [{ label: 'Productos', href: rutas.tienda }] : []),
  { label: 'Nosotros', href: rutas.nosotros },
  { label: 'Blog', href: rutas.blog },
  { label: 'Contacto', href: rutas.contacto },
];

export const menuFooter = [
  { label: 'Inicio', href: rutas.inicio },
  ...(tiendaActiva ? [{ label: 'Productos', href: rutas.tienda }] : []),
  { label: 'Nosotros', href: rutas.nosotros },
  { label: 'Blog', href: rutas.blog },
  { label: 'Contacto', href: rutas.contacto },
];

// TODO: reemplazar "#" por las URLs reales de las redes de Tindershop.
export const redes = [
  { label: 'Facebook', icon: url('/img/red-facebook.svg'), href: '#' },
  { label: 'Instagram', icon: url('/img/red-instagram.svg'), href: '#' },
  { label: 'WhatsApp', icon: url('/img/red-whatsapp.svg'), href: '#' },
];

export const direccion = 'San José, Costa Rica';

export const telHref = (tel: string) => `tel:${tel.replace(/\s+/g, '')}`;

/** Marca como activo el ítem del menú para la ruta actual (incluye subrutas). */
export const isActive = (href: string, path: string) => {
  const sinBase = (p: string) => (base && p.startsWith(base) ? p.slice(base.length) || '/' : p);
  const clean = (p: string) => (p.length > 1 ? p.replace(/\/$/, '') : p);
  const h = clean(sinBase(href.split('#')[0]));
  const p = clean(sinBase(path));
  return h === '/' ? p === '/' : p === h || p.startsWith(h + '/');
};
