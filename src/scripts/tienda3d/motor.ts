// Motor de la tienda 3D: render, recorrido, cámaras (tercera y primera persona), controles de
// computadora, celular y VR (WebXR), colisiones, carrito 3D, ir a la caja y selección de productos.
//
// Caminar es como en la vida real: el comprador siempre mira hacia adelante.
//   adelante (W / ↑ / joystick arriba)   camina hacia adelante
//   atrás    (S / ↓ / joystick abajo)    retrocede sin darse vuelta (más despacio)
//   girar    (A D / ← → / joystick a los lados / arrastrar el mouse o el dedo)
//            gira al comprador y la tienda gira con él (la cámara siempre queda detrás o en sus ojos)
// Las dos cámaras usan la misma posición y orientación: cambiar de cámara no reinicia el recorrido.
import * as THREE from 'three';
import { construirTienda, type Producto3D, type Caja, type Mostrador, type Tomado } from './escena';
import { crearPersonaje, aparienciaDe, ALTURA_OJOS, type Personaje } from './personaje';
import { crearCarrito, type ItemCarrito, type Carrito3D } from './carrito';
import type { Otro } from './presencia';
import type { FabricaPersonas } from './personaReal';

export type Modo = 'tercera' | 'primera';

export type Eventos = {
  /** Producto frente al comprador (o null): para el aviso «E para ver». */
  enFoco: (p: Producto3D | null) => void;
  /** El comprador levantó un producto del estante para mirarlo (clic, toque o E). */
  elegir: (p: Producto3D) => void;
  /** Entró o salió de la zona de cajas. */
  enCajas: (si: boolean) => void;
  /** Llegó caminando a la caja (después de «Pagar»). */
  llegoACaja: () => void;
  /** En VR, el gatillo sobre un producto lo agrega directo al carrito. */
  agregarVR: (p: Producto3D) => Promise<string>;
};

export type Motor = {
  modo: () => Modo;
  cambiarModo: (m?: Modo) => Modo;
  /** Joystick del celular: x (girar) y z (adelante/atrás), de -1 a 1. */
  joystick: (x: number, z: number) => void;
  /** Mirar con el dedo o el mouse (píxeles arrastrados). */
  mirar: (dx: number, dy: number) => void;
  zoom: (delta: number) => void;
  /** Elige el producto bajo un punto de la pantalla (toque / clic). */
  elegirEn: (x: number, y: number) => void;
  elegirEnFoco: () => void;
  /** Termina de mirar el producto levantado: lo devuelve al estante o lo pone en el carrito. */
  soltar: (destino: 'estante' | 'carrito') => Promise<void>;
  pausar: (si: boolean) => void;
  /** Multijugador: los demás compradores (los que no están en la lista se van). */
  otros: (lista: Otro[]) => void;
  /** Multijugador: dónde está este comprador (para avisarle a los demás). */
  propio: () => { x: number; z: number; r: number };
  /** Lo que hay en el carrito real de WooCommerce: se ve adentro del carrito 3D. */
  ponerCarrito: (items: ItemCarrito[]) => void;
  /** El comprador camina solo, con su carrito, hasta la caja más cercana. */
  irACaja: () => void;
  entrarVR: () => Promise<void>;
  vrDisponible: () => Promise<boolean>;
  /** Para pruebas: lleva al comprador a un punto (metros) mirando hacia «giro» (radianes). */
  irA: (x: number, z: number, giro: number) => void;
  /** Para pruebas: posición, rumbo y camino pendiente hacia la caja. */
  estado: () => unknown;
  ligera: boolean;
};

const VEL_CAMINAR = 2.3;
const VEL_CORRER = 4.2;
const VEL_ATRAS = 1.3;
const VEL_GIRO = 1.9; // rad/s con teclado o joystick
const RADIO = 0.3;
const RADIO_CARRITO = 0.36;
const ALCANCE = 3.2; // metros para elegir un producto

export type Opciones = {
  /** Aspecto del muñeco de este comprador (número estable, guardado en el navegador). */
  aspecto: number;
  /** Letreros de los pasillos escritos en WordPress (uno por pasillo). */
  pasillos: string[];
  /** Personas realistas (modelos CC0); sin esto, personas hechas con figuras. */
  crearPersona?: FabricaPersonas;
};

export function iniciarMotor(
  contenedor: HTMLElement,
  productos: Producto3D[],
  ev: Eventos,
  modoInicial: Modo,
  opciones: Opciones = { aspecto: 1, pasillos: [] },
): Motor {
  // ---------- calidad según el equipo ----------
  const nav = navigator as Navigator & { deviceMemory?: number };
  const tactil = matchMedia('(pointer: coarse)').matches;
  const ligera = (tactil && (nav.deviceMemory ?? 4) <= 4) || (navigator.hardwareConcurrency ?? 4) <= 4;

  const renderer = new THREE.WebGLRenderer({ antialias: !ligera, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, ligera ? 1 : 1.75));
  renderer.setSize(contenedor.clientWidth, contenedor.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = !ligera;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true;
  contenedor.appendChild(renderer.domElement);

  const escena = new THREE.Scene();
  escena.background = new THREE.Color('#dfe7f1');
  escena.fog = new THREE.Fog('#dfe7f1', 24, 55); // hasta el fondo de una tienda ancha (12 pasillos)

  // near 0,1: más precisión de profundidad (evita que los colores «tiemblen» de cerca).
  const camara = new THREE.PerspectiveCamera(65, contenedor.clientWidth / contenedor.clientHeight, 0.1, 60);
  const nuevaPersona = (n: number) => (opciones.crearPersona ? opciones.crearPersona(n) : crearPersonaje(aparienciaDe(n)));
  const tienda = construirTienda(escena, productos, ligera, opciones.pasillos, opciones.crearPersona);
  const yo = nuevaPersona(opciones.aspecto);
  // Cada comprador entra en un lugar distinto de la entrada (así dos que llegan juntos no quedan encimados).
  yo.posicion.copy(tienda.inicio).add(new THREE.Vector3((Math.random() * 2 - 1) * 3, 0, -Math.random() * 1.2));
  yo.rumbo = 0; // mirando hacia adentro de la tienda (-z)
  yo.empujar(true);
  escena.add(yo.grupo);
  // El carrito va aparte del personaje: se sigue viendo en primera persona.
  const carrito = crearCarrito();
  escena.add(carrito.grupo);
  let itemsCarrito: ItemCarrito[] = [];

  // ---------- estado de la cámara ----------
  let modo: Modo = modoInicial;
  let yaw = 0; // hacia dónde mira el comprador (= rumbo); la cámara lo sigue
  // Tercera persona: un poco desde arriba, para ver el carrito por encima del hombro.
  let pitch = modoInicial === 'tercera' ? -0.42 : -0.18;
  // En pantallas verticales (celular) la cámara va un poco más lejos: el personaje tapa menos.
  let distancia = contenedor.clientWidth / contenedor.clientHeight < 0.8 ? 4.4 : 3.4;
  let distanciaReal = distancia;
  let pausado = false;
  const objetivo = new THREE.Vector3();
  const deseada = new THREE.Vector3();
  const rayo = new THREE.Raycaster();

  function aplicarModo() {
    if (yo.primeraPersona) {
      // Persona realista: en primera persona se esconde solo la cabeza (se ven brazos y manos).
      yo.mostrar(true);
      yo.primeraPersona(modo === 'primera');
    } else yo.mostrar(modo === 'tercera');
    // En primera persona arranca mirando un poco hacia abajo: se ven las manos en el carrito y la góndola.
    pitch = modo === 'tercera' ? Math.min(Math.max(pitch, -0.9), 0.25) : -0.5;
    // En primera persona, un poco más de campo visual (como la vista de una persona): entran las manos.
    camara.fov = modo === 'primera' ? 76 : 65;
    camara.updateProjectionMatrix();
  }
  aplicarModo();

  // ---------- teclado y mouse ----------
  const teclas = new Set<string>();
  let joy = { x: 0, z: 0 };
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, dialog[open]')) return;
    teclas.add(e.code);
    if (e.code === 'KeyC') cambiarModo();
    if (e.code === 'KeyE' || e.code === 'Enter') elegirEnFoco();
  });
  window.addEventListener('keyup', (e: KeyboardEvent) => teclas.delete(e.code));
  window.addEventListener('blur', () => teclas.clear());

  const lienzo = renderer.domElement;
  let arrastre: { x: number; y: number; movio: boolean; id: number } | null = null;
  lienzo.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return; // el celular usa sus propias zonas (joystick / mirar)
    arrastre = { x: e.clientX, y: e.clientY, movio: false, id: e.pointerId };
    lienzo.setPointerCapture(e.pointerId);
  });
  lienzo.addEventListener('pointermove', (e) => {
    if (document.pointerLockElement === lienzo) {
      mirar(e.movementX, e.movementY);
      return;
    }
    if (!arrastre || e.pointerId !== arrastre.id) return;
    const dx = e.clientX - arrastre.x;
    const dy = e.clientY - arrastre.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) arrastre.movio = true;
    if (arrastre.movio) mirar(dx, dy);
    arrastre.x = e.clientX;
    arrastre.y = e.clientY;
  });
  lienzo.addEventListener('pointerup', (e) => {
    if (!arrastre || e.pointerId !== arrastre.id) return;
    const fueClic = !arrastre.movio;
    arrastre = null;
    if (!fueClic) return;
    if (document.pointerLockElement === lienzo) elegirEnFoco();
    else if (modo === 'primera' && !tactil) {
      // Primera persona en computadora: el primer clic «toma» el mouse (como en un juego).
      if (!elegirEn(e.clientX, e.clientY, false)) lienzo.requestPointerLock?.();
    } else elegirEn(e.clientX, e.clientY);
  });
  lienzo.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoom(e.deltaY);
    },
    { passive: false },
  );
  lienzo.addEventListener('contextmenu', (e) => e.preventDefault());

  // Mirar = girar al comprador (horizontal) y levantar o bajar la vista (vertical).
  function mirar(dx: number, dy: number) {
    const s = tactil ? 0.006 : 0.0032;
    if (enMano) {
      // Con el producto en la mano, arrastrar lo da vuelta para verlo por todos lados.
      enMano.giroY += dx * s * 1.6;
      enMano.giroX = Math.max(-1.3, Math.min(1.3, enMano.giroX + dy * s * 1.6));
      return;
    }
    if (automatico) return;
    yaw -= dx * s;
    pitch -= dy * s;
    pitch = modo === 'primera' ? Math.max(-1.35, Math.min(1.2, pitch)) : Math.max(-0.9, Math.min(0.25, pitch));
  }
  function zoom(delta: number) {
    if (modo !== 'tercera') return;
    distancia = Math.max(1.6, Math.min(6.5, distancia + delta * 0.004));
  }

  // ---------- selección ----------
  const centro = new THREE.Vector2(0, 0);
  const punto = new THREE.Vector2();
  let enFoco: Producto3D | null = null;
  let golpeFoco: THREE.Intersection | null = null;
  const objetivos = () => [...tienda.elegibles, ...tienda.solidos];

  /** El producto bajo un punto de la pantalla, si está al alcance del comprador. */
  function golpeBajo(ndc: THREE.Vector2): THREE.Intersection | null {
    rayo.setFromCamera(ndc, camara);
    rayo.far = modo === 'tercera' ? distanciaReal + ALCANCE + 1 : ALCANCE;
    const golpe = rayo.intersectObjects(objetivos(), false)[0];
    if (!golpe || !tienda.productoDe(golpe)) return null;
    // Que esté al alcance del comprador (no del otro lado de la tienda).
    return golpe.point.distanceTo(yo.posicion.clone().setY(golpe.point.y)) <= ALCANCE ? golpe : null;
  }
  function elegirEn(x: number, y: number, avisarSiNada = true): boolean {
    if (enMano) return true;
    const r = lienzo.getBoundingClientRect();
    punto.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const golpe = golpeBajo(punto);
    if (golpe) levantar(golpe);
    else if (avisarSiNada && golpeFoco) levantar(golpeFoco);
    return !!golpe;
  }
  function elegirEnFoco() {
    if (!enMano && golpeFoco) levantar(golpeFoco);
  }

  // ---------- levantar un producto, mirarlo y devolverlo (o ponerlo en el carrito) ----------
  type EnMano = {
    t: Tomado;
    fase: 'subir' | 'mirar' | 'estante' | 'carrito';
    k: number;
    giroX: number;
    giroY: number;
    desdePos: THREE.Vector3;
    desdeQ: THREE.Quaternion;
    escalaMano: number;
    listo?: () => void;
  };
  let enMano: EnMano | null = null;
  const tmpPos = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const giroMano = new THREE.Quaternion(); // aparte de tmpQ: poseEnMano escribe en tmpQ
  const tmpS = new THREE.Vector3();
  function levantar(golpe: THREE.Intersection) {
    const t = tienda.tomar(golpe);
    if (!t) return;
    automatico = null;
    teclas.clear();
    joy = { x: 0, z: 0 };
    const desdePos = new THREE.Vector3();
    const desdeQ = new THREE.Quaternion();
    t.desde.decompose(desdePos, desdeQ, tmpS);
    t.objeto.position.copy(desdePos);
    t.objeto.quaternion.copy(desdeQ);
    t.objeto.traverse((o) => (o.castShadow = true));
    escena.add(t.objeto);
    t.ocultar();
    // Tamaño en la mano: las cajas chicas se ven más grandes de cerca; la ropa, a su tamaño.
    const caja = new THREE.Box3().setFromObject(t.objeto);
    const mayor = Math.max(...caja.getSize(tmpS).toArray());
    enMano = { t, fase: 'subir', k: 0, giroX: 0, giroY: 0, desdePos, desdeQ, escalaMano: mayor < 0.4 ? 1.1 : 0.7 };
    yo.sostener(true);
    if (document.pointerLockElement) document.exitPointerLock();
    ev.elegir(t.producto);
  }
  function soltar(destino: 'estante' | 'carrito') {
    return new Promise<void>((listo) => {
      if (!enMano) return listo();
      enMano.fase = destino;
      enMano.k = 0;
      enMano.listo = listo;
      // Punto de partida de la vuelta: donde está ahora (en la mano).
      enMano.t.objeto.updateMatrixWorld();
      (enMano as EnMano & { manoPos?: THREE.Vector3; manoQ?: THREE.Quaternion }).manoPos = enMano.t.objeto.position.clone();
      (enMano as EnMano & { manoPos?: THREE.Vector3; manoQ?: THREE.Quaternion }).manoQ = enMano.t.objeto.quaternion.clone();
    });
  }
  /** Delante de los ojos (primera persona) o en las manos frente a la cámara (tercera). */
  /** Dónde se sostiene: frente a los ojos (primera persona) o en las manos del muñeco (tercera). */
  function puntoMano() {
    if (modo === 'primera') {
      const adelante = new THREE.Vector3(0, 0, -1).applyQuaternion(camara.quaternion);
      const abajo = new THREE.Vector3(0, -1, 0).applyQuaternion(camara.quaternion);
      return camara.position.clone().addScaledVector(adelante, 0.7).addScaledVector(abajo, 0.05);
    }
    return new THREE.Vector3(yo.posicion.x, 1.42, yo.posicion.z).addScaledVector(frenteDe(yaw), 0.48);
  }
  const centroLocal = new THREE.Vector3();
  function poseEnMano(m: EnMano, pos: THREE.Vector3, q: THREE.Quaternion) {
    // El frente del producto (su cara +z, o +y si es ropa doblada) mira a la cámara; el arrastre lo gira.
    const geo = (m.t.objeto as THREE.Mesh).geometry;
    const frente = geo?.userData?.frente === 'y' ? Math.PI / 2 : 0;
    tmpE.set(m.giroX + frente, m.giroY, 0, 'YXZ');
    q.copy(camara.quaternion).multiply(giroMano.setFromEuler(tmpE));
    // Centrado en el punto de la mano (las piezas tienen el origen abajo, no en el medio).
    if (geo && !geo.boundingBox) geo.computeBoundingBox();
    geo?.boundingBox?.getCenter(centroLocal);
    pos.copy(puntoMano()).sub(centroLocal.multiplyScalar(m.escalaMano).applyQuaternion(q));
  }
  const suave = (k: number) => k * k * (3 - 2 * k);
  function animarMano(dt: number) {
    if (!enMano) return;
    const m = enMano as EnMano & { manoPos?: THREE.Vector3; manoQ?: THREE.Quaternion };
    const o = m.t.objeto;
    poseEnMano(m, tmpPos, tmpQ);
    if (m.fase === 'subir' || m.fase === 'mirar') {
      m.k = Math.min(1, m.k + dt / 0.45);
      const k = suave(m.k);
      o.position.copy(m.desdePos).lerp(tmpPos, k);
      o.quaternion.copy(m.desdeQ).slerp(tmpQ, k);
      o.scale.setScalar(1 + (m.escalaMano - 1) * k);
      if (m.k >= 1) m.fase = 'mirar';
      return;
    }
    m.k = Math.min(1, m.k + dt / 0.5);
    const k = suave(m.k);
    const desde = m.manoPos ?? tmpPos;
    if (m.fase === 'estante') {
      o.position.copy(desde).lerp(m.desdePos, k);
      o.quaternion.copy(m.manoQ ?? tmpQ).slerp(m.desdeQ, k);
      o.scale.setScalar(m.escalaMano + (1 - m.escalaMano) * k);
    } else {
      // Cae en la canasta del carrito (con un pequeño arco).
      const destino = carrito.grupo.localToWorld(new THREE.Vector3(0, 0.75, -carrito.adelante));
      o.position.copy(desde).lerp(destino, k);
      o.position.y += Math.sin(k * Math.PI) * 0.25;
      o.scale.setScalar(m.escalaMano + (0.45 - m.escalaMano) * k);
    }
    if (m.k >= 1) {
      escena.remove(o);
      m.t.restaurar(); // en la góndola siempre hay más unidades
      yo.sostener(false);
      enMano = null;
      m.listo?.();
    }
  }

  function cambiarModo(m?: Modo) {
    modo = m ?? (modo === 'tercera' ? 'primera' : 'tercera');
    if (modo === 'tercera' && document.pointerLockElement) document.exitPointerLock();
    aplicarModo();
    return modo;
  }

  // ---------- colisiones (círculo contra cajas, deslizándose por las paredes) ----------
  function empujar(p: THREE.Vector3, radio: number, cajas: Caja[], lim: Caja) {
    for (const c of cajas) {
      const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radio * radio) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * radio;
          p.z = cz + (dz / d) * radio;
        } else {
          const salidas = [p.x - c.minX, c.maxX - p.x, p.z - c.minZ, c.maxZ - p.z];
          const i = salidas.indexOf(Math.min(...salidas));
          if (i === 0) p.x = c.minX - radio;
          if (i === 1) p.x = c.maxX + radio;
          if (i === 2) p.z = c.minZ - radio;
          if (i === 3) p.z = c.maxZ + radio;
        }
      }
    }
    p.x = Math.max(lim.minX + radio - RADIO, Math.min(lim.maxX - radio + RADIO, p.x));
    p.z = Math.max(lim.minZ + radio - RADIO, Math.min(lim.maxZ - radio + RADIO, p.z));
  }
  const frenteDe = (r: number) => new THREE.Vector3(-Math.sin(r), 0, -Math.cos(r));
  const puntoCarrito = new THREE.Vector3();
  /** El comprador y su carrito no atraviesan nada: si el carrito choca, el comprador retrocede. */
  /** Cajas de colisión de los demás compradores y sus carritos (se mueven: se arman en cada cuadro). */
  let dinamicas: Caja[] = [];
  const todasLasCajas = () => (dinamicas.length ? tienda.colisiones.concat(dinamicas) : tienda.colisiones);
  function resolver(p: THREE.Vector3) {
    const cajas = todasLasCajas();
    empujar(p, RADIO, cajas, tienda.limites);
    for (let i = 0; i < 2; i++) {
      puntoCarrito.copy(p).addScaledVector(frenteDe(yo.rumbo), carrito.adelante);
      const antes = puntoCarrito.clone();
      empujar(puntoCarrito, RADIO_CARRITO, cajas, tienda.limites);
      p.add(puntoCarrito.sub(antes));
    }
    empujar(p, RADIO, cajas, tienda.limites);
  }

  // ---------- multijugador: los demás compradores ----------
  type Remoto = { p: Personaje; c: Carrito3D; x: number; z: number; r: number; antes: THREE.Vector3 };
  const remotos = new Map<string, Remoto>();
  function otros(lista: Otro[]) {
    const vivos = new Set<string>();
    for (const o of lista) {
      vivos.add(o.id);
      let r = remotos.get(o.id);
      if (!r) {
        const p = nuevaPersona(o.a);
        p.empujar(true);
        p.posicion.set(o.x, 0, o.z);
        p.rumbo = o.r;
        const c = crearCarrito();
        escena.add(p.grupo, c.grupo);
        r = { p, c, x: o.x, z: o.z, r: o.r, antes: new THREE.Vector3(o.x, 0, o.z) };
        remotos.set(o.id, r);
      }
      r.x = o.x;
      r.z = o.z;
      r.r = o.r;
    }
    for (const [id, r] of remotos) {
      if (vivos.has(id)) continue;
      escena.remove(r.p.grupo, r.c.grupo);
      remotos.delete(id);
    }
  }
  /** Los demás se mueven suave entre un aviso y el siguiente (llegan cada ~1 s). */
  function animarRemotos(dt: number) {
    const nuevas: Caja[] = [];
    for (const r of remotos.values()) {
      const pos = r.p.posicion;
      r.antes.copy(pos);
      const k = Math.min(1, dt * 3);
      pos.x += (r.x - pos.x) * k;
      pos.z += (r.z - pos.z) * k;
      const dr = Math.atan2(Math.sin(r.r - r.p.rumbo), Math.cos(r.r - r.p.rumbo));
      r.p.rumbo += dr * Math.min(1, dt * 6);
      const v = pos.distanceTo(r.antes) / Math.max(dt, 1e-3);
      // Hacia adelante o hacia atrás, según hacia dónde se mueve respecto de donde mira.
      const f = frenteDe(r.p.rumbo);
      const signo = (pos.x - r.antes.x) * f.x + (pos.z - r.antes.z) * f.z >= 0 ? 1 : -1;
      r.p.animar(dt, v > 0.15 ? signo * v : 0);
      r.c.grupo.position.set(pos.x, 0, pos.z);
      r.c.grupo.rotation.y = r.p.rumbo;
      // No se puede atravesar a otro comprador ni a su carrito.
      const cc = pos.clone().addScaledVector(f, 0.98);
      nuevas.push(
        { minX: pos.x - 0.25, maxX: pos.x + 0.25, minZ: pos.z - 0.25, maxZ: pos.z + 0.25 },
        { minX: cc.x - 0.3, maxX: cc.x + 0.3, minZ: cc.z - 0.3, maxZ: cc.z + 0.3 },
      );
    }
    dinamicas = nuevas;
  }

  // ---------- ir solo a la caja ----------
  let automatico: { puntos: THREE.Vector3[]; mostrador: Mostrador; atascado: number } | null = null;
  function irACaja() {
    const p = yo.posicion;
    const m = tienda.mostradores.reduce((a, b) =>
      Math.abs(a.cliente.x - p.x) <= Math.abs(b.cliente.x - p.x) ? a : b,
    );
    const puntos: THREE.Vector3[] = [];
    const z = tienda.zCruce;
    if (p.z < z) {
      // Desde los pasillos: si está detrás de las góndolas, primero a un carril libre.
      if (p.z < -11) {
        const carril = tienda.carriles.reduce((a, b) => (Math.abs(a - p.x) < Math.abs(b - p.x) ? a : b));
        puntos.push(new THREE.Vector3(carril, 0, p.z));
        puntos.push(new THREE.Vector3(carril, 0, z));
      } else puntos.push(new THREE.Vector3(p.x, 0, z));
      puntos.push(new THREE.Vector3(m.cliente.x, 0, z));
    } else {
      // Desde la entrada: primero al costado del mostrador, después a la fila.
      puntos.push(new THREE.Vector3(m.cliente.x, 0, Math.min(p.z, 11)));
    }
    puntos.push(m.cliente.clone());
    automatico = { puntos, mostrador: m, atascado: 0 };
  }

  // ---------- VR (WebXR) ----------
  // En VR la cabeza la mueve el visor (cámara de WebXR); el «rig» lleva al comprador por la tienda.
  const rig = new THREE.Group();
  escena.add(rig);
  const controles: THREE.Group[] = [];
  const lineaGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  for (const i of [0, 1]) {
    const c = renderer.xr.getController(i);
    const linea = new THREE.Line(lineaGeo, new THREE.LineBasicMaterial({ color: '#ed2853' }));
    linea.scale.z = 4;
    c.add(linea);
    c.addEventListener('selectstart', () => gatilloVR(c));
    rig.add(c);
    controles.push(c);
  }
  const mirilla = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.24, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ed2853' }),
  );
  mirilla.visible = false;
  escena.add(mirilla);
  const tmpM = new THREE.Matrix4();

  function rayoDeControl(c: THREE.Group) {
    tmpM.identity().extractRotation(c.matrixWorld);
    rayo.ray.origin.setFromMatrixPosition(c.matrixWorld);
    rayo.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
    rayo.far = 12;
  }
  async function gatilloVR(c: THREE.Group) {
    rayoDeControl(c);
    const golpe = rayo.intersectObjects([...objetivos(), tienda.piso], false)[0];
    if (!golpe) return;
    const p = tienda.productoDe(golpe);
    if (p && golpe.distance <= ALCANCE + 1) {
      avisoVR(await ev.agregarVR(p));
      return;
    }
    if (golpe.object === tienda.piso) {
      // Teletransporte: evita mareos (opción recomendada en VR).
      const destino = golpe.point.clone();
      resolver(destino);
      yo.posicion.set(destino.x, 0, destino.z);
    }
  }
  // Aviso flotante en VR (los avisos HTML no se ven dentro del visor).
  let avisoMalla: THREE.Mesh | null = null;
  function avisoVR(texto: string) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0a4383';
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#fff';
    g.font = '700 34px Sarabun, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(texto, 256, 50, 490);
    if (avisoMalla) escena.remove(avisoMalla);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    avisoMalla = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.15), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
    const cam = renderer.xr.getCamera();
    avisoMalla.position.copy(cam.position).add(new THREE.Vector3(0, 0, -1.2).applyQuaternion(cam.quaternion));
    avisoMalla.quaternion.copy(cam.quaternion);
    escena.add(avisoMalla);
    const m = avisoMalla;
    setTimeout(() => {
      escena.remove(m);
      if (avisoMalla === m) avisoMalla = null;
    }, 2200);
  }
  async function vrDisponible() {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported: (m: string) => Promise<boolean> } }).xr;
    if (!xr || !window.isSecureContext) return false;
    return xr.isSessionSupported('immersive-vr').catch(() => false);
  }
  async function entrarVR() {
    const xr = (navigator as unknown as { xr: { requestSession: (m: string, o: object) => Promise<XRSession> } }).xr;
    const sesion = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
    renderer.xr.setReferenceSpaceType('local-floor');
    // La cámara de WebXR se mueve dentro del «rig», que está donde está el comprador.
    rig.position.set(yo.posicion.x, 0, yo.posicion.z);
    rig.rotation.y = yaw;
    camara.position.set(0, 0, 0);
    camara.rotation.set(0, 0, 0);
    rig.add(camara);
    await renderer.xr.setSession(sesion);
    cambiarModo('primera');
    sesion.addEventListener('end', () => {
      mirilla.visible = false;
      rig.remove(camara);
      yaw = rig.rotation.y;
    });
  }
  let giroListo = true;
  function controlesVR(dt: number) {
    const sesion = renderer.xr.getSession();
    if (!sesion) return;
    const cam = renderer.xr.getCamera();
    const adelante = new THREE.Vector3();
    cam.getWorldDirection(adelante);
    adelante.y = 0;
    adelante.normalize();
    const derecha = new THREE.Vector3(-adelante.z, 0, adelante.x);
    for (const fuente of sesion.inputSources) {
      const ejes = fuente.gamepad?.axes;
      if (!ejes || ejes.length < 4) continue;
      const [x, y] = [ejes[2], ejes[3]];
      if (fuente.handedness === 'left' && Math.hypot(x, y) > 0.15) {
        yo.posicion.addScaledVector(adelante, -y * VEL_CAMINAR * dt).addScaledVector(derecha, x * VEL_CAMINAR * dt);
        resolver(yo.posicion);
      }
      if (fuente.handedness === 'right') {
        // Giro por saltos de 30°: marea menos que el giro continuo.
        if (Math.abs(x) > 0.6 && giroListo) {
          rig.rotation.y -= Math.sign(x) * (Math.PI / 6);
          giroListo = false;
        }
        if (Math.abs(x) < 0.3) giroListo = true;
      }
    }
    rig.position.set(yo.posicion.x, 0, yo.posicion.z);
    yo.rumbo = rig.rotation.y;
    const c = controles[1] ?? controles[0];
    rayoDeControl(c);
    const golpe = rayo.intersectObject(tienda.piso, false)[0];
    mirilla.visible = !!golpe;
    if (golpe) mirilla.position.copy(golpe.point).setY(0.01);
  }

  // ---------- bucle ----------
  const reloj = new THREE.Clock();
  const mov = new THREE.Vector3();
  let enCajas = false;
  let cuadro = 0;

  function moverCarrito() {
    carrito.grupo.position.set(yo.posicion.x, 0, yo.posicion.z);
    carrito.grupo.rotation.y = yo.rumbo;
  }

  function bucle() {
    // Tope de 0,1 s por cuadro: en equipos lentos sigue caminando a velocidad normal, y al volver
    // de otra pestaña no «salta» de golpe.
    const dt = Math.min(reloj.getDelta(), 0.1);
    tienda.animar(dt);
    animarRemotos(dt);
    if (renderer.xr.isPresenting) {
      controlesVR(dt);
      moverCarrito();
      renderer.render(escena, camara);
      return;
    }
    if (pausado) {
      renderer.render(escena, camara);
      return;
    }

    // Entrada: adelante/atrás y girar (teclado + joystick).
    let avance = joy.z;
    let giro = Math.abs(joy.x) > 0.12 ? joy.x : 0;
    if (teclas.has('KeyW') || teclas.has('ArrowUp')) avance += 1;
    if (teclas.has('KeyS') || teclas.has('ArrowDown')) avance -= 1;
    if (teclas.has('KeyD') || teclas.has('ArrowRight')) giro += 1;
    if (teclas.has('KeyA') || teclas.has('ArrowLeft')) giro -= 1;
    avance = Math.max(-1, Math.min(1, avance));
    giro = Math.max(-1, Math.min(1, giro));
    let velocidad = 0;

    if (enMano) avance = giro = 0; // con un producto en la mano, el comprador se queda quieto
    if (automatico && (Math.abs(avance) > 0.1 || Math.abs(giro) > 0.1)) automatico = null; // el cliente retoma el control

    if (automatico) {
      // Camina solo hacia el próximo punto del camino, girando hacia él.
      const meta = automatico.puntos[0];
      const dx = meta.x - yo.posicion.x;
      const dz = meta.z - yo.posicion.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.12) {
        automatico.puntos.shift();
        if (!automatico.puntos.length) {
          yaw = automatico.mostrador.rumboCliente;
          automatico = null;
          ev.llegoACaja();
        }
      } else {
        const rumboMeta = Math.atan2(-dx, -dz);
        let dr = Math.atan2(Math.sin(rumboMeta - yaw), Math.cos(rumboMeta - yaw));
        yaw += dr * Math.min(1, dt * 6);
        dr = Math.atan2(Math.sin(rumboMeta - yaw), Math.cos(rumboMeta - yaw));
        if (Math.abs(dr) < 0.6) {
          const paso = Math.min(d, VEL_CAMINAR * dt);
          const antes = yo.posicion.clone();
          yo.posicion.x += (dx / d) * paso;
          yo.posicion.z += (dz / d) * paso;
          yo.rumbo = yaw;
          resolver(yo.posicion);
          velocidad = VEL_CAMINAR;
          // Si algo lo frena (un rincón), se salta ese punto para no quedarse trabado.
          if (yo.posicion.distanceTo(antes) < paso * 0.3) {
            automatico.atascado += dt;
            if (automatico.atascado > 0.8) {
              yo.posicion.set(meta.x, 0, meta.z);
              automatico.atascado = 0;
            }
          } else automatico.atascado = 0;
        }
      }
    } else {
      yaw -= giro * VEL_GIRO * dt;
      if (Math.abs(avance) > 0.05) {
        const correr = teclas.has('ShiftLeft') || teclas.has('ShiftRight') || (tactil && avance > 0.97);
        const vel = avance > 0 ? (correr ? VEL_CORRER : VEL_CAMINAR) : VEL_ATRAS;
        mov.copy(frenteDe(yaw)).multiplyScalar(avance * vel * dt);
        yo.rumbo = yaw;
        yo.posicion.add(mov);
        resolver(yo.posicion);
        velocidad = Math.sign(avance) * vel * Math.min(1, Math.abs(avance));
      }
    }
    // Si otro comprador quedó encima (entró en el mismo lugar o se acercó quieto), se separan solos.
    if (dinamicas.length && !automatico) resolver(yo.posicion);
    yo.rumbo = yaw;
    yo.animar(dt, velocidad);
    moverCarrito();

    // Cámara: en sus ojos, o detrás (siempre mira hacia donde mira el comprador).
    if (modo === 'primera') {
      // A la altura de los ojos, un poco adelante (que no se vea el cuello por dentro).
      camara.position.set(yo.posicion.x, ALTURA_OJOS, yo.posicion.z).addScaledVector(frenteDe(yaw), yo.primeraPersona ? 0.14 : 0);
      camara.rotation.set(pitch, yaw, 0, 'YXZ');
    } else {
      // Por encima del hombro derecho y mirando un poco por delante: se ve el carrito y lo que hay
      // adentro, sin que el cuerpo lo tape.
      const f = frenteDe(yaw);
      // Con un producto en la mano, la cámara se acerca por encima del hombro y mira lo que sostiene.
      const cerca = !!enMano;
      if (cerca) objetivo.copy(puntoMano());
      else objetivo.set(yo.posicion.x, 1.3, yo.posicion.z).addScaledVector(f, 0.55).add(new THREE.Vector3(-f.z, 0, f.x).multiplyScalar(0.45));
      const alejarse = cerca ? 1.05 : distancia;
      const cp = Math.cos(cerca ? -0.32 : pitch);
      deseada.set(Math.sin(yaw + (cerca ? 0.45 : 0)) * cp, -Math.sin(cerca ? -0.32 : pitch), Math.cos(yaw + (cerca ? 0.45 : 0)) * cp).normalize();
      // Que la cámara no atraviese paredes ni estanterías: se acerca si algo se interpone.
      rayo.set(objetivo, deseada);
      rayo.far = alejarse;
      const golpe = rayo.intersectObjects(tienda.solidos, false)[0];
      const meta = golpe ? Math.max(0.6, golpe.distance - 0.25) : alejarse;
      distanciaReal += (meta - distanciaReal) * Math.min(1, dt * (meta < distanciaReal ? 20 : 6));
      camara.position.copy(objetivo).addScaledVector(deseada, distanciaReal);
      camara.position.y = Math.max(0.3, camara.position.y);
      camara.lookAt(objetivo);
    }

    // Producto frente al comprador (cada 6 cuadros: alcanza y ahorra trabajo).
    if (++cuadro % 6 === 0) {
      let p: Producto3D | null = null;
      let golpeP: THREE.Intersection | null = null;
      if (modo === 'primera') {
        golpeP = golpeBajo(centro);
        p = golpeP ? tienda.productoDe(golpeP) : null;
      }
      if (!p) {
        // Lo que está delante del comprador (más allá del carrito), a la altura del pecho y la
        // cintura, y un poco corrido a los costados para no escaparse entre dos cajas.
        const frente = frenteDe(yo.rumbo);
        const costado = new THREE.Vector3(-frente.z, 0, frente.x);
        buscar: for (const altura of [1.28, 0.85, 1.6]) {
          for (const corrido of [0, 0.12, -0.12]) {
            rayo.set(new THREE.Vector3(yo.posicion.x, altura, yo.posicion.z).addScaledVector(costado, corrido), frente);
            rayo.far = 2.4;
            const golpe = rayo.intersectObjects(objetivos(), false)[0];
            p = golpe ? tienda.productoDe(golpe) : null;
            golpeP = p ? golpe : null;
            if (p) break buscar;
          }
        }
      }
      golpeFoco = golpeP;
      if (p !== enFoco && !enMano) {
        enFoco = p;
        ev.enFoco(p);
      }
      const ahora = tienda.zonasCajas.some(
        (z) => yo.posicion.x > z.minX && yo.posicion.x < z.maxX && yo.posicion.z > z.minZ && yo.posicion.z < z.maxZ,
      );
      if (ahora !== enCajas) {
        enCajas = ahora;
        ev.enCajas(ahora);
      }
    }

    animarMano(dt);
    renderer.render(escena, camara);
  }
  renderer.setAnimationLoop(bucle);

  // Ajustar al tamaño de la pantalla (girar el celular, barras del navegador).
  new ResizeObserver(() => {
    const w = contenedor.clientWidth;
    const h = contenedor.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
  }).observe(contenedor);

  // Cuando cargan las fotos, las cajitas del carrito 3D también las muestran.
  const refrescarCarrito = () => carrito.llenar(itemsCarrito, tienda.texturaDe, tienda.colorDe);
  setInterval(() => itemsCarrito.length && refrescarCarrito(), 3000);

  return {
    modo: () => modo,
    cambiarModo,
    joystick: (x, z) => (joy = { x, z }),
    mirar,
    zoom,
    elegirEn: (x, y) => void elegirEn(x, y),
    elegirEnFoco,
    soltar,
    otros,
    propio: () => ({ x: +yo.posicion.x.toFixed(2), z: +yo.posicion.z.toFixed(2), r: +yaw.toFixed(2) }),
    pausar: (si) => {
      pausado = si;
      if (si) teclas.clear();
    },
    ponerCarrito(items) {
      itemsCarrito = items;
      refrescarCarrito();
    },
    irACaja,
    entrarVR,
    vrDisponible,
    estado: () => ({ pos: yo.posicion.toArray().map((v) => +v.toFixed(2)), yaw: +yaw.toFixed(2), camino: automatico?.puntos.map((v) => [v.x, v.z]) ?? null }),
    irA: (x, z, giro) => {
      yaw = giro;
      yo.rumbo = giro;
      yo.posicion.set(x, 0, z);
      resolver(yo.posicion);
    },
    ligera,
  };
}
