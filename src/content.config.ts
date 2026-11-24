import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { entradasWp, textoWp } from './data/wordpress';

const blog = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      excerpt: z.string(),
      image: image(),
      imageAlt: z.string(),
    }),
});

/**
 * Testimonios — en WordPress:
 *   CPT UI: tipo «testimonios» (REST base «testimonios», «Show in REST API» = Sí).
 *   ACF, grupo «Testimonio» asignado a ese tipo y con «Mostrar en la API REST» = Sí:
 *     texto     Área de texto (obligatorio)  — lo que dijo el cliente
 *     cargo     Texto                        — «Mamá de Sofía», «Cliente desde 2024»…
 *     estrellas Número 1 a 5                 — vacío = no se muestran estrellas
 *     foto      Imagen                       — opcional
 *   El título de la entrada es el nombre de quien opina.
 */
const testimonios = defineCollection({
  loader: async () =>
    (await entradasWp('testimonios')).map((t) => {
      const acf = t.acf ?? {};
      return {
        id: t.slug || String(t.id),
        nombre: textoWp(t.title.rendered),
        fecha: t.date,
        texto: acf.texto,
        cargo: acf.cargo || undefined,
        estrellas: acf.estrellas === '' || acf.estrellas == null ? undefined : acf.estrellas,
        // ACF devuelve false cuando la imagen está vacía.
        foto: acf.foto && typeof acf.foto === 'object' ? acf.foto : undefined,
      };
    }),
  schema: z.object({
    nombre: z.string().min(1),
    fecha: z.string(),
    texto: z.string().min(1, 'El testimonio no tiene texto (campo ACF «texto»).'),
    cargo: z.string().optional(),
    estrellas: z.coerce.number().int().min(1).max(5).optional(),
    foto: z
      .object({ url: z.string().url(), alt: z.string().default('') })
      .passthrough()
      .optional(),
  }),
});

/**
 * Banners del mazo — en WordPress:
 *   CPT UI: tipo «banners» (REST base «banners», «Show in REST API» = Sí, admite «Atributos de página»
 *   para el campo Orden).
 *   ACF, grupo «Banner» (wordpress/acf/banner.json) con «Mostrar en la API REST» = Sí:
 *     imagen        Imagen (obligatoria)  — vertical, como una tarjeta (ideal 900×1200)
 *     etiqueta      Texto                 — el badge; vacío = «Promo»
 *     texto         Área de texto         — una o dos líneas debajo del título
 *     boton         Texto                 — vacío = «Ver más»
 *     enlace        Texto                 — /productos/, https://…, wa.me/…; vacío = sin enlace
 *     solo_imagen   Verdadero/Falso       — la imagen ya trae el texto: no se dibuja encima
 *     posicion      Número                — después de cuántos productos aparece (0 = primera tarjeta)
 *     inicio, fin   Selector de fecha     — vacío = siempre; se respetan también sin recompilar
 *   El título de la entrada es el título del banner.
 */
const fechaAcf = z
  .string()
  .regex(/^\d{8}$/)
  .optional()
  .or(z.literal('').transform(() => undefined));

// «wa.me/506…» o «www.algo.com» → https://…; las rutas del sitio (/productos/) quedan igual.
const enlaceCompleto = (v: unknown) => {
  const e = typeof v === 'string' ? v.trim() : '';
  if (!e) return undefined;
  return /^(\/|#|https?:|mailto:|tel:)/i.test(e) ? e : `https://${e}`;
};

const banners = defineCollection({
  loader: async () =>
    (await entradasWp('banners')).map((b) => {
      const acf = b.acf ?? {};
      return {
        id: b.slug || String(b.id),
        titulo: textoWp(b.title.rendered),
        orden: b.menu_order ?? 0,
        imagen: acf.imagen && typeof acf.imagen === 'object' ? acf.imagen : undefined,
        etiqueta: acf.etiqueta || 'Promo',
        texto: acf.texto || undefined,
        boton: acf.boton || 'Ver más',
        enlace: enlaceCompleto(acf.enlace),
        soloImagen: acf.solo_imagen === true,
        posicion: acf.posicion === '' || acf.posicion == null ? 0 : acf.posicion,
        inicio: acf.inicio || undefined,
        fin: acf.fin || undefined,
      };
    }),
  schema: z.object({
    titulo: z.string(),
    orden: z.number(),
    imagen: z
      .object({ url: z.string().url(), alt: z.string().default('') }, {
        required_error: 'El banner no tiene imagen (campo ACF «imagen»).',
      })
      .passthrough(),
    etiqueta: z.string(),
    texto: z.string().optional(),
    boton: z.string(),
    enlace: z.string().optional(),
    soloImagen: z.boolean(),
    posicion: z.coerce.number().int().min(0),
    inicio: fechaAcf,
    fin: fechaAcf,
  }),
});

export const collections = { blog, testimonios, banners };
