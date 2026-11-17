/* Portada con el logo + usuario y contraseña.
 * El usuario y la contraseña se crean la primera vez en el propio teléfono.
 * La contraseña no se guarda: se guarda sólo una "huella" (PBKDF2-SHA256 con sal). */
const Acceso = (() => {
  const ITERACIONES = 150000;
  const $ = s => document.querySelector(s);

  let modo = 'entrar';       // 'crear' | 'entrar' | 'cambiar'
  let alEntrar = null;

  /* ---------- huella de la contraseña ---------- */
  const aHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const deHex = hex => new Uint8Array(hex.match(/../g).map(x => parseInt(x, 16)));

  async function huella(clave, salHex) {
    if (!window.crypto || !crypto.subtle) throw new Error('Abrí la app desde la dirección https://');
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: deHex(salHex), iterations: ITERACIONES }, base, 256);
    return aHex(bits);
  }

  const normUsuario = u => String(u || '').trim().toLowerCase();

  async function guardarCredenciales(usuario, clave) {
    const sal = aHex(crypto.getRandomValues(new Uint8Array(16)));
    await DB.setMeta('acceso', { usuario: usuario.trim(), sal, hash: await huella(clave, sal) });
  }

  async function verificar(usuario, clave) {
    const c = await DB.getMeta('acceso');
    if (!c) return false;
    if (normUsuario(usuario) !== normUsuario(c.usuario)) return false;
    return (await huella(clave, c.sal)) === c.hash;
  }

  /* ---------- sesión: se vence a las 4 horas sin usar la app ---------- */
  const MINUTOS = 4 * 60;
  const CLAVE_ACTIVIDAD = 'guille-actividad';
  let ultimaActividad = 0;
  let bloqueada = true;

  function leerActividad() {
    try { return parseInt(localStorage.getItem(CLAVE_ACTIVIDAD) || '0', 10); } catch (e) { return ultimaActividad; }
  }

  function marcarActividad() {
    ultimaActividad = Date.now();
    try { localStorage.setItem(CLAVE_ACTIVIDAD, String(ultimaActividad)); } catch (e) {}
  }

  const vencida = () => Date.now() - Math.max(leerActividad(), ultimaActividad) > MINUTOS * 60000;

  function sesionActiva() { return !vencida(); }

  function cerrarSesion() {
    bloqueada = true;            // que el aviso de "app oculta" al recargar no vuelva a abrir la sesión
    ultimaActividad = 0;
    try { localStorage.removeItem(CLAVE_ACTIVIDAD); } catch (e) {}
    location.reload();
  }

  /** Vuelve a pedir usuario y contraseña (después de 4 horas sin uso). */
  function bloquear() {
    if (bloqueada) return;
    bloqueada = true;
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    document.dispatchEvent(new Event('acceso-bloqueado'));
    colorBarra('#1c1714');
    const p = $('#portada');
    p.classList.remove('oculto', 'saliendo');
    prepararFormulario('entrar');
  }

  function vigilarInactividad() {
    let ultimoGuardado = 0;
    const actividad = () => {
      if (bloqueada) return;
      // guardar como mucho cada 20 segundos
      if (Date.now() - ultimoGuardado > 20000) { ultimoGuardado = Date.now(); marcarActividad(); }
    };
    ['pointerdown', 'keydown', 'scroll'].forEach(ev => document.addEventListener(ev, actividad, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (!bloqueada) marcarActividad(); }
      else if (!bloqueada && vencida()) bloquear();
    });
    setInterval(() => { if (!document.hidden && !bloqueada && vencida()) bloquear(); }, 30000);
  }

  /* ---------- pantalla ---------- */
  function mostrar(el, si) { el.classList.toggle('oculto', !si); }

  function prepararFormulario(m, usuarioActual) {
    modo = m;
    const titulos = {
      crear: ['Creá tu usuario', 'Es la primera vez que entrás en este teléfono. Elegí un usuario y una contraseña.'],
      entrar: ['Bienvenido', ''],
      cambiar: ['Cambiar usuario o contraseña', 'Escribí tu contraseña actual y los datos nuevos.'],
    };
    $('#accesoTitulo').textContent = titulos[m][0];
    $('#accesoAyuda').textContent = titulos[m][1];
    mostrar($('#accesoAyuda'), !!titulos[m][1]);
    mostrar($('#accesoClaveActual'), m === 'cambiar');
    mostrar($('#accesoClave2'), m !== 'entrar');
    mostrar($('#btnOlvide'), m === 'entrar');
    mostrar($('#btnCancelarAcceso'), m === 'cambiar');
    $('#accesoClave').placeholder = m === 'entrar' ? 'Contraseña' : 'Contraseña nueva';
    $('#accesoClave').autocomplete = m === 'entrar' ? 'current-password' : 'new-password';
    $('#btnAcceso').textContent = m === 'entrar' ? 'Entrar' : 'Guardar';
    $('#accesoUsuario').value = usuarioActual || '';
    ['#accesoClave', '#accesoClave2', '#accesoClaveActual'].forEach(s => { $(s).value = ''; });
    $('#accesoError').textContent = '';
    mostrar($('#portadaForm'), true);
    $('#portada').classList.add('con-form');
  }

  async function alEnviar(e) {
    e.preventDefault();
    const err = $('#accesoError');
    const btn = $('#btnAcceso');
    err.textContent = '';
    const usuario = $('#accesoUsuario').value.trim();
    const clave = $('#accesoClave').value;
    btn.disabled = true;
    try {
      if (modo === 'entrar') {
        if (await verificar(usuario, clave)) {
          marcarActividad();
          entrar();
        } else {
          err.textContent = 'Usuario o contraseña incorrectos';
          $('#accesoClave').value = '';
        }
        return;
      }
      if (modo === 'cambiar') {
        const c = await DB.getMeta('acceso');
        if (!(await verificar(c.usuario, $('#accesoClaveActual').value))) {
          err.textContent = 'La contraseña actual no es correcta';
          return;
        }
      }
      if (usuario.length < 3) { err.textContent = 'El usuario debe tener al menos 3 letras'; return; }
      if (clave.length < 4) { err.textContent = 'La contraseña debe tener al menos 4 caracteres'; return; }
      if (clave !== $('#accesoClave2').value) { err.textContent = 'Las contraseñas no coinciden'; return; }
      await guardarCredenciales(usuario, clave);
      marcarActividad();
      entrar();
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  }

  async function olvide() {
    if (!confirm('Por seguridad, para crear una contraseña nueva hay que BORRAR todos los datos de este teléfono: la lista de precios y las fichas (fotos y características).\n\n¿Continuar?')) return;
    if (!confirm('¿Seguro? Si no tenés una copia de las fichas, se pierden.')) return;
    bloqueada = true;
    ultimaActividad = 0;
    await DB.borrarTodo();
    try { localStorage.removeItem(CLAVE_ACTIVIDAD); } catch (e) {}
    location.reload();
  }

  /** Color de la barra de arriba (hora / batería): oscura en la portada, arena en la app. */
  function colorBarra(c) {
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', c);
  }

  function entrar() {
    bloqueada = false;
    colorBarra('#efe6d6');
    const p = $('#portada');
    p.classList.add('saliendo');
    setTimeout(() => { p.classList.add('oculto'); p.classList.remove('saliendo'); }, 500);
    document.dispatchEvent(new Event('acceso-listo'));
    if (alEntrar) { const f = alEntrar; alEntrar = null; f(); }
  }

  /** Muestra la portada; resuelve cuando la persona ya puede usar la app. */
  function iniciar() {
    $('#formAcceso').addEventListener('submit', alEnviar);
    $('#btnOlvide').addEventListener('click', olvide);
    $('#btnCancelarAcceso').addEventListener('click', entrar);
    try { localStorage.removeItem('guille-sesion'); } catch (e) {}  // formato viejo ("recordarme 30 días")
    vigilarInactividad();
    return new Promise(async resolve => {
      alEntrar = resolve;
      const c = await DB.getMeta('acceso');
      if (c && sesionActiva()) {
        // usó la app hace menos de 4 horas: mostrar el logo un momento (tocar para saltear)
        let hecho = false;
        const saltar = () => {
          $('#portada').removeEventListener('click', saltar);
          if (!hecho) { hecho = true; entrar(); }
        };
        $('#portada').addEventListener('click', saltar);
        setTimeout(saltar, 1400);
        return;
      }
      prepararFormulario(c ? 'entrar' : 'crear');
    });
  }

  async function cambiar() {
    const c = await DB.getMeta('acceso');
    colorBarra('#1c1714');
    $('#portada').classList.remove('oculto');
    prepararFormulario('cambiar', c ? c.usuario : '');
  }

  async function usuarioActual() {
    const c = await DB.getMeta('acceso');
    return c ? c.usuario : '';
  }

  return { iniciar, cambiar, cerrarSesion, usuarioActual };
})();
