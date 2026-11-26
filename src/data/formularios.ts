// Endpoints de Formspree para los formularios del sitio.
//
// Formularios por defecto (cuenta de Formspree del sitio):
//   Contacto → mgaklyon
//   Boletín  → mvkabrzl
// (Conviene renombrarlos a «Tindershop – …» en el panel de Formspree; el ID no cambia.)
// Los IDs no son secretos (van en el HTML). Para usar otros, definirlos en `.env`
// (ver `.env.example`) o en las variables de entorno del hosting y volver a hacer build:
//   PUBLIC_FORMSPREE_CONTACTO=abcdwxyz   ← ID del formulario de contacto
//   PUBLIC_FORMSPREE_BOLETIN=efghwxyz    ← ID del formulario del boletín
//
// Conviene un formulario por cada uno: el de contacto exige nombre y mensaje,
// así que una suscripción (solo correo) sería rechazada si usara el mismo ID.
//
// El ID es la parte final de la URL que da Formspree: https://formspree.io/f/<ID>

const id = (valor: string | undefined) => (valor ?? '').trim().replace(/^https?:\/\/formspree\.io\/f\//, '');

const idContacto = id(import.meta.env.PUBLIC_FORMSPREE_CONTACTO) || 'mgaklyon';
const idBoletin = id(import.meta.env.PUBLIC_FORMSPREE_BOLETIN) || 'mvkabrzl';

const endpoint = (formId: string) => (formId ? `https://formspree.io/f/${formId}` : '');

export const formspree = {
  contacto: endpoint(idContacto),
  boletin: endpoint(idBoletin),
};
