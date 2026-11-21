/* Etiquetas de precio para imprimir en hoja A4.
 * Se van acumulando (botón "Agregar a la hoja") y cuando se completa la hoja se imprime.
 * Imprime con el diálogo del sistema: en el iPhone sirve para impresoras AirPrint
 * o para "Guardar en Archivos" como PDF y mandarlo a la app de la impresora. */
const Etiquetas = (() => {
  const POR_HOJA = 14;            // 2 columnas × 7 filas, cada etiqueta 96 × 38 mm
  let cola = [];                  // [{ codigo, nombre, precio, precioTexto, presentacion }]

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

  /* ---------- armado de la etiqueta (igual a la de la góndola) ---------- */
  function textoPrecio(d) {
    if (d.precio == null) return d.precioTexto || '';
    return '$' + Number(d.precio).toFixed(2);
  }

  function fechaHoy() {
    return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function etiqueta(item, fecha) {
    const d = datos(item);
    const e = el('div', 'et');
    const nombre = String(d.nombre || '').toUpperCase();
    const n = el('div', 'et-nombre', nombre);
    if (nombre.length > 44) n.classList.add('muy-largo');
    else if (nombre.length > 26) n.classList.add('largo');
    const fila = el('div', 'et-fila');
    fila.append(el('div', 'et-cant', 'X  1'), el('div', 'et-codigo', d.codigo));
    const precio = textoPrecio(d);
    const pr = el('div', 'et-precio', precio);
    if (precio.length > 10) pr.classList.add('largo');
    e.append(n, fila, pr, el('div', 'et-fecha', fecha));
    return e;
  }

  function hojas() {
    const fecha = fechaHoy();
    const paginas = [];
    for (let i = 0; i < Math.max(cola.length, 1); i += POR_HOJA) {
      const hoja = el('div', 'hoja-a4');
      cola.slice(i, i + POR_HOJA).forEach(item => hoja.append(etiqueta(item, fecha)));
      paginas.push(hoja);
    }
    return paginas;
  }

  /* ---------- pantalla ---------- */
  function ajustarVistaPrevia() {
    const cont = q('#previaHojas');
    if (!cont) return;
    const ancho = cont.clientWidth;
    cont.querySelectorAll('.hoja-escala').forEach(w => {
      const hoja = w.firstChild;
      const esc = ancho / hoja.offsetWidth;
      hoja.style.transform = `scale(${esc})`;
      w.style.height = hoja.offsetHeight * esc + 'px';
    });
  }

  function render() {
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
    q('#btnImprimirEtiquetas').disabled = !n;
    q('#btnVaciarEtiquetas').disabled = !n;

    const prev = q('#previaHojas');
    prev.innerHTML = '';
    hojas().forEach(hoja => {
      const w = el('div', 'hoja-escala');
      w.append(hoja);
      prev.append(w);
    });
    requestAnimationFrame(ajustarVistaPrevia);

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
  }

  /* ---------- imprimir ---------- */
  function imprimir() {
    if (!cola.length) return;
    const zona = q('#zonaImpresion');
    zona.innerHTML = '';
    hojas().forEach(h => zona.append(h));
    document.body.classList.add('imprimiendo');
    const despues = () => {
      window.removeEventListener('afterprint', despues);
      document.body.classList.remove('imprimiendo');
      zona.innerHTML = '';
      setTimeout(() => {
        if (confirm('¿Se imprimieron bien? Tocá Aceptar para vaciar la hoja y empezar una nueva.')) vaciar(false);
      }, 300);
    };
    window.addEventListener('afterprint', despues);
    // pequeño respiro para que se dibuje la hoja antes de abrir el diálogo
    setTimeout(() => {
      try { window.print(); } catch (e) { toast('Este navegador no permite imprimir', 4000); despues(); }
    }, 50);
  }

  function conectar() {
    q('#btnImprimirEtiquetas').addEventListener('click', imprimir);
    q('#btnVaciarEtiquetas').addEventListener('click', () => vaciar(true));
    window.addEventListener('resize', ajustarVistaPrevia);
  }

  return { POR_HOJA, cargar, agregar, render, conectar };
})();
