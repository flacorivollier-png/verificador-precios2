/* Lectura de la lista de precios (CSV o Excel) y conversión a productos. */
const Importar = (() => {

  function normalizar(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim();
  }

  /* ---------------- lectura de archivos ---------------- */

  function decodificarTexto(buffer) {
    // Primero UTF-8; si hay bytes inválidos, es casi seguro un CSV de Excel en Windows-1252.
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
    } catch (e) {
      return new TextDecoder('windows-1252').decode(buffer);
    }
  }

  function detectarSeparador(texto) {
    const primeras = texto.split(/\r?\n/).slice(0, 5).join('\n');
    let mejor = ',', max = -1;
    for (const sep of [';', ',', '\t', '|']) {
      const n = primeras.split(sep).length;
      if (n > max) { max = n; mejor = sep; }
    }
    return mejor;
  }

  /** Parser CSV que respeta comillas ("a;b" queda como un solo campo). */
  function parsearCSV(texto) {
    const sep = detectarSeparador(texto);
    const filas = [];
    let fila = [], campo = '', comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (comillas) {
        if (ch === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i++; }
          else comillas = false;
        } else campo += ch;
      } else if (ch === '"' && campo === '') {
        comillas = true;
      } else if (ch === sep) {
        fila.push(campo); campo = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        fila.push(campo); campo = '';
        if (fila.some(c => c.trim() !== '')) filas.push(fila);
        fila = [];
      } else campo += ch;
    }
    fila.push(campo);
    if (fila.some(c => c.trim() !== '')) filas.push(fila);
    return filas;
  }

  let cargaXLSX = null;
  function cargarXLSX() {
    if (window.XLSX) return Promise.resolve();
    if (!cargaXLSX) {
      cargaXLSX = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'vendor/xlsx.full.min.js';
        s.onload = resolve;
        s.onerror = () => { cargaXLSX = null; reject(new Error('No se pudo cargar el lector de Excel')); };
        document.head.appendChild(s);
      });
    }
    return cargaXLSX;
  }

  /** Devuelve una matriz de filas (la primera es el encabezado). */
  async function leerArchivo(file) {
    const buffer = await file.arrayBuffer();
    const nombre = file.name.toLowerCase();
    if (nombre.endsWith('.xlsx') || nombre.endsWith('.xls') || nombre.endsWith('.xlsm') || nombre.endsWith('.ods')) {
      await cargarXLSX();
      const wb = XLSX.read(buffer, { type: 'array' });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' });
      return filas.filter(f => f.some(c => String(c).trim() !== ''));
    }
    return parsearCSV(decodificarTexto(buffer));
  }

  /* ---------------- columnas ---------------- */

  const CAMPOS = [
    { id: 'codigo', etiqueta: 'Código de barras', obligatorio: true,
      claves: ['codigo de barras', 'cod barras', 'cod. barras', 'codigo barra', 'ean', 'barcode', 'barra', 'codigo', 'cod', 'sku', 'plu', 'id'] },
    { id: 'nombre', etiqueta: 'Nombre / descripción', obligatorio: true,
      claves: ['nombre', 'descripcion', 'producto', 'articulo', 'detalle', 'desc'] },
    { id: 'precio', etiqueta: 'Precio', obligatorio: true,
      claves: ['precio venta', 'precio final', 'precio publico', 'pvp', 'precio', 'venta', 'importe', 'p. venta', 'valor'] },
    { id: 'presentacion', etiqueta: 'Presentación', obligatorio: false,
      claves: ['presentacion', 'contenido', 'unidad', 'medida', 'tamano', 'peso'] },
  ];

  function adivinarColumnas(encabezado) {
    const enc = encabezado.map(normalizar);
    const usadas = new Set();
    const mapa = {};
    for (const campo of CAMPOS) {
      let elegido = -1;
      // 1) coincidencia exacta, 2) el encabezado contiene la clave
      for (const modo of ['exacto', 'contiene']) {
        for (const clave of campo.claves) {
          const idx = enc.findIndex((h, i) => !usadas.has(i) && (modo === 'exacto' ? h === clave : h.includes(clave)));
          if (idx >= 0) { elegido = idx; break; }
        }
        if (elegido >= 0) break;
      }
      mapa[campo.id] = elegido;
      if (elegido >= 0) usadas.add(elegido);
    }
    return mapa;
  }

  /* ---------------- valores ---------------- */

  function limpiarCodigo(v) {
    if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v);
    let s = String(v == null ? '' : v).trim();
    // Excel a veces exporta "7790000000000.0" o "=""779..."""
    s = s.replace(/^="?|"$/g, '');
    if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
    return s;
  }

  /** Interpreta precios como "1.234,56", "1234.56", "$ 1.500", 1500 … */
  function parsearPrecio(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v == null ? '' : v).replace(/[^\d.,\-]/g, '');
    if (!s || !/\d/.test(s)) return null;
    const ultComa = s.lastIndexOf(','), ultPunto = s.lastIndexOf('.');
    if (ultComa >= 0 && ultPunto >= 0) {
      if (ultComa > ultPunto) s = s.replace(/\./g, '').replace(',', '.');   // 1.234,56
      else s = s.replace(/,/g, '');                                         // 1,234.56
    } else if (ultComa >= 0) {
      const dec = s.length - ultComa - 1;
      s = (dec <= 2 && s.split(',').length === 2) ? s.replace(',', '.') : s.replace(/,/g, '');
    } else if (ultPunto >= 0) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');        // 1.500 / 12.345.678
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function texto(v) {
    return String(v == null ? '' : v).trim();
  }

  /** Convierte las filas en productos según el mapa de columnas elegido. */
  function construirProductos(filas, mapa) {
    const encabezado = filas[0].map(texto);
    const otrasCols = encabezado
      .map((h, i) => i)
      .filter(i => !Object.values(mapa).includes(i) && encabezado[i] !== '');
    const porCodigo = new Map();
    let sinCodigo = 0;
    for (let r = 1; r < filas.length; r++) {
      const f = filas[r];
      const codigo = limpiarCodigo(f[mapa.codigo]);
      if (!codigo) { sinCodigo++; continue; }
      const p = {
        codigo,
        nombre: texto(f[mapa.nombre]),
        precio: mapa.precio >= 0 ? parsearPrecio(f[mapa.precio]) : null,
        precioTexto: mapa.precio >= 0 ? texto(f[mapa.precio]) : '',
        presentacion: mapa.presentacion >= 0 ? texto(f[mapa.presentacion]) : '',
      };
      if (otrasCols.length) {
        const otros = {};
        otrasCols.forEach(i => { const v = texto(f[i]); if (v) otros[encabezado[i]] = v; });
        if (Object.keys(otros).length) p.otros = otros;
      }
      porCodigo.set(codigo, p); // si un código se repite, queda la última fila
    }
    return { productos: [...porCodigo.values()], sinCodigo, repetidos: (filas.length - 1 - sinCodigo) - porCodigo.size };
  }

  return { CAMPOS, leerArchivo, adivinarColumnas, construirProductos, parsearPrecio, normalizar, limpiarCodigo };
})();
