// Personajes de la tienda (el comprador y los cajeros): figuras simples (sin modelos que
// descargar), con cara (ojos, nariz, boca) para que se vea hacia dónde miran, y animación de
// caminar hacia adelante y hacia atrás. Son independientes de quién los controla: preparado para
// que en el futuro haya varios compradores en la misma tienda (multijugador).
// El frente del personaje es -z (local); rumbo 0 = mirando hacia -z del mundo.
import * as THREE from 'three';

export type Personaje = {
  grupo: THREE.Group;
  /** Posición en el piso y hacia dónde mira (radianes). */
  posicion: THREE.Vector3;
  rumbo: number;
  /** Avanza la animación. velocidad en m/s: positiva = adelante, negativa = marcha atrás. */
  animar: (dt: number, velocidad: number) => void;
  /** Brazos hacia adelante, tomando el manubrio del carrito. */
  empujar: (si: boolean) => void;
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
  const oscuro = new THREE.MeshBasicMaterial({ color: '#1b1b22' });
  const blanco = new THREE.MeshBasicMaterial({ color: '#ffffff' });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 12), remera);
  torso.position.y = 1.18;
  torso.scale.z = 0.72;
  grupo.add(torso);

  // Cabeza con cara mirando al frente (-z).
  const cabeza = new THREE.Group();
  cabeza.position.y = 1.62;
  grupo.add(cabeza);
  cabeza.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 18), piel));
  const cabello = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 1.85), pelo);
  cabello.position.set(0, 0.02, 0.012);
  cabello.rotation.x = 0.42; // inclinado hacia atrás: deja la frente y los ojos al descubierto
  cabeza.add(cabello);
  for (const lado of [-1, 1]) {
    const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), blanco);
    ojo.position.set(lado * 0.05, 0.025, -0.122);
    cabeza.add(ojo);
    const pupila = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), oscuro);
    pupila.position.set(lado * 0.05, 0.025, -0.142);
    cabeza.add(pupila);
    const ceja = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.008, 0.01), new THREE.MeshBasicMaterial({ color: colores.pelo }));
    ceja.position.set(lado * 0.05, 0.065, -0.13);
    cabeza.add(ceja);
  }
  const nariz = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), piel);
  nariz.position.set(0, -0.01, -0.142);
  cabeza.add(nariz);
  const boca = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 16, Math.PI), oscuro);
  boca.position.set(0, -0.045, -0.13);
  boca.rotation.z = Math.PI; // sonrisa
  cabeza.add(boca);

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
  let conCarrito = false;
  const p: Personaje = {
    grupo,
    posicion: grupo.position,
    rumbo: 0,
    animar(dt, velocidad) {
      const rapidez = Math.abs(velocidad);
      const paso = Math.min(rapidez / 2.2, 1.6);
      // Marcha atrás: la misma animación al revés (no se da vuelta).
      fase += Math.sign(velocidad || 1) * dt * (4 + rapidez * 2.2) * (rapidez > 0.01 ? 1 : 0);
      if (rapidez < 0.01) fase *= 0.85; // al frenar, las piernas vuelven a su lugar
      const angulo = Math.sin(fase) * 0.55 * paso;
      piernaI.rotation.x = angulo;
      piernaD.rotation.x = -angulo;
      if (conCarrito) {
        // Brazos hacia adelante, sobre el manubrio (rotar en x positivo los lleva hacia -z).
        brazoI.rotation.x = 1.15 + angulo * 0.08;
        brazoD.rotation.x = 1.15 - angulo * 0.08;
      } else {
        brazoI.rotation.x = -angulo * 0.8;
        brazoD.rotation.x = angulo * 0.8;
      }
      torso.position.y = 1.18 + Math.abs(Math.sin(fase)) * 0.03 * paso;
      grupo.rotation.y = p.rumbo;
    },
    empujar(si) {
      conCarrito = si;
    },
    mostrar(si) {
      grupo.visible = si;
    },
  };
  return p;
}
