/* Sincronización con Supabase.
 *  - Cuentas: registro, ingreso, aprobación por el admin, cambio / recuperación de contraseña.
 *  - Lista de precios: el admin la sube comprimida; los usuarios la bajan cuando hay versión nueva.
 *  - Fichas: se sincronizan de a poco (sólo lo cambiado). Las fotos se bajan al verlas.
 * Todo queda guardado en el teléfono, así que la app sigue andando sin internet. */
const Nube = (() => {
  const BUCKET = 'datos';
  const activa = typeof CONFIG_NUBE !== 'undefined' && !!CONFIG_NUBE.url && !!CONFIG_NUBE.anonKey && !!window.supabase;
  const $ = s => document.querySelector(s);

  let sb = null;
  let perfil = null;          // { id, email, nombre, rol, aprobado }
  let modo = 'entrar';
  let alEntrar = null;
  let recuperando = false;

  if (activa) {
    sb = supabase.createClient(CONFIG_NUBE.url, CONFIG_NUBE.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'guille-nube' },
    });
    sb.auth.onAuthStateChange(evento => {
      if (evento === 'PASSWORD_RECOVERY') {
        recuperando = true;
        $('#portada').classList.remove('oculto');
        prepararFormulario('nueva-clave');
      }
    });
  }

  /* ---------- utilidades ---------- */
  const esAdmin = () => !!(perfil && perfil.rol === 'admin' && perfil.aprobado);
  const urlApp = () => location.origin + location.pathname;

  function traducirError(err) {
    const m = String((err && (err.message || err.error_description)) || err || '');
    if (/Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos';
    if (/already registered|already been registered|already exists/i.test(m)) return 'Ya existe una cuenta con ese email';
    if (/Email not confirmed/i.test(m)) return 'Falta confirmar el email: revisá tu correo';
    if (/at least 6|Password should be/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres';
    if (/valid email|invalid format|Unable to validate email/i.test(m)) return 'El email no es válido';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Esperá unos minutos.';
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return 'Sin conexión a internet';
    if (/row-level security|permission denied|not authorized|Unauthorized/i.test(m)) return 'No tenés permiso para hacer esto';
    return m || 'Error desconocido';
  }

  function chequear({ data, error }) {
    if (error) throw new Error(traducirError(error));
    return data;
  }

  async function comprimir(texto) {
    const s = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Response(s).blob();
  }

  async function descomprimir(blob) {
    const s = blob.stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(s).text();
  }

  /* ---------- perfil ---------- */
  async function cargarPerfil(userId) {
    try {
      const data = chequear(await sb.from('perfiles').select('*').eq('id', userId).maybeSingle());
      perfil = data;
      if (data) await DB.setMeta('perfil', data);
    } catch (e) {
      // sin internet: usar el último perfil conocido de este usuario
      const guardado = await DB.getMeta('perfil');
      perfil = guardado && guardado.id === userId ? guardado : null;
      if (!perfil) throw e;
    }
    return perfil;
  }

  /* ---------- pantalla de acceso ---------- */
  const MODOS = {
    entrar: { titulo: 'Bienvenido', campos: ['email', 'clave'], boton: 'Entrar',
      alt1: ['Crear una cuenta', () => prepararFormulario('registrar')],
      alt2: ['Olvidé mi contraseña', () => olvide()] },
    registrar: { titulo: 'Crear cuenta', ayuda: 'El administrador tiene que aprobar tu cuenta antes de que puedas usar la app.',
      campos: ['nombre', 'email', 'clave', 'clave2'], boton: 'Registrarme',
      alt1: ['Ya tengo cuenta', () => prepararFormulario('entrar')] },
    esperando: { titulo: 'Cuenta pendiente', campos: [], boton: 'Ya me aprobaron',
      alt1: ['Cerrar sesión', () => cerrarSesion()] },
    confirmar: { titulo: 'Revisá tu email', campos: [], boton: 'Ya confirmé, entrar',
      ayuda: 'Te mandamos un link para confirmar la cuenta. Abrilo y después volvé acá.' },
    enviado: { titulo: 'Revisá tu email', campos: [], boton: 'Volver',
      ayuda: 'Te mandamos un link para crear una contraseña nueva. Abrilo desde este teléfono.' },
    'nueva-clave': { titulo: 'Contraseña nueva', campos: ['clave', 'clave2'], boton: 'Guardar',
      alt1: ['Cancelar', () => salirFormulario()] },
  };

  function prepararFormulario(m, ayudaExtra) {
    modo = m;
    const cfg = MODOS[m];
    $('#formAcceso').classList.add('oculto');
    $('#formNube').classList.remove('oculto');
    $('#nubeTitulo').textContent = cfg.titulo;
    const ayuda = ayudaExtra || cfg.ayuda || '';
    $('#nubeAyuda').textContent = ayuda;
    $('#nubeAyuda').classList.toggle('oculto', !ayuda);
    ['nombre', 'email', 'clave', 'clave2'].forEach(c => {
      const el = $('#nube' + c[0].toUpperCase() + c.slice(1));
      el.classList.toggle('oculto', !cfg.campos.includes(c));
      if (c.startsWith('clave')) el.value = '';
    });
    $('#nubeClave').placeholder = m === 'entrar' ? 'Contraseña' : 'Contraseña nueva (mínimo 6)';
    $('#nubeClave').autocomplete = m === 'entrar' ? 'current-password' : 'new-password';
    $('#btnNube').textContent = cfg.boton;
    [['#nubeAlt1', cfg.alt1], ['#nubeAlt2', cfg.alt2]].forEach(([sel, alt]) => {
      const b = $(sel);
      b.classList.toggle('oculto', !alt);
      if (alt) { b.textContent = alt[0]; b.onclick = alt[1]; }
    });
    $('#nubeError').textContent = '';
    $('#portadaForm').classList.remove('oculto');
    $('#portada').classList.add('con-form');
  }

  function error(msg) { $('#nubeError').textContent = msg; }

  async function alEnviar(e) {
    e.preventDefault();
    error('');
    const btn = $('#btnNube');
    const email = $('#nubeEmail').value.trim();
    const clave = $('#nubeClave').value;
    btn.disabled = true;
    try {
      if (modo === 'entrar') {
        const data = chequear(await sb.auth.signInWithPassword({ email, password: clave }));
        await despuesDeEntrar(data.user);
      } else if (modo === 'registrar') {
        const nombre = $('#nubeNombre').value.trim();
        if (!nombre) return error('Escribí tu nombre');
        if (clave.length < 6) return error('La contraseña debe tener al menos 6 caracteres');
        if (clave !== $('#nubeClave2').value) return error('Las contraseñas no coinciden');
        const data = chequear(await sb.auth.signUp({
          email, password: clave, options: { data: { nombre }, emailRedirectTo: urlApp() },
        }));
        if (!data.session) prepararFormulario('confirmar');
        else await despuesDeEntrar(data.user);
      } else if (modo === 'esperando') {
        const { data } = await sb.auth.getSession();
        if (data.session) await despuesDeEntrar(data.session.user);
        else prepararFormulario('entrar');
      } else if (modo === 'confirmar' || modo === 'enviado') {
        prepararFormulario('entrar');
      } else if (modo === 'nueva-clave') {
        if (clave.length < 6) return error('La contraseña debe tener al menos 6 caracteres');
        if (clave !== $('#nubeClave2').value) return error('Las contraseñas no coinciden');
        chequear(await sb.auth.updateUser({ password: clave }));
        if (window.toast) toast('✅ Contraseña cambiada');
        if (recuperando) {
          recuperando = false;
          history.replaceState(null, '', urlApp());
          const { data } = await sb.auth.getSession();
          if (data.session) return despuesDeEntrar(data.session.user);
        }
        salirFormulario();
      }
    } catch (ex) {
      error(traducirError(ex));
    } finally {
      btn.disabled = false;
    }
  }

  async function olvide() {
    const email = $('#nubeEmail').value.trim();
    if (!email) return error('Escribí tu email arriba y tocá de nuevo “Olvidé mi contraseña”');
    try {
      chequear(await sb.auth.resetPasswordForEmail(email, { redirectTo: urlApp() }));
      prepararFormulario('enviado');
    } catch (ex) { error(traducirError(ex)); }
  }

  async function despuesDeEntrar(user) {
    const p = await cargarPerfil(user.id);
    if (!p) throw new Error('No se encontró el perfil. Revisá que el script de la base esté instalado.');
    if (!p.aprobado) {
      prepararFormulario('esperando', `Hola ${p.nombre || p.email}. Tu cuenta está esperando que el administrador la apruebe.`);
      return;
    }
    // si cambió de usuario en este teléfono, empezar la sincronización de cero
    const ultimo = await DB.getMeta('ultimoUsuario');
    if (!ultimo && p.rol !== 'admin') {
      // primera vez con la nube en este teléfono: lo que manda es lo de la nube
      await DB.vaciar(['fichas', 'minis', 'fotos']);
      await reiniciarSync();
    } else if (ultimo && ultimo !== p.id) await reiniciarSync();
    await DB.setMeta('ultimoUsuario', p.id);
    salirFormulario();
  }

  function salirFormulario() {
    const port = $('#portada');
    port.classList.add('saliendo');
    setTimeout(() => { port.classList.add('oculto'); port.classList.remove('saliendo'); }, 500);
    document.body.classList.toggle('es-admin', esAdmin());
    document.dispatchEvent(new Event('acceso-listo'));
    if (alEntrar) { const f = alEntrar; alEntrar = null; f(); }
  }

  async function cerrarSesion() {
    try { await sb.auth.signOut(); } catch (e) {}
    location.reload();
  }

  /** Muestra la portada; resuelve cuando la persona puede usar la app. */
  function iniciar() {
    $('#formNube').addEventListener('submit', alEnviar);
    return new Promise(async resolve => {
      alEntrar = resolve;
      if (recuperando) return;   // vino del link de "olvidé mi contraseña"
      const { data } = await sb.auth.getSession();
      if (!data.session) return prepararFormulario('entrar');
      let p = null;
      try { p = await cargarPerfil(data.session.user.id); } catch (e) {}
      if (!p) return prepararFormulario('entrar');
      if (!p.aprobado) return prepararFormulario('esperando', `Hola ${p.nombre || p.email}. Tu cuenta está esperando que el administrador la apruebe.`);
      let hecho = false;
      const saltar = () => {
        $('#portada').removeEventListener('click', saltar);
        if (!hecho && !recuperando) { hecho = true; salirFormulario(); }
      };
      $('#portada').addEventListener('click', saltar);
      setTimeout(saltar, 1400);
    });
  }

  function cambiarClave() {
    $('#portada').classList.remove('oculto');
    prepararFormulario('nueva-clave');
  }

  /* ---------- sincronización ---------- */
  async function reiniciarSync() {
    await DB.setMeta('listaVersion', 0);
    await DB.setMeta('fichasDesde', null);
  }

  let sincronizando = null;

  /** Baja lo nuevo de la nube. alAvanzar(texto) informa qué está haciendo.
   *  Devuelve { lista: bool, fichas: n } con lo que cambió. */
  function sincronizar(alAvanzar) {
    if (!sincronizando) {
      sincronizando = _sincronizar(alAvanzar || (() => {})).finally(() => { sincronizando = null; });
    }
    return sincronizando;
  }

  async function _sincronizar(avisar) {
    const cambios = { lista: false, fichas: 0 };
    // 1) lista de precios
    const fila = chequear(await sb.from('lista').select('*').eq('id', 1).maybeSingle());
    const local = (await DB.getMeta('listaVersion')) || 0;
    if (fila && fila.version > local) {
      avisar('Bajando lista de precios…');
      const blob = chequear(await sb.storage.from(BUCKET).download(fila.ruta));
      const datos = JSON.parse(await descomprimir(blob));
      avisar('Guardando lista…');
      await DB.reemplazarProductos(datos.productos);
      await DB.setMeta('importacion', { fecha: fila.actualizado, archivo: fila.archivo, cantidad: fila.cantidad });
      await DB.setMeta('listaVersion', fila.version);
      cambios.lista = true;
    }
    // 2) fichas cambiadas desde la última vez
    let desde = await DB.getMeta('fichasDesde');
    for (;;) {
      let q = sb.from('fichas').select('*').order('actualizado', { ascending: true }).limit(500);
      if (desde) q = q.gt('actualizado', desde);
      const filas = chequear(await q);
      if (!filas.length) break;
      avisar(`Bajando fichas… (${cambios.fichas + filas.length})`);
      const lote = { fichas: [], minis: [] };
      for (const r of filas) {
        if (r.borrado) {
          await DB.borrar('fichas', r.codigo);
          await DB.borrar('minis', r.codigo);
          await DB.borrar('fotos', r.codigo);
        } else {
          lote.fichas.push(aFichaLocal(r));
          if (r.mini) lote.minis.push({ codigo: r.codigo, url: r.mini });
          else await DB.borrar('minis', r.codigo);
        }
      }
      await DB.guardarVarios(lote);
      cambios.fichas += filas.length;
      desde = filas[filas.length - 1].actualizado;
      await DB.setMeta('fichasDesde', desde);
      if (filas.length < 500) break;
    }
    await DB.setMeta('ultimaSync', new Date().toISOString());
    return cambios;
  }

  function aFichaLocal(r) {
    return {
      codigo: r.codigo,
      descripcion: r.descripcion || '',
      caracteristicas: r.caracteristicas || '',
      destacado: !!r.destacado,
      tieneFoto: !!r.foto_ruta,
      foto_ruta: r.foto_ruta || null,
      actualizado: r.actualizado,
    };
  }

  /** Devuelve la foto guardada en el teléfono o la baja de la nube si falta / cambió. */
  async function obtenerFoto(ficha) {
    let reg = await DB.obtener('fotos', ficha.codigo);
    if (ficha.foto_ruta && (!reg || reg.ruta !== ficha.foto_ruta)) {
      try {
        const blob = chequear(await sb.storage.from(BUCKET).download(ficha.foto_ruta));
        reg = { codigo: ficha.codigo, tipo: 'image/jpeg', datos: await blob.arrayBuffer(), ruta: ficha.foto_ruta };
        await DB.guardar('fotos', reg);
      } catch (e) { /* sin internet: se muestra sin foto */ }
    }
    return reg || null;
  }

  /* ---------- acciones del admin ---------- */
  async function subirLista(productos, nombreArchivo, avisar) {
    avisar = avisar || (() => {});
    avisar('Comprimiendo lista…');
    const version = Date.now();
    const ruta = `lista/lista-${version}.json.gz`;
    const blob = await comprimir(JSON.stringify({ v: 1, productos }));
    avisar(`Subiendo lista (${(blob.size / 1048576).toFixed(1)} MB)…`);
    chequear(await sb.storage.from(BUCKET).upload(ruta, blob, { contentType: 'application/octet-stream', upsert: true }));
    const anterior = chequear(await sb.from('lista').select('ruta').eq('id', 1).maybeSingle());
    chequear(await sb.from('lista').upsert({
      id: 1, version, ruta, archivo: nombreArchivo, cantidad: productos.length, actualizado: new Date().toISOString(),
    }));
    if (anterior && anterior.ruta && anterior.ruta !== ruta) await sb.storage.from(BUCKET).remove([anterior.ruta]);
    await DB.setMeta('listaVersion', version);
  }

  /** Guarda la ficha en la nube. foto = { blob, mini } si hay foto nueva; quitarFoto = true para borrarla. */
  async function guardarFicha(ficha, foto, quitarFoto, anterior) {
    let foto_ruta = anterior && anterior.foto_ruta || null;
    let mini;  // undefined = no cambiar
    if (foto) {
      const ruta = `fotos/${encodeURIComponent(ficha.codigo)}-${Date.now()}.jpg`;
      chequear(await sb.storage.from(BUCKET).upload(ruta, foto.blob, { contentType: 'image/jpeg', upsert: true }));
      foto_ruta = ruta;
      mini = foto.mini;
    } else if (quitarFoto) {
      foto_ruta = null;
      mini = null;
    }
    const fila = {
      codigo: ficha.codigo,
      descripcion: ficha.descripcion,
      caracteristicas: ficha.caracteristicas,
      destacado: ficha.destacado,
      foto_ruta,
      borrado: false,
    };
    if (mini !== undefined) fila.mini = mini;
    const guardada = chequear(await sb.from('fichas').upsert(fila).select().single());
    const vieja = anterior && anterior.foto_ruta;
    if (vieja && vieja !== foto_ruta) await sb.storage.from(BUCKET).remove([vieja]);
    return aFichaLocal(guardada);
  }

  async function borrarFicha(codigo, anterior) {
    chequear(await sb.from('fichas').upsert({
      codigo, descripcion: '', caracteristicas: '', destacado: false, foto_ruta: null, mini: null, borrado: true,
    }));
    if (anterior && anterior.foto_ruta) await sb.storage.from(BUCKET).remove([anterior.foto_ruta]);
  }

  async function listarPerfiles() {
    return chequear(await sb.from('perfiles').select('*').order('aprobado').order('creado', { ascending: false }));
  }

  async function actualizarPerfil(id, cambios) {
    chequear(await sb.from('perfiles').update(cambios).eq('id', id));
  }

  return {
    activa,
    iniciar, cerrarSesion, cambiarClave,
    sincronizar, obtenerFoto, subirLista, guardarFicha, borrarFicha,
    listarPerfiles, actualizarPerfil,
    esAdmin, perfil: () => perfil,
  };
})();
