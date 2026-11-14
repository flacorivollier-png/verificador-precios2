/* Verificador de precios — lógica principal */
const VERSION_APP = '1.0.0';

const $ = sel => document.querySelector(sel);

/* ---------- estado en memoria ---------- */
let productos = [];               // lista completa
let porCodigo = new Map();        // código exacto -> producto
let porCodigoSinCeros = new Map();// código sin ceros a la izquierda -> producto
let indiceNombres = [];           // texto normalizado para buscar por nombre
let fichas = new Map();           // código -> ficha (sin la foto grande)
let urlsActivas = [];             // object URLs a liberar

/* ---------- utilidades ---------- */
function h(tag, attrs, ...hijos) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

let toastTimer;
function toast(msg, ms = 2500) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), ms);
}

function sinCeros(c) { return String(c).replace(/^0+/, ''); }

function formatearPrecio(p) {
  if (!p) return '';
  if (p.precio == null) return p.precioTexto || '—';
  const decimales = Math.round(p.precio * 100) % 100 !== 0;
  return '$ ' + p.precio.toLocaleString('es-AR', {
    minimumFractionDigits: decimales ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

function formatearFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function liberarURLs() {
  urlsActivas.forEach(u => URL.revokeObjectURL(u));
  urlsActivas = [];
}

async function urlFoto(codigo) {
  const f = await DB.obtener('fotos', codigo);
  if (!f) return null;
  const url = URL.createObjectURL(new Blob([f.datos], { type: f.tipo || 'image/jpeg' }));
  urlsActivas.push(url);
  return url;
}

/* ---------- carga de datos ---------- */
function indexarProductos(lista) {
  productos = lista;
  porCodigo = new Map();
  porCodigoSinCeros = new Map();
  indiceNombres = new Array(lista.length);
  for (let i = 0; i < lista.length; i++) {
    const p = lista[i];
    porCodigo.set(p.codigo, p);
    const sc = sinCeros(p.codigo);
    if (!porCodigoSinCeros.has(sc)) porCodigoSinCeros.set(sc, p);
    indiceNombres[i] = Importar.normalizar(p.nombre + ' ' + (p.presentacion || '') + ' ' + p.codigo);
  }
}

async function cargarTodo() {
  $('#estadoBase').textContent = 'Cargando…';
  const [lista, listaFichas] = await Promise.all([DB.todos('productos'), DB.todos('fichas')]);
  indexarProductos(lista);
  fichas = new Map(listaFichas.map(f => [f.codigo, f]));
  await actualizarInfo();
}

async function actualizarInfo() {
  const info = await DB.getMeta('importacion');
  const n = productos.length.toLocaleString('es-AR');
  $('#estadoBase').textContent = productos.length ? `${n} productos` : 'Sin datos';
  $('#infoBase').innerHTML = '';
  if (productos.length && info) {
    $('#infoBase').append(
      h('div', null, h('b', null, n), ' productos cargados'),
      h('div', null, 'Última actualización: ', formatearFecha(info.fecha)),
      h('div', null, 'Archivo: ', info.archivo || '')
    );
  } else {
    $('#infoBase').textContent = 'Todavía no cargaste ninguna lista. Tocá el botón de abajo y elegí tu archivo.';
  }
  const conFoto = [...fichas.values()].filter(f => f.tieneFoto).length;
  const dest = [...fichas.values()].filter(f => f.destacado).length;
  $('#infoFichas').textContent = `${fichas.size} fichas · ${conFoto} con foto · ${dest} destacados`;
}

/* ---------- búsqueda ---------- */
function buscarCodigo(codigo) {
  codigo = Importar.limpiarCodigo(codigo);
  if (!codigo) return null;
  return porCodigo.get(codigo) || porCodigoSinCeros.get(sinCeros(codigo)) || null;
}

function buscar(q) {
  q = q.trim();
  limpiarResultados();
  if (!q) return;
  if (!productos.length) {
    mostrarAviso('Primero cargá la lista de precios en la pestaña ⚙️ Datos.');
    return;
  }
  const esCodigo = /^\d{3,}$/.test(q);
  if (esCodigo) {
    const p = buscarCodigo(q);
    if (p) { mostrarProducto(p); return; }
  }
  // búsqueda por nombre (o por parte del código)
  const terminos = Importar.normalizar(q).split(/\s+/).filter(Boolean);
  const encontrados = [];
  for (let i = 0; i < productos.length && encontrados.length < 60; i++) {
    const t = indiceNombres[i];
    if (terminos.every(x => t.includes(x))) encontrados.push(productos[i]);
  }
  if (encontrados.length === 1) { mostrarProducto(encontrados[0]); return; }
  if (!encontrados.length) { mostrarNoEncontrado(q); return; }
  mostrarLista($('#listaResultados'), encontrados, encontrados.length >= 60 ? 'Mostrando los primeros 60. Escribí más palabras para afinar.' : null);
}

function limpiarResultados() {
  liberarURLs();
  $('#resultado').innerHTML = '';
  $('#listaResultados').innerHTML = '';
}

function mostrarAviso(msg) {
  $('#resultado').append(h('div', { class: 'tarjeta' }, msg));
}

function mostrarNoEncontrado(q) {
  $('#resultado').append(h('div', { class: 'tarjeta no-encontrado' },
    h('div', { class: 'nombre' }, 'Producto no encontrado'),
    h('div', { class: 'codigo' }, q)
  ));
}

async function mostrarProducto(p) {
  limpiarResultados();
  const f = fichas.get(p.codigo);
  const tarjeta = h('div', { class: 'tarjeta' });
  const img = h('img', { class: 'foto oculto', alt: '' });
  tarjeta.append(img);
  if (f && f.destacado) tarjeta.append(h('div', { class: 'destacado' }, '★ Destacado'));
  tarjeta.append(
    h('div', { class: 'nombre' }, p.nombre || '(sin nombre)'),
    p.presentacion ? h('div', { class: 'presentacion' }, p.presentacion) : null,
    h('div', { class: 'precio' }, formatearPrecio(p)),
    h('div', { class: 'codigo' }, 'Código ', p.codigo)
  );
  if (f && f.descripcion) tarjeta.append(h('div', { class: 'descripcion' }, f.descripcion));
  if (f && f.caracteristicas) {
    const ul = h('ul', { class: 'caracteristicas' });
    f.caracteristicas.split('\n').map(l => l.trim()).filter(Boolean).forEach(linea => {
      const i = linea.indexOf(':');
      ul.append(i > 0
        ? h('li', null, h('b', null, linea.slice(0, i).trim()), h('span', null, linea.slice(i + 1).trim()))
        : h('li', null, h('span', null, linea)));
    });
    tarjeta.append(ul);
  }
  if (p.otros) {
    tarjeta.append(h('div', { class: 'otros' },
      Object.entries(p.otros).map(([k, v]) => h('div', null, k + ': ' + v))));
  }
  tarjeta.append(h('button', { class: 'btn btn-gris', type: 'button', onclick: () => abrirFicha(p.codigo) },
    f ? '✏️ Editar ficha' : '➕ Agregar foto / características'));
  $('#resultado').append(tarjeta);

  if (f && f.tieneFoto) {
    const url = await urlFoto(p.codigo);
    if (url) { img.src = url; img.classList.remove('oculto'); }
  }
}

function mostrarLista(ul, lista, nota) {
  ul.innerHTML = '';
  lista.forEach(item => {
    const p = item.producto || item;
    const codigo = item.codigo || p.codigo;
    const f = fichas.get(codigo);
    const mini = f && f.mini
      ? h('img', { class: 'mini', src: f.mini, alt: '' })
      : h('div', { class: 'mini vacia' }, '📦');
    ul.append(h('li', { onclick: () => { irA('consultar'); mostrarProducto(p.codigo ? p : { codigo, nombre: '(no está en la lista actual)', precio: null }); window.scrollTo(0, 0); } },
      mini,
      h('div', { class: 'txt' },
        h('div', { class: 'n' }, (f && f.destacado ? '★ ' : ''), p.nombre || '(no está en la lista actual)'),
        h('div', { class: 'c' }, codigo, p.presentacion ? ' · ' + p.presentacion : '')),
      h('div', { class: 'p' }, p.codigo ? formatearPrecio(p) : '')
    ));
  });
  if (nota) ul.append(h('div', { class: 'lista-msg' }, nota));
}

/* ---------- escáner ---------- */
let scanner = null;
let escaneando = false;
let pausado = false;
let audioCtx = null;

function beep() {
  try {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 1400; g.gain.value = 0.15;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.09);
  } catch (e) { /* sin sonido */ }
  if (navigator.vibrate) navigator.vibrate(60);
}

async function iniciarScanner() {
  if (!productos.length) { toast('Primero cargá la lista de precios (pestaña Datos)'); }
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) {}
  $('#scannerWrap').classList.remove('oculto');
  $('#btnEscanear').classList.add('oculto');
  $('#btnSiguiente').classList.add('oculto');
  if (escaneando) return;
  const F = Html5QrcodeSupportedFormats;
  scanner = scanner || new Html5Qrcode('reader', {
    verbose: false,
    formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  });
  try {
    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: 15,
        qrbox: (w, hgt) => ({ width: Math.floor(w * 0.85), height: Math.floor(Math.min(hgt * 0.6, w * 0.45)) }),
        aspectRatio: 1.333,
        disableFlip: true,
      },
      alLeer,
      () => {}
    );
    escaneando = true;
    pausado = false;
  } catch (err) {
    cerrarScanner();
    const msg = String(err && (err.message || err));
    if (/NotAllowed|Permission/i.test(msg)) toast('Permití el acceso a la cámara: Ajustes › Safari › Cámara', 5000);
    else if (location.protocol !== 'https:' && location.hostname !== 'localhost') toast('La cámara sólo funciona con https://', 5000);
    else toast('No se pudo abrir la cámara: ' + msg, 5000);
  }
}

function alLeer(texto) {
  if (pausado) return;
  pausado = true;
  try { scanner.pause(true); } catch (e) {}
  beep();
  $('#inputBuscar').value = texto;
  const p = buscarCodigo(texto);
  if (p) mostrarProducto(p);
  else { limpiarResultados(); mostrarNoEncontrado(texto); }
  $('#btnSiguiente').classList.remove('oculto');
  // llevar la tarjeta (con el precio) a la vista, debajo de la cámara
  requestAnimationFrame(() => {
    const t = $('#resultado .tarjeta');
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function siguiente() {
  if (!escaneando) return iniciarScanner();
  $('#btnSiguiente').classList.add('oculto');
  limpiarResultados();
  try { scanner.resume(); } catch (e) {}
  pausado = false;
  $('#scannerWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function cerrarScanner() {
  if (scanner && escaneando) {
    try { await scanner.stop(); } catch (e) {}
  }
  escaneando = false;
  pausado = false;
  $('#scannerWrap').classList.add('oculto');
  $('#btnEscanear').classList.remove('oculto');
}

/* ---------- navegación ---------- */
function irA(vista) {
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('activa', v.id === 'vista-' + vista));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('activa', t.dataset.vista === vista));
  if (vista !== 'consultar') cerrarScanner();
  if (vista === 'fichas') renderFichas();
}

function renderFichas() {
  const solo = $('#soloDestacados').checked;
  const lista = [...fichas.values()]
    .filter(f => !solo || f.destacado)
    .map(f => ({ codigo: f.codigo, producto: porCodigo.get(f.codigo) || { nombre: '' }, destacado: f.destacado }))
    .sort((a, b) => (b.destacado - a.destacado) || String(a.producto.nombre).localeCompare(b.producto.nombre, 'es'));
  const ul = $('#listaFichas');
  if (!lista.length) {
    ul.innerHTML = '';
    ul.append(h('div', { class: 'lista-msg' }, solo
      ? 'No hay productos destacados todavía.'
      : 'Todavía no agregaste fichas. Buscá un producto y tocá “Agregar foto / características”.'));
    return;
  }
  mostrarLista(ul, lista);
}

/* ---------- importar lista ---------- */
async function alElegirArchivo(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let filas;
  try {
    toast('Leyendo archivo…');
    filas = await Importar.leerArchivo(file);
  } catch (err) {
    toast('No se pudo leer el archivo: ' + err.message, 5000);
    return;
  }
  if (filas.length < 2) { toast('El archivo está vacío o no tiene filas', 4000); return; }

  const encabezado = filas[0].map(x => String(x).trim());
  const guess = Importar.adivinarColumnas(encabezado);
  const recordado = await DB.getMeta('columnas');
  // si el archivo tiene el mismo encabezado que la última vez, usar las columnas elegidas entonces
  const mapaInicial = recordado && JSON.stringify(recordado.encabezado) === JSON.stringify(encabezado) ? recordado.mapa : guess;

  const mapeo = $('#mapeo');
  mapeo.innerHTML = '';
  const selects = {};
  Importar.CAMPOS.forEach(c => {
    const sel = h('select', { 'data-campo': c.id },
      h('option', { value: '-1' }, '— ninguna —'),
      encabezado.map((col, i) => h('option', { value: i, selected: mapaInicial[c.id] === i }, col || `Columna ${i + 1}`)));
    selects[c.id] = sel;
    mapeo.append(h('label', null, h('span', null, c.etiqueta, c.obligatorio ? ' *' : ''), sel));
  });
  const prev = $('#preview');
  prev.innerHTML = '';
  prev.append(h('tr', null, encabezado.map(x => h('th', null, x))));
  filas.slice(1, 5).forEach(f => prev.append(h('tr', null, encabezado.map((_, i) => h('td', null, f[i] == null ? '' : String(f[i]))))));
  $('#dlgFilas').textContent = `El archivo tiene ${(filas.length - 1).toLocaleString('es-AR')} filas.`;

  const dlg = $('#dlgColumnas');
  dlg.returnValue = '';
  dlg.showModal();
  dlg.addEventListener('close', async () => {
    if (dlg.returnValue !== 'ok') return;
    const mapa = {};
    Object.entries(selects).forEach(([k, s]) => { mapa[k] = parseInt(s.value, 10); });
    const faltan = Importar.CAMPOS.filter(c => c.obligatorio && mapa[c.id] < 0);
    if (faltan.length) { toast('Falta elegir: ' + faltan.map(c => c.etiqueta).join(', '), 4000); return; }
    await guardarLista(filas, mapa, encabezado, file.name);
  }, { once: true });
}

async function guardarLista(filas, mapa, encabezado, nombreArchivo) {
  const { productos: lista, sinCodigo, repetidos } = Importar.construirProductos(filas, mapa);
  if (!lista.length) { toast('No se encontró ningún producto con código', 4000); return; }
  const prog = $('#progreso'), barra = $('#barra'), txt = $('#progresoTxt');
  prog.classList.remove('oculto');
  try {
    await DB.reemplazarProductos(lista, (n, total) => {
      barra.style.width = Math.round(n / total * 100) + '%';
      txt.textContent = `Guardando ${n.toLocaleString('es-AR')} de ${total.toLocaleString('es-AR')}`;
    });
    await DB.setMeta('importacion', { fecha: new Date().toISOString(), archivo: nombreArchivo, cantidad: lista.length });
    await DB.setMeta('columnas', { encabezado, mapa });
    indexarProductos(lista);
    await actualizarInfo();
    let msg = `✅ ${lista.length.toLocaleString('es-AR')} productos cargados`;
    if (sinCodigo) msg += ` · ${sinCodigo} filas sin código ignoradas`;
    if (repetidos) msg += ` · ${repetidos} códigos repetidos`;
    toast(msg, 5000);
  } catch (err) {
    toast('Error al guardar: ' + err.message, 6000);
  } finally {
    setTimeout(() => prog.classList.add('oculto'), 1500);
  }
}

/* ---------- fichas: foto + características ---------- */
let fichaActual = null;     // código
let fotoNueva = null;       // Blob pendiente de guardar
let quitarFoto = false;
let urlFotoDialogo = null;

function cargarImagen(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen no válida')); };
    img.src = url;
  });
}

function aBlob(canvas, calidad) {
  return new Promise(res => canvas.toBlob(res, 'image/jpeg', calidad));
}

async function redimensionar(img, max, calidad) {
  const esc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * esc);
  c.height = Math.round(img.naturalHeight * esc);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return aBlob(c, calidad);
}

function miniatura(img, lado = 120) {
  const c = document.createElement('canvas');
  c.width = c.height = lado;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lado, lado);
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, lado, lado);
  return c.toDataURL('image/jpeg', 0.7);
}

function mostrarFotoDialogo(url) {
  if (urlFotoDialogo) URL.revokeObjectURL(urlFotoDialogo);
  urlFotoDialogo = url;
  $('#fichaFoto').classList.toggle('oculto', !url);
  $('#fichaSinFoto').classList.toggle('oculto', !!url);
  $('#btnQuitarFoto').classList.toggle('oculto', !url);
  if (url) $('#fichaFoto').src = url; else $('#fichaFoto').removeAttribute('src');
}

async function abrirFicha(codigo) {
  await cerrarScanner();
  fichaActual = codigo;
  fotoNueva = null;
  quitarFoto = false;
  const p = porCodigo.get(codigo);
  const f = fichas.get(codigo) || {};
  $('#fichaTitulo').textContent = p ? p.nombre : 'Ficha';
  $('#fichaCodigo').textContent = 'Código ' + codigo + (p ? ' · ' + formatearPrecio(p) : '');
  $('#fichaDescripcion').value = f.descripcion || '';
  $('#fichaCaracteristicas').value = f.caracteristicas || '';
  $('#fichaDestacado').checked = !!f.destacado;
  $('#btnBorrarFicha').classList.toggle('oculto', !fichas.has(codigo));
  mostrarFotoDialogo(null);
  if (f.tieneFoto) {
    const reg = await DB.obtener('fotos', codigo);
    if (reg) mostrarFotoDialogo(URL.createObjectURL(new Blob([reg.datos], { type: reg.tipo })));
  }
  const dlg = $('#dlgFicha');
  dlg.returnValue = '';
  dlg.showModal();
}

async function alElegirFoto(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const img = await cargarImagen(file);
    fotoNueva = { blob: await redimensionar(img, 1200, 0.8), mini: miniatura(img) };
    quitarFoto = false;
    mostrarFotoDialogo(URL.createObjectURL(fotoNueva.blob));
  } catch (err) {
    toast('No se pudo usar esa imagen', 3000);
  }
}

async function guardarFicha() {
  const codigo = fichaActual;
  const anterior = fichas.get(codigo) || {};
  const ficha = {
    codigo,
    descripcion: $('#fichaDescripcion').value.trim(),
    caracteristicas: $('#fichaCaracteristicas').value.trim(),
    destacado: $('#fichaDestacado').checked,
    tieneFoto: quitarFoto ? false : (!!fotoNueva || !!anterior.tieneFoto),
    mini: quitarFoto ? null : (fotoNueva ? fotoNueva.mini : anterior.mini || null),
    actualizado: new Date().toISOString(),
  };
  try {
    if (fotoNueva) {
      await DB.guardar('fotos', { codigo, tipo: 'image/jpeg', datos: await fotoNueva.blob.arrayBuffer() });
    } else if (quitarFoto) {
      await DB.borrar('fotos', codigo);
    }
    const vacia = !ficha.descripcion && !ficha.caracteristicas && !ficha.destacado && !ficha.tieneFoto;
    if (vacia) {
      await DB.borrar('fichas', codigo);
      fichas.delete(codigo);
    } else {
      await DB.guardar('fichas', ficha);
      fichas.set(codigo, ficha);
    }
    toast('Ficha guardada');
  } catch (err) {
    toast('Error al guardar: ' + err.message, 5000);
  }
  refrescarTrasFicha(codigo);
}

async function borrarFicha() {
  if (!confirm('¿Borrar la foto y las características de este producto?')) return;
  const codigo = fichaActual;
  await DB.borrar('fotos', codigo);
  await DB.borrar('fichas', codigo);
  fichas.delete(codigo);
  $('#dlgFicha').close('borrada');
  toast('Ficha borrada');
  refrescarTrasFicha(codigo);
}

function refrescarTrasFicha(codigo) {
  actualizarInfo();
  if ($('#vista-fichas').classList.contains('activa')) renderFichas();
  else {
    const p = porCodigo.get(codigo);
    if (p) mostrarProducto(p);
  }
}

/* ---------- copia de seguridad ---------- */
function blobADataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function exportarFichas() {
  if (!fichas.size) { toast('No hay fichas para exportar'); return; }
  toast('Preparando copia…');
  const salida = [];
  for (const f of fichas.values()) {
    const item = { ...f };
    if (f.tieneFoto) {
      const reg = await DB.obtener('fotos', f.codigo);
      if (reg) item.foto = await blobADataURL(new Blob([reg.datos], { type: reg.tipo }));
    }
    salida.push(item);
  }
  const json = JSON.stringify({ app: 'verificador-precios', version: 1, fecha: new Date().toISOString(), fichas: salida });
  const nombre = 'fichas-' + new Date().toISOString().slice(0, 10) + '.json';
  const file = new File([json], nombre, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: nombre });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function importarFichas(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const datos = JSON.parse(await file.text());
    if (!datos || !Array.isArray(datos.fichas)) throw new Error('No es una copia de fichas');
    let n = 0;
    for (const item of datos.fichas) {
      if (!item.codigo) continue;
      const { foto, ...ficha } = item;
      if (foto) {
        const buf = await (await fetch(foto)).arrayBuffer();
        await DB.guardar('fotos', { codigo: ficha.codigo, tipo: 'image/jpeg', datos: buf });
        ficha.tieneFoto = true;
      }
      await DB.guardar('fichas', ficha);
      fichas.set(ficha.codigo, ficha);
      n++;
    }
    await actualizarInfo();
    toast(`✅ ${n} fichas importadas`, 4000);
  } catch (err) {
    toast('No se pudo importar: ' + err.message, 5000);
  }
}

/* ---------- inicio ---------- */
function conectarEventos() {
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => irA(t.dataset.vista)));
  $('#btnEscanear').addEventListener('click', iniciarScanner);
  $('#btnSiguiente').addEventListener('click', siguiente);
  $('#btnCerrarScanner').addEventListener('click', cerrarScanner);
  $('#formBuscar').addEventListener('submit', e => {
    e.preventDefault();
    $('#inputBuscar').blur();
    buscar($('#inputBuscar').value);
  });
  $('#inputArchivo').addEventListener('change', alElegirArchivo);
  $('#soloDestacados').addEventListener('change', renderFichas);
  $('#inputFotoCamara').addEventListener('change', alElegirFoto);
  $('#inputFotoGaleria').addEventListener('change', alElegirFoto);
  $('#btnQuitarFoto').addEventListener('click', () => { fotoNueva = null; quitarFoto = true; mostrarFotoDialogo(null); });
  $('#btnBorrarFicha').addEventListener('click', borrarFicha);
  $('#dlgFicha').addEventListener('close', () => {
    if ($('#dlgFicha').returnValue === 'guardar') guardarFicha();
    mostrarFotoDialogo(null);
  });
  $('#btnExportar').addEventListener('click', exportarFichas);
  $('#inputBackup').addEventListener('change', importarFichas);
  // apagar la cámara si la app pasa a segundo plano
  document.addEventListener('visibilitychange', () => { if (document.hidden) cerrarScanner(); });
}

async function iniciar() {
  $('#version').textContent = VERSION_APP;
  conectarEventos();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  try {
    await cargarTodo();
  } catch (err) {
    $('#estadoBase').textContent = 'Error';
    toast('No se pudo abrir la base de datos: ' + err.message, 6000);
  }
  if (!productos.length) irA('datos');
}

iniciar();
