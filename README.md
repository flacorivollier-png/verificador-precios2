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
- **Copia de seguridad** de las fichas (con fotos) a un archivo `.json` para guardar en Archivos/iCloud
  o pasar a otro teléfono.

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
