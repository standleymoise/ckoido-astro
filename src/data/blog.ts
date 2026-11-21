import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/**
 * Todas las entradas del blog, de la más reciente a la más antigua.
 * Si dos entradas tienen la misma fecha se ordenan por slug (id) alfabéticamente,
 * así el orden es estable entre builds.
 */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('blog');
  return posts.sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id),
  );
}

const formatter = new Intl.DateTimeFormat('es-CR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC', // las fechas del frontmatter son UTC: evita que se corran un día
});

/** «14 de agosto de 2023» */
export const formatDate = (date: Date) => formatter.format(date);
