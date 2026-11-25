/* Etiquetas de precio para imprimir en hoja A4.
 * Se van acumulando (botón "Agregar a la hoja") y cuando se completa la hoja se imprime.
 * Las hojas se dibujan en un canvas y se arma un PDF. El PDF se abre con el menú
 * Compartir del iPhone → "Imprimir" (AirPrint) o la app HP Smart.
 * (window.print() no funciona en las apps agregadas a la pantalla de inicio del iPhone.) */
const Etiquetas = (() => {
  const POR_HOJA = 18;              // 2 columnas × 9 filas
  const MM = 240 / 25.4;            // 240 dpi → píxeles por milímetro
  const A4 = { w: 210, h: 297 };
  const ET = { w: 75, h: 30 };      // etiqueta, en mm (7,5 × 3 cm)
  const SEP = { x: 3, y: 2 };
  const MARGEN = { x: (A4.w - 2 * ET.w - SEP.x) / 2, y: (A4.h - 9 * ET.h - 8 * SEP.y) / 2 };
  const FUENTE = 'Helvetica, Arial, sans-serif';

  let cola = [];                    // [{ codigo, nombre, precio, precioTexto }]
  let pdfListo = null;              // File con el PDF de la cola actual
  let generacion = 0;
  let logo = null;

  const q = s => document.querySelector(s);

  function el(tag, cls, texto) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  }

  async function cargar() {
    cola = (await DB.getMeta('etiquetas')) || [];
    actualizarContador();
  }

  async function guardar() {
    pdfListo = null;
    await DB.setMeta('etiquetas', cola);
    actualizarContador();
  }

  /** Datos actuales del producto (si se actualizó la lista, toma el precio nuevo). */
  function datos(item) {
    const p = (typeof porCodigo !== 'undefined' && porCodigo.get(item.codigo)) || item;
    return { codigo: item.codigo, nombre: p.nombre, precio: p.precio, precioTexto: p.precioTexto };
  }

  async function agregar(p) {
    cola.push({ codigo: p.codigo, nombre: p.nombre || '', precio: p.precio, precioTexto: p.precioTexto || '' });
    await guardar();
    const enHoja = cola.length % POR_HOJA || POR_HOJA;
    const hojas = Math.ceil(cola.length / POR_HOJA);
    if (enHoja === POR_HOJA) toast(`📄 ¡Hoja ${hojas > 1 ? hojas + ' ' : ''}completa! Andá a 🏷️ Etiquetas para imprimir`, 4000);
    else toast(`🏷️ Agregada · ${enHoja} de ${POR_HOJA} en la hoja${hojas > 1 ? ' ' + hojas : ''}`, 2000);
  }

  async function quitar(i) {
    cola.splice(i, 1);
    await guardar();
    render();
  }

  async function vaciar(preguntar = true) {
    if (!cola.length) return;
    if (preguntar && !confirm(`¿Sacar las ${cola.length} etiquetas de la hoja?`)) return;
    cola = [];
    await guardar();
    render();
  }

  function actualizarContador() {
    const b = q('#badgeEtiquetas');
    if (!b) return;
    b.textContent = cola.length;
    b.classList.toggle('oculto', !cola.length);
  }

  function textoPrecio(d) {
    if (d.precio == null) return d.precioTexto || '';
    return '$' + Number(d.precio).toFixed(2);
  }

  function fechaHoy() {
    return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function cargarLogo() {
    if (logo) return Promise.resolve(logo);
    return new Promise(res => {
      const img = new Image();
      img.onload = () => { logo = img; res(img); };
      img.onerror = () => res(null);
      img.src = 'icons/logo-etiqueta.png';
    });
  }

  /* ---------- dibujo (todo en milímetros) ---------- */
  const pt = n => n * 0.3528;       // puntos tipográficos → mm

  function partirLineas(ctx, texto, ancho) {
    const palabras = texto.split(/\s+/).filter(Boolean);
    const lineas = [];
    let actual = '';
    for (const w of palabras) {
      const prueba = actual ? actual + ' ' + w : w;
      if (ctx.measureText(prueba).width <= ancho || !actual) actual = prueba;
      else { lineas.push(actual); actual = w; }
    }
    if (actual) lineas.push(actual);
    return lineas;
  }

  function dibujarEtiqueta(ctx, x, y, item, fecha) {
    const d = datos(item);
    const W = ET.w, H = ET.h;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';

    // borde
    ctx.lineWidth = 0.3;
    ctx.strokeRect(0, 0, W, H);

    // nombre: hasta 2 líneas, achica la letra si no entra
    const nombre = String(d.nombre || '').toUpperCase();
    const anchoTexto = W - 5;
    let tam = 12, lineas;
    for (; tam >= 7; tam -= 0.5) {
      ctx.font = `${pt(tam)}px ${FUENTE}`;
      lineas = partirLineas(ctx, nombre, anchoTexto);
      if (lineas.length <= 2 && lineas.every(l => ctx.measureText(l).width <= anchoTexto)) break;
    }
    lineas = lineas.slice(0, 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const alto = pt(tam) * 1.1;
    lineas.forEach((l, i) => ctx.fillText(l, W / 2, 2 + i * alto, anchoTexto));
    const bajoNombre = 2 + lineas.length * alto;

    // X 1 y código
    const yFila = Math.max(bajoNombre + 0.8, 7);
    ctx.textAlign = 'center';
    ctx.font = `bold ${pt(11)}px ${FUENTE}`;
    ctx.fillText('X  1', W / 2, yFila);
    ctx.textAlign = 'right';
    ctx.font = `${pt(7.5)}px ${FUENTE}`;
    ctx.fillText(d.codigo, W - 2.5, yFila);

    // logo abajo a la izquierda
    const yZona = yFila + pt(11) + 1;          // donde empieza la zona de logo y precio
    const baseLinea = H - 2.8;
    let anchoLogo = 0;
    if (logo) {
      const altoMax = baseLinea - yZona;
      anchoLogo = Math.min(27, altoMax * logo.width / logo.height);
      const altoLogo = anchoLogo * logo.height / logo.width;
      ctx.drawImage(logo, 2.5, baseLinea - altoLogo, anchoLogo, altoLogo);
    }

    // precio grande a la derecha, achicado si se pisa con el logo
    const precio = textoPrecio(d);
    const anchoPrecio = W - 2.5 - (anchoLogo ? 2.5 + anchoLogo + 1.5 : 2.5);
    let tp = 27;
    ctx.font = `bold ${pt(tp)}px ${FUENTE}`;
    const medido = ctx.measureText(precio).width;
    if (medido > anchoPrecio) { tp = tp * anchoPrecio / medido; ctx.font = `bold ${pt(tp)}px ${FUENTE}`; }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(precio, W - 2.5, baseLinea);

    // fecha sobre la línea de abajo
    ctx.font = `${pt(6.5)}px ${FUENTE}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const anchoFecha = ctx.measureText(fecha).width;
    ctx.fillStyle = '#fff';
    ctx.fillRect(22, H - 1.4, anchoFecha + 3, 2.8);
    ctx.fillStyle = '#000';
    ctx.fillText(fecha, 23.5, H + 0.1);
    ctx.restore();
  }

  function dibujarHoja(items, fecha) {
    const c = document.createElement('canvas');
    c.width = Math.round(A4.w * MM);
    c.height = Math.round(A4.h * MM);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.scale(MM, MM);
    items.forEach((item, i) => {
      const col = i % 2, fila = Math.floor(i / 2);
      dibujarEtiqueta(ctx, MARGEN.x + col * (ET.w + SEP.x), MARGEN.y + fila * (ET.h + SEP.y), item, fecha);
    });
    return c;
  }

  /* ---------- PDF (una imagen JPEG por hoja) ---------- */
  function aJPEG(canvas) {
    return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('No se pudo armar la hoja')), 'image/jpeg', 0.92));
  }

  async function armarPDF(canvases) {
    const enc = new TextEncoder();
    const partes = [];
    const offsets = [];
    let largo = 0;
    const add = x => { const b = typeof x === 'string' ? enc.encode(x) : x; partes.push(b); largo += b.length; };
    const obj = (n, cuerpo) => { offsets[n] = largo; add(`${n} 0 obj\n`); cuerpo(); add('\nendobj\n'); };

    const W = 595.28, H = 841.89;     // A4 en puntos
    const n = canvases.length;
    // 1 catálogo, 2 páginas, luego por hoja: página, contenido, imagen
    const idPag = i => 3 + i * 3;
    add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, () => add('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => add(`<< /Type /Pages /Count ${n} /Kids [${canvases.map((_, i) => idPag(i) + ' 0 R').join(' ')}] >>`));
    for (let i = 0; i < n; i++) {
      const c = canvases[i];
      const jpg = new Uint8Array(await (await aJPEG(c)).arrayBuffer());
      const p = idPag(i);
      obj(p, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`));
      const contenido = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
      obj(p + 1, () => add(`<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`));
      obj(p + 2, () => {
        add(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
        add(jpg);
        add('\nendstream');
      });
    }
    const total = 3 + n * 3;
    const xref = largo;
    let tabla = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i++) tabla += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    add(tabla + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    const fecha = new Date().toISOString().slice(0, 10);
    return new File(partes, `etiquetas-${fecha}.pdf`, { type: 'application/pdf' });
  }

  /* ---------- pantalla ---------- */
  async function render() {
    const vista = q('#vista-etiquetas');
    if (!vista || !vista.classList.contains('activa')) return;
    const n = cola.length;
    const hojasN = Math.ceil(n / POR_HOJA);
    const resto = n % POR_HOJA;
    q('#estadoEtiquetas').textContent = !n
      ? `La hoja está vacía. Buscá o escaneá un producto y tocá “🏷️ Agregar a la hoja”. Entran ${POR_HOJA} etiquetas por hoja.`
      : resto === 0
        ? `✅ ${hojasN === 1 ? 'Hoja completa' : hojasN + ' hojas completas'} (${n} etiquetas). Lista para imprimir.`
        : `${n} etiqueta${n === 1 ? '' : 's'} · ${hojasN > 1 ? `hoja ${hojasN}: ` : ''}faltan ${POR_HOJA - resto} para completar la hoja.`;
    q('#btnVaciarEtiquetas').disabled = !n;

    const ul = q('#listaEtiquetas');
    ul.innerHTML = '';
    cola.forEach((item, i) => {
      const d = datos(item);
      const li = el('li');
      const txt = el('div', 'txt');
      txt.append(el('div', 'n', d.nombre || '(sin nombre)'), el('div', 'c', d.codigo));
      const btn = el('button', 'btn btn-gris quitar-et', '✕');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Quitar');
      btn.addEventListener('click', ev => { ev.stopPropagation(); quitar(i); });
      li.append(el('div', 'mini vacia', String(i + 1)), txt, el('div', 'p', textoPrecio(d)), btn);
      ul.append(li);
    });

    // dibujar hojas y dejar el PDF preparado (iOS exige compartir apenas se toca el botón)
    const mia = ++generacion;
    const btn = q('#btnImprimirEtiquetas');
    btn.disabled = true;
    btn.textContent = n ? '⏳ Preparando…' : '🖨️ Imprimir';
    pdfListo = null;
    await cargarLogo();
    const fecha = fechaHoy();
    const canvases = [];
    for (let i = 0; i < Math.max(n, 1); i += POR_HOJA) canvases.push(dibujarHoja(cola.slice(i, i + POR_HOJA), fecha));
    if (mia !== generacion) return;
    const prev = q('#previaHojas');
    prev.innerHTML = '';
    canvases.forEach(c => { c.className = 'hoja-previa'; prev.append(c); });
    if (!n) return;
    try {
      const pdf = await armarPDF(canvases);
      if (mia !== generacion) return;
      pdfListo = pdf;
      btn.textContent = '🖨️ Imprimir';
      btn.disabled = false;
    } catch (err) {
      btn.textContent = '🖨️ Imprimir';
      toast('No se pudo armar el PDF: ' + err.message, 5000);
    }
  }

  /* ---------- imprimir ---------- */
  function preguntarVaciar() {
    setTimeout(() => {
      if (confirm('¿Se imprimieron bien? Tocá Aceptar para vaciar la hoja y empezar una nueva.')) vaciar(false);
    }, 400);
  }

  /** Se llama directo desde el toque (sin esperas antes de compartir). */
  function imprimir() {
    if (!pdfListo) { toast('Esperá un segundo, se está preparando la hoja…'); return; }
    const pdf = pdfListo;
    try {
      if (navigator.canShare && navigator.canShare({ files: [pdf] })) {
        navigator.share({ files: [pdf] })
          .then(preguntarVaciar)
          .catch(e => { if (!e || e.name !== 'AbortError') abrirPDF(pdf); });
        return;
      }
    } catch (e) { /* sigue abajo */ }
    abrirPDF(pdf);
  }

  /** Sin "Compartir": abre el PDF (desde ahí se puede imprimir o compartir). */
  function abrirPDF(pdf) {
    const url = URL.createObjectURL(pdf);
    const a = el('a');
    a.href = url;
    a.download = pdf.name;
    a.target = '_blank';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    preguntarVaciar();
  }

  function conectar() {
    q('#btnImprimirEtiquetas').addEventListener('click', imprimir);
    q('#btnVaciarEtiquetas').addEventListener('click', () => vaciar(true));
  }

  return { POR_HOJA, cargar, agregar, render, conectar };
})();
