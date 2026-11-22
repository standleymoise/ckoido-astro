// Cliente de la Store API de WooCommerce y favoritos, compartido por las páginas de la tienda
// (inicio con swipe y /favoritos). Corre en el navegador.
//
// - El carrito se identifica con el encabezado Cart-Token (guardado en localStorage), así
//   funciona desde otro dominio sin cookies ni nonce.
// - Los favoritos son una lista de SKU en localStorage (no requieren cuenta).

export type Precio = { currency_code: string; currency_minor_unit: number };
export type Item = {
  key: string;
  id: number;
  name: string;
  quantity: number;
  images: { thumbnail: string; alt: string }[];
  totals: Precio & { line_total: string };
};
export type Carrito = {
  items: Item[];
  items_count: number;
  payment_methods: string[];
  totals: Precio & { total_price: string };
};
export type ProductoApi = {
  id: number;
  sku: string;
  name: string;
  short_description: string;
  description: string;
  is_purchasable: boolean;
  is_in_stock: boolean;
  stock_availability?: { text: string };
  images: { src: string; thumbnail?: string; srcset?: string; sizes?: string; alt: string }[];
  prices: Precio & { price: string };
};

const CLAVE_TOKEN = 'ckoido-cart-token';
const CLAVE_FAVS = 'ckoido-favoritos';

// ---------- almacenamiento local (puede fallar en modo privado) ----------
export const leer = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
export const guardar = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento: los datos duran mientras la página esté abierta */
  }
};

// ---------- favoritos ----------
export function leerFavoritos(): Set<string> {
  try {
    const lista = JSON.parse(leer(CLAVE_FAVS) || '[]');
    return new Set(Array.isArray(lista) ? lista.map(String) : []);
  } catch {
    return new Set();
  }
}
export const guardarFavoritos = (favs: Set<string>) => guardar(CLAVE_FAVS, JSON.stringify([...favs]));

// ---------- formato ----------
export const formato = (valor: string, p: Precio) =>
  new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: p.currency_code,
    minimumFractionDigits: 0,
    maximumFractionDigits: p.currency_minor_unit,
  }).format(Number(valor) / 10 ** p.currency_minor_unit);

export const textoPlano = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent?.trim() || '';
};

// ---------- Store API ----------
export function crearCliente(API: string) {
  let token = leer(CLAVE_TOKEN);

  async function api<T>(ruta: string, cuerpo?: unknown, reintento = true): Promise<T> {
    // Sin Cart-Token, WooCommerce exige un nonce en los POST, y desde otro dominio no se
    // puede leer. Un GET /cart primero entrega el token y con él no hace falta el nonce.
    if (cuerpo !== undefined && !token) await api('/cart');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Cart-Token'] = token;
    const r = await fetch(API + ruta, {
      method: cuerpo === undefined ? 'GET' : 'POST',
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const nuevo = r.headers.get('Cart-Token');
    if (nuevo && nuevo !== token) {
      token = nuevo;
      guardar(CLAVE_TOKEN, token);
    }
    const datos = await r.json().catch(() => null);
    if (!r.ok) {
      // Token vencido o inválido: se empieza un carrito nuevo una sola vez.
      if ((r.status === 401 || r.status === 403) && token && reintento) {
        token = null;
        guardar(CLAVE_TOKEN, null);
        return api<T>(ruta, cuerpo, false);
      }
      throw new Error(datos?.message ? textoPlano(datos.message) : `Error ${r.status}`);
    }
    return datos as T;
  }

  return {
    api,
    tieneCarrito: () => !!token,
    productos: () => api<ProductoApi[]>('/products?per_page=100&orderby=title&order=asc'),
    carrito: () => api<Carrito>('/cart'),
    agregar: (id: number) => api<Carrito>('/cart/add-item', { id, quantity: 1 }),
    cambiar: (key: string, quantity: number) =>
      quantity > 0
        ? api<Carrito>('/cart/update-item', { key, quantity })
        : api<Carrito>('/cart/remove-item', { key }),
  };
}
