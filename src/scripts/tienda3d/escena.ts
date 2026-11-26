// Construcción de la tienda 3D: piso, paredes, luces, góndolas con productos, cajas y carteles.
// Todo es geometría simple (sin modelos que descargar): carga rápida y funciona en celulares.
// Los productos repetidos usan InstancedMesh (una llamada de dibujo por producto) y las fotos se
// cargan de a poco (carga progresiva): mientras tanto, la caja se ve con su color.
import * as THREE from 'three';

export type Producto3D = {
  id: number;
  sku: string;
  nombre: string;
  precio: string;
  stock: string;
  enStock: boolean;
  resumen: string;
  img: string;
  categoria: string;
};

/** Caja de colisión en el piso (x/z), en metros. */
export type Caja = { minX: number; maxX: number; minZ: number; maxZ: number };

export type Tienda = {
  /** Mallas contra las que choca la cámara de tercera persona. */
  solidos: THREE.Object3D[];
  /** Mallas de productos (InstancedMesh) para elegir con el mouse, el dedo o el control de VR. */
  seleccionables: THREE.InstancedMesh[];
  productoDe: Map<THREE.InstancedMesh, Producto3D>;
  colisiones: Caja[];
  piso: THREE.Mesh;
  limites: Caja;
  /** Zonas junto a las cajas: al acercarse, se ofrece pagar. */
  zonasCajas: Caja[];
  inicio: THREE.Vector3;
};

// Medidas de la tienda (metros).
const ANCHO = 24;
const FONDO = 28;
const ALTO = 4.2;
const MEDIO_X = ANCHO / 2;
const MEDIO_Z = FONDO / 2;
const GONDOLA_Z0 = -11; // fondo de las góndolas
const GONDOLA_Z1 = 3; // frente (hacia la entrada)
const NIVELES = [0.25, 0.7, 1.15, 1.6]; // altura de cada estante
const SECCION = 1; // metros por sección de producto

const COLORES = {
  piso: '#dfe4ea',
  junta: '#c5ccd6',
  pared: '#eef2f7',
  franja: '#0a4383',
  acento: '#ed2853',
  gondola: '#f4f6f9',
  estante: '#cfd8e3',
  borde: '#0a4383',
};

function texturaPiso(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = COLORES.piso;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = COLORES.junta;
  g.lineWidth = 4;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(ANCHO / 1.2, FONDO / 1.2);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Cartel con texto (canvas → textura). */
function cartel(texto: string, ancho: number, alto: number, fondo: string, color: string, px = 96) {
  const escala = 256;
  const c = document.createElement('canvas');
  c.width = Math.round(ancho * escala);
  c.height = Math.round(alto * escala);
  const g = c.getContext('2d')!;
  g.fillStyle = fondo;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${px}px Sarabun, system-ui, sans-serif`;
  g.fillText(texto, c.width / 2, c.height / 2 + px * 0.05, c.width * 0.92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), new THREE.MeshBasicMaterial({ map: t }));
}

/** Etiqueta de precio de un producto (la comparten todas sus copias en los estantes). */
function texturaPrecio(p: Producto3D) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = COLORES.acento;
  g.fillRect(0, 0, 10, 96);
  g.fillStyle = COLORES.franja;
  g.font = '800 44px Sarabun, system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(p.precio, 24, 36, 220);
  g.fillStyle = '#526377';
  g.font = '500 22px Sarabun, system-ui, sans-serif';
  g.fillText(p.nombre, 24, 76, 220);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Un color suave y estable por producto (se ve mientras carga la foto). */
function colorDe(id: number) {
  const h = (id * 47) % 360;
  return new THREE.Color(`hsl(${h}, 45%, 78%)`);
}

type Lado = { x: number; z0: number; z1: number; mira: 1 | -1 };

export function construirTienda(escena: THREE.Scene, productos: Producto3D[], ligera: boolean): Tienda {
  const solidos: THREE.Object3D[] = [];
  const colisiones: Caja[] = [];

  // ---------- piso, techo y paredes ----------
  const piso = new THREE.Mesh(
    new THREE.PlaneGeometry(ANCHO, FONDO),
    new THREE.MeshStandardMaterial({ map: texturaPiso(), roughness: 0.55, metalness: 0 }),
  );
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = !ligera;
  escena.add(piso);

  const techo = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO, FONDO), new THREE.MeshBasicMaterial({ color: '#d8dee7' }));
  techo.rotation.x = Math.PI / 2;
  techo.position.y = ALTO;
  escena.add(techo);

  const matPared = new THREE.MeshStandardMaterial({ color: COLORES.pared, roughness: 0.9 });
  const matFranja = new THREE.MeshBasicMaterial({ color: COLORES.franja });
  const paredes: [number, number, number, number, number][] = [
    // x, z, ancho, rotY, (1 = con puerta)
    [0, -MEDIO_Z, ANCHO, 0, 0],
    [-MEDIO_X, 0, FONDO, Math.PI / 2, 0],
    [MEDIO_X, 0, FONDO, -Math.PI / 2, 0],
  ];
  for (const [x, z, ancho, rot] of paredes) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, ALTO), matPared);
    m.position.set(x, ALTO / 2, z);
    m.rotation.y = rot;
    escena.add(m);
    solidos.push(m);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(ancho, 0.35), matFranja);
    f.position.set(x, ALTO - 0.6, z);
    f.rotation.y = rot;
    f.position.add(new THREE.Vector3(0, 0, 0.01).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot));
    escena.add(f);
  }
  // Pared de la entrada con la puerta (vidrio) en el centro.
  for (const lado of [-1, 1]) {
    const ancho = MEDIO_X - 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, ALTO), matPared);
    m.position.set(lado * (2 + ancho / 2), ALTO / 2, MEDIO_Z);
    m.rotation.y = Math.PI;
    escena.add(m);
    solidos.push(m);
  }
  const vidrio = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 2.6),
    new THREE.MeshStandardMaterial({ color: '#bfe3ff', transparent: true, opacity: 0.35, roughness: 0.1 }),
  );
  vidrio.position.set(0, 1.3, MEDIO_Z - 0.01);
  vidrio.rotation.y = Math.PI;
  escena.add(vidrio);

  // Carteles: la marca al fondo y «Cajas» sobre los mostradores.
  const marca = cartel('Tindershop', 6, 1, COLORES.franja, '#ffffff', 170);
  marca.position.set(0, ALTO - 1.2, -MEDIO_Z + 0.02);
  escena.add(marca);

  // ---------- luces ----------
  escena.add(new THREE.HemisphereLight('#ffffff', '#b9c4d3', ligera ? 1.7 : 1.25));
  const sol = new THREE.DirectionalLight('#fff6ea', ligera ? 0.9 : 1.3);
  sol.position.set(6, 10, 8);
  if (!ligera) {
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    const s = sol.shadow.camera as THREE.OrthographicCamera;
    s.left = -14;
    s.right = 14;
    s.top = 16;
    s.bottom = -16;
    sol.shadow.bias = -0.0005;
  }
  escena.add(sol);
  // Paneles de luz del techo (solo se ven: la luz real es la de arriba, así rinde en celulares).
  const panel = new THREE.BoxGeometry(0.5, 0.04, 4);
  const matPanel = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const paneles = new THREE.InstancedMesh(panel, matPanel, 20);
  let k = 0;
  const m4 = new THREE.Matrix4();
  for (const x of [-7.5, -2.5, 2.5, 7.5]) {
    for (const z of [-10, -5, 0, 5, 10]) {
      m4.makeTranslation(x, ALTO - 0.03, z);
      paneles.setMatrixAt(k++, m4);
    }
  }
  escena.add(paneles);

  // ---------- góndolas ----------
  const lados: Lado[] = [];
  const matGondola = new THREE.MeshStandardMaterial({ color: COLORES.gondola, roughness: 0.6 });
  const matEstante = new THREE.MeshStandardMaterial({ color: COLORES.estante, roughness: 0.5 });
  const matBorde = new THREE.MeshBasicMaterial({ color: COLORES.borde });
  const largo = GONDOLA_Z1 - GONDOLA_Z0;
  const zc = (GONDOLA_Z0 + GONDOLA_Z1) / 2;
  const estante = new THREE.BoxGeometry(1, 0.03, largo);

  function gondola(x: number, prof: number, doble: boolean, mira: 1 | -1) {
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(doble ? 0.12 : 0.08, 2.0, largo), matGondola);
    cuerpo.position.set(x, 1.0, zc);
    cuerpo.castShadow = !ligera;
    escena.add(cuerpo);
    solidos.push(cuerpo);
    const base = new THREE.Mesh(new THREE.BoxGeometry(prof * (doble ? 2 : 1), 0.12, largo), matGondola);
    base.position.set(doble ? x : x + (mira * prof) / 2, 0.06, zc);
    escena.add(base);
    const caras: (1 | -1)[] = doble ? [1, -1] : [mira];
    for (const cara of caras) {
      for (const y of NIVELES.slice(1)) {
        const e = new THREE.Mesh(estante, matEstante);
        e.scale.x = prof;
        e.position.set(x + (cara * prof) / 2, y - 0.02, zc);
        escena.add(e);
      }
      // Franja de color en el borde de cada estante (donde van los precios).
      for (const y of NIVELES) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.06, largo), matBorde);
        b.position.set(x + cara * (prof + 0.005), y - 0.05, zc);
        escena.add(b);
      }
      lados.push({ x: x + cara * 0.07, z0: GONDOLA_Z0, z1: GONDOLA_Z1, mira: cara });
    }
    const minX = doble ? x - prof : Math.min(x, x + mira * prof);
    const maxX = doble ? x + prof : Math.max(x, x + mira * prof);
    colisiones.push({ minX: minX - 0.05, maxX: maxX + 0.05, minZ: GONDOLA_Z0 - 0.05, maxZ: GONDOLA_Z1 + 0.05 });
    // Cabecera de la góndola, con el cartel de la sección.
    const cab = new THREE.Mesh(new THREE.BoxGeometry(prof * (doble ? 2 : 1) + 0.1, 0.35, 0.1), matBorde);
    cab.position.set(doble ? x : x + (mira * prof) / 2, 2.15, GONDOLA_Z1);
    escena.add(cab);
  }
  const PROF = 0.45;
  gondola(-MEDIO_X + 0.05, PROF, false, 1);
  gondola(-5, PROF, true, 1);
  gondola(0, PROF, true, 1);
  gondola(5, PROF, true, 1);
  gondola(MEDIO_X - 0.05, PROF, false, -1);

  // ---------- productos en los estantes ----------
  // Se ordenan por categoría y se reparten en secciones de 1 m; si hay pocos productos, se repiten
  // para que la tienda se vea llena (como un súper real, con varias caras de cada producto).
  const ordenados = [...productos].sort(
    (a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre),
  );
  type Hueco = { x: number; y: number; z: number; mira: 1 | -1 };
  const huecosPor = new Map<number, Hueco[]>();
  let n = 0;
  for (const lado of lados) {
    for (let z = lado.z0 + SECCION / 2; z < lado.z1; z += SECCION) {
      for (const y of NIVELES) {
        if (!ordenados.length) break;
        const p = ordenados[n++ % ordenados.length];
        const lista = huecosPor.get(p.id) ?? [];
        lista.push({ x: lado.x, y, z, mira: lado.mira });
        huecosPor.set(p.id, lista);
      }
    }
  }

  const POR_HUECO = 4; // cajas de frente por sección
  const caja = new THREE.BoxGeometry(0.22, 0.3, 0.16);
  caja.translate(0, 0.15, 0);
  const etiqueta = new THREE.PlaneGeometry(0.34, 0.13);
  const cargador = new THREE.TextureLoader();
  const seleccionables: THREE.InstancedMesh[] = [];
  const productoDe = new Map<THREE.InstancedMesh, Producto3D>();
  const q = new THREE.Quaternion();
  const eje = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const uno = new THREE.Vector3(1, 1, 1);

  for (const p of ordenados) {
    const huecos = huecosPor.get(p.id);
    if (!huecos) continue;
    const color = colorDe(p.id);
    const lateral = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const frente = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
    // Caras de BoxGeometry: +x, -x, +y, -y, +z (frente), -z
    const malla = new THREE.InstancedMesh(caja, [lateral, lateral, lateral, lateral, frente, lateral], huecos.length * POR_HUECO);
    malla.castShadow = !ligera;
    let i = 0;
    for (const h of huecos) {
      // La cara +z mira al pasillo: girar ±90° según el lado de la góndola.
      q.setFromAxisAngle(eje, (h.mira * Math.PI) / 2);
      for (let j = 0; j < POR_HUECO; j++) {
        const dz = -SECCION / 2 + (SECCION / POR_HUECO) * (j + 0.5);
        pos.set(h.x + h.mira * 0.2, h.y, h.z + dz);
        m4.compose(pos, q, uno);
        malla.setMatrixAt(i++, m4);
      }
    }
    escena.add(malla);
    seleccionables.push(malla);
    productoDe.set(malla, p);

    // Precio en el borde del estante, uno por sección.
    const matEtiqueta = new THREE.MeshBasicMaterial({ map: texturaPrecio(p) });
    const precios = new THREE.InstancedMesh(etiqueta, matEtiqueta, huecos.length);
    huecos.forEach((h, k2) => {
      q.setFromAxisAngle(eje, (h.mira * Math.PI) / 2);
      pos.set(h.x + h.mira * 0.39, h.y - 0.05, h.z);
      m4.compose(pos, q, uno);
      precios.setMatrixAt(k2, m4);
    });
    escena.add(precios);

    // Foto del producto en el frente (carga progresiva; mientras, se ve el color).
    if (p.img) {
      cargador.load(p.img, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = ligera ? 1 : 4;
        frente.map = t;
        frente.needsUpdate = true;
      });
    }
  }

  // ---------- cajas (mostradores para pagar) ----------
  const matMostrador = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
  const matCinta = new THREE.MeshStandardMaterial({ color: '#2b3442', roughness: 0.8 });
  for (const x of [-7.5, 7.5]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 3), matMostrador);
    m.position.set(x, 0.45, 8);
    m.castShadow = !ligera;
    escena.add(m);
    solidos.push(m);
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 2.6), matCinta);
    c.position.set(x, 0.91, 8);
    escena.add(c);
    colisiones.push({ minX: x - 0.55, maxX: x + 0.55, minZ: 6.45, maxZ: 9.55 });
    const s = cartel('Cajas', 1.6, 0.5, COLORES.acento, '#ffffff', 90);
    s.position.set(x, 2.6, 8);
    s.rotation.y = Math.PI / 2 * Math.sign(-x);
    escena.add(s);
    const s2 = s.clone();
    s2.rotation.y += Math.PI;
    escena.add(s2);
  }

  const limites = { minX: -MEDIO_X + 0.35, maxX: MEDIO_X - 0.35, minZ: -MEDIO_Z + 0.35, maxZ: MEDIO_Z - 0.6 };
  return {
    solidos,
    seleccionables,
    productoDe,
    colisiones,
    piso,
    limites,
    zonasCajas: [-7.5, 7.5].map((x) => ({ minX: x - 1.8, maxX: x + 1.8, minZ: 6, maxZ: 10 })),
    inicio: new THREE.Vector3(0, 0, MEDIO_Z - 2.2),
  };
}
