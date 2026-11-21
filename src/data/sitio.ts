// Datos compartidos del sitio (rutas, menú, redes, farmacias).

export const rutas = {
  inicio: '/',
  nosotros: '/nosotros',
  dondeComprar: '/nosotros#donde-comprar',
  producto: '/nuestro-producto',
  sincerax: '/nuestro-producto/sincerax',
  otitis: '/otitis-externa',
  regCertPol: '/reg-cert-pol',
  blog: '/blog',
  contacto: '/contacto',
};

/** Destino de todos los botones «Comprar ahora». */
export const comprarHref = rutas.dondeComprar;

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
  { label: 'Facebook', icon: '/img/red-facebook.svg', href: '#' },
  { label: 'Instagram', icon: '/img/red-instagram.svg', href: '#' },
  { label: 'WhatsApp', icon: '/img/red-whatsapp.svg', href: '#' },
];

export const farmacias = [
  { nombre: 'Farmacia Santa Lucia', telefono: '+506 8711 0404' },
  { nombre: 'Farmacia Sucre', telefono: '+506 8646 5050' },
];

export const direccion = 'Roleisa Farmaceutica SA. San José, Costa Rica';

export const telHref = (tel: string) => `tel:${tel.replace(/\s+/g, '')}`;

/** Marca como activo el ítem del menú para la ruta actual (incluye subrutas). */
export const isActive = (href: string, path: string) => {
  const clean = (p: string) => (p.length > 1 ? p.replace(/\/$/, '') : p);
  const h = clean(href.split('#')[0]);
  const p = clean(path);
  return h === '/' ? p === '/' : p === h || p.startsWith(h + '/');
};
