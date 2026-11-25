/* Presupuesto en PDF a partir de la cuenta de "Sumar".
 * La hoja A4 (blanco y negro, con el logo Guille Deco Bazar) se dibuja en un canvas y se arma un PDF,
 * igual que las etiquetas: window.print() no funciona en las apps agregadas a la pantalla de inicio
 * del iPhone, así que el PDF se abre con el menú Compartir → Imprimir / WhatsApp.
 * Usa funciones de app.js (h, toast, formatearPrecio, precioEfectivo, configPrecios, fichas, porCodigo). */
const Presupuesto = (() => {
  const MM = 240 / 25.4;                       // 240 dpi → píxeles por milímetro
  const A4 = { w: 210, h: 297 };
  const M = { x: 15, arriba: 14, abajo: 16 };  // márgenes en mm
  const ANCHO = A4.w - 2 * M.x;                // 180 mm útiles
  const SANS = 'Helvetica, Arial, sans-serif';
  const SERIF = 'Georgia, "Times New Roman", serif';
  const PT = 25.4 / 72;                        // 1 punto tipográfico en mm

  let opciones = { cliente: '', telefono: '', observaciones: '', mostrarEfectivo: true, mostrarCuit: false, numero: null };
  let local = { cuit: '', direccion: '', whatsapp: '', instagram: '' };
  let pdfListo = null;
  let numeroEnPdf = null;
  let generacion = 0;
  let logo = null;

  const q = s => document.querySelector(s);
  const plata = v => formatearPrecio({ precio: v });
  const pct = () => String(configPrecios.efectivo).replace('.', ',');
  const nro = n => 'Nº ' + String(n).padStart(4, '0');

  /* ---------- datos ---------- */
  function items() {
    return Cuenta.lista().map(d => {
      const f = fichas.get(d.codigo);
      const p = porCodigo.get(d.codigo);
      return { ...d, descripcion: (f && f.descripcion) || (p && p.presentacion) || '' };
    });
  }

  async function cargar() {
    const o = await DB.getMeta('presupuesto');
    if (o) opciones = { ...opciones, ...o };
    const l = await DB.getMeta('local');
    if (l) local = { ...local, ...l };
  }

  let timerGuardar = null;
  function guardarOpciones() {
    clearTimeout(timerGuardar);
    timerGuardar = setTimeout(() => { timerGuardar = null; DB.setMeta('presupuesto', opciones).catch(() => {}); }, 150);
    prepararLuego();
  }

  /* ---------- dibujo ---------- */
  function cargarLogo() {
    if (logo) return Promise.resolve(logo);
    return new Promise(res => {
      const img = new Image();
      img.onload = () => { logo = img; res(img); };
      img.onerror = () => res(null);
      img.src = 'icons/logo-guille-deco-negro.png';
    });
  }

  function nuevaHoja() {
    const c = document.createElement('canvas');
    c.width = Math.round(A4.w * MM);
    c.height = Math.round(A4.h * MM);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.scale(MM, MM);                         // a partir de acá todo en milímetros
    ctx.textBaseline = 'alphabetic';
    return { c, ctx };
  }

  const fuente = (ctx, pt, peso = 'normal', fam = SANS) => { ctx.font = `${peso} ${pt * PT}px ${fam}`; };

  /** Texto con espaciado entre letras (alineado a derecha o izquierda). */
  function espaciado(ctx, texto, x, y, sep, alinear = 'left') {
    const anchos = [...texto].map(ch => ctx.measureText(ch).width);
    const total = anchos.reduce((a, b) => a + b, 0) + sep * (anchos.length - 1);
    let cx = alinear === 'right' ? x - total : x;
    ctx.textAlign = 'left';
    [...texto].forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += anchos[i] + sep; });
  }

  /** Corta un texto en renglones que entren en `ancho` mm. */
  function renglones(ctx, texto, ancho) {
    const palabras = String(texto || '').split(/\s+/).filter(Boolean);
    const out = [];
    let linea = '';
    palabras.forEach(p => {
      const prueba = linea ? linea + ' ' + p : p;
      if (ctx.measureText(prueba).width <= ancho || !linea) linea = prueba;
      else { out.push(linea); linea = p; }
    });
    if (linea) out.push(linea);
    return out;
  }

  function linea(ctx, x1, y1, x2, y2, grosor, color) {
    ctx.strokeStyle = color; ctx.lineWidth = grosor;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function cajaRedondeada(ctx, x, y, w, hgt, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hgt, r); ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
    ctx.arcTo(x, y + hgt, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // columnas de la tabla (mm desde el margen izquierdo)
  const COL = { prod: 2.5, prodW: 50, desc: 56, descW: 50, cant: 117, unit: 150, sub: 177.5 };

  function encabezadoTabla(ctx, y) {
    fuente(ctx, 7.8, '600');
    ctx.fillStyle = '#666';
    const x0 = M.x;
    espaciado(ctx, 'PRODUCTO', x0 + COL.prod, y, 0.5);
    espaciado(ctx, 'DESCRIPCIÓN', x0 + COL.desc, y, 0.5);
    const cw = ctx.measureText('CANT.').width + 0.5 * 4;
    espaciado(ctx, 'CANT.', x0 + COL.cant - cw / 2, y, 0.5);
    espaciado(ctx, 'UNITARIO', x0 + COL.unit, y, 0.5, 'right');
    espaciado(ctx, 'SUBTOTAL', x0 + COL.sub, y, 0.5, 'right');
    linea(ctx, M.x, y + 2.5, M.x + ANCHO, y + 2.5, 0.42, '#111');
    return y + 2.5;
  }

  function dibujar(lista, numero) {
    const hojas = [];
    let { c, ctx } = nuevaHoja();
    hojas.push(c);
    const der = M.x + ANCHO;
    let y = M.arriba;

    // --- membrete ---
    let altoLogo = 0;
    if (logo) {
      const w = 78, hgt = w * logo.naturalHeight / logo.naturalWidth;
      ctx.drawImage(logo, M.x, y, w, hgt);
      altoLogo = hgt;
    }
    ctx.fillStyle = '#111';
    fuente(ctx, 22, 'normal', SERIF);
    espaciado(ctx, 'PRESUPUESTO', der, y + 9, 1.8, 'right');
    fuente(ctx, 11);
    ctx.fillStyle = '#555';
    espaciado(ctx, nro(numero), der, y + 16, 0.7, 'right');
    const filasDatos = [['Fecha', new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })]];
    if (opciones.mostrarCuit && local.cuit) filasDatos.push(['CUIT', local.cuit]);
    let yd = y + 24;
    filasDatos.forEach(([k, v]) => {
      fuente(ctx, 9.5, 'bold'); ctx.fillStyle = '#111'; ctx.textAlign = 'right'; ctx.fillText(v, der, yd);
      const wv = ctx.measureText(v).width;
      fuente(ctx, 9.5); ctx.fillStyle = '#666'; ctx.fillText(k, der - wv - 5, yd);
      yd += 5.2;
    });
    y = Math.max(y + altoLogo, yd - 3) + 5;
    linea(ctx, M.x, y, der, y, 0.42, '#111');
    y += 6;

    // --- cliente ---
    if (opciones.cliente.trim() || opciones.telefono.trim()) {
      ctx.strokeStyle = '#bbb'; ctx.lineWidth = 0.28;
      cajaRedondeada(ctx, M.x, y, ANCHO, 11, 3); ctx.stroke();
      let x = M.x + 5;
      ctx.textAlign = 'left';
      [['Cliente:', opciones.cliente.trim()], ['Teléfono:', opciones.telefono.trim()]].forEach(([k, v]) => {
        if (!v) return;
        fuente(ctx, 10); ctx.fillStyle = '#666'; ctx.fillText(k, x, y + 7.2);
        x += ctx.measureText(k).width + 2;
        fuente(ctx, 10, 'bold'); ctx.fillStyle = '#111'; ctx.fillText(v, x, y + 7.2);
        x += ctx.measureText(v).width + 10;
      });
      y += 17;
    } else y += 2;

    // --- tabla ---
    y = encabezadoTabla(ctx, y + 3);
    const LIMITE = A4.h - M.abajo;
    lista.forEach(it => {
      fuente(ctx, 9.5, 'bold');
      const rp = renglones(ctx, it.nombre || '(sin nombre)', COL.prodW);
      fuente(ctx, 8.8);
      const rd = renglones(ctx, it.descripcion, COL.descW);
      const alto = Math.max(rp.length * 4.3 + 3.6, rd.length * 4 + 1) + 6;
      if (y + alto > LIMITE) {
        ({ c, ctx } = nuevaHoja()); hojas.push(c);
        y = encabezadoTabla(ctx, M.arriba + 4);
      }
      let ty = y + 6;
      ctx.textAlign = 'left';
      fuente(ctx, 9.5, 'bold'); ctx.fillStyle = '#111';
      rp.forEach((l, i) => ctx.fillText(l, M.x + COL.prod, ty + i * 4.3));
      fuente(ctx, 7.5); ctx.fillStyle = '#888';
      ctx.fillText(it.codigo, M.x + COL.prod, ty + rp.length * 4.3 - 0.6);
      fuente(ctx, 8.8); ctx.fillStyle = '#444';
      rd.forEach((l, i) => ctx.fillText(l, M.x + COL.desc, ty + i * 4));
      fuente(ctx, 9.5); ctx.fillStyle = '#111';
      ctx.textAlign = 'center'; ctx.fillText(String(it.cant), M.x + COL.cant, ty);
      ctx.textAlign = 'right';
      ctx.fillText(it.precio == null ? (it.precioTexto || '—') : plata(it.precio), M.x + COL.unit, ty);
      fuente(ctx, 9.5, 'bold');
      ctx.fillText(it.precio == null ? '—' : plata(Math.round(it.precio * it.cant * 100) / 100), M.x + COL.sub, ty);
      y += alto;
      linea(ctx, M.x, y, der, y, 0.2, '#ccc');
    });

    // --- totales ---
    const t = Cuenta.totales();
    const conEfectivo = opciones.mostrarEfectivo && configPrecios.efectivo > 0;
    const altoTot = 30 + (conEfectivo ? 12 : 0) + (t.sinPrecio ? 6 : 0);
    if (y + 6 + altoTot > LIMITE) { ({ c, ctx } = nuevaHoja()); hojas.push(c); y = M.arriba; }
    const tx = der - 82;
    y += 9;
    ctx.textAlign = 'left'; fuente(ctx, 10); ctx.fillStyle = '#111';
    ctx.fillText('Cantidad de artículos', tx + 2.5, y);
    ctx.textAlign = 'right'; ctx.fillText(String(t.unidades), der - 2.5, y);
    y += 3.5;
    linea(ctx, tx, y, der, y, 0.42, '#111');
    y += 9;
    fuente(ctx, 15, 'bold');
    ctx.textAlign = 'left'; ctx.fillText('TOTAL', tx + 2.5, y);
    ctx.textAlign = 'right'; ctx.fillText(plata(t.total), der - 2.5, y);
    y += 4;
    if (conEfectivo) {
      y += 2;
      ctx.fillStyle = '#eee'; cajaRedondeada(ctx, tx, y, 82, 10, 2); ctx.fill();
      ctx.fillStyle = '#111'; fuente(ctx, 12, 'bold'); ctx.textAlign = 'left';
      ctx.fillText('En efectivo', tx + 2.5, y + 6.8);
      const we = ctx.measureText('En efectivo ').width;
      fuente(ctx, 8.5); ctx.fillStyle = '#666'; ctx.fillText(`(${pct()}% off)`, tx + 2.5 + we, y + 6.8);
      fuente(ctx, 12, 'bold'); ctx.fillStyle = '#111'; ctx.textAlign = 'right';
      ctx.fillText(plata(precioEfectivo(t.total)), der - 2.5, y + 6.8);
      y += 10;
    }
    if (t.sinPrecio) {
      y += 5; fuente(ctx, 8); ctx.fillStyle = '#666'; ctx.textAlign = 'right';
      ctx.fillText(`${t.sinPrecio} producto${t.sinPrecio === 1 ? '' : 's'} sin precio no ${t.sinPrecio === 1 ? 'está sumado' : 'están sumados'} al total`, der, y);
    }

    // --- observaciones ---
    const obs = opciones.observaciones.trim();
    if (obs) {
      fuente(ctx, 9);
      const ro = renglones(ctx, 'Observaciones: ' + obs.replace(/\s*\n\s*/g, ' '), ANCHO);
      if (y + 10 + ro.length * 4.5 > LIMITE) { ({ c, ctx } = nuevaHoja()); hojas.push(c); y = M.arriba; }
      y += 12;
      ctx.textAlign = 'left';
      ro.forEach((l, i) => {
        if (i === 0) {
          fuente(ctx, 9, 'bold'); ctx.fillStyle = '#111'; ctx.fillText('Observaciones:', M.x, y);
          const w = ctx.measureText('Observaciones: ').width;
          fuente(ctx, 9); ctx.fillStyle = '#444'; ctx.fillText(l.slice('Observaciones: '.length), M.x + w, y);
        } else { fuente(ctx, 9); ctx.fillStyle = '#444'; ctx.fillText(l, M.x, y); }
        y += 4.5;
      });
    }

    // --- pie con los datos del local (al final de la última hoja) ---
    const pie = [local.direccion, local.whatsapp, local.instagram].map(x => (x || '').trim()).filter(Boolean).join('   ·   ');
    if (pie) {
      if (y + 14 > LIMITE) { ({ c, ctx } = nuevaHoja()); hojas.push(c); }
      const yp = A4.h - 12;
      linea(ctx, M.x, yp - 5, der, yp - 5, 0.2, '#ccc');
      fuente(ctx, 8.5); ctx.fillStyle = '#555'; ctx.textAlign = 'left';
      ctx.fillText(pie, M.x, yp);
    }
    return hojas;
  }

  /* ---------- PDF (una imagen JPEG por hoja) ---------- */
  function aJPEG(canvas) {
    return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('No se pudo armar la hoja'))), 'image/jpeg', 0.92));
  }

  async function armarPDF(canvases, nombre) {
    const enc = new TextEncoder();
    const partes = [];
    const offsets = [];
    let largo = 0;
    const add = x => { const b = typeof x === 'string' ? enc.encode(x) : x; partes.push(b); largo += b.length; };
    const obj = (n, cuerpo) => { offsets[n] = largo; add(`${n} 0 obj\n`); cuerpo(); add('\nendobj\n'); };
    const W = 595.28, H = 841.89;
    const n = canvases.length;
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
    return new File(partes, nombre, { type: 'application/pdf' });
  }

  /* ---------- preparar (el PDF tiene que estar listo antes de tocar el botón) ---------- */
  let timerPreparar = null;
  function prepararLuego() {
    clearTimeout(timerPreparar);
    timerPreparar = setTimeout(preparar, 350);
  }

  async function preparar() {
    const vista = q('#vista-cuenta');
    if (!vista || !vista.classList.contains('activa')) return;
    const lista = items();
    const btn = q('#btnPresupuesto');
    q('#bloquePresupuesto').classList.toggle('oculto', !lista.length);
    if (!lista.length) return;
    const mia = ++generacion;
    pdfListo = null;
    btn.disabled = true;
    btn.textContent = '⏳ Preparando…';
    await cargarLogo();
    const numero = opciones.numero || ((await DB.getMeta('presupuestoUltimoNumero')) || 0) + 1;
    const hojas = dibujar(lista, numero);
    if (mia !== generacion) return;
    const prev = q('#previaPresupuesto');
    prev.innerHTML = '';
    hojas.forEach(c => { c.className = 'hoja-previa'; prev.append(c); });
    try {
      const pdf = await armarPDF(hojas, `Presupuesto ${String(numero).padStart(4, '0')} - Guille Deco Bazar.pdf`);
      if (mia !== generacion) return;
      pdfListo = pdf;
      numeroEnPdf = numero;
      btn.disabled = false;
      btn.textContent = `🧾 Presupuesto en PDF (${nro(numero)})`;
    } catch (err) {
      btn.textContent = '🧾 Presupuesto en PDF';
      toast('No se pudo armar el PDF: ' + err.message, 5000);
    }
  }

  /** Se llama directo desde el toque (iOS exige compartir sin esperas). */
  function compartir() {
    if (!pdfListo) { toast('Esperá un segundo, se está preparando el presupuesto…'); return; }
    const pdf = pdfListo;
    // el número queda usado: el próximo presupuesto lleva el siguiente
    if (!opciones.numero) {
      opciones.numero = numeroEnPdf;
      DB.setMeta('presupuestoUltimoNumero', numeroEnPdf).catch(() => {});
      DB.setMeta('presupuesto', opciones).catch(() => {});
    }
    try {
      if (navigator.canShare && navigator.canShare({ files: [pdf] })) {
        navigator.share({ files: [pdf] }).catch(e => { if (!e || e.name !== 'AbortError') abrirPDF(pdf); });
        return;
      }
    } catch (e) { /* sigue abajo */ }
    abrirPDF(pdf);
  }

  function abrirPDF(pdf) {
    const url = URL.createObjectURL(pdf);
    const a = document.createElement('a');
    a.href = url; a.download = pdf.name; a.target = '_blank';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  /* ---------- pantalla ---------- */
  function render() {
    q('#presuCliente').value = opciones.cliente;
    q('#presuTelefono').value = opciones.telefono;
    q('#presuObs').value = opciones.observaciones;
    q('#presuEfectivo').checked = opciones.mostrarEfectivo;
    q('#presuEfectivoTxt').textContent = `Mostrar precio en efectivo (${pct()}% off)`;
    q('#presuCuit').disabled = !local.cuit;
    q('#presuCuit').checked = !!(opciones.mostrarCuit && local.cuit);
    q('#presuCuitTxt').textContent = local.cuit ? `Mostrar CUIT (${local.cuit})` : 'Mostrar CUIT (cargalo en ⚙️ Datos → Datos del local)';
    preparar();
  }

  /** Cuenta nueva → presupuesto nuevo (con el número siguiente). */
  function reiniciar() {
    opciones = { ...opciones, cliente: '', telefono: '', observaciones: '', numero: null };
    DB.setMeta('presupuesto', opciones).catch(() => {});
    const vista = q('#vista-cuenta');
    if (vista && vista.classList.contains('activa')) render();
  }

  function renderLocal() {
    q('#cfgCuit').value = local.cuit;
    q('#cfgDireccion').value = local.direccion;
    q('#cfgWhatsapp').value = local.whatsapp;
    q('#cfgInstagram').value = local.instagram;
  }

  async function guardarLocal() {
    local = {
      cuit: q('#cfgCuit').value.trim(),
      direccion: q('#cfgDireccion').value.trim(),
      whatsapp: q('#cfgWhatsapp').value.trim(),
      instagram: q('#cfgInstagram').value.trim(),
    };
    await DB.setMeta('local', local);
    toast('Guardado ✓', 1200);
  }

  function conectar() {
    renderLocal();
    const enlazar = (id, campo, ev) => q(id).addEventListener(ev, () => {
      opciones[campo] = q(id).type === 'checkbox' ? q(id).checked : q(id).value;
      guardarOpciones();
    });
    enlazar('#presuCliente', 'cliente', 'input');
    enlazar('#presuTelefono', 'telefono', 'input');
    enlazar('#presuObs', 'observaciones', 'input');
    enlazar('#presuEfectivo', 'mostrarEfectivo', 'change');
    enlazar('#presuCuit', 'mostrarCuit', 'change');
    q('#btnPresupuesto').addEventListener('click', compartir);
    ['#cfgCuit', '#cfgDireccion', '#cfgWhatsapp', '#cfgInstagram'].forEach(id => q(id).addEventListener('change', guardarLocal));
    document.addEventListener('cuenta-cambio', prepararLuego);
    document.addEventListener('cuenta-vaciada', reiniciar);
    // si la app se cierra, guardar ya lo pendiente
    const alSalir = () => { if (timerGuardar) { clearTimeout(timerGuardar); timerGuardar = null; DB.setMeta('presupuesto', opciones).catch(() => {}); } };
    document.addEventListener('visibilitychange', () => { if (document.hidden) alSalir(); });
    window.addEventListener('pagehide', alSalir);
  }

  return { cargar, conectar, render };
})();
