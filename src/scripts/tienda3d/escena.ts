// Construcción de la tienda 3D: piso, paredes, luces, exhibidores con productos, cajas y cajeros.
// Todo es geometría simple (sin modelos que descargar): carga rápida y funciona en celulares.
// Los productos repetidos usan InstancedMesh (una llamada de dibujo por producto) y las fotos se
// cargan de a poco (carga progresiva): mientras tanto se ve el color del producto.
//
// Cada categoría de WooCommerce elige cómo se exhibe (WordPress → Productos → Categorías):
//   góndola   estanterías de supermercado (lo de siempre)
//   perchero  prendas colgadas en percheros
//   maniqui   conjuntos en maniquíes: los primeros 4 en la vidriera de la entrada, el resto al fondo
//   estante   prendas dobladas y accesorios, en la pared izquierda
//   exhibidor pantalla de destacados a la entrada (también los productos «destacados» de WooCommerce)
import * as THREE from 'three';
import { crearPersonaje, aparienciaDe, type Personaje } from './personaje';
import type { FabricaPersonas } from './personaReal';

export type Exhibicion = 'gondola' | 'perchero' | 'maniqui' | 'estante' | 'exhibidor';

export type Producto3D = {
  id: number;
  sku: string;
  nombre: string;
  precio: string;
  /** En oferta: precio normal (tachado en la etiqueta) y descuento en %. */
  precioAnterior?: string;
  descuento?: number;
  stock: string;
  enStock: boolean;
  resumen: string;
  img: string;
  categoria: string;
  exhibicion: Exhibicion;
  destacado: boolean;
};

/** Caja de colisión en el piso (x/z), en metros. */
export type Caja = { minX: number; maxX: number; minZ: number; maxZ: number };

export type Mostrador = {
  /** Donde se para el cliente para pagar, y hacia dónde mira (rumbo). */
  cliente: THREE.Vector3;
  rumboCliente: number;
  cajero: Personaje;
};

/** Un producto levantado del estante para mirarlo: la pieza que se sostiene y cómo devolverla. */
export type Tomado = {
  producto: Producto3D;
  /** Copia que se sostiene en la mano (misma forma y foto que la del estante). */
  objeto: THREE.Object3D;
  /** Dónde estaba (posición y giro en el mundo), para devolverlo al mismo lugar. */
  desde: THREE.Matrix4;
  /** Saca la pieza del estante mientras se mira, y la vuelve a poner. */
  ocultar: () => void;
  restaurar: () => void;
};

export type Tienda = {
  /** Mallas contra las que choca la cámara de tercera persona. */
  solidos: THREE.Object3D[];
  /** Todo lo que se puede elegir (productos en góndolas, percheros, maniquíes, estantes, pantalla). */
  elegibles: THREE.Object3D[];
  /** Qué producto es lo que tocó un rayo (o null). */
  productoDe: (golpe: THREE.Intersection) => Producto3D | null;
  /** Levantar el producto que tocó el rayo (para mirarlo de cerca). */
  tomar: (golpe: THREE.Intersection) => Tomado | null;
  /** Textura (foto) de un producto, cuando ya cargó: para las cajitas dentro del carrito 3D. */
  texturaDe: (id: number) => THREE.Texture | null;
  colorDe: (id: number) => THREE.Color;
  colisiones: Caja[];
  piso: THREE.Mesh;
  limites: Caja;
  zonasCajas: Caja[];
  mostradores: Mostrador[];
  /** Pasillo transversal (z) que une los pasillos con las cajas, y carriles libres (x) a lo largo. */
  zCruce: number;
  carriles: number[];
  /** Animación del cajero (respira). */
  animar: (dt: number) => void;
  inicio: THREE.Vector3;
};

// Medidas de la tienda (metros).
const ANCHO = 24;
const FONDO = 28;
const ALTO = 4.2;
const MEDIO_X = ANCHO / 2;
const MEDIO_Z = FONDO / 2;
const Z0 = -11; // fondo de los pasillos
const Z1 = 3; // frente de los pasillos (hacia la entrada)
const NIVELES = [0.25, 0.7, 1.15, 1.6]; // altura de cada estante de góndola
const SECCION = 1; // metros por sección de producto en góndola

const COLORES = {
  piso: '#dfe4ea',
  junta: '#c5ccd6',
  pared: '#eef2f7',
  franja: '#0a4383',
  acento: '#ed2853',
  gondola: '#f4f6f9',
  estante: '#cfd8e3',
  borde: '#0a4383',
  madera: '#c9a77c',
  metal: '#8e99a8',
};

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const eje = new THREE.Vector3(0, 1, 0);
const pos = new THREE.Vector3();
const uno = new THREE.Vector3(1, 1, 1);

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

/**
 * La foto de una prenda sin su fondo: se borra el fondo «inundando» desde los bordes (así una camisa
 * blanca no pierde su interior), se recorta a la prenda y se calcula su color (para el resto del maniquí).
 */
function prendaSinFondo(imagen: CanvasImageSource & { width: number; height: number }) {
  const max = 384;
  const k = Math.min(1, max / Math.max(imagen.width, imagen.height));
  const w = Math.max(1, Math.round(imagen.width * k));
  const h = Math.max(1, Math.round(imagen.height * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(imagen, 0, 0, w, h);
  const datos = g.getImageData(0, 0, w, h);
  const d = datos.data;
  // Color del fondo: el promedio de las cuatro esquinas.
  let fr = 0;
  let fg = 0;
  let fb = 0;
  for (const [x, y] of [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]]) {
    const i = (y * w + x) * 4;
    fr += d[i] / 4;
    fg += d[i + 1] / 4;
    fb += d[i + 2] / 4;
  }
  const esFondo = (i: number) =>
    d[i + 3] < 20 || Math.abs(d[i] - fr) + Math.abs(d[i + 1] - fg) + Math.abs(d[i + 2] - fb) < 54;
  const visto = new Uint8Array(w * h);
  const pila: number[] = [];
  for (let x = 0; x < w; x++) pila.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) pila.push(y * w, y * w + w - 1);
  while (pila.length) {
    const n = pila.pop()!;
    if (visto[n]) continue;
    visto[n] = 1;
    if (!esFondo(n * 4)) continue;
    d[n * 4 + 3] = 0;
    const x = n % w;
    if (x > 0) pila.push(n - 1);
    if (x < w - 1) pila.push(n + 1);
    if (n >= w) pila.push(n - w);
    if (n < w * (h - 1)) pila.push(n + w);
  }
  // Lo que quedó: borde de la prenda y su color promedio.
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  let r = 0;
  let gg = 0;
  let b = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 128) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      r += d[i];
      gg += d[i + 1];
      b += d[i + 2];
      n++;
    }
  }
  // Casi nada o casi todo: la foto no tiene un fondo liso que se pueda quitar.
  if (n < w * h * 0.05 || n > w * h * 0.97) return null;
  g.putImageData(datos, 0, 0);
  const recorte = document.createElement('canvas');
  recorte.width = x1 - x0 + 1;
  recorte.height = y1 - y0 + 1;
  recorte.getContext('2d')!.drawImage(c, x0, y0, recorte.width, recorte.height, 0, 0, recorte.width, recorte.height);
  const t = new THREE.CanvasTexture(recorte);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return {
    textura: t,
    aspecto: recorte.width / recorte.height,
    color: new THREE.Color(`rgb(${Math.round(r / n)}, ${Math.round(gg / n)}, ${Math.round(b / n)})`),
  };
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

/** Etiqueta de precio de un producto (la comparten todas sus copias). */
function texturaPrecio(p: Producto3D) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.textBaseline = 'middle';
  if (p.precioAnterior && p.descuento) {
    // Oferta: etiqueta roja, precio nuevo grande y el de antes tachado con el descuento.
    g.fillStyle = '#ed2853';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#ffffff';
    g.font = '800 42px Sarabun, system-ui, sans-serif';
    g.fillText(p.precio, 16, 34, 168);
    const pct = `−${p.descuento}%`;
    g.font = '800 24px Sarabun, system-ui, sans-serif';
    const wp = g.measureText(pct).width + 16;
    g.fillStyle = '#ffd23f';
    g.fillRect(256 - wp - 8, 16, wp, 36);
    g.fillStyle = '#7a0d26';
    g.fillText(pct, 256 - wp, 35);
    g.fillStyle = '#ffe3ea';
    g.font = '600 24px Sarabun, system-ui, sans-serif';
    const antes = `Antes ${p.precioAnterior}`;
    g.fillText(antes, 16, 76, 228);
    const w = Math.min(228, g.measureText(antes).width);
    g.fillRect(16, 75, w, 2.5);
  } else {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = COLORES.acento;
    g.fillRect(0, 0, 10, 96);
    g.fillStyle = COLORES.franja;
    g.font = '800 44px Sarabun, system-ui, sans-serif';
    g.fillText(p.precio, 24, 36, 220);
    g.fillStyle = '#526377';
    g.font = '500 22px Sarabun, system-ui, sans-serif';
    g.fillText(p.nombre, 24, 76, 220);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Material de etiqueta: se dibuja «delante» de lo que tenga detrás (sin parpadeo de colores). */
function materialEtiqueta(p: Producto3D) {
  return new THREE.MeshBasicMaterial({
    map: texturaPrecio(p),
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/** Silueta de una prenda (remera) de 0,6 × 0,62 m, con coordenadas de textura para la foto. */
function geometriaPrenda() {
  const s = new THREE.Shape();
  s.moveTo(-0.09, 0.31);
  s.quadraticCurveTo(0, 0.25, 0.09, 0.31); // cuello
  s.lineTo(0.25, 0.25);
  s.lineTo(0.3, 0.06);
  s.lineTo(0.19, 0.03);
  s.lineTo(0.18, -0.31);
  s.lineTo(-0.18, -0.31);
  s.lineTo(-0.19, 0.03);
  s.lineTo(-0.3, 0.06);
  s.lineTo(-0.25, 0.25);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 6);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 0.3) / 0.6, (p.getY(i) + 0.31) / 0.62);
  return g;
}

type Lado = { x: number; z0: number; z1: number; mira: 1 | -1 };
type Region = { lados: Lado[] };

export function construirTienda(
  escena: THREE.Scene,
  productos: Producto3D[],
  ligera: boolean,
  pasillos: string[] = [],
  crearPersona?: FabricaPersonas,
): Tienda {
  const solidos: THREE.Object3D[] = [];
  const elegibles: THREE.Object3D[] = [];
  const colisiones: Caja[] = [];
  const porMalla = new Map<THREE.Object3D, Producto3D>();
  const texturas = new Map<number, THREE.Texture>();
  const colores = new Map<number, THREE.Color>();
  const esperandoTextura = new Map<number, ((t: THREE.Texture) => void)[]>();
  const cargador = new THREE.TextureLoader();
  // Pasillos (de izquierda a derecha al entrar) y las categorías que hay en cada uno, para el letrero.
  const BORDES_PASILLO = [-MEDIO_X, -5, 0, 5, MEDIO_X];
  const CENTROS_PASILLO = [-8.4, -2.5, 2.5, 8.4];
  const categoriasPasillo = CENTROS_PASILLO.map(() => new Set<string>());
  const anotarPasillo = (x: number, categoria: string) => {
    if (!categoria) return;
    const i = BORDES_PASILLO.findIndex((b, k) => k > 0 && x < b) - 1;
    if (i >= 0 && i < categoriasPasillo.length) categoriasPasillo[i].add(categoria);
  };

  // ---------- fotos de productos (una vez cada una, compartidas) ----------
  const colorBase = (id: number) => new THREE.Color(`hsl(${(id * 47) % 360}, 45%, 72%)`);
  function conTextura(p: Producto3D, usar: (t: THREE.Texture) => void) {
    const t = texturas.get(p.id);
    if (t) return usar(t);
    const cola = esperandoTextura.get(p.id);
    if (cola) return void cola.push(usar);
    esperandoTextura.set(p.id, [usar]);
    if (!p.img) return;
    cargador.load(p.img, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = ligera ? 1 : 4;
      texturas.set(p.id, tex);
      // Color promedio de la foto: para los costados de las cajas y las prendas dobladas.
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 8;
        const g = c.getContext('2d')!;
        g.drawImage(tex.image as CanvasImageSource, 0, 0, 8, 8);
        const d = g.getImageData(0, 0, 8, 8).data;
        let r = 0;
        let gg = 0;
        let b = 0;
        for (let i = 0; i < d.length; i += 4) {
          r += d[i];
          gg += d[i + 1];
          b += d[i + 2];
        }
        const n = d.length / 4;
        colores.set(p.id, new THREE.Color(`rgb(${Math.round(r / n)}, ${Math.round(gg / n)}, ${Math.round(b / n)})`));
      } catch {
        /* sin color promedio: queda el de base */
      }
      esperandoTextura.get(p.id)?.forEach((f) => f(tex));
      esperandoTextura.delete(p.id);
    });
  }
  const colorDe = (id: number) => colores.get(id) ?? colorBase(id);

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
  for (const [x, z, ancho, rot] of [
    [0, -MEDIO_Z, ANCHO, 0],
    [-MEDIO_X, 0, FONDO, Math.PI / 2],
    [MEDIO_X, 0, FONDO, -Math.PI / 2],
  ] as const) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, ALTO), matPared);
    m.position.set(x, ALTO / 2, z);
    m.rotation.y = rot;
    escena.add(m);
    solidos.push(m);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(ancho, 0.35), matFranja);
    f.position.set(x, ALTO - 0.6, z).add(new THREE.Vector3(0, 0, 0.01).applyAxisAngle(eje, rot));
    f.rotation.y = rot;
    escena.add(f);
  }
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
    sol.shadow.bias = -0.0008;
    sol.shadow.normalBias = 0.02;
  }
  escena.add(sol);
  const paneles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.04, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 20);
  let k = 0;
  for (const x of [-7.5, -2.5, 2.5, 7.5]) {
    for (const z of [-10, -5, 0, 5, 10]) {
      m4.makeTranslation(x, ALTO - 0.03, z);
      paneles.setMatrixAt(k++, m4);
    }
  }
  escena.add(paneles);

  // ---------- qué productos van en cada tipo de exhibición ----------
  const grupos: Record<Exhibicion, Producto3D[]> = { gondola: [], perchero: [], maniqui: [], estante: [], exhibidor: [] };
  for (const p of productos) grupos[p.exhibicion].push(p);
  const ordenar = (l: Producto3D[]) =>
    [...l].sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
  // Si ninguna categoría quedó en góndola, las góndolas muestran todo (la tienda nunca queda vacía).
  const enGondola = ordenar(grupos.gondola.length ? grupos.gondola : productos);
  const hayPercheros = grupos.perchero.length > 0;
  const hayEstantes = grupos.estante.length > 0;

  // ---------- góndolas ----------
  const matGondola = new THREE.MeshStandardMaterial({ color: COLORES.gondola, roughness: 0.6 });
  const matEstante = new THREE.MeshStandardMaterial({ color: COLORES.estante, roughness: 0.5 });
  const matBorde = new THREE.MeshBasicMaterial({ color: COLORES.borde });
  const largo = Z1 - Z0;
  const zc = (Z0 + Z1) / 2;
  const PROF = 0.45;

  function gondola(x: number, doble: boolean, mira: 1 | -1, region: Region) {
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(doble ? 0.12 : 0.08, 2.0, largo), matGondola);
    cuerpo.position.set(x, 1.0, zc);
    cuerpo.castShadow = !ligera;
    escena.add(cuerpo);
    solidos.push(cuerpo);
    const base = new THREE.Mesh(new THREE.BoxGeometry(PROF * (doble ? 2 : 1), 0.12, largo), matGondola);
    base.position.set(doble ? x : x + (mira * PROF) / 2, 0.06, zc);
    escena.add(base);
    for (const cara of (doble ? [1, -1] : [mira]) as (1 | -1)[]) {
      for (const y of NIVELES.slice(1)) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(PROF, 0.03, largo), matEstante);
        e.position.set(x + (cara * PROF) / 2, y - 0.02, zc);
        escena.add(e);
      }
      for (const y of NIVELES) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.06, largo), matBorde);
        b.position.set(x + cara * (PROF + 0.005), y - 0.05, zc);
        escena.add(b);
      }
      region.lados.push({ x: x + cara * 0.07, z0: Z0, z1: Z1, mira: cara });
    }
    const minX = doble ? x - PROF : Math.min(x, x + mira * PROF);
    const maxX = doble ? x + PROF : Math.max(x, x + mira * PROF);
    colisiones.push({ minX: minX - 0.05, maxX: maxX + 0.05, minZ: Z0 - 0.05, maxZ: Z1 + 0.05 });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(PROF * (doble ? 2 : 1) + 0.1, 0.35, 0.1), matBorde);
    cab.position.set(doble ? x : x + (mira * PROF) / 2, 2.15, Z1);
    escena.add(cab);
  }

  const regionGondola: Region = { lados: [] };
  gondola(-5, true, 1, regionGondola);
  gondola(0, true, 1, regionGondola);
  if (!hayPercheros) {
    gondola(5, true, 1, regionGondola);
    gondola(MEDIO_X - 0.05, false, -1, regionGondola);
  }
  if (!hayEstantes) gondola(-MEDIO_X + 0.05, false, 1, regionGondola);

  // Productos en góndola: un pasillo por categoría, como en un súper. Cada pasillo tiene dos caras
  // (estantes de cada lado); cada categoría va en las suyas, repetida para que se vea lleno.
  //   - Menos categorías que pasillos: una por pasillo, y los pasillos que sobran repiten las más grandes.
  //   - Más categorías que pasillos: cada cara de un pasillo lleva una (dos por pasillo, las dos en el letrero).
  //   - Más categorías que caras: las más chicas se suman a la cara que tenga menos productos.
  type Hueco = { x: number; y: number; z: number; mira: 1 | -1 };
  const huecosPor = new Map<number, Hueco[]>();
  const pasilloDe = (x: number) => BORDES_PASILLO.findIndex((b, k) => k > 0 && x < b) - 1;
  const caras = [...regionGondola.lados].sort(
    (a, b) => pasilloDe(a.x + a.mira * 0.4) - pasilloDe(b.x + b.mira * 0.4) || a.x - b.x,
  );
  const porCategoria = new Map<string, Producto3D[]>();
  // Sin categoría (WooCommerce no la manda): van juntos como «Otros productos».
  const grupoDe = (p: Producto3D) => p.categoria || 'Otros productos';
  for (const p of enGondola) porCategoria.set(grupoDe(p), [...(porCategoria.get(grupoDe(p)) ?? []), p]);
  const categorias = [...porCategoria.keys()].sort(
    (a, b) => porCategoria.get(b)!.length - porCategoria.get(a)!.length || a.localeCompare(b),
  );
  const pasillosUsados = [...new Set(caras.map((l) => pasilloDe(l.x + l.mira * 0.4)))];
  const carasDe = (i: number) => caras.filter((l) => pasilloDe(l.x + l.mira * 0.4) === i);
  // Orden de llenado: la primera cara de cada pasillo, después la segunda.
  const orden = [...pasillosUsados.map((i) => carasDe(i)[0]), ...pasillosUsados.map((i) => carasDe(i)[1]).filter(Boolean)];
  const enCara = new Map<Lado, string[]>(caras.map((l) => [l, []]));
  const cuantos = (l: Lado) => enCara.get(l)!.reduce((t, c) => t + porCategoria.get(c)!.length, 0);
  categorias.forEach((cat, k) => {
    if (categorias.length <= pasillosUsados.length) {
      for (const l of carasDe(pasillosUsados[k])) enCara.get(l)!.push(cat);
    } else if (k < orden.length) enCara.get(orden[k])!.push(cat);
    else enCara.get(orden.reduce((a, b) => (cuantos(b) < cuantos(a) ? b : a)))!.push(cat);
  });
  // Pasillos que quedaron vacíos (pocas categorías): repiten las categorías, de la más grande a la más chica.
  pasillosUsados.forEach((i, k) => {
    for (const l of carasDe(i)) {
      if (enCara.get(l)!.length) continue;
      const hermana = carasDe(i).find((o) => enCara.get(o)!.length);
      enCara.get(l)!.push(...(hermana ? enCara.get(hermana)! : categorias.length ? [categorias[k % categorias.length]] : []));
    }
  });
  for (const lado of caras) {
    const deCara = enCara.get(lado)!.flatMap((c) => porCategoria.get(c)!);
    let n = 0;
    for (let z = lado.z0 + SECCION / 2; z < lado.z1; z += SECCION) {
      for (const y of NIVELES) {
        const p = deCara[n++ % Math.max(1, deCara.length)];
        if (!p) continue;
        anotarPasillo(lado.x + lado.mira * 0.4, grupoDe(p));
        const lista = huecosPor.get(p.id) ?? [];
        lista.push({ x: lado.x, y, z, mira: lado.mira });
        huecosPor.set(p.id, lista);
      }
    }
  }
  const POR_HUECO = 4;
  const caja = new THREE.BoxGeometry(0.22, 0.3, 0.16);
  caja.translate(0, 0.15, 0);
  const etiqueta = new THREE.PlaneGeometry(0.34, 0.13);
  for (const p of enGondola) {
    const huecos = huecosPor.get(p.id);
    if (!huecos) continue;
    const lateral = new THREE.MeshStandardMaterial({ color: colorBase(p.id), roughness: 0.7 });
    const frente = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
    const malla = new THREE.InstancedMesh(caja, [lateral, lateral, lateral, lateral, frente, lateral], huecos.length * POR_HUECO);
    malla.castShadow = !ligera;
    let i = 0;
    for (const h of huecos) {
      q.setFromAxisAngle(eje, (h.mira * Math.PI) / 2);
      for (let j = 0; j < POR_HUECO; j++) {
        pos.set(h.x + h.mira * 0.2, h.y, h.z - SECCION / 2 + (SECCION / POR_HUECO) * (j + 0.5));
        m4.compose(pos, q, uno);
        malla.setMatrixAt(i++, m4);
      }
    }
    escena.add(malla);
    elegibles.push(malla);
    porMalla.set(malla, p);
    // Precio 2 cm por delante de la franja del estante y debajo de los productos: no parpadea
    // (antes estaba en el mismo plano que la franja) ni queda tapado.
    const precios = new THREE.InstancedMesh(etiqueta, materialEtiqueta(p), huecos.length);
    huecos.forEach((h, k2) => {
      q.setFromAxisAngle(eje, (h.mira * Math.PI) / 2);
      pos.set(h.x + h.mira * 0.41, h.y - 0.075, h.z);
      m4.compose(pos, q, uno);
      precios.setMatrixAt(k2, m4);
    });
    escena.add(precios);
    conTextura(p, (t) => {
      frente.map = t;
      frente.needsUpdate = true;
      lateral.color.copy(colorDe(p.id)).lerp(new THREE.Color('#ffffff'), 0.35);
    });
  }

  // ---------- percheros (prendas colgadas) ----------
  if (hayPercheros) {
    const lista = ordenar(grupos.perchero);
    const matMetal = new THREE.MeshStandardMaterial({ color: COLORES.metal, roughness: 0.35, metalness: 0.6 });
    const prenda = geometriaPrenda();
    const percha = new THREE.TorusGeometry(0.17, 0.006, 4, 16, Math.PI);
    const gancho = new THREE.TorusGeometry(0.03, 0.005, 4, 12, Math.PI * 1.3);
    const rieles: { x: number; mira: 1 | -1 }[] = [];
    // Perchero doble en el lugar de la góndola derecha, y perchero de pared a la derecha.
    const rack = (x: number, z0: number, z1: number, doble: boolean, mira: 1 | -1) => {
      for (const xr of doble ? [x - 0.3, x + 0.3] : [x]) {
        const riel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, z1 - z0, 8).rotateX(Math.PI / 2), matMetal);
        riel.position.set(xr, 1.7, (z0 + z1) / 2);
        escena.add(riel);
      }
      for (const z of [z0, z1]) {
        const poste = new THREE.Mesh(new THREE.BoxGeometry(doble ? 0.7 : 0.08, 1.75, 0.05), matMetal);
        poste.position.set(x, 0.875, z);
        escena.add(poste);
        solidos.push(poste);
      }
      if (doble) {
        rieles.push({ x: x - 0.3, mira: -1 }, { x: x + 0.3, mira: 1 });
        colisiones.push({ minX: x - 0.65, maxX: x + 0.65, minZ: z0 - 0.1, maxZ: z1 + 0.1 });
      } else {
        rieles.push({ x, mira });
        colisiones.push({ minX: Math.min(x, x + mira * 0.6), maxX: Math.max(x, x + mira * 0.6), minZ: z0 - 0.1, maxZ: z1 + 0.1 });
      }
    };
    rack(5, Z0 + 0.5, Z1 - 0.5, true, 1);
    rack(MEDIO_X - 0.35, Z0 + 0.5, Z1 - 0.5, false, -1);
    // Prendas «de frente» (como en una boutique): una al lado de la otra cada 68 cm, mirando al
    // pasillo, apenas giradas y a distinta profundidad para que no se pisen.
    const lugares = new Map<number, { x: number; z: number; giro: number }[]>();
    const perchas: THREE.Matrix4[] = [];
    let i = 0;
    for (const r of rieles) {
      for (let z = Z0 + 0.9; z < Z1 - 0.8; z += 0.68) {
        const p = lista[i % lista.length];
        const giro = (r.mira * Math.PI) / 2 + Math.sin(z * 7.3) * 0.08;
        const x = r.x + r.mira * (0.05 + (i % 2) * 0.03);
        i++;
        anotarPasillo(r.x + r.mira * 0.4, p.categoria);
        const l = lugares.get(p.id) ?? [];
        l.push({ x, z, giro });
        lugares.set(p.id, l);
        q.setFromAxisAngle(eje, giro);
        perchas.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 1.62, z), q.clone(), uno));
      }
    }
    const mallaPerchas = new THREE.InstancedMesh(percha, matMetal, perchas.length);
    const mallaGanchos = new THREE.InstancedMesh(gancho, matMetal, perchas.length);
    perchas.forEach((m, j) => {
      mallaPerchas.setMatrixAt(j, m);
      mallaGanchos.setMatrixAt(j, new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, 0.18, 0)));
    });
    escena.add(mallaPerchas, mallaGanchos);
    for (const p of lista) {
      const l = lugares.get(p.id);
      if (!l) continue;
      const mat = new THREE.MeshStandardMaterial({ color: colorBase(p.id), side: THREE.DoubleSide, roughness: 0.85 });
      const malla = new THREE.InstancedMesh(prenda, mat, l.length);
      malla.castShadow = !ligera;
      l.forEach((u, j) => {
        q.setFromAxisAngle(eje, u.giro);
        malla.setMatrixAt(j, m4.compose(pos.set(u.x, 1.3, u.z), q, uno));
      });
      escena.add(malla);
      elegibles.push(malla);
      porMalla.set(malla, p);
      conTextura(p, (t) => {
        mat.map = t;
        mat.color.set('#ffffff');
        mat.needsUpdate = true;
      });
    }
  }

  // ---------- estantes de pared (prendas dobladas y accesorios) ----------
  if (hayEstantes) {
    const lista = ordenar(grupos.estante);
    const x0 = -MEDIO_X;
    const matMadera = new THREE.MeshStandardMaterial({ color: COLORES.madera, roughness: 0.7 });
    const alturas = [0.35, 0.8, 1.25, 1.7];
    const fondo = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.1, largo), matMadera);
    fondo.position.set(x0 + 0.04, 1.05, zc);
    escena.add(fondo);
    solidos.push(fondo);
    for (const y of alturas) {
      const tabla = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, largo), matMadera);
      tabla.position.set(x0 + 0.29, y - 0.02, zc);
      tabla.castShadow = !ligera;
      escena.add(tabla);
    }
    colisiones.push({ minX: x0, maxX: x0 + 0.6, minZ: Z0 - 0.05, maxZ: Z1 + 0.05 });
    // Pilas de 4 prendas dobladas cada 45 cm; arriba se ve la foto, los costados con su color.
    const doblada = new THREE.BoxGeometry(0.3, 0.055, 0.36);
    doblada.translate(0, 0.0275, 0);
    doblada.userData.frente = 'y'; // al levantarla, se muestra la cara de arriba (la de la foto)
    const lugares = new Map<number, THREE.Vector3[]>();
    let i = 0;
    for (const y of alturas) {
      for (let z = Z0 + 0.4; z < Z1 - 0.2; z += 0.45) {
        const p = lista[i++ % lista.length];
        anotarPasillo(x0 + 1, p.categoria);
        const l = lugares.get(p.id) ?? [];
        for (let a = 0; a < 4; a++) l.push(new THREE.Vector3(x0 + 0.3, y + a * 0.058, z));
        lugares.set(p.id, l);
      }
    }
    for (const p of lista) {
      const l = lugares.get(p.id);
      if (!l) continue;
      const costado = new THREE.MeshStandardMaterial({ color: colorBase(p.id), roughness: 0.9 });
      const arriba = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
      const malla = new THREE.InstancedMesh(doblada, [costado, costado, arriba, costado, costado, costado], l.length);
      l.forEach((v, j) => malla.setMatrixAt(j, m4.makeTranslation(v.x, v.y, v.z)));
      escena.add(malla);
      elegibles.push(malla);
      porMalla.set(malla, p);
      const precios = new THREE.InstancedMesh(etiqueta, materialEtiqueta(p), l.length / 4);
      for (let j = 0; j < l.length; j += 4) {
        q.setFromAxisAngle(eje, Math.PI / 2);
        precios.setMatrixAt(j / 4, m4.compose(pos.set(x0 + 0.56, l[j].y - 0.06, l[j].z), q, uno));
      }
      escena.add(precios);
      conTextura(p, (t) => {
        arriba.map = t;
        arriba.needsUpdate = true;
        costado.color.copy(colorDe(p.id));
      });
    }
  }

  // ---------- maniquíes (conjuntos) ----------
  // Los primeros 4 van en la vidriera de la entrada, a los lados de la pantalla, mirando al que entra
  // (se ven apenas se abre la tienda). Si hay más, siguen en una fila al fondo, detrás de las góndolas.
  const VIDRIERA_X = [-2.0, 2.0, -3.7, 3.7];
  const VIDRIERA_Z = 6.4;
  const enVidriera: Producto3D[] = [];
  if (grupos.maniqui.length) {
    const lista = ordenar(grupos.maniqui).slice(0, 10);
    const alFondo = lista.slice(VIDRIERA_X.length);
    const matBlanco = new THREE.MeshStandardMaterial({ color: '#f3f3f1', roughness: 0.4 });
    const matPedestal = new THREE.MeshStandardMaterial({ color: '#2b3442', roughness: 0.5 });
    const paso = Math.min(2.2, 20 / Math.max(1, alFondo.length));
    lista.forEach((p, i) => {
      const adelante = i < VIDRIERA_X.length;
      if (adelante) enVidriera.push(p);
      const j = i - VIDRIERA_X.length;
      const x = adelante ? VIDRIERA_X[i] : -((alFondo.length - 1) * paso) / 2 + j * paso;
      const z = adelante ? VIDRIERA_Z : -MEDIO_Z + 1.3;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.22, 24), matPedestal);
      pedestal.position.y = 0.11;
      g.add(pedestal);
      const ropa = new THREE.MeshStandardMaterial({ color: colorBase(p.id), roughness: 0.8 });
      const piernas = new THREE.MeshStandardMaterial({ color: '#3d4a5c', roughness: 0.8 });
      const parte = (geo: THREE.BufferGeometry, mat: THREE.Material, x2: number, y: number, rz = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x2, y, 0);
        m.rotation.z = rz;
        m.castShadow = !ligera;
        g.add(m);
        elegibles.push(m);
        porMalla.set(m, p);
        return m;
      };
      const torso = parte(new THREE.CapsuleGeometry(0.21, 0.45, 6, 16), ropa, 0, 1.42);
      torso.scale.z = 0.7;
      parte(new THREE.CapsuleGeometry(0.085, 0.65, 4, 10), piernas, -0.1, 0.78);
      parte(new THREE.CapsuleGeometry(0.085, 0.65, 4, 10), piernas, 0.1, 0.78);
      const brazos = [
        parte(new THREE.CapsuleGeometry(0.06, 0.48, 4, 10), ropa, -0.29, 1.4, -0.08),
        parte(new THREE.CapsuleGeometry(0.06, 0.48, 4, 10), ropa, 0.29, 1.4, 0.08),
      ];
      parte(new THREE.SphereGeometry(0.13, 20, 16), matBlanco, 0, 1.92);
      parte(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12), matBlanco, 0, 1.76);
      // Cartel con el precio, en el pedestal, mirando a la tienda.
      const cartelPrecio = new THREE.Mesh(etiqueta, materialEtiqueta(p));
      cartelPrecio.position.set(0, 0.13, 0.47);
      g.add(cartelPrecio);
      escena.add(g);
      colisiones.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
      // La prenda: la foto sin fondo, apoyada adelante y atrás del torso (se ve como puesta), y el resto
      // del cuerpo del color de la prenda. Si la foto no tiene fondo liso, se usa su color promedio.
      conTextura(p, (t) => {
        const prenda = prendaSinFondo(t.image as HTMLImageElement);
        if (!prenda) {
          ropa.color.copy(colorDe(p.id));
          return;
        }
        ropa.color.copy(prenda.color);
        // El cuerpo queda escondido detrás de la foto (las mangas ya están en la foto).
        brazos.forEach((b) => (b.visible = false));
        torso.scale.set(0.8, 0.82, 0.6);
        torso.position.y = 1.36;
        // Del hombro (1.72) a la cadera (1.0), sin pasarse de ancho.
        let alto = 0.78;
        let ancho = alto * prenda.aspecto;
        if (ancho > 0.74) {
          ancho = 0.74;
          alto = ancho / prenda.aspecto;
        }
        const mat = new THREE.MeshStandardMaterial({ map: prenda.textura, transparent: true, alphaTest: 0.5, roughness: 0.85 });
        for (const lado of [1, -1]) {
          const frente = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), mat);
          frente.position.set(0, 1.72 - alto / 2, lado * 0.16);
          if (lado < 0) frente.rotation.y = Math.PI;
          frente.castShadow = !ligera;
          g.add(frente);
          elegibles.push(frente);
          porMalla.set(frente, p);
        }
      });
    });
  }

  // ---------- exhibidor (pantalla de destacados) a la entrada ----------
  const destacados = ordenar([
    ...grupos.exhibidor,
    ...productos.filter((p) => p.destacado && p.exhibicion !== 'exhibidor'),
  ]);
  const enPantalla = (destacados.length ? destacados : enGondola).slice(0, 6);
  const COLS = 2;
  const FILAS = 3;
  let pantalla: THREE.Mesh | null = null;
  if (enPantalla.length) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 880;
    const g = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dibujar = () => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 512, 880);
      g.fillStyle = COLORES.franja;
      g.fillRect(0, 0, 512, 88);
      g.fillStyle = '#ffffff';
      g.font = '800 46px Sarabun, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(destacados.length ? 'Destacados' : 'Recomendados', 256, 46);
      enPantalla.forEach((p, i) => {
        const cx = (i % COLS) * 256;
        const cy = 88 + Math.floor(i / COLS) * 264;
        const t = texturas.get(p.id);
        if (t) g.drawImage(t.image as CanvasImageSource, cx + 28, cy + 12, 200, 170);
        else {
          g.fillStyle = `#${colorBase(p.id).getHexString()}`;
          g.fillRect(cx + 28, cy + 12, 200, 170);
        }
        if (p.descuento) {
          // Oferta: cinta con el descuento sobre la foto.
          g.fillStyle = '#ed2853';
          g.fillRect(cx + 28, cy + 12, 92, 34);
          g.fillStyle = '#ffffff';
          g.font = '800 22px Sarabun, system-ui, sans-serif';
          g.fillText(`−${p.descuento}%`, cx + 74, cy + 30);
        }
        g.fillStyle = p.descuento ? '#ed2853' : COLORES.acento;
        g.font = '800 30px Sarabun, system-ui, sans-serif';
        g.fillText(p.precio, cx + 128, cy + 206);
        g.fillStyle = '#526377';
        g.font = '500 20px Sarabun, system-ui, sans-serif';
        g.fillText(p.nombre, cx + 128, cy + 238, 230);
      });
      tex.needsUpdate = true;
    };
    dibujar();
    enPantalla.forEach((p) => conTextura(p, dibujar));
    const kiosco = new THREE.Group();
    kiosco.position.set(0, 0, 6.4);
    const marco = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.25, 0.16), new THREE.MeshStandardMaterial({ color: '#1d2430', roughness: 0.4 }));
    marco.position.y = 1.18;
    marco.castShadow = !ligera;
    kiosco.add(marco);
    pantalla = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 1.99), new THREE.MeshBasicMaterial({ map: tex }));
    pantalla.position.set(0, 1.2, 0.081);
    kiosco.add(pantalla);
    const reverso = cartel('Tindershop', 1.16, 0.4, COLORES.franja, '#ffffff', 120);
    reverso.position.set(0, 1.6, -0.081);
    reverso.rotation.y = Math.PI;
    kiosco.add(reverso);
    escena.add(kiosco);
    elegibles.push(pantalla);
    solidos.push(marco);
    colisiones.push({ minX: -0.7, maxX: 0.7, minZ: 6.25, maxZ: 6.55 });
  }

  // ---------- carteles colgados del techo (con sus cables, como en una tienda real) ----------
  const matCable = new THREE.MeshStandardMaterial({ color: '#6b7684', metalness: 0.6, roughness: 0.4 });
  function colgar(x: number, z: number, arriba: number, separacion: number, aLoLargoDeZ = false) {
    const largoCable = ALTO - arriba;
    for (const lado of [-1, 1]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, largoCable, 6), matCable);
      cable.position.set(aLoLargoDeZ ? x : x + lado * separacion, arriba + largoCable / 2, aLoLargoDeZ ? z + lado * separacion : z);
      escena.add(cable);
      const anclaje = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), matCable);
      anclaje.position.set(cable.position.x, ALTO - 0.01, cable.position.z);
      escena.add(anclaje);
    }
  }

  // ---------- letreros de los pasillos ----------
  // «PASILLO N» y lo que hay: el texto escrito en WordPress (Ajustes → Tindershop) o, si no hay, las
  // categorías de los productos de ese pasillo. Doble faz: se lee al entrar y al salir del pasillo.
  function letrero(numero: number, texto: string) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 300;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 1024, 300);
    g.fillStyle = COLORES.franja;
    g.fillRect(0, 0, 1024, 92);
    g.fillStyle = '#ffffff';
    g.font = '800 64px Sarabun, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('PASILLO ' + numero, 512, 50);
    g.fillStyle = COLORES.franja;
    // El texto se achica si es largo (hasta dos líneas).
    const palabras = texto.split(' ');
    let lineas = [texto];
    let px = 84;
    g.font = '800 ' + px + 'px Sarabun, system-ui, sans-serif';
    if (g.measureText(texto).width > 960) {
      const mitad = Math.ceil(palabras.length / 2);
      lineas = [palabras.slice(0, mitad).join(' '), palabras.slice(mitad).join(' ')];
      px = 62;
    }
    g.font = '800 ' + px + 'px Sarabun, system-ui, sans-serif';
    lineas.forEach((l, k) => g.fillText(l, 512, 196 + (k - (lineas.length - 1) / 2) * (px + 8), 980));
    g.fillStyle = COLORES.acento;
    g.fillRect(0, 288, 1024, 12);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    const tablero = new THREE.Group();
    tablero.add(new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.76, 0.04), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 })));
    for (const cara of [1, -1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.44, 0.715), new THREE.MeshBasicMaterial({ map: t }));
      m.position.z = cara * 0.021;
      if (cara < 0) m.rotation.y = Math.PI;
      tablero.add(m);
    }
    return tablero;
  }
  // Cartel colgado sobre la vidriera con las categorías de los maniquíes (doble faz).
  if (enVidriera.length) {
    const nombres = [...new Set(enVidriera.map((p) => p.categoria).filter(Boolean))].sort().join(' · ') || 'Vidriera';
    // Un maniquí: el cartel justo encima. Más: uno a cada lado de la pantalla.
    for (const x of enVidriera.length > 1 ? [-2.85, 2.85] : [VIDRIERA_X[0]]) {
      const s = cartel(nombres, 1.7, 0.36, COLORES.franja, '#ffffff', nombres.length > 22 ? 44 : 60);
      // Bajo, justo sobre los maniquíes: desde la entrada no tapa los letreros de los pasillos.
      s.position.set(x, 2.3, VIDRIERA_Z);
      escena.add(s);
      const s2 = s.clone();
      s2.rotation.y = Math.PI;
      escena.add(s2);
      colgar(x, VIDRIERA_Z, 2.48, 0.7);
    }
  }

  CENTROS_PASILLO.forEach((x, i) => {
    const escrito = (pasillos[i] ?? '').trim();
    const texto = escrito || [...categoriasPasillo[i]].sort().join(' · ');
    if (!texto && !pasillos.length) return; // pasillo vacío: sin letrero
    const l = letrero(i + 1, texto || ' ');
    l.position.set(x, 3.3, Z1 + 0.4);
    escena.add(l);
    colgar(x, Z1 + 0.4, 3.68, 1.0);
  });

  // ---------- cajas (mostradores) con su cajero ----------
  const matMostrador = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
  const matCinta = new THREE.MeshStandardMaterial({ color: '#2b3442', roughness: 0.8 });
  const mostradores: Mostrador[] = [];
  for (const x of [-7.5, 7.5]) {
    const lado = Math.sign(x);
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 3), matMostrador);
    m.position.set(x, 0.45, 8);
    m.castShadow = !ligera;
    escena.add(m);
    solidos.push(m);
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 2.6), matCinta);
    c.position.set(x, 0.91, 8);
    escena.add(c);
    const registradora = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.4), matCinta);
    registradora.position.set(x + lado * 0.2, 1.03, 8.9);
    escena.add(registradora);
    colisiones.push({ minX: x - 0.55, maxX: x + 0.55, minZ: 6.45, maxZ: 9.55 });
    const s = cartel('Cajas', 1.6, 0.5, COLORES.acento, '#ffffff', 90);
    s.position.set(x, 2.6, 8);
    s.rotation.y = (Math.PI / 2) * -lado;
    escena.add(s);
    const s2 = s.clone();
    s2.rotation.y += Math.PI;
    escena.add(s2);
    colgar(x, 8, 2.85, 0.6, true);
    // Cajero detrás del mostrador, mirando al cliente (hacia el centro de la tienda).
    // Uniforme de la tienda (remera azul), cada cajero con su propia cara y peinado.
    const uniforme = { remera: '#0474ba', pantalon: '#2b3442' };
    const cajero = crearPersona
      ? crearPersona(lado > 0 ? 7 : 12, uniforme)
      : crearPersonaje({ ...aparienciaDe(lado > 0 ? 7 : 12), ...uniforme });
    const rumboCajero = (lado * Math.PI) / 2; // caja derecha: mira hacia -x; izquierda: hacia +x
    cajero.posicion.set(x + lado * 0.95, 0, 8);
    cajero.rumbo = rumboCajero;
    cajero.animar(0, 0);
    escena.add(cajero.grupo);
    colisiones.push({ minX: x + lado * 0.95 - 0.3, maxX: x + lado * 0.95 + 0.3, minZ: 7.7, maxZ: 8.3 });
    mostradores.push({
      // El cliente queda con su carrito tocando el mostrador (el carrito va 1,3 m por delante).
      cliente: new THREE.Vector3(x - lado * 1.95, 0, 8),
      rumboCliente: -rumboCajero,
      cajero,
    });
  }

  // Carriles libres a lo largo de la tienda (para ir solo a la caja sin chocar).
  const carriles = hayPercheros ? [-2.5, 2.45] : [-2.5, 2.5, 7.75];
  carriles.push(hayEstantes ? -8.9 : -8.6);

  let tiempo = 0;
  return {
    solidos,
    elegibles,
    productoDe(golpe) {
      if (pantalla && golpe.object === pantalla && golpe.uv) {
        // La pantalla: qué recuadro tocó (2 columnas × 3 filas, debajo del título).
        const fila = Math.floor(((1 - golpe.uv.y) * 880 - 88) / 264);
        const col = Math.floor(golpe.uv.x * COLS);
        return fila >= 0 && fila < FILAS ? enPantalla[fila * COLS + col] ?? null : null;
      }
      return porMalla.get(golpe.object) ?? null;
    },
    tomar(golpe) {
      const producto = this.productoDe(golpe);
      if (!producto) return null;
      const malla = golpe.object as THREE.InstancedMesh;
      if (malla.isInstancedMesh && golpe.instanceId !== undefined) {
        // La misma pieza del estante (caja, prenda o ropa doblada), con su foto.
        const id = golpe.instanceId;
        const desde = new THREE.Matrix4();
        malla.getMatrixAt(id, desde);
        const vacia = new THREE.Matrix4().makeScale(0, 0, 0);
        return {
          producto,
          objeto: new THREE.Mesh(malla.geometry, malla.material),
          desde,
          ocultar() {
            malla.setMatrixAt(id, vacia);
            malla.instanceMatrix.needsUpdate = true;
          },
          restaurar() {
            malla.setMatrixAt(id, desde);
            malla.instanceMatrix.needsUpdate = true;
          },
        };
      }
      // Maniquí o pantalla: se toma una caja del producto, desde donde se tocó.
      const t = texturas.get(producto.id);
      const caja2 = new THREE.BoxGeometry(0.22, 0.3, 0.16);
      caja2.translate(0, 0.15, 0);
      const lat = new THREE.MeshStandardMaterial({ color: colorDe(producto.id) });
      const fr = new THREE.MeshStandardMaterial({ color: '#ffffff', map: t ?? null });
      return {
        producto,
        objeto: new THREE.Mesh(caja2, [lat, lat, lat, lat, fr, lat]),
        desde: new THREE.Matrix4().makeTranslation(golpe.point.x, golpe.point.y - 0.15, golpe.point.z),
        ocultar() {},
        restaurar() {},
      };
    },
    texturaDe: (id) => texturas.get(id) ?? null,
    colorDe,
    colisiones,
    piso,
    limites: { minX: -MEDIO_X + 0.35, maxX: MEDIO_X - 0.35, minZ: -MEDIO_Z + 0.35, maxZ: MEDIO_Z - 0.6 },
    zonasCajas: mostradores.map((m) => ({ minX: m.cliente.x - 1.2, maxX: m.cliente.x + 1.2, minZ: 6.2, maxZ: 9.8 })),
    mostradores,
    zCruce: 4.6,
    carriles,
    animar(dt) {
      tiempo += dt;
      for (const m of mostradores) m.cajero.animar(dt, 0); // respira (animación de estar quieto)
    },
    inicio: new THREE.Vector3(0, 0, MEDIO_Z - 2.2),
  };
}
