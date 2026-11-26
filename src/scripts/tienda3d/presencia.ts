// Multijugador: cada comprador avisa dónde está y ve a los demás caminando por la tienda.
// Por ahora usa WordPress (POST /wp-json/tindershop/v1/presencia, plugin tindershop-ajustes.php):
// sin cuentas ni servicios nuevos, alcanza para decenas de compradores a la vez. Para cientos, el mismo
// mensaje puede ir por WebSocket (Cloudflare, Ably…): solo cambia esta función de envío.
// Sin datos personales: un id al azar por pestaña, la posición, el rumbo y el aspecto del muñeco.

export type Otro = { id: string; x: number; z: number; r: number; a: number };

export type Presencia = { detener: () => void };

const CLAVE_ID = 'tindershop-presencia-id';

function idAlAzar() {
  try {
    const guardado = sessionStorage.getItem(CLAVE_ID);
    if (guardado && /^[a-f0-9]{16}$/.test(guardado)) return guardado;
  } catch {
    /* sin almacenamiento: id nuevo */
  }
  const id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  try {
    sessionStorage.setItem(CLAVE_ID, id);
  } catch {
    /* no pasa nada */
  }
  return id;
}

export function iniciarPresencia(
  url: string,
  aspecto: number,
  propio: () => { x: number; z: number; r: number },
  recibir: (otros: Otro[]) => void,
): Presencia {
  const id = idAlAzar();
  let fallos = 0;
  let activo = true;
  let temporizador = 0;

  async function avisar() {
    if (!activo) return;
    if (document.visibilityState === 'visible') {
      const { x, z, r } = propio();
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, x, z, r, a: aspecto }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const datos = (await res.json()) as { otros?: Otro[] };
        recibir(Array.isArray(datos.otros) ? datos.otros : []);
        fallos = 0;
      } catch {
        // WordPress sin el plugin, o sin conexión: se reintenta más despacio y, a los 5 fallos, se deja.
        if (++fallos >= 5) {
          activo = false;
          recibir([]);
          return;
        }
      }
    }
    temporizador = window.setTimeout(avisar, fallos ? 4000 : 1100);
  }
  avisar();
  return {
    detener() {
      activo = false;
      clearTimeout(temporizador);
    },
  };
}
