// Envío de formularios a Formspree sin salir de la página.
// Cada <form data-formspree> necesita un elemento [data-estado] (aria-live) para los mensajes.
// Sin JavaScript, el formulario hace un POST normal a Formspree (que muestra su propia página de gracias).

type Mensajes = { ok: string; error: string; enviando: string; sinConfig: string };

const porDefecto: Mensajes = {
  ok: '¡Gracias! Recibimos su mensaje.',
  error: 'No se pudo enviar. Revise su conexión e intente de nuevo.',
  enviando: 'Enviando…',
  sinConfig: 'Este formulario todavía no está configurado.',
};

function iniciar(form: HTMLFormElement) {
  const estado = form.parentElement?.querySelector<HTMLElement>('[data-estado]') ?? null;
  const boton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const mensajes: Mensajes = {
    ok: form.dataset.ok || porDefecto.ok,
    error: porDefecto.error,
    enviando: porDefecto.enviando,
    sinConfig: porDefecto.sinConfig,
  };

  const mostrar = (texto: string, tipo: 'ok' | 'error' | 'info') => {
    if (!estado) return;
    estado.textContent = texto;
    estado.dataset.tipo = tipo;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.action || form.getAttribute('action') === '#') {
      mostrar(mensajes.sinConfig, 'error');
      return;
    }

    const textoBoton = boton?.textContent;
    if (boton) {
      boton.disabled = true;
      boton.textContent = mensajes.enviando;
    }
    mostrar('', 'info');

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        form.reset();
        mostrar(mensajes.ok, 'ok');
      } else {
        const data = await res.json().catch(() => null);
        const detalle = data?.errors?.map((x: { message: string }) => x.message).join(' ');
        mostrar(detalle ? `${mensajes.error} (${detalle})` : mensajes.error, 'error');
      }
    } catch {
      mostrar(mensajes.error, 'error');
    } finally {
      if (boton) {
        boton.disabled = false;
        boton.textContent = textoBoton ?? '';
      }
    }
  });
}

document.querySelectorAll<HTMLFormElement>('form[data-formspree]').forEach(iniciar);
