// Datos compartidos del sitio (rutas, menú, redes, farmacias).
import { tiendaActiva } from './tienda';

/** Prefijo del sitio (p. ej. "/ckoido-astro" en GitHub Pages, "" en un dominio propio). */
export const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Convierte una ruta absoluta del sitio ("/nosotros", "/img/x.svg") en una URL con el prefijo. */
export const url = (path: string) => (path.startsWith('/') ? `${base}${path}` : path);

export const rutas = {
  inicio: url('/'),
  nosotros: url('/nosotros'),
  dondeComprar: url('/nosotros#donde-comprar'),
  producto: url('/nuestro-producto'),
  sincerax: url('/nuestro-producto/sincerax'),
  otitis: url('/otitis-externa'),
  regCertPol: url('/reg-cert-pol'),
  blog: url('/blog'),
  contacto: url('/contacto'),
  tienda: url('/productos'),
  favoritos: url('/favoritos'),
};

/** Destino de los botones «Comprar ahora»: la tienda (el inicio) si está activa, si no «Dónde comprar». */
export const comprarHref = tiendaActiva ? rutas.inicio : rutas.dondeComprar;

/** En modo tienda: abre la tienda con ese producto primero (sin salir del sitio). */
export const comprarProducto = (sku: string) => `${rutas.inicio}#${encodeURIComponent(sku)}`;

export const menu = [
  { label: 'Inicio', href: rutas.inicio },
  { label: 'Nosotros', href: rutas.nosotros },
  { label: 'Nuestro producto', href: rutas.producto },
  { label: 'Otitis externa', href: rutas.otitis },
  { label: 'REG.CERT.POL.', href: rutas.regCertPol },
  { label: 'Blog', href: rutas.blog },
  { label: 'Contacto', href: rutas.contacto },
];

export const menuFooter = [
  { label: 'Inicio', href: rutas.inicio },
  { label: 'Nosotros', href: rutas.nosotros },
  { label: 'Nuestros productos', href: rutas.producto },
  { label: 'Otitis externa', href: rutas.otitis },
  { label: 'REG.CERT.POL.', href: rutas.regCertPol },
  { label: 'Contacto', href: rutas.contacto },
  { label: 'Blog', href: rutas.blog },
];

// TODO: reemplazar "#" por las URLs reales de las redes de CK Oído.
export const redes = [
  { label: 'Facebook', icon: url('/img/red-facebook.svg'), href: '#' },
  { label: 'Instagram', icon: url('/img/red-instagram.svg'), href: '#' },
  { label: 'WhatsApp', icon: url('/img/red-whatsapp.svg'), href: '#' },
];

export const farmacias = [
  { nombre: 'Farmacia Santa Lucía', telefono: '+506 8711 0404' },
  { nombre: 'Farmacia Sucre', telefono: '+506 8646 5050' },
];

export const direccion = 'Roleisa Farmacéutica S.A. San José, Costa Rica';

export const telHref = (tel: string) => `tel:${tel.replace(/\s+/g, '')}`;

/** Marca como activo el ítem del menú para la ruta actual (incluye subrutas). */
export const isActive = (href: string, path: string) => {
  const sinBase = (p: string) => (base && p.startsWith(base) ? p.slice(base.length) || '/' : p);
  const clean = (p: string) => (p.length > 1 ? p.replace(/\/$/, '') : p);
  const h = clean(sinBase(href.split('#')[0]));
  const p = clean(sinBase(path));
  return h === '/' ? p === '/' : p === h || p.startsWith(h + '/');
};
