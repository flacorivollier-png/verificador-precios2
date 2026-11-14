/* Conexión con Supabase (la "nube" que comparte la lista y las fichas con los usuarios).
 * Se completa con los datos de Supabase → Project Settings → API:
 *   url:     "Project URL"            (ej: https://abcdefgh.supabase.co)
 *   anonKey: "anon public" key        (es pública: puede ir acá sin problema)
 * ¡NUNCA poner acá la clave "service_role"!
 * Si se deja vacío, la app funciona sólo en este teléfono (modo local). */
const CONFIG_NUBE = {
  url: '',
  anonKey: '',
};
