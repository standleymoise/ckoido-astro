// Música de fondo de la tienda 3D, como en una tienda de verdad.
//   - Si el dueño subió canciones en WordPress (Ajustes → Tindershop → Música), suenan esas, una tras otra.
//   - Si no, suenan 4 canciones de fábrica, originales, generadas en el navegador (Web Audio): no pesan
//     nada, no hay derechos de autor de por medio y cada una dura unos 2 minutos y medio.
// Arranca con el primer clic del cliente (los navegadores no dejan sonar nada antes) y se puede silenciar.

export type Cancion = { url: string; titulo?: string };
export type Musica = {
  iniciar: () => void;
  silenciar: (si: boolean) => void;
  siguiente: () => void;
  /** Nombre de lo que está sonando (para mostrarlo un momento). */
  titulo: () => string;
};

const VOLUMEN = 0.32;

// ---------- canciones de WordPress ----------
function lista(canciones: Cancion[], alCambiar: (t: string) => void): Musica {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.volume = VOLUMEN;
  let i = 0;
  let silencio = false;
  const tocar = () => {
    audio.src = canciones[i].url;
    alCambiar(canciones[i].titulo ?? '');
    if (!silencio) audio.play().catch(() => {});
  };
  audio.addEventListener('ended', () => {
    i = (i + 1) % canciones.length;
    tocar();
  });
  audio.addEventListener('error', () => {
    i = (i + 1) % canciones.length;
    setTimeout(tocar, 1000);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.pause();
    else if (!silencio && audio.src) audio.play().catch(() => {});
  });
  return {
    iniciar: tocar,
    silenciar(si) {
      silencio = si;
      if (si) audio.pause();
      else audio.play().catch(() => {});
    },
    siguiente() {
      i = (i + 1) % canciones.length;
      tocar();
    },
    titulo: () => canciones[i]?.titulo ?? '',
  };
}

// ---------- canciones de fábrica (sintetizadas) ----------
type Estilo = {
  titulo: string;
  bpm: number;
  raiz: number; // nota MIDI de la tónica
  menor: boolean;
  progresion: number[]; // grados de la escala (0 = I), un acorde por compás
  arpegio: boolean; // acordes arpegiados o golpes
  semilla: number;
  bateria: number; // 0 nada, 1 suave, 2 un poco más
};

const ESTILOS: Estilo[] = [
  { titulo: 'Paseo por los pasillos', bpm: 98, raiz: 60, menor: false, progresion: [0, 5, 3, 4], arpegio: true, semilla: 3, bateria: 1 },
  { titulo: 'Tarde de compras', bpm: 86, raiz: 57, menor: true, progresion: [0, 5, 2, 6], arpegio: false, semilla: 11, bateria: 1 },
  { titulo: 'Carrito lleno', bpm: 108, raiz: 62, menor: false, progresion: [0, 3, 5, 4], arpegio: true, semilla: 7, bateria: 2 },
  { titulo: 'Ofertas de la semana', bpm: 92, raiz: 55, menor: false, progresion: [3, 4, 2, 5], arpegio: false, semilla: 19, bateria: 1 },
];
const MAYOR = [0, 2, 4, 5, 7, 9, 11];
const MENOR = [0, 2, 3, 5, 7, 8, 10];
const COMPASES = 60; // ≈ 2,5 minutos por canción

const frecuencia = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function fabrica(alCambiar: (t: string) => void): Musica {
  let ctx: AudioContext | null = null;
  let salida: GainNode;
  let ruido: AudioBuffer;
  let cancion = 0;
  let compas = 0;
  let tiempoCompas = 0;
  let temporizador = 0;
  let silencio = false;

  function preparar() {
    ctx = new AudioContext();
    const compresor = ctx.createDynamicsCompressor();
    salida = ctx.createGain();
    salida.gain.value = silencio ? 0 : VOLUMEN;
    salida.connect(compresor).connect(ctx.destination);
    ruido = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const d = ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend();
      else if (!silencio) ctx.resume();
    });
  }

  /** Una nota de «piano eléctrico»: dos osciladores, filtro y envolvente suave. */
  function nota(midi: number, t: number, dur: number, vol: number, brillo = 2400) {
    const c = ctx!;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = brillo;
    for (const [tipo, desafino, v] of [
      ['sine', 0, 1],
      ['triangle', 4, 0.35],
    ] as const) {
      const o = c.createOscillator();
      o.type = tipo;
      o.frequency.value = frecuencia(midi);
      o.detune.value = desafino;
      const gv = c.createGain();
      gv.gain.value = v;
      o.connect(gv).connect(f);
      o.start(t);
      o.stop(t + dur + 0.6);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
    f.connect(g).connect(salida);
  }
  function bajo(midi: number, t: number, dur: number) {
    const c = ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.value = frecuencia(midi);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(salida);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function bombo(t: number) {
    const c = ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(salida);
    o.start(t);
    o.stop(t + 0.3);
  }
  function platillo(t: number, vol: number) {
    const c = ctx!;
    const s = c.createBufferSource();
    s.buffer = ruido;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(f).connect(g).connect(salida);
    s.start(t);
    s.stop(t + 0.08);
  }

  /** Programa un compás entero de la canción actual. */
  function compasDe(e: Estilo, n: number, t: number) {
    const escala = e.menor ? MENOR : MAYOR;
    const negra = 60 / e.bpm;
    const grado = e.progresion[n % e.progresion.length];
    const nota1 = (g: number, oct = 0) => e.raiz + escala[((g % 7) + 7) % 7] + 12 * (Math.floor(g / 7) + oct);
    const acorde = [nota1(grado), nota1(grado + 2), nota1(grado + 4), nota1(grado + 6)];
    // La canción entra de a poco y se despide al final.
    const fade = Math.min(1, (n + 1) / 4, (COMPASES - n) / 4);
    if (e.arpegio) {
      [0, 1, 2, 3, 2, 1, 2, 3].forEach((k, i) => nota(acorde[k], t + i * (negra / 2), negra * 0.9, 0.07 * fade));
    } else {
      for (const golpe of [0, 1.5, 2.5]) acorde.forEach((m) => nota(m, t + golpe * negra, negra * 1.2, 0.045 * fade, 1800));
    }
    bajo(acorde[0] - 24, t, negra * 1.8);
    bajo(acorde[0] - 24 + (n % 2 ? 7 : 0), t + 2 * negra, negra * 1.8);
    // Melodía: frase de 4 compases que se repite, elegida con la semilla de la canción.
    if (n >= 4 && n < COMPASES - 2) {
      let s = (e.semilla * 9301 + (n % 4) * 49297) % 233280;
      const al = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      const pentatonica = e.menor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
      for (let i = 0; i < 4; i++) {
        if (al() < 0.35) continue;
        const m = e.raiz + 12 + pentatonica[Math.floor(al() * pentatonica.length)];
        nota(m, t + i * negra + (al() < 0.3 ? negra / 2 : 0), negra * 0.8, 0.06 * fade, 3200);
      }
    }
    if (e.bateria && n >= 2 && n < COMPASES - 1) {
      bombo(t);
      bombo(t + 2 * negra);
      for (let i = 0; i < 8; i++) platillo(t + (i * negra) / 2, (i % 2 ? 0.025 : 0.04) * e.bateria * fade);
    }
    return 4 * negra;
  }

  function programar() {
    const c = ctx!;
    while (tiempoCompas < c.currentTime + 0.6) {
      const e = ESTILOS[cancion];
      tiempoCompas += compasDe(e, compas, tiempoCompas);
      if (++compas >= COMPASES) {
        compas = 0;
        cancion = (cancion + 1) % ESTILOS.length;
        tiempoCompas += 1.5; // un respiro entre canciones
        alCambiar(ESTILOS[cancion].titulo);
      }
    }
  }

  return {
    iniciar() {
      if (!ctx) preparar();
      ctx!.resume();
      cancion = Math.floor(Math.random() * ESTILOS.length);
      compas = 0;
      tiempoCompas = ctx!.currentTime + 0.2;
      alCambiar(ESTILOS[cancion].titulo);
      clearInterval(temporizador);
      temporizador = window.setInterval(programar, 200);
      programar();
    },
    silenciar(si) {
      silencio = si;
      if (!ctx) return;
      salida.gain.setTargetAtTime(si ? 0 : VOLUMEN, ctx.currentTime, 0.2);
      if (si) setTimeout(() => silencio && ctx?.suspend(), 600);
      else ctx.resume();
    },
    siguiente() {
      if (!ctx) return;
      compas = COMPASES - 1;
    },
    titulo: () => ESTILOS[cancion].titulo,
  };
}

/** Las canciones de WordPress si hay; si no, las de fábrica. */
export function crearMusica(canciones: Cancion[], alCambiar: (titulo: string) => void = () => {}): Musica {
  return canciones.length ? lista(canciones, alCambiar) : fabrica(alCambiar);
}
