// Endpoints de Formspree para los formularios del sitio.
//
// Configurar en un archivo `.env` (ver `.env.example`) o en las variables de
// entorno del hosting, y volver a hacer build:
//   PUBLIC_FORMSPREE_CONTACTO=abcdwxyz   ← ID del formulario de contacto
//   PUBLIC_FORMSPREE_BOLETIN=efghwxyz    ← ID del formulario del boletín
//
// Conviene un formulario por cada uno: el de contacto exige nombre y mensaje,
// así que una suscripción (solo correo) sería rechazada si usara el mismo ID.
// Si el boletín queda vacío se usa el de contacto como último recurso.
//
// El ID es la parte final de la URL que da Formspree: https://formspree.io/f/<ID>

const id = (valor: string | undefined) => (valor ?? '').trim().replace(/^https?:\/\/formspree\.io\/f\//, '');

const idContacto = id(import.meta.env.PUBLIC_FORMSPREE_CONTACTO);
const idBoletin = id(import.meta.env.PUBLIC_FORMSPREE_BOLETIN) || idContacto;

const endpoint = (formId: string) => (formId ? `https://formspree.io/f/${formId}` : '');

export const formspree = {
  contacto: endpoint(idContacto),
  boletin: endpoint(idBoletin),
};
