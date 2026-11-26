// Personas de la tienda (el comprador, los demás compradores y los cajeros), hechas con figuras
// (sin modelos que descargar) pero con proporciones de persona real: cabeza, cuello, hombros,
// codos y rodillas que se doblan al caminar, manos, zapatos, orejas, cara y distintos peinados,
// tonos de piel y ropa. Cada aspecto sale de un número (apariencia), así todos los compradores se
// ven distintos y el mismo número siempre da la misma persona (sirve para el multijugador).
// El frente de la persona es -z (local); rumbo 0 = mirando hacia -z del mundo.
import * as THREE from 'three';

export type Apariencia = {
  piel: string;
  pelo: string;
  remera: string;
  pantalon: string;
  zapatos: string;
  /** 0 corto, 1 largo, 2 rodete, 3 rapado */
  peinado: number;
  /** Ancho de hombros (0,9 a 1,1) y altura (0,94 a 1,06). */
  hombros: number;
  altura: number;
};

export type Personaje = {
  grupo: THREE.Group;
  /** Posición en el piso y hacia dónde mira (radianes). */
  posicion: THREE.Vector3;
  rumbo: number;
  /** Avanza la animación. velocidad en m/s: positiva = adelante, negativa = marcha atrás. */
  animar: (dt: number, velocidad: number) => void;
  /** Brazos hacia adelante, tomando el manubrio del carrito. */
  empujar: (si: boolean) => void;
  /** Brazos levantados, sosteniendo un producto para mirarlo. */
  sostener: (si: boolean) => void;
  /** Visible en tercera persona; oculto en primera (la cámara está en su cabeza). */
  mostrar: (si: boolean) => void;
  /** Primera persona sin esconder todo: solo la cabeza (se ven los brazos y las manos en el manubrio). */
  primeraPersona?: (si: boolean) => void;
};

export const ALTURA_OJOS = 1.68;

const PIELES = ['#f6d5b8', '#ecbf9a', '#d9a27c', '#b97d57', '#8d5a3b', '#5e3a26'];

import { decodificar, COLORES_REMERA, COLORES_PANTALON } from './codigo';
export { decodificar, codificar, COLORES_REMERA, COLORES_PANTALON, PEINADOS_NOMBRES, CODIGOS, codigoAlAzar, type Eleccion } from './codigo';
const PELOS = ['#2b1d14', '#4a3020', '#7a5233', '#b88a4e', '#1a1a1a', '#8a8a8a'];
const REMERAS = ['#ed2853', '#0474ba', '#2f9e6a', '#f2b632', '#6b4fbb', '#ffffff', '#24303f', '#e8692c'];
const PANTALONES = ['#0a4383', '#2b3442', '#5a4636', '#3d5a80', '#1d1d1f', '#7a7f87'];
const ZAPATOS = ['#ffffff', '#1d1d1f', '#6b4a2f', '#c0392b'];

/** Aspecto a partir del código del personaje (el mismo código = la misma persona). */
export function aparienciaDe(n: number): Apariencia {
  const e = decodificar(n);
  let s = (Math.abs(Math.floor(n)) * 2654435761) >>> 0;
  const al = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const de = <T,>(l: T[]) => l[Math.floor(al() * l.length)];
  return {
    piel: e.oscura ? PIELES[4] : de(PIELES.slice(0, 3)),
    pelo: de(PELOS),
    remera: COLORES_REMERA[e.remera],
    pantalon: COLORES_PANTALON[e.pantalon],
    zapatos: de(ZAPATOS),
    peinado: e.mujer ? [1, 2, 3][e.peinado] : [0, 3, 0][e.peinado],
    hombros: 0.9 + al() * 0.2,
    altura: 0.94 + al() * 0.12,
  };
}

export function crearPersonaje(ap: Apariencia = aparienciaDe(1)): Personaje {
  const grupo = new THREE.Group();
  const cuerpo = new THREE.Group(); // escala de altura
  cuerpo.scale.setScalar(ap.altura);
  grupo.add(cuerpo);
  const mat = (c: string, r = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const remera = mat(ap.remera, 0.85);
  const pantalon = mat(ap.pantalon, 0.9);
  const piel = mat(ap.piel, 0.6);
  const pelo = mat(ap.pelo, 0.9);
  const zapato = mat(ap.zapatos, 0.5);
  const oscuro = new THREE.MeshBasicMaterial({ color: '#1b1b22' });
  const blanco = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const pieza = (geo: THREE.BufferGeometry, m: THREE.Material, padre: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    padre.add(o);
    return o;
  };

  // ---------- tronco ----------
  const H = ap.hombros;
  const cadera = pieza(new THREE.CylinderGeometry(0.15 * H, 0.16, 0.2, 16), pantalon, cuerpo, 0, 0.96);
  cadera.scale.z = 0.72;
  const torso = pieza(new THREE.CylinderGeometry(0.19 * H, 0.15, 0.48, 18), remera, cuerpo, 0, 1.3);
  torso.scale.z = 0.62;
  pieza(new THREE.SphereGeometry(0.19 * H, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), remera, cuerpo, 0, 1.53).scale.set(1, 0.38, 0.62);
  for (const lado of [-1, 1]) pieza(new THREE.SphereGeometry(0.075, 12, 10), remera, cuerpo, lado * 0.19 * H, 1.5);
  pieza(new THREE.CylinderGeometry(0.045, 0.052, 0.1, 12), piel, cuerpo, 0, 1.6);

  // ---------- cabeza ----------
  const cabeza = new THREE.Group();
  cabeza.position.y = 1.73;
  cuerpo.add(cabeza);
  pieza(new THREE.SphereGeometry(0.1, 24, 18), piel, cabeza).scale.set(0.95, 1.15, 1.02);
  pieza(new THREE.SphereGeometry(0.06, 14, 10), piel, cabeza, 0, -0.065, -0.025).scale.set(1.1, 0.8, 1); // mandíbula
  for (const lado of [-1, 1]) {
    pieza(new THREE.SphereGeometry(0.022, 10, 8), piel, cabeza, lado * 0.096, 0, 0.005).scale.set(0.6, 1, 0.8); // oreja
    pieza(new THREE.SphereGeometry(0.017, 12, 10), blanco, cabeza, lado * 0.036, 0.018, -0.088);
    pieza(new THREE.SphereGeometry(0.0095, 10, 8), oscuro, cabeza, lado * 0.036, 0.018, -0.102);
    pieza(new THREE.BoxGeometry(0.034, 0.006, 0.01), new THREE.MeshBasicMaterial({ color: ap.pelo }), cabeza, lado * 0.036, 0.046, -0.096);
  }
  pieza(new THREE.ConeGeometry(0.014, 0.035, 8), piel, cabeza, 0, -0.008, -0.105).rotation.x = -Math.PI / 2;
  const boca = pieza(new THREE.TorusGeometry(0.02, 0.0035, 6, 14, Math.PI), new THREE.MeshBasicMaterial({ color: '#8a3b3b' }), cabeza, 0, -0.045, -0.096);
  boca.rotation.z = Math.PI;
  // Peinados.
  if (ap.peinado !== 3) {
    const casco = pieza(new THREE.SphereGeometry(0.107, 24, 14, 0, Math.PI * 2, 0, Math.PI / 1.75), pelo, cabeza, 0, 0.018, 0.008);
    casco.scale.set(0.97, 1.12, 1.04);
    casco.rotation.x = 0.32; // deja la frente al descubierto
  } else {
    pieza(new THREE.SphereGeometry(0.103, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), pelo, cabeza, 0, 0.012, 0.01).scale.set(0.96, 1.1, 1.02);
  }
  if (ap.peinado === 1) pieza(new THREE.CapsuleGeometry(0.085, 0.16, 4, 12), pelo, cabeza, 0, -0.09, 0.055).scale.z = 0.6;
  if (ap.peinado === 2) pieza(new THREE.SphereGeometry(0.045, 12, 10), pelo, cabeza, 0, 0.09, 0.08);

  // ---------- brazos (hombro → codo → mano) ----------
  const brazo = (lado: number) => {
    const hombro = new THREE.Group();
    hombro.position.set(lado * 0.215 * H, 1.5, 0);
    cuerpo.add(hombro);
    pieza(new THREE.CapsuleGeometry(0.052, 0.2, 4, 10), remera, hombro, 0, -0.14);
    const codo = new THREE.Group();
    codo.position.y = -0.28;
    hombro.add(codo);
    pieza(new THREE.CapsuleGeometry(0.042, 0.2, 4, 10), piel, codo, 0, -0.12);
    pieza(new THREE.SphereGeometry(0.045, 12, 10), piel, codo, 0, -0.26).scale.set(0.8, 1.1, 0.6);
    return { hombro, codo };
  };
  const bI = brazo(-1);
  const bD = brazo(1);

  // ---------- piernas (cadera → rodilla → pie) ----------
  const pierna = (lado: number) => {
    const muslo = new THREE.Group();
    muslo.position.set(lado * 0.09, 0.9, 0);
    cuerpo.add(muslo);
    pieza(new THREE.CapsuleGeometry(0.075, 0.3, 4, 10), pantalon, muslo, 0, -0.2);
    const rodilla = new THREE.Group();
    rodilla.position.y = -0.42;
    muslo.add(rodilla);
    pieza(new THREE.CapsuleGeometry(0.06, 0.3, 4, 10), pantalon, rodilla, 0, -0.2);
    pieza(new THREE.BoxGeometry(0.1, 0.07, 0.24), zapato, rodilla, 0, -0.42, -0.04);
    return { muslo, rodilla };
  };
  const pI = pierna(-1);
  const pD = pierna(1);

  grupo.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  let fase = 0;
  let pose: 'libre' | 'carrito' | 'sostener' = 'libre';
  let carrito = false;
  const p: Personaje = {
    grupo,
    posicion: grupo.position,
    rumbo: 0,
    animar(dt, velocidad) {
      const rapidez = Math.abs(velocidad);
      const paso = Math.min(rapidez / 2.2, 1.5);
      if (rapidez > 0.01) fase += Math.sign(velocidad) * dt * (4.2 + rapidez * 2);
      else fase *= 0.85; // al frenar, las piernas vuelven a su lugar
      const s = Math.sin(fase);
      // Piernas: el muslo va y viene; la rodilla se dobla cuando la pierna vuelve hacia adelante.
      pI.muslo.rotation.x = s * 0.5 * paso;
      pD.muslo.rotation.x = -s * 0.5 * paso;
      pI.rodilla.rotation.x = -Math.max(0, -Math.cos(fase)) * 0.7 * paso;
      pD.rodilla.rotation.x = -Math.max(0, Math.cos(fase)) * 0.7 * paso;
      // Brazos según lo que esté haciendo (rotar el hombro en x positivo lleva el brazo hacia -z).
      if (pose === 'sostener') {
        for (const b of [bI, bD]) {
          b.hombro.rotation.x = 1.05;
          b.codo.rotation.x = 0.9;
        }
        bI.hombro.rotation.z = -0.25;
        bD.hombro.rotation.z = 0.25;
      } else if (pose === 'carrito') {
        bI.hombro.rotation.x = 0.75 + s * 0.04;
        bD.hombro.rotation.x = 0.75 - s * 0.04;
        bI.codo.rotation.x = bD.codo.rotation.x = 0.4;
        bI.hombro.rotation.z = bD.hombro.rotation.z = 0;
      } else {
        bI.hombro.rotation.x = -s * 0.45 * paso;
        bD.hombro.rotation.x = s * 0.45 * paso;
        bI.codo.rotation.x = bD.codo.rotation.x = 0.15 + 0.2 * paso;
        bI.hombro.rotation.z = -0.06;
        bD.hombro.rotation.z = 0.06;
      }
      cuerpo.position.y = Math.abs(Math.sin(fase)) * 0.025 * paso;
      grupo.rotation.y = p.rumbo;
    },
    empujar(si) {
      carrito = si;
      if (pose !== 'sostener') pose = si ? 'carrito' : 'libre';
    },
    sostener(si) {
      pose = si ? 'sostener' : carrito ? 'carrito' : 'libre';
    },
    mostrar(si) {
      grupo.visible = si;
    },
  };
  return p;
}
