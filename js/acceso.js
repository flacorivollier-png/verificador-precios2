/* Portada con el logo + usuario y contraseña.
 * El usuario y la contraseña se crean la primera vez en el propio teléfono.
 * La contraseña no se guarda: se guarda sólo una "huella" (PBKDF2-SHA256 con sal). */
const Acceso = (() => {
  const CLAVE_SESION = 'guille-sesion';
  const DIAS_RECORDAR = 30;
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

  /* ---------- sesión ---------- */
  function sesionActiva() {
    try {
      if (sessionStorage.getItem(CLAVE_SESION) === '1') return true;
      const hasta = parseInt(localStorage.getItem(CLAVE_SESION) || '0', 10);
      return hasta > Date.now();
    } catch (e) { return false; }
  }

  function abrirSesion(recordar) {
    try {
      sessionStorage.setItem(CLAVE_SESION, '1');
      if (recordar) localStorage.setItem(CLAVE_SESION, String(Date.now() + DIAS_RECORDAR * 86400000));
      else localStorage.removeItem(CLAVE_SESION);
    } catch (e) { /* sin almacenamiento: vale sólo mientras la app esté abierta */ }
  }

  function cerrarSesion() {
    try { sessionStorage.removeItem(CLAVE_SESION); localStorage.removeItem(CLAVE_SESION); } catch (e) {}
    location.reload();
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
    mostrar($('#accesoRecordarWrap'), m !== 'cambiar');
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
          abrirSesion($('#accesoRecordar').checked);
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
      if (modo === 'crear') abrirSesion($('#accesoRecordar').checked);
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
    await DB.borrarTodo();
    try { localStorage.removeItem(CLAVE_SESION); sessionStorage.removeItem(CLAVE_SESION); } catch (e) {}
    location.reload();
  }

  /** Color de la barra de arriba (hora / batería): oscura en la portada, arena en la app. */
  function colorBarra(c) {
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', c);
  }

  function entrar() {
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
    return new Promise(async resolve => {
      alEntrar = resolve;
      const c = await DB.getMeta('acceso');
      if (c && sesionActiva()) {
        // ya tiene sesión: mostrar el logo un momento (tocar para saltear)
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
