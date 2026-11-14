/* Lector de códigos de barras con la cámara.
 * - Cámara trasera en alta resolución, con enfoque continuo.
 * - Zoom y linterna si el teléfono los permite.
 * - Lee con el lector nativo del teléfono si existe (Android / Chrome) y si no con
 *   ZXing-C++ (WebAssembly), que es mucho más robusto que el lector anterior. */
const Escaner = (() => {
  const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
  const WASM = 'vendor/zxing_reader.wasm';

  let detector = null;
  let stream = null, track = null;
  let video = null, canvas = null, ctx = null;
  let leyendo = false;      // el bucle de lectura está activo
  let ocupado = false;      // hay una lectura en curso
  let alLeer = null;
  let vuelta = 0;
  let zoomActual = 1;
  let linterna = false;

  /** Empieza a cargar el lector (para que la primera lectura sea instantánea). */
  function precargar() {
    try {
      window.BarcodeDetectionAPI.prepareZXingModule({
        overrides: { locateFile: (p, prefijo) => (p.endsWith('.wasm') ? WASM : prefijo + p) },
        fireImmediately: true,
      });
    } catch (e) { /* se reintenta al escanear */ }
  }

  async function crearDetector() {
    if (detector) return detector;
    // lector nativo del sistema (Chrome en Android) si sabe leer EAN-13
    if ('BarcodeDetector' in window) {
      try {
        const soportados = await window.BarcodeDetector.getSupportedFormats();
        if (soportados.includes('ean_13')) {
          detector = new window.BarcodeDetector({ formats: FORMATOS.filter(f => soportados.includes(f)) });
          return detector;
        }
      } catch (e) { /* usar ZXing */ }
    }
    precargar();
    detector = new window.BarcodeDetectionAPI.BarcodeDetector({ formats: FORMATOS });
    return detector;
  }

  /** Abre la cámara dentro de `contenedor`. `onCodigo(texto)` se llama al leer uno. */
  async function abrir(contenedor, onCodigo) {
    alLeer = onCodigo;
    await crearDetector();
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
      });
      track = stream.getVideoTracks()[0];
      video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      video.muted = true;
      video.autoplay = true;
      video.srcObject = stream;
      contenedor.prepend(video);
      await video.play().catch(() => {});
      await new Promise(r => (video.readyState >= 2 ? r() : video.addEventListener('loadeddata', r, { once: true })));
      await ajustarCamara();
    }
    continuar();
    return capacidades();
  }

  function capacidades() {
    const c = (track && track.getCapabilities) ? track.getCapabilities() : {};
    return {
      zoom: c.zoom ? { min: c.zoom.min, max: c.zoom.max } : null,
      linterna: !!c.torch,
    };
  }

  async function ajustarCamara() {
    if (!track || !track.getCapabilities) return;
    const c = track.getCapabilities();
    const avanzado = {};
    if (c.focusMode && c.focusMode.includes('continuous')) avanzado.focusMode = 'continuous';
    if (c.exposureMode && c.exposureMode.includes('continuous')) avanzado.exposureMode = 'continuous';
    if (Object.keys(avanzado).length) {
      try { await track.applyConstraints({ advanced: [avanzado] }); } catch (e) {}
    }
    // un poco de zoom ayuda a no acercar demasiado el teléfono (y que no se desenfoque)
    if (c.zoom && c.zoom.max >= 1.5) await zoom(Math.min(1.5, c.zoom.max));
  }

  async function zoom(valor) {
    if (!track) return zoomActual;
    const c = track.getCapabilities ? track.getCapabilities() : {};
    if (!c.zoom) return zoomActual;
    valor = Math.max(c.zoom.min, Math.min(c.zoom.max, valor));
    try { await track.applyConstraints({ advanced: [{ zoom: valor }] }); zoomActual = valor; } catch (e) {}
    return zoomActual;
  }

  async function alternarLinterna() {
    if (!track) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: !linterna }] });
      linterna = !linterna;
    } catch (e) { /* no soportado */ }
    return linterna;
  }

  /** Lee un cuadro. Alterna entre la franja del medio (más rápido, más detalle) y la imagen entera. */
  async function leerCuadro() {
    if (!leyendo || ocupado || !video || video.readyState < 2) return;
    ocupado = true;
    try {
      const vw = video.videoWidth, vh = video.videoHeight;
      vuelta++;
      let fuente = video;
      if (vuelta % 3 !== 0) {
        // franja central: 90% del ancho, 45% del alto (donde está el recuadro guía)
        const cw = Math.round(vw * 0.9), ch = Math.round(vh * 0.45);
        if (!canvas) { canvas = document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); }
        if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
        ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, cw, ch);
        fuente = canvas;
      }
      const res = await detector.detect(fuente);
      const r = res.find(x => x.rawValue && x.rawValue.trim());
      if (r && leyendo) {
        leyendo = false;
        if (alLeer) alLeer(r.rawValue.trim(), r.format);
      }
    } catch (e) {
      /* cuadro inválido: seguir */
    } finally {
      ocupado = false;
    }
  }

  function bucle() {
    if (!leyendo) return;
    leerCuadro().finally(() => { if (leyendo) setTimeout(bucle, 40); });
  }

  function continuar() {
    if (leyendo) return;
    leyendo = true;
    bucle();
  }

  function pausar() { leyendo = false; }

  function cerrar() {
    leyendo = false;
    if (linterna && track) { try { track.applyConstraints({ advanced: [{ torch: false }] }); } catch (e) {} }
    linterna = false;
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (video) { video.srcObject = null; video.remove(); }
    stream = track = video = null;
    zoomActual = 1;
  }

  return { precargar, abrir, continuar, pausar, cerrar, zoom, alternarLinterna, zoomActual: () => zoomActual };
})();
