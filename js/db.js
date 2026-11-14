/* Almacenamiento local en IndexedDB.
 *  - productos: la lista de precios importada (se reemplaza en cada importación)
 *  - fichas:    descripción / características / miniatura (NO se tocan al importar)
 *  - fotos:     foto completa de cada ficha (separada para que las listas carguen rápido)
 *  - minis:     miniatura de cada foto, se lee sólo al mostrar una lista
 *  - meta:      datos varios (fecha de la última importación, etc.)
 */
const DB = (() => {
  const NOMBRE = 'verificador-precios';
  const VERSION = 2;
  let dbPromise = null;

  function abrir() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('productos')) db.createObjectStore('productos', { keyPath: 'codigo' });
        if (!db.objectStoreNames.contains('fichas')) db.createObjectStore('fichas', { keyPath: 'codigo' });
        if (!db.objectStoreNames.contains('fotos')) db.createObjectStore('fotos', { keyPath: 'codigo' });
        if (!db.objectStoreNames.contains('minis')) db.createObjectStore('minis', { keyPath: 'codigo' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'clave' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function reqAPromesa(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function txFin(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transacción cancelada'));
    });
  }

  async function todos(store) {
    const db = await abrir();
    return reqAPromesa(db.transaction(store).objectStore(store).getAll());
  }

  async function obtener(store, clave) {
    const db = await abrir();
    return reqAPromesa(db.transaction(store).objectStore(store).get(clave));
  }

  async function guardar(store, valor) {
    const db = await abrir();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(valor);
    return txFin(tx);
  }

  async function borrar(store, clave) {
    const db = await abrir();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(clave);
    return txFin(tx);
  }

  /** Reemplaza toda la lista de productos, en bloques, informando el avance. */
  async function reemplazarProductos(lista, alAvanzar) {
    const db = await abrir();
    let tx = db.transaction('productos', 'readwrite');
    tx.objectStore('productos').clear();
    await txFin(tx);

    const BLOQUE = 5000;
    for (let i = 0; i < lista.length; i += BLOQUE) {
      tx = db.transaction('productos', 'readwrite');
      const st = tx.objectStore('productos');
      const fin = Math.min(i + BLOQUE, lista.length);
      for (let j = i; j < fin; j++) st.put(lista[j]);
      await txFin(tx);
      if (alAvanzar) alAvanzar(fin, lista.length);
    }
  }

  /** Guarda en varios almacenes en una sola transacción: { fichas: [...], fotos: [...] } */
  async function guardarVarios(porStore) {
    const stores = Object.keys(porStore).filter(k => porStore[k].length);
    if (!stores.length) return;
    const db = await abrir();
    const tx = db.transaction(stores, 'readwrite');
    stores.forEach(k => { const st = tx.objectStore(k); porStore[k].forEach(v => st.put(v)); });
    return txFin(tx);
  }

  async function getMeta(clave) {
    const r = await obtener('meta', clave);
    return r ? r.valor : undefined;
  }

  function setMeta(clave, valor) {
    return guardar('meta', { clave, valor });
  }

  return { abrir, todos, obtener, guardar, borrar, reemplazarProductos, guardarVarios, getMeta, setMeta };
})();
