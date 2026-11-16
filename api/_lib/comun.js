// Utilidades compartidas por las demos de pragma-ti.com/demos.
// Los archivos de api/ que empiezan con «_» no se publican como funciones.
import crypto from 'node:crypto'

export const LIMITE_POR_IP = 3        // usos por IP y por demo
export const VENTANA_DIAS = 30        // los usos se cuentan en los últimos 30 días
export const TOPE_DIARIO = 150        // freno global por demo y día, protege el presupuesto

/** IP de quien llama. Vercel la pone en x-forwarded-for (la primera es la del visitante). */
export function ipDe(req) {
  const xf = String(req.headers['x-forwarded-for'] || '')
  return (xf.split(',')[0] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').trim()
}

/** La IP nunca se guarda tal cual: se guarda su huella con una sal secreta. */
export function huellaIp(ip) {
  const sal = process.env.DEMO_SAL || 'sin-sal'
  return crypto.createHash('sha256').update(sal + '|' + ip).digest('hex').slice(0, 40)
}

// ---------- Conteo de usos en Supabase (funciones de la migración demo_usos) ----------

async function rpc(nombre, args) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new ErrorDemo('El contador de usos no está configurado.', 'SIN_CONTADOR', 503)
  const r = await fetch(`${url}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    // Las llaves nuevas de Supabase (sb_secret_…) van solo en «apikey»; las antiguas (JWT) también en Authorization.
    headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'content-type': 'application/json' },
    body: JSON.stringify(args),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new ErrorDemo('No se pudo registrar el uso de la demo.', 'CONTADOR', 503, j?.message)
  return j
}

/** Reserva un uso. Devuelve cuántos quedan después de este. Lanza ErrorDemo si ya no quedan. */
export async function consumir(huella, demo) {
  const quedan = await rpc('demo_consumir', { p_huella: huella, p_demo: demo, p_limite: LIMITE_POR_IP, p_dias: VENTANA_DIAS, p_tope_dia: TOPE_DIARIO })
  if (quedan === -2) throw new ErrorDemo('Esta demo alcanzó su límite de hoy. Vuelve mañana o escríbenos por WhatsApp y te la mostramos en vivo.', 'TOPE_DIA', 429)
  if (quedan < 0) throw new ErrorDemo('Ya usaste esta demo 3 veces. ¿Te gustó? Escríbenos y la adaptamos a tu negocio.', 'SIN_USOS', 429)
  return quedan
}

/** Si la demo falló por nuestro lado, se devuelve el uso para no cobrárselo al visitante. */
export async function devolver(huella, demo) {
  try { await rpc('demo_devolver', { p_huella: huella, p_demo: demo }) } catch { /* no bloquea la respuesta */ }
}

export async function usados(huella) {
  try {
    const filas = await rpc('demo_usados', { p_huella: huella, p_dias: VENTANA_DIAS })
    const m = {}
    for (const f of filas || []) m[f.demo] = Number(f.usos) || 0
    return m
  } catch { return {} }
}

// ---------- Captcha invisible de Cloudflare Turnstile ----------

export async function verificarCaptcha(token, ip, { obligatorio = false } = {}) {
  const secreto = process.env.TURNSTILE_SECRET
  if (!secreto) {
    if (obligatorio) throw new ErrorDemo('Esta demo aún no está habilitada.', 'SIN_CAPTCHA', 503)
    return
  }
  if (!token) throw new ErrorDemo('Confirma que no eres un robot y vuelve a intentarlo.', 'CAPTCHA', 403)
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: secreto, response: String(token), remoteip: ip }),
  })
  const j = await r.json().catch(() => ({}))
  if (!j.success) throw new ErrorDemo('No pudimos confirmar que no eres un robot. Recarga la página.', 'CAPTCHA', 403)
}

// ---------- Firmas para la conversación del bot (sin guardar nada en el servidor) ----------

export function firmar(obj) {
  const cuerpo = Buffer.from(JSON.stringify(obj)).toString('base64url')
  const firma = crypto.createHmac('sha256', process.env.DEMO_SAL || 'sin-sal').update(cuerpo).digest('base64url')
  return cuerpo + '.' + firma
}

export function leerFirma(token) {
  const [cuerpo, firma] = String(token || '').split('.')
  if (!cuerpo || !firma) return null
  const esperada = crypto.createHmac('sha256', process.env.DEMO_SAL || 'sin-sal').update(cuerpo).digest('base64url')
  if (firma.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null
  try { return JSON.parse(Buffer.from(cuerpo, 'base64url').toString()) } catch { return null }
}

// ---------- Errores y entrada ----------

export class ErrorDemo extends Error {
  constructor(mensaje, codigo, estado = 400, detalle) {
    super(mensaje); this.codigo = codigo; this.estado = estado; this.detalle = detalle
  }
}

/** Valida una imagen en base64 que manda la página (ya reducida en el navegador). */
export function imagen(b64, mime, nombre = 'imagen') {
  const tipos = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (!b64 || typeof b64 !== 'string') throw new ErrorDemo(`Falta la ${nombre}.`, 'SIN_ARCHIVO')
  if (!tipos.includes(mime)) throw new ErrorDemo('Sube una foto (JPG, PNG o WEBP) o un PDF.', 'TIPO')
  if (b64.length > 4_000_000) throw new ErrorDemo('El archivo es muy pesado. Prueba con una foto más liviana.', 'PESO')
  return mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mime, data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } }
}

export function texto(v, max, nombre) {
  const t = String(v ?? '').trim()
  if (!t) throw new ErrorDemo(`Escribe ${nombre}.`, 'SIN_TEXTO')
  if (t.length > max) throw new ErrorDemo(`El texto es muy largo (máximo ${max} caracteres).`, 'LARGO')
  return t
}
