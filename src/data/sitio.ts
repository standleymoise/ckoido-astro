// Datos compartidos del sitio (menú, redes, farmacias).
// Las rutas que aún no existen apuntan a "#": cambiar cuando se construyan esas páginas.

export const menu = [
  { label: 'Inicio', href: '#' },
  { label: 'Nosotros', href: '#' },
  { label: 'Nuestro producto', href: '#' },
  { label: 'Otitis externa', href: '#' },
  { label: 'REG.CERT.POL.', href: '/' },
  { label: 'Blog', href: '#' },
  { label: 'Contacto', href: '#' },
];

export const menuFooter = [
  { label: 'Inicio', href: '#' },
  { label: 'Nosotros', href: '#' },
  { label: 'Nuestros productos', href: '#' },
  { label: 'Otitis externa', href: '#' },
  { label: 'REG.CERT.POL.', href: '/' },
  { label: 'Contacto', href: '#' },
  { label: 'Blog', href: '#' },
];

export const redes = [
  { label: 'Facebook', icon: '/img/red-facebook.svg', href: '#' },
  { label: 'Instagram', icon: '/img/red-instagram.svg', href: '#' },
  { label: 'WhatsApp', icon: '/img/red-whatsapp.svg', href: '#' },
];

export const farmacias = [
  { nombre: 'Farmacia Santa Lucia', telefono: '+506 8711 0404' },
  { nombre: 'Farmacia Sucre', telefono: '+506 8646 5050' },
];

export const telHref = (tel: string) => `tel:${tel.replace(/\s+/g, '')}`;
