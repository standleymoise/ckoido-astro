// El personaje que elige cada comprador, en un solo número (sin Three.js: lo usa la pantalla de inicio).
// Un solo número (código) guarda la elección: género, piel, peinado y colores de ropa. Se guarda en el
// navegador y en la cuenta del cliente, y viaja en el multijugador (así los demás lo ven igual).
export const COLORES_REMERA = ['#ed2853', '#0474ba', '#2f9e6a', '#f2b632', '#6b4fbb', '#ffffff', '#24303f', '#e8692c'];
export const COLORES_PANTALON = ['#0a4383', '#2b3442', '#5a4636', '#3d5a80', '#1d1d1f', '#7a7f87'];
export const PEINADOS_NOMBRES = {
  hombre: ['Raya al costado', 'Rapado', 'Barba'],
  mujer: ['Pelo largo', 'Rodete', 'Rapado'],
};
export type Eleccion = { mujer: boolean; oscura: boolean; peinado: number; remera: number; pantalon: number };
export const CODIGOS = 2 * 2 * 3 * COLORES_REMERA.length * COLORES_PANTALON.length; // 576

export function codificar(e: Eleccion): number {
  return (
    1 +
    ((((e.mujer ? 1 : 0) * 2 + (e.oscura ? 1 : 0)) * 3 + (e.peinado % 3)) * COLORES_REMERA.length + (e.remera % COLORES_REMERA.length)) *
      COLORES_PANTALON.length +
    (e.pantalon % COLORES_PANTALON.length)
  );
}
export function decodificar(codigo: number): Eleccion {
  let n = (Math.abs(Math.floor(codigo)) - 1 + CODIGOS * 10) % CODIGOS;
  const pantalon = n % COLORES_PANTALON.length;
  n = Math.floor(n / COLORES_PANTALON.length);
  const remera = n % COLORES_REMERA.length;
  n = Math.floor(n / COLORES_REMERA.length);
  const peinado = n % 3;
  n = Math.floor(n / 3);
  return { mujer: Math.floor(n / 2) === 1, oscura: n % 2 === 1, peinado, remera, pantalon };
}
/** Un personaje al azar (para quien entra por primera vez). */
export const codigoAlAzar = () => 1 + Math.floor(Math.random() * CODIGOS);
