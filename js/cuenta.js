/* Cuenta: sumar varios productos para decirle al cliente cuánto sale todo junto. */
const Cuenta = (() => {
  let items = [];   // [{ codigo, nombre, precio, precioTexto, cant }]

  const q = s => document.querySelector(s);

  async function cargar() {
    items = (await DB.getMeta('cuenta')) || [];
    actualizarContador();
  }

  async function guardar() {
    await DB.setMeta('cuenta', items);
    actualizarContador();
  }

  /** Datos actuales (si se cargó una lista nueva, toma el precio nuevo). */
  function datos(it) {
    const p = (typeof porCodigo !== 'undefined' && porCodigo.get(it.codigo)) || it;
    return { codigo: it.codigo, nombre: p.nombre, precio: p.precio, precioTexto: p.precioTexto, cant: it.cant };
  }

  function totales() {
    let total = 0, sinPrecio = 0, unidades = 0;
    items.forEach(it => {
      const d = datos(it);
      unidades += d.cant;
      if (d.precio == null) sinPrecio++;
      else total += d.precio * d.cant;
    });
    total = Math.round(total * 100) / 100;
    return { total, sinPrecio, unidades };
  }

  async function agregar(p) {
    const ya = items.find(it => it.codigo === p.codigo);
    if (ya) ya.cant++;
    else items.push({ codigo: p.codigo, nombre: p.nombre || '', precio: p.precio, precioTexto: p.precioTexto || '', cant: 1 });
    await guardar();
    const t = totales();
    toast(`➕ Sumado · ${t.unidades} producto${t.unidades === 1 ? '' : 's'} · Total ${formatearPrecio({ precio: t.total })}`, 2500);
  }

  async function cambiar(i, delta) {
    items[i].cant += delta;
    if (items[i].cant <= 0) items.splice(i, 1);
    await guardar();
    render();
  }

  async function vaciar() {
    if (!items.length) return;
    if (!confirm('¿Empezar una cuenta nueva? Se borran los productos sumados.')) return;
    items = [];
    await guardar();
    render();
  }

  function actualizarContador() {
    const b = q('#badgeCuenta');
    if (!b) return;
    const n = items.reduce((s, it) => s + it.cant, 0);
    b.textContent = n;
    b.classList.toggle('oculto', !n);
  }

  const pct = () => String(configPrecios.efectivo).replace('.', ',');

  function render() {
    const vista = q('#vista-cuenta');
    if (!vista || !vista.classList.contains('activa')) return;
    const t = totales();

    const caja = q('#totalCuenta');
    caja.innerHTML = '';
    caja.append(
      h('div', { class: 'precio-etiqueta' }, t.unidades ? `TOTAL · ${t.unidades} producto${t.unidades === 1 ? '' : 's'}` : 'TOTAL'),
      h('div', { class: 'precio' }, precioElegante({ precio: t.total })));
    if (t.unidades && configPrecios.efectivo > 0) {
      caja.append(h('div', { class: 'precio-extra' },
        h('div', { class: 'efectivo' }, '💵 Efectivo', precioElegante({ precio: precioEfectivo(t.total) }), h('small', null, `-${pct()}%`))));
    }
    if (t.sinPrecio) caja.append(h('div', { class: 'aviso-cuenta' }, `⚠️ ${t.sinPrecio} producto${t.sinPrecio === 1 ? '' : 's'} sin precio no se suma${t.sinPrecio === 1 ? '' : 'n'}`));

    q('#ayudaCuenta').classList.toggle('oculto', !!items.length);
    q('#btnCompartirCuenta').disabled = !items.length;
    q('#btnVaciarCuenta').disabled = !items.length;

    const ul = q('#listaCuenta');
    ul.innerHTML = '';
    items.forEach((it, i) => {
      const d = datos(it);
      const sub = d.precio == null ? (d.precioTexto || '—') : formatearPrecio({ precio: Math.round(d.precio * d.cant * 100) / 100 });
      ul.append(h('li', { class: 'item-cuenta' },
        h('div', { class: 'txt' },
          h('div', { class: 'n' }, d.nombre || '(sin nombre)'),
          h('div', { class: 'c' }, d.precio == null ? d.codigo : `${formatearPrecio(d)} c/u · ${d.codigo}`)),
        h('div', { class: 'cant' },
          h('button', { type: 'button', class: 'btn-cant', 'aria-label': 'Uno menos', onclick: () => cambiar(i, -1) }, '−'),
          h('span', null, String(d.cant)),
          h('button', { type: 'button', class: 'btn-cant', 'aria-label': 'Uno más', onclick: () => cambiar(i, 1) }, '+')),
        h('div', { class: 'p sub' }, sub)));
    });
  }

  function compartir() {
    if (!items.length) return;
    const t = totales();
    const lineas = ['🛍️ *Guille Deco Bazar*', ''];
    items.forEach(it => {
      const d = datos(it);
      const sub = d.precio == null ? (d.precioTexto || 'sin precio') : formatearPrecio({ precio: Math.round(d.precio * d.cant * 100) / 100 });
      lineas.push(`• ${d.cant} × ${d.nombre || d.codigo}: ${sub}`);
    });
    lineas.push('', `*Total: ${formatearPrecio({ precio: t.total })}*`);
    if (configPrecios.efectivo > 0) lineas.push(`💵 Efectivo: ${formatearPrecio({ precio: precioEfectivo(t.total) })} (${pct()}% off)`);
    const texto = lineas.join('\n');
    if (navigator.share) navigator.share({ text: texto }).catch(() => {});
    else window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
  }

  function conectar() {
    q('#btnCompartirCuenta').addEventListener('click', compartir);
    q('#btnVaciarCuenta').addEventListener('click', vaciar);
  }

  return { cargar, agregar, render, conectar };
})();
