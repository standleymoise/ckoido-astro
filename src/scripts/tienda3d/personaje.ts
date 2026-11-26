// El comprador: un personaje sencillo hecho con figuras (sin modelos que descargar), con una
// animación de caminar. Es independiente de quién lo controla: preparado para que en el futuro
// haya varios compradores en la misma tienda (multijugador).
import * as THREE from 'three';

export type Personaje = {
  grupo: THREE.Group;
  /** Posición en el piso y hacia dónde mira (radianes). */
  posicion: THREE.Vector3;
  rumbo: number;
  /** Avanza la animación: velocidad en m/s. */
  animar: (dt: number, velocidad: number) => void;
  /** Visible en tercera persona; oculto en primera (la cámara está en su cabeza). */
  mostrar: (si: boolean) => void;
};

export const ALTURA_OJOS = 1.6;

export function crearPersonaje(colores = { remera: '#ed2853', pantalon: '#0a4383', piel: '#f1c7a5', pelo: '#3b2a20' }): Personaje {
  const grupo = new THREE.Group();
  const mat = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const remera = mat(colores.remera);
  const pantalon = mat(colores.pantalon);
  const piel = mat(colores.piel);
  const pelo = mat(colores.pelo);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 12), remera);
  torso.position.y = 1.18;
  torso.scale.z = 0.72;
  grupo.add(torso);

  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), piel);
  cabeza.position.y = 1.62;
  grupo.add(cabeza);
  const cabello = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 12, 0, Math.PI * 2, 0, Math.PI / 1.9), pelo);
  cabello.position.y = 1.64;
  cabello.rotation.x = -0.25;
  grupo.add(cabello);

  // Piernas y brazos cuelgan de un pivote (cadera / hombro) para poder balancearlos.
  const extremidad = (x: number, y: number, largo: number, radio: number, m: THREE.Material) => {
    const pivote = new THREE.Group();
    pivote.position.set(x, y, 0);
    const pieza = new THREE.Mesh(new THREE.CapsuleGeometry(radio, largo, 4, 10), m);
    pieza.position.y = -largo / 2 - radio;
    pivote.add(pieza);
    grupo.add(pivote);
    return pivote;
  };
  const piernaI = extremidad(-0.1, 0.86, 0.6, 0.085, pantalon);
  const piernaD = extremidad(0.1, 0.86, 0.6, 0.085, pantalon);
  const brazoI = extremidad(-0.27, 1.42, 0.45, 0.06, piel);
  const brazoD = extremidad(0.27, 1.42, 0.45, 0.06, piel);

  grupo.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  let fase = 0;
  const p: Personaje = {
    grupo,
    posicion: grupo.position,
    rumbo: 0,
    animar(dt, velocidad) {
      const paso = Math.min(velocidad / 2.2, 1.6);
      fase += dt * (4 + velocidad * 2.2);
      const angulo = Math.sin(fase) * 0.55 * paso;
      piernaI.rotation.x = angulo;
      piernaD.rotation.x = -angulo;
      brazoI.rotation.x = -angulo * 0.8;
      brazoD.rotation.x = angulo * 0.8;
      torso.position.y = 1.18 + Math.abs(Math.sin(fase)) * 0.03 * paso;
      grupo.rotation.y = p.rumbo;
    },
    mostrar(si) {
      grupo.visible = si;
    },
  };
  return p;
}
