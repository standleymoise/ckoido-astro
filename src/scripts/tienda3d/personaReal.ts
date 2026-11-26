// Personas realistas: cuerpos, peinados y animaciones de Quaternius («Universal Base Characters» y
// «Universal Animation Library», licencia CC0, en public/modelos/). Los cuerpos vienen en ropa interior;
// acá se los viste: cada parte del cuerpo se pinta según el hueso que la mueve (remera en el torso y los
// brazos, pantalón en la cadera y las piernas, zapatos en los pies) y se le da un poco de volumen.
// Cada comprador sale de un número (apariencia): género, piel, peinado y colores de ropa propios.
// Devuelve la misma interfaz que las personas hechas con figuras (personaje.ts), así el resto no cambia.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as clonarConEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { aparienciaDe, type Apariencia, type Personaje } from './personaje';

export type Ropa = Partial<Pick<Apariencia, 'remera' | 'pantalon' | 'zapatos'>>;
export type FabricaPersonas = (numero: number, ropa?: Ropa) => Personaje;

const REMERA = new Set(['spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r']);
const PANTALON = new Set(['root', 'pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r']);
const ZAPATOS = new Set(['foot_l', 'foot_r', 'ball_l', 'ball_r', 'ball_leaf_l', 'ball_leaf_r']);

const PEINADOS = {
  hombre: ['simpleparted', 'buzzed', 'beard', 'simpleparted'],
  mujer: ['long', 'buns', 'buzzedfemale', 'long'],
} as const;

type Plantilla = { escena: THREE.Object3D; pieles: THREE.Texture[] };

/** Por vértice: cuánto pesa la remera, el pantalón y los zapatos (según los huesos que lo mueven). */
function marcarRopa(malla: THREE.SkinnedMesh) {
  const g = malla.geometry;
  if (g.getAttribute('aRopa')) return;
  const indices = g.getAttribute('skinIndex');
  const pesos = g.getAttribute('skinWeight');
  const nombres = malla.skeleton.bones.map((b) => b.name);
  const ropa = new Float32Array(indices.count * 3);
  for (let v = 0; v < indices.count; v++) {
    for (let k = 0; k < 4; k++) {
      const nombre = nombres[indices.getComponent(v, k)];
      const peso = pesos.getComponent(v, k);
      if (REMERA.has(nombre)) ropa[v * 3] += peso;
      else if (PANTALON.has(nombre)) ropa[v * 3 + 1] += peso;
      else if (ZAPATOS.has(nombre)) ropa[v * 3 + 2] += peso;
    }
  }
  g.setAttribute('aRopa', new THREE.BufferAttribute(ropa, 3));
}

/** Material del cuerpo con ropa: mismos mapas, colores de tela por persona y un poco de volumen. */
function vestir(material: THREE.MeshStandardMaterial, piel: THREE.Texture, ropa: Required<Ropa>) {
  const m = material.clone();
  m.map = piel;
  m.roughness = 0.75;
  const uniformes = {
    uRemera: { value: new THREE.Color(ropa.remera) },
    uPantalon: { value: new THREE.Color(ropa.pantalon) },
    uZapatos: { value: new THREE.Color(ropa.zapatos) },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniformes);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRopa;\nvarying vec3 vRopa;')
      .replace(
        '#include <begin_vertex>',
        // La tela queda apenas por fuera de la piel: se ve con volumen y no «pintada».
        '#include <begin_vertex>\nvRopa = aRopa;\ntransformed += objectNormal * (aRopa.x * 0.007 + aRopa.y * 0.008 + aRopa.z * 0.014);',
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vRopa;\nuniform vec3 uRemera;\nuniform vec3 uPantalon;\nuniform vec3 uZapatos;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float tono = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        float relieve = 0.82 + 0.35 * tono; // conserva un poco del sombreado del cuerpo (pliegues)
        diffuseColor.rgb = mix(diffuseColor.rgb, uRemera * relieve, smoothstep(0.42, 0.58, vRopa.x));
        diffuseColor.rgb = mix(diffuseColor.rgb, uPantalon * relieve, smoothstep(0.42, 0.58, vRopa.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, uZapatos * relieve, smoothstep(0.42, 0.58, vRopa.z));`,
      );
  };
  m.customProgramCacheKey = () => 'tindershop-vestido';
  return m;
}

export async function cargarPersonas(base: string): Promise<FabricaPersonas> {
  const cargador = new GLTFLoader();
  const texturas = new THREE.TextureLoader();
  const glb = (n: string) => cargador.loadAsync(`${base}${n}`);
  const piel = async (n: string) => {
    const t = await texturas.loadAsync(`${base}${n}`);
    t.flipY = false; // mapas de glTF
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const [hombre, mujer, anim, ...resto] = await Promise.all([
    glb('persona-hombre.glb'),
    glb('persona-mujer.glb'),
    glb('animaciones.glb'),
    piel('piel-hombre-clara.jpg'),
    piel('piel-hombre-oscura.jpg'),
    piel('piel-mujer-clara.jpg'),
    piel('piel-mujer-oscura.jpg'),
  ]);
  const nombresPelo = [...new Set([...PEINADOS.hombre, ...PEINADOS.mujer])];
  const pelos = new Map<string, THREE.SkinnedMesh>();
  await Promise.all(
    nombresPelo.map(async (n) => {
      const g = await glb(`pelo-${n}.glb`);
      g.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) pelos.set(n, o as THREE.SkinnedMesh);
      });
    }),
  );
  const plantillas: Record<'hombre' | 'mujer', Plantilla> = {
    hombre: { escena: hombre.scene, pieles: [resto[0], resto[1]] },
    mujer: { escena: mujer.scene, pieles: [resto[2], resto[3]] },
  };
  for (const p of Object.values(plantillas)) {
    p.escena.traverse((o) => {
      const s = o as THREE.SkinnedMesh;
      if (s.isSkinnedMesh) {
        s.castShadow = true;
        s.frustumCulled = false; // las animaciones mueven el cuerpo fuera de su caja original
        if ((s.material as THREE.Material).name?.startsWith('MI_Superhero')) marcarRopa(s);
      }
    });
  }
  const clips = new Map(anim.animations.map((c) => [c.name, c]));

  return (numero, ropaPedida = {}) => {
    const ap = aparienciaDe(numero);
    const genero: 'hombre' | 'mujer' = numero % 2 ? 'mujer' : 'hombre';
    const plantilla = plantillas[genero];
    const modelo = clonarConEsqueleto(plantilla.escena);
    const ropa = {
      remera: ropaPedida.remera ?? ap.remera,
      pantalon: ropaPedida.pantalon ?? ap.pantalon,
      zapatos: ropaPedida.zapatos ?? ap.zapatos,
    };
    const tonoOscuro = ['#b97d57', '#8d5a3b', '#5e3a26'].includes(ap.piel);
    let cuerpo: THREE.SkinnedMesh | null = null;
    modelo.traverse((o) => {
      const s = o as THREE.SkinnedMesh;
      if (s.isSkinnedMesh && (s.material as THREE.Material).name?.startsWith('MI_Superhero')) {
        cuerpo = s;
        s.material = vestir(s.material as THREE.MeshStandardMaterial, plantilla.pieles[tonoOscuro ? 1 : 0], ropa);
      }
    });
    // Peinado: la malla del pelo se ata al esqueleto de esta persona (mismos nombres de huesos).
    const peinados = PEINADOS[genero];
    const pelo = pelos.get(peinados[ap.peinado % peinados.length]);
    if (pelo && cuerpo) {
      const c = cuerpo as THREE.SkinnedMesh;
      const copia = new THREE.SkinnedMesh(pelo.geometry, (pelo.material as THREE.Material).clone());
      const huesos = pelo.skeleton.bones.map((b) => c.skeleton.getBoneByName(b.name) ?? c.skeleton.bones[0]);
      copia.bind(new THREE.Skeleton(huesos, pelo.skeleton.boneInverses), pelo.bindMatrix);
      copia.castShadow = true;
      copia.frustumCulled = false;
      (copia.material as THREE.MeshStandardMaterial).color.set(ap.pelo).lerp(new THREE.Color('#ffffff'), 0.45);
      c.parent?.add(copia);
    }

    // El modelo mira hacia +z; la tienda usa -z como «adelante».
    const grupo = new THREE.Group();
    modelo.rotation.y = Math.PI;
    modelo.scale.setScalar(0.97 + (ap.altura - 1) * 0.6);
    grupo.add(modelo);

    const mezclador = new THREE.AnimationMixer(modelo);
    const accion = (n: string) => {
      const c = clips.get(n);
      return c ? mezclador.clipAction(c) : null;
    };
    const quieto = accion('Idle_Loop');
    const caminar = accion('Walk_Loop');
    const empujarA = accion('Push_Loop');
    const tomar = accion('PickUp_Table');
    if (tomar) {
      tomar.setLoop(THREE.LoopOnce, 1);
      tomar.clampWhenFinished = true;
    }
    let actual = quieto;
    actual?.play();
    const cambiarA = (a: THREE.AnimationAction | null) => {
      if (!a || a === actual) return;
      a.reset().setEffectiveWeight(1).play();
      if (actual) a.crossFadeFrom(actual, 0.25, false);
      actual = a;
    };
    let conCarrito = false;
    let sosteniendo = false;

    const p: Personaje = {
      grupo,
      posicion: grupo.position,
      rumbo: 0,
      animar(dt, velocidad) {
        const rapidez = Math.abs(velocidad);
        if (sosteniendo) cambiarA(tomar);
        else if (rapidez > 0.15) {
          const a = conCarrito && empujarA ? empujarA : caminar;
          cambiarA(a);
          // La animación va al ritmo del paso; hacia atrás, al revés (no se da vuelta).
          if (a) a.timeScale = Math.sign(velocidad) * Math.min(1.8, rapidez / (a === empujarA ? 1.1 : 1.35));
        } else cambiarA(quieto);
        mezclador.update(dt);
        grupo.rotation.y = p.rumbo;
      },
      empujar(si) {
        conCarrito = si;
      },
      sostener(si) {
        sosteniendo = si;
      },
      mostrar(si) {
        grupo.visible = si;
      },
    };
    return p;
  };
}
