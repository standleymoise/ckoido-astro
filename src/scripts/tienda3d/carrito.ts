// Carrito de compras 3D que empuja el comprador. Muestra adentro lo que hay en el carrito real de
// WooCommerce (una cajita con la foto por cada unidad, hasta 24), así lo que se ve es lo que se
// va a pagar.
import * as THREE from 'three';

export type ItemCarrito = { id: number; cantidad: number };

export type Carrito3D = {
  grupo: THREE.Group;
  /** Distancia desde el comprador hasta el centro de la canasta (metros, hacia adelante). */
  adelante: number;
  llenar: (items: ItemCarrito[], texturaDe: (id: number) => THREE.Texture | null, colorDe: (id: number) => THREE.Color) => void;
};

/** Textura de rejilla (alambre) con transparencia. */
function rejilla() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#c8d0da';
  g.lineWidth = 5;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 64);
    g.moveTo(0, i);
    g.lineTo(64, i);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function crearCarrito(): Carrito3D {
  const grupo = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#aeb8c4', roughness: 0.35, metalness: 0.7 });
  const rojo = new THREE.MeshStandardMaterial({ color: '#ed2853', roughness: 0.5 });
  const negro = new THREE.MeshStandardMaterial({ color: '#222831', roughness: 0.8 });
  const malla = rejilla();

  // Canasta: 0,55 de ancho × 0,75 de largo × 0,4 de alto, entre z −0,6 y −1,35 (frente del comprador).
  const ANCHO = 0.55;
  const LARGO = 0.75;
  const ALTO = 0.4;
  const BASE = 0.55;
  const ZC = -0.98;
  const panel = (w: number, h: number, rep: [number, number]) => {
    const t = malla.clone();
    t.needsUpdate = true;
    t.repeat.set(...rep);
    return new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }),
    );
  };
  const fondo = new THREE.Mesh(new THREE.BoxGeometry(ANCHO, 0.02, LARGO), metal);
  fondo.position.set(0, BASE, ZC);
  grupo.add(fondo);
  for (const lado of [-1, 1]) {
    const p = panel(LARGO, ALTO, [6, 3]);
    p.rotation.y = Math.PI / 2;
    p.position.set((lado * ANCHO) / 2, BASE + ALTO / 2, ZC);
    grupo.add(p);
  }
  for (const z of [ZC - LARGO / 2, ZC + LARGO / 2]) {
    const p = panel(ANCHO, ALTO, [4, 3]);
    p.position.set(0, BASE + ALTO / 2, z);
    grupo.add(p);
  }
  // Borde superior y manubrio rojo (a la altura de las manos del comprador).
  const borde = new THREE.Mesh(new THREE.BoxGeometry(ANCHO + 0.02, 0.025, LARGO + 0.02), metal);
  borde.position.set(0, BASE + ALTO, ZC);
  (borde.geometry as THREE.BoxGeometry).computeBoundingBox();
  const marco = new THREE.LineSegments(new THREE.EdgesGeometry(borde.geometry), new THREE.LineBasicMaterial({ color: '#aeb8c4' }));
  marco.position.copy(borde.position);
  grupo.add(marco);
  const manubrio = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, ANCHO + 0.08, 10).rotateZ(Math.PI / 2), rojo);
  manubrio.position.set(0, BASE + ALTO + 0.2, ZC + LARGO / 2 + 0.13); // a la altura de las manos
  grupo.add(manubrio);
  for (const lado of [-1, 1]) {
    const brazo = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8), metal);
    brazo.position.set((lado * ANCHO) / 2, BASE + ALTO + 0.1, ZC + LARGO / 2 + 0.07);
    brazo.rotation.x = -0.55;
    grupo.add(brazo);
  }
  // Chasis, patas y ruedas.
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, BASE - 0.06, 8), metal);
    pata.position.set((x * (ANCHO - 0.08)) / 2, (BASE - 0.06) / 2 + 0.06, ZC + (z * (LARGO - 0.1)) / 2);
    grupo.add(pata);
    const rueda = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 14).rotateZ(Math.PI / 2), negro);
    rueda.position.set((x * (ANCHO - 0.08)) / 2, 0.05, ZC + (z * (LARGO - 0.1)) / 2);
    grupo.add(rueda);
  }
  grupo.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  // Productos adentro: cajitas de 0,14 × 0,12 × 0,14, en filas de 3 × 4, de a capas.
  const contenido = new THREE.Group();
  grupo.add(contenido);
  const cajita = new THREE.BoxGeometry(0.14, 0.12, 0.14);
  const materiales = new Map<number, THREE.MeshStandardMaterial>();

  return {
    grupo,
    adelante: -ZC,
    llenar(items, texturaDe, colorDe) {
      contenido.clear();
      let i = 0;
      for (const it of items) {
        let mat = materiales.get(it.id);
        if (!mat) {
          mat = new THREE.MeshStandardMaterial({ color: colorDe(it.id), roughness: 0.6 });
          materiales.set(it.id, mat);
        }
        const t = texturaDe(it.id);
        if (t && mat.map !== t) {
          mat.map = t;
          mat.color.set('#ffffff');
          mat.needsUpdate = true;
        }
        for (let u = 0; u < it.cantidad && i < 24; u++, i++) {
          const capa = Math.floor(i / 12);
          const enCapa = i % 12;
          const m = new THREE.Mesh(cajita, mat);
          m.position.set(-0.17 + (enCapa % 3) * 0.17, BASE + 0.07 + capa * 0.125, ZC - 0.26 + Math.floor(enCapa / 3) * 0.17);
          m.rotation.y = ((i * 37) % 10) * 0.03 - 0.15; // un poco desordenado, como de verdad
          m.castShadow = true;
          contenido.add(m);
        }
      }
    },
  };
}
