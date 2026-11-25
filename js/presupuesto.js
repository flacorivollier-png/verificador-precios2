/* Presupuesto: se arma escaneando / buscando productos y se imprime (o guarda en PDF).
 * Queda guardado en el teléfono hasta que se empieza uno nuevo.
 * Usa funciones de app.js (h, $, toast, formatearPrecio, precioEfectivo, configPrecios…),
 * que existen cuando se llama a cualquiera de estas funciones. */
const Presupuesto = (() => {
  let estado = nuevoEstado();
  let local = { cuit: '', direccion: '', whatsapp: '', instagram: '' };

  function nuevoEstado() {
    return { numero: null, items: [], cliente: '', telefono: '', observaciones: '', mostrarEfectivo: true, mostrarCuit: false };
  }

  const redondear = v => Math.round(v * 100) / 100;
  const subtotal = it => redondear((it.unitario || 0) * it.cantidad);
  const total = () => redondear(estado.items.reduce((s, it) => s + subtotal(it), 0));
  const articulos = () => estado.items.reduce((s, it) => s + it.cantidad, 0);
  const plata = v => formatearPrecio({ precio: v });
  const num = v => (v == null ? '' : v.toLocaleString('es-AR', { maximumFractionDigits: 2 }));

  let guardarTimer = null;
  function guardarYa() {
    clearTimeout(guardarTimer);
    guardarTimer = null;
    return DB.setMeta('presupuesto', estado).catch(() => {});
  }
  function guardar() {
    clearTimeout(guardarTimer);
    guardarTimer = setTimeout(guardarYa, 150);
    actualizarContador();
  }

  /* ---------- agregar desde la tarjeta del producto ---------- */
  function agregar(p) {
    const existente = estado.items.find(it => it.codigo === p.codigo);
    if (existente) existente.cantidad++;
    else {
      const f = fichas.get(p.codigo);
      estado.items.push({
        codigo: p.codigo,
        nombre: p.nombre || '',
        descripcion: (f && f.descripcion) || p.presentacion || '',
        cantidad: 1,
        unitario: p.precio != null ? p.precio : 0,
      });
    }
    guardar();
    const n = articulos();
    toast(`🧾 Agregado al presupuesto · ${n} ${n === 1 ? 'artículo' : 'artículos'} · ${plata(total())}`, 2500);
  }

  function actualizarContador() {
    const b = $('#presuBadge');
    const n = articulos();
    b.textContent = n;
    b.classList.toggle('oculto', !n);
  }

  /* ---------- pantalla ---------- */
  function render() {
    $('#presuCliente').value = estado.cliente;
    $('#presuTelefono').value = estado.telefono;
    $('#presuObs').value = estado.observaciones;
    $('#presuEfectivo').checked = estado.mostrarEfectivo;
    $('#presuEfectivoTxt').textContent = `Mostrar precio en efectivo (${String(configPrecios.efectivo).replace('.', ',')}% off)`;
    $('#presuCuit').checked = estado.mostrarCuit && !!local.cuit;
    $('#presuCuit').disabled = !local.cuit;
    $('#presuCuitTxt').textContent = local.cuit ? `Mostrar CUIT (${local.cuit})` : 'Mostrar CUIT (cargalo en ⚙️ Datos → Datos del local)';
    $('#presuNumero').textContent = estado.numero ? 'Nº ' + String(estado.numero).padStart(4, '0') : '';
    renderItems();
  }

  function renderItems() {
    const ul = $('#presuItems');
    ul.innerHTML = '';
    $('#presuVacio').classList.toggle('oculto', estado.items.length > 0);
    $('#presuConItems').classList.toggle('oculto', estado.items.length === 0);
    estado.items.forEach((it, i) => {
      const sub = h('b', { class: 'pi-sub' }, plata(subtotal(it)));
      const cant = h('span', { class: 'pi-cant' }, it.cantidad);
      const refrescar = () => { cant.textContent = it.cantidad; sub.textContent = plata(subtotal(it)); renderTotales(); guardar(); };
      const unit = h('input', { class: 'pi-unit', inputmode: 'decimal', value: num(it.unitario), 'aria-label': 'Precio unitario' });
      unit.addEventListener('change', () => {
        const v = Importar.parsearPrecio(unit.value);
        it.unitario = v != null ? v : 0;
        unit.value = num(it.unitario);
        refrescar();
      });
      const desc = h('input', { class: 'pi-desc', value: it.descripcion, placeholder: 'Descripción (opcional)' });
      desc.addEventListener('input', () => { it.descripcion = desc.value; guardar(); });
      ul.append(h('li', { class: 'presu-item' },
        h('div', { class: 'pi-top' },
          h('div', { class: 'pi-nom' }, it.nombre, h('div', { class: 'pi-cod' }, it.codigo)),
          h('button', { class: 'pi-x', type: 'button', 'aria-label': 'Quitar', onclick: () => { estado.items.splice(i, 1); guardar(); renderItems(); } }, '✕')),
        desc,
        h('div', { class: 'pi-bottom' },
          h('div', { class: 'qty' },
            h('button', { type: 'button', 'aria-label': 'Menos', onclick: () => { if (it.cantidad > 1) { it.cantidad--; refrescar(); } } }, '−'),
            cant,
            h('button', { type: 'button', 'aria-label': 'Más', onclick: () => { it.cantidad++; refrescar(); } }, '+')),
          h('span', { class: 'pi-por' }, '× $'), unit, sub)));
    });
    renderTotales();
  }

  function renderTotales() {
    const box = $('#presuTotales');
    box.innerHTML = '';
    const n = articulos();
    box.append(
      h('div', { class: 'fila' }, h('span', null, 'Artículos'), h('span', null, n)),
      h('div', { class: 'fila total' }, h('span', null, 'TOTAL'), h('span', null, plata(total()))));
    if (estado.mostrarEfectivo && configPrecios.efectivo > 0) {
      box.append(h('div', { class: 'fila efectivo' },
        h('span', null, `En efectivo (${String(configPrecios.efectivo).replace('.', ',')}% off)`),
        h('span', null, plata(precioEfectivo(total())))));
    }
  }

  /* ---------- hoja para imprimir ---------- */
  function armarHoja() {
    const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const datos = h('dl', null, h('dt', null, 'Fecha'), h('dd', null, hoy));
    if (estado.mostrarCuit && local.cuit) datos.append(h('dt', null, 'CUIT'), h('dd', null, local.cuit));
    const hoja = $('#hoja');
    hoja.innerHTML = '';
    hoja.append(h('header', { class: 'h-cab' },
      h('img', { src: 'icons/logo-guille-deco-negro.png', alt: 'Guille Deco Bazar', class: 'h-logo' }),
      h('div', { class: 'h-doc' },
        h('h1', null, 'PRESUPUESTO'),
        h('div', { class: 'h-num' }, 'Nº ' + String(estado.numero).padStart(4, '0')),
        datos)));
    if (estado.cliente || estado.telefono) {
      hoja.append(h('div', { class: 'h-cliente' },
        estado.cliente ? h('div', null, h('span', null, 'Cliente:'), h('b', null, estado.cliente)) : null,
        estado.telefono ? h('div', null, h('span', null, 'Teléfono:'), h('b', null, estado.telefono)) : null));
    }
    const tbody = h('tbody');
    estado.items.forEach(it => tbody.append(h('tr', null,
      h('td', null, h('div', { class: 'h-nom' }, it.nombre), h('div', { class: 'h-cod' }, it.codigo)),
      h('td', { class: 'h-desc' }, it.descripcion),
      h('td', { class: 'c' }, it.cantidad),
      h('td', { class: 'n' }, plata(it.unitario)),
      h('td', { class: 'n h-sub' }, plata(subtotal(it))))));
    hoja.append(h('table', { class: 'h-tabla' },
      h('thead', null, h('tr', null,
        h('th', { style: 'width:30%' }, 'Producto'), h('th', null, 'Descripción'),
        h('th', { class: 'c', style: 'width:9%' }, 'Cant.'), h('th', { class: 'n', style: 'width:15%' }, 'Unitario'),
        h('th', { class: 'n', style: 'width:16%' }, 'Subtotal'))),
      tbody));
    const tot = h('div', { class: 'h-totales' },
      h('div', { class: 'h-fila' }, h('span', null, 'Cantidad de artículos'), h('span', null, articulos())),
      h('div', { class: 'h-fila h-total' }, h('span', null, 'TOTAL'), h('span', null, plata(total()))));
    if (estado.mostrarEfectivo && configPrecios.efectivo > 0) {
      tot.append(h('div', { class: 'h-fila h-efectivo' },
        h('span', null, 'En efectivo ', h('small', null, `(${String(configPrecios.efectivo).replace('.', ',')}% off)`)),
        h('span', null, plata(precioEfectivo(total())))));
    }
    hoja.append(tot);
    if (estado.observaciones.trim()) {
      hoja.append(h('div', { class: 'h-notas' }, h('b', null, 'Observaciones: '), estado.observaciones.trim()));
    }
    const pie = [local.direccion, local.whatsapp, local.instagram].map(x => (x || '').trim()).filter(Boolean);
    if (pie.length) hoja.append(h('footer', { class: 'h-pie' }, pie.join('  ·  ')));
  }

  async function imprimir() {
    if (!estado.items.length) { toast('Agregá productos al presupuesto primero'); return; }
    if (!estado.numero) {
      const ultimo = (await DB.getMeta('presupuestoUltimoNumero')) || 0;
      estado.numero = ultimo + 1;
      await DB.setMeta('presupuestoUltimoNumero', estado.numero);
      await DB.setMeta('presupuesto', estado);
      $('#presuNumero').textContent = 'Nº ' + String(estado.numero).padStart(4, '0');
    }
    armarHoja();
    const img = $('#hoja .h-logo');
    if (img && !img.complete) await new Promise(r => { img.onload = img.onerror = r; });
    document.title = `Presupuesto ${String(estado.numero).padStart(4, '0')} - Guille Deco Bazar`;
    window.print();
    setTimeout(() => { document.title = 'Verificador de precios'; }, 1000);
  }

  function nuevo() {
    if (estado.items.length && !confirm('¿Empezar un presupuesto nuevo? Se borra el actual.')) return;
    estado = nuevoEstado();
    guardar();
    render();
  }

  /* ---------- datos del local ---------- */
  function renderLocal() {
    $('#cfgCuit').value = local.cuit;
    $('#cfgDireccion').value = local.direccion;
    $('#cfgWhatsapp').value = local.whatsapp;
    $('#cfgInstagram').value = local.instagram;
  }

  async function guardarLocal() {
    local = {
      cuit: $('#cfgCuit').value.trim(),
      direccion: $('#cfgDireccion').value.trim(),
      whatsapp: $('#cfgWhatsapp').value.trim(),
      instagram: $('#cfgInstagram').value.trim(),
    };
    await DB.setMeta('local', local);
    toast('Guardado ✓', 1200);
  }

  async function iniciar() {
    const guardado = await DB.getMeta('presupuesto');
    if (guardado && Array.isArray(guardado.items)) estado = { ...nuevoEstado(), ...guardado };
    const l = await DB.getMeta('local');
    if (l) local = { ...local, ...l };
    renderLocal();
    actualizarContador();
    const enlazar = (id, campo, ev = 'input') => $(id).addEventListener(ev, () => {
      estado[campo] = $(id).type === 'checkbox' ? $(id).checked : $(id).value;
      guardar();
      if ($(id).type === 'checkbox') renderTotales();
    });
    enlazar('#presuCliente', 'cliente');
    enlazar('#presuTelefono', 'telefono');
    enlazar('#presuObs', 'observaciones');
    enlazar('#presuEfectivo', 'mostrarEfectivo', 'change');
    enlazar('#presuCuit', 'mostrarCuit', 'change');
    // si la app se cierra o pasa a segundo plano, guardar ya lo pendiente
    const alSalir = () => { if (guardarTimer) guardarYa(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) alSalir(); });
    window.addEventListener('pagehide', alSalir);
    $('#btnPresuImprimir').addEventListener('click', imprimir);
    $('#btnPresuNuevo').addEventListener('click', nuevo);
    ['#cfgCuit', '#cfgDireccion', '#cfgWhatsapp', '#cfgInstagram'].forEach(id => $(id).addEventListener('change', guardarLocal));
  }

  return { iniciar, agregar, render };
})();
