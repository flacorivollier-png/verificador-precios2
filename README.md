# Verificador de precios

App web para consultar precios desde el iPhone leyendo el código de barras con la cámara.
Funciona sin internet una vez instalada y guarda todo en el teléfono.

## Qué hace
- **Escanear** códigos de barras (EAN-13, EAN-8, UPC, Code 128, Code 39, ITF, QR) con la cámara trasera.
- **Buscar** por código o por nombre (varias palabras, sin importar acentos).
- **Cargar la lista de precios** desde Excel (.xlsx/.xls) o CSV. Soporta más de 50.000 productos.
  La app adivina las columnas (código, nombre, precio, presentación) y te deja corregirlas;
  las demás columnas (rubro, marca, etc.) se muestran como información extra.
- **Fichas**: a cualquier producto le podés agregar foto, descripción, características
  (una por línea, `Marca: Arcor`) y marcarlo como ★ destacado.
  **Las fichas se conservan cuando actualizás la lista de precios.**
- **Etiquetas de precio** en hoja A4: desde cada producto, *🏷️ Agregar a la hoja de precios*.
  Se acumulan de a 14 por hoja (2 × 7, de 96 × 38 mm) y en la pestaña 🏷️ Etiquetas se ven e imprimen
  como PDF desde el menú Compartir → Imprimir (AirPrint) o la app HP Smart.
  (`window.print()` no funciona en el iPhone con la app instalada en la pantalla de inicio.)
- **Copia de seguridad** de las fichas (con fotos) en archivos `.json` para guardar en Archivos/iCloud
  o pasar a otro teléfono:
  - *Copia de lo nuevo*: sólo lo agregado o cambiado desde la última copia (rápida, para hacer seguido).
  - *Copia completa*: todo, dividido en archivos de hasta 250 fotos (~25 MB c/u).
  - Para restaurar se pueden elegir varios archivos a la vez.

## Capacidad
Pensada para **50.000+ productos y hasta ~5.000 fotos**. Las fotos se achican a 900 px
(~50–120 KB cada una), así que 5.000 fotos ocupan alrededor de 0,5 GB en el teléfono.
Las miniaturas se leen sólo cuando se muestran y la lista de fichas se pagina de a 50,
así que la app abre igual de rápido con muchas fotos. En **⚙️ Datos** se ve el espacio usado.

## Publicarla (gratis, con GitHub Pages)
La cámara del iPhone sólo funciona en páginas `https://`. GitHub Pages lo da gratis:
1. En GitHub: **Settings → Pages**.
2. En *Source* elegí **Deploy from a branch**, la rama (por ej. `main`) y la carpeta `/ (root)`. Guardar.
3. A los minutos queda en `https://<tu-usuario>.github.io/verificador-precios2/`.

> La lista de precios **no** se sube a GitHub: se carga desde el teléfono y queda guardada sólo ahí.

## Instalar en el iPhone
1. Abrí la dirección en **Safari**.
2. Botón **Compartir** → **Agregar a pantalla de inicio**.
3. Abrila desde el ícono, andá a **⚙️ Datos** y cargá tu lista (podés tenerla en Archivos, iCloud Drive, WhatsApp, mail…).

Instalada en la pantalla de inicio, iOS no borra los datos guardados.
Igual conviene **exportar la copia de fichas** cada tanto.

## Formato de la lista
Cualquier planilla con una fila de encabezados. Ejemplo CSV (separado por `;` o `,`):

```
Código;Descripción;Presentación;Rubro;Precio Venta
7790000000003;Aceite Natura;1,5 L;Almacén;18.951,00
```
Precios en formato `1.234,56`, `1234.56` o `$ 1.500` se interpretan bien.
Si los códigos se ven como `7,79E+12` en Excel, formateá esa columna como *Texto* o *Número sin decimales* antes de guardar.

## Archivos
- `index.html`, `css/`, `js/` — la app
- `vendor/` — librerías de lectura de códigos (html5-qrcode) y de Excel (SheetJS)
- `sw.js`, `manifest.webmanifest`, `icons/` — instalación y uso sin internet
- `app.py` — versión anterior en Streamlit (no se usa)

---

# Mis gastos (`/gastos/`)

App para anotar gastos e ingresos del mes, con metas de ahorro, presupuesto por categoría
y carga rápida escribiendo o dictando ("15 mil en el súper, 3500 en el kiosco").
Queda en `https://<tu-usuario>.github.io/verificador-precios2/gastos/`.

- Los datos se guardan **sólo en el teléfono**. `datos.js` trae una carga inicial **cifrada** (AES-GCM);
  la primera vez la app pide la clave para abrirla. Sin la clave no se puede leer.
- **Ajustes → Guardar copia de seguridad** baja un `.json`; con **Importar copia** se recupera
  (también sirve para pasar los datos de la versión de Claude o a otro teléfono).
- Funciona sin internet una vez instalada (Safari → Compartir → Agregar a pantalla de inicio).
- La pestaña *Tarjeta* (leer el PDF del resumen) sólo aparece dentro de Claude, porque usa IA.
- **Anotar rápido:** la barra de abajo siempre está a mano. Escribí o dictá “4000 panadería” y Enter.
  Los botones de arriba de la barra repiten tus gastos de siempre con un toque, y cada anotación se puede deshacer.
