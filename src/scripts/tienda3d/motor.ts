// Motor de la tienda 3D: render, recorrido, cámaras (tercera y primera persona), controles de
// computadora, celular y VR (WebXR), colisiones y selección de productos.
// Las dos cámaras usan la misma posición y orientación del personaje: cambiar de cámara no
// reinicia el recorrido.
import * as THREE from 'three';
import { construirTienda, type Producto3D, type Caja } from './escena';
import { crearPersonaje, ALTURA_OJOS } from './personaje';

export type Modo = 'tercera' | 'primera';

export type Eventos = {
  /** Producto frente al comprador (o null): para el aviso «E para ver». */
  enFoco: (p: Producto3D | null) => void;
  /** El comprador eligió un producto (clic, toque o E). */
  elegir: (p: Producto3D) => void;
  /** Entró o salió de la zona de cajas. */
  enCajas: (si: boolean) => void;
  /** En VR, el gatillo sobre un producto lo agrega directo al carrito. */
  agregarVR: (p: Producto3D) => Promise<string>;
};

export type Motor = {
  modo: () => Modo;
  cambiarModo: (m?: Modo) => Modo;
  /** Joystick del celular: x (derecha) y z (adelante), de -1 a 1. */
  joystick: (x: number, z: number) => void;
  /** Mirar con el dedo (píxeles arrastrados). */
  mirar: (dx: number, dy: number) => void;
  zoom: (delta: number) => void;
  /** Elige el producto bajo un punto de la pantalla (toque / clic). */
  elegirEn: (x: number, y: number) => void;
  elegirEnFoco: () => void;
  pausar: (si: boolean) => void;
  entrarVR: () => Promise<void>;
  vrDisponible: () => Promise<boolean>;
  /** Para pruebas: lleva al comprador a un punto (metros) mirando hacia «giro» (radianes). */
  irA: (x: number, z: number, giro: number) => void;
  ligera: boolean;
};

const VEL_CAMINAR = 2.3;
const VEL_CORRER = 4.2;
const RADIO = 0.3;
const ALCANCE = 3.2; // metros para elegir un producto

export function iniciarMotor(contenedor: HTMLElement, productos: Producto3D[], ev: Eventos, modoInicial: Modo): Motor {
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
  escena.fog = new THREE.Fog('#dfe7f1', 20, 40);

  const camara = new THREE.PerspectiveCamera(65, contenedor.clientWidth / contenedor.clientHeight, 0.05, 60);
  const tienda = construirTienda(escena, productos, ligera);
  const yo = crearPersonaje();
  yo.posicion.copy(tienda.inicio);
  yo.rumbo = 0; // mirando hacia adentro de la tienda (-z)
  escena.add(yo.grupo);

  // ---------- estado de la cámara ----------
  let modo: Modo = modoInicial;
  let yaw = 0; // giro horizontal (igual para las dos cámaras)
  let pitch = -0.18;
  // En pantallas verticales (celular) la cámara va un poco más lejos: el personaje tapa menos.
  let distancia = contenedor.clientWidth / contenedor.clientHeight < 0.8 ? 4.2 : 3.2;
  let distanciaReal = distancia;
  let pausado = false;
  const objetivo = new THREE.Vector3();
  const deseada = new THREE.Vector3();
  const rayo = new THREE.Raycaster();

  function aplicarModo() {
    yo.mostrar(modo === 'tercera');
    if (modo === 'tercera') pitch = Math.min(Math.max(pitch, -0.9), 0.25);
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
  lienzo.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom(e.deltaY);
  }, { passive: false });
  lienzo.addEventListener('contextmenu', (e) => e.preventDefault());

  function mirar(dx: number, dy: number) {
    const s = tactil ? 0.006 : 0.0032;
    yaw -= dx * s;
    pitch -= dy * s;
    pitch = modo === 'primera' ? Math.max(-1.35, Math.min(1.2, pitch)) : Math.max(-0.9, Math.min(0.25, pitch));
  }
  function zoom(delta: number) {
    if (modo !== 'tercera') return;
    distancia = Math.max(1.4, Math.min(6.5, distancia + delta * 0.004));
  }

  // ---------- selección ----------
  const centro = new THREE.Vector2(0, 0);
  const punto = new THREE.Vector2();
  let enFoco: Producto3D | null = null;

  function productoBajo(ndc: THREE.Vector2, desde: THREE.Camera = camara): Producto3D | null {
    rayo.setFromCamera(ndc, desde);
    rayo.far = modo === 'tercera' ? distanciaReal + ALCANCE + 1 : ALCANCE;
    const golpe = rayo.intersectObjects([...tienda.seleccionables, ...tienda.solidos], false)[0];
    if (!golpe) return null;
    const p = tienda.productoDe.get(golpe.object as THREE.InstancedMesh) ?? null;
    if (!p) return null;
    // Que esté al alcance del comprador (no del otro lado de la tienda).
    return golpe.point.distanceTo(yo.posicion.clone().setY(golpe.point.y)) <= ALCANCE ? p : null;
  }
  function elegirEn(x: number, y: number, avisarSiNada = true): boolean {
    const r = lienzo.getBoundingClientRect();
    punto.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const p = productoBajo(punto);
    if (p) ev.elegir(p);
    else if (avisarSiNada && enFoco) ev.elegir(enFoco);
    return !!p;
  }
  function elegirEnFoco() {
    if (enFoco) ev.elegir(enFoco);
  }

  function cambiarModo(m?: Modo) {
    modo = m ?? (modo === 'tercera' ? 'primera' : 'tercera');
    if (modo === 'tercera' && document.pointerLockElement) document.exitPointerLock();
    aplicarModo();
    return modo;
  }

  // ---------- colisiones (círculo contra cajas, deslizándose por las paredes) ----------
  function resolver(p: THREE.Vector3, cajas: Caja[], lim: Caja) {
    for (const c of cajas) {
      const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < RADIO * RADIO) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * RADIO;
          p.z = cz + (dz / d) * RADIO;
        } else {
          // Adentro de la caja: salir por el lado más cercano.
          const salidas = [p.x - c.minX, c.maxX - p.x, p.z - c.minZ, c.maxZ - p.z];
          const i = salidas.indexOf(Math.min(...salidas));
          if (i === 0) p.x = c.minX - RADIO;
          if (i === 1) p.x = c.maxX + RADIO;
          if (i === 2) p.z = c.minZ - RADIO;
          if (i === 3) p.z = c.maxZ + RADIO;
        }
      }
    }
    p.x = Math.max(lim.minX, Math.min(lim.maxX, p.x));
    p.z = Math.max(lim.minZ, Math.min(lim.maxZ, p.z));
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
    const golpe = rayo.intersectObjects([...tienda.seleccionables, ...tienda.solidos, tienda.piso], false)[0];
    if (!golpe) return;
    const p = tienda.productoDe.get(golpe.object as THREE.InstancedMesh);
    if (p && golpe.distance <= ALCANCE + 1) {
      const texto = await ev.agregarVR(p);
      avisoVR(texto);
      return;
    }
    if (golpe.object === tienda.piso) {
      // Teletransporte: evita mareos (opción recomendada en VR).
      const destino = golpe.point.clone();
      resolver(destino, tienda.colisiones, tienda.limites);
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
    if (avisoMalla) rig.remove(avisoMalla);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    avisoMalla = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.15), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
    const cam = renderer.xr.getCamera();
    const frente = new THREE.Vector3(0, 0, -1.2).applyQuaternion(cam.quaternion);
    avisoMalla.position.copy(cam.position).add(frente);
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
        // Movimiento suave con el stick izquierdo (opcional: el teletransporte es la opción cómoda).
        yo.posicion.addScaledVector(adelante, -y * VEL_CAMINAR * dt).addScaledVector(derecha, x * VEL_CAMINAR * dt);
        resolver(yo.posicion, tienda.colisiones, tienda.limites);
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
    // Mirilla de teletransporte: dónde apunta el control derecho sobre el piso.
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

  function bucle() {
    const dt = Math.min(reloj.getDelta(), 0.05);
    if (renderer.xr.isPresenting) {
      controlesVR(dt);
      renderer.render(escena, camara);
      return;
    }
    if (pausado) {
      renderer.render(escena, camara);
      return;
    }

    // Entrada: teclado + joystick, relativa hacia donde mira la cámara.
    let ax = joy.x;
    let az = joy.z;
    if (teclas.has('KeyW') || teclas.has('ArrowUp')) az += 1;
    if (teclas.has('KeyS') || teclas.has('ArrowDown')) az -= 1;
    if (teclas.has('KeyD') || teclas.has('ArrowRight')) ax += 1;
    if (teclas.has('KeyA') || teclas.has('ArrowLeft')) ax -= 1;
    if (teclas.has('KeyQ')) yaw += 1.8 * dt;
    if (teclas.has('KeyR')) yaw -= 1.8 * dt;
    const largo = Math.hypot(ax, az);
    let velocidad = 0;
    if (largo > 0.05) {
      if (largo > 1) {
        ax /= largo;
        az /= largo;
      }
      const vel = teclas.has('ShiftLeft') || teclas.has('ShiftRight') || largo > 0.95 && tactil && Math.hypot(joy.x, joy.z) > 0.98 ? VEL_CORRER : VEL_CAMINAR;
      // adelante = -z rotado por yaw
      mov.set(ax, 0, -az).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiplyScalar(vel * dt);
      yo.posicion.add(mov);
      resolver(yo.posicion, tienda.colisiones, tienda.limites);
      velocidad = vel * Math.min(1, largo);
      // El personaje gira suave hacia donde camina.
      const rumboDeseado = Math.atan2(-mov.x, -mov.z);
      let d = rumboDeseado - yo.rumbo;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yo.rumbo += d * Math.min(1, dt * 10);
    }
    if (modo === 'primera') yo.rumbo = yaw;
    yo.animar(dt, velocidad);

    // Cámara.
    if (modo === 'primera') {
      camara.position.set(yo.posicion.x, ALTURA_OJOS, yo.posicion.z);
      camara.rotation.set(pitch, yaw, 0, 'YXZ');
    } else {
      objetivo.set(yo.posicion.x, 1.45, yo.posicion.z);
      const cp = Math.cos(pitch);
      deseada.set(Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp).normalize();
      // Que la cámara no atraviese paredes ni estanterías: se acerca si algo se interpone.
      rayo.set(objetivo, deseada);
      rayo.far = distancia;
      const golpe = rayo.intersectObjects(tienda.solidos, false)[0];
      const meta = golpe ? Math.max(0.6, golpe.distance - 0.25) : distancia;
      distanciaReal += (meta - distanciaReal) * Math.min(1, dt * (meta < distanciaReal ? 20 : 6));
      camara.position.copy(objetivo).addScaledVector(deseada, distanciaReal);
      camara.position.y = Math.max(0.3, camara.position.y);
      camara.lookAt(objetivo);
    }

    // Producto frente al comprador (cada 6 cuadros: alcanza y ahorra trabajo).
    if (++cuadro % 6 === 0) {
      let p: Producto3D | null;
      if (modo === 'primera') p = productoBajo(centro);
      else {
        // En tercera persona: lo que está adelante del personaje, a la altura del pecho.
        // Dos alturas (pecho y cintura): los estantes tienen huecos entre un nivel y otro.
        const frente = new THREE.Vector3(-Math.sin(yo.rumbo), 0, -Math.cos(yo.rumbo));
        p = null;
        // …y un poco corridos a los costados, para no escaparse entre dos cajas.
        const costado = new THREE.Vector3(-frente.z, 0, frente.x);
        buscar: for (const altura of [1.28, 0.85]) {
          for (const corrido of [0, 0.12, -0.12]) {
            rayo.set(
              new THREE.Vector3(yo.posicion.x, altura, yo.posicion.z).addScaledVector(costado, corrido),
              frente,
            );
            rayo.far = 1.8;
            const golpe = rayo.intersectObjects([...tienda.seleccionables, ...tienda.solidos], false)[0];
            p = golpe ? tienda.productoDe.get(golpe.object as THREE.InstancedMesh) ?? null : null;
            if (p) break buscar;
          }
        }
      }
      if (p !== enFoco) {
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

  return {
    modo: () => modo,
    cambiarModo,
    joystick: (x, z) => (joy = { x, z }),
    mirar,
    zoom,
    elegirEn: (x, y) => void elegirEn(x, y),
    elegirEnFoco,
    pausar: (si) => {
      pausado = si;
      if (si) teclas.clear();
    },
    entrarVR,
    vrDisponible,
    irA: (x, z, giro) => {
      yo.posicion.set(x, 0, z);
      resolver(yo.posicion, tienda.colisiones, tienda.limites);
      yaw = giro;
      yo.rumbo = giro;
    },
    ligera,
  };
}
