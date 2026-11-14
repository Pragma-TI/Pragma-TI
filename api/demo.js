// Demos en vivo de pragma-ti.com/demos. Una sola función atiende las 10 demos:
//   GET  /api/demo            → qué demos están activas y cuántos usos le quedan a esta IP
//   POST /api/demo {demo,...} → ejecuta una demo (consume 1 de los 3 usos de esa IP)
// Nada de lo que sube el visitante se guarda: fotos, audios y números viven solo en esta llamada.
import Anthropic from '@anthropic-ai/sdk'
import {
  LIMITE_POR_IP, ipDe, huellaIp, consumir, devolver, usados, verificarCaptcha,
  firmar, leerFirma, ErrorDemo, imagen, texto,
} from './_lib/comun.js'
import { enmascararNombre, tipoDocumento, rucValido, leerIcal, ocupacion, urlCalendarioPermitida } from './_lib/puros.js'
import { DATOS_EDIFICIO } from './_lib/datos-edificio.js'
import { ICAL_EJEMPLO } from './_lib/ical-ejemplo.js'

const MODELO = 'claude-opus-5-5'
let _cliente
const claude = () => (_cliente ??= new Anthropic())

// Qué necesita cada demo para funcionar (si falta la variable, la página la muestra como «pronto»).
const REQUISITOS = {
  documento: ['ANTHROPIC_API_KEY'],
  facial: [],
  acta: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
  boleta: ['ANTHROPIC_API_KEY'],
  cotizaciones: ['ANTHROPIC_API_KEY'],
  datos: ['ANTHROPIC_API_KEY'],
  proveedor: ['ANTHROPIC_API_KEY'],
  identidad: ['FACTILIZA_TOKEN', 'TURNSTILE_SECRET'],
  calendario: [],
  bot: ['ANTHROPIC_API_KEY'],
}
// Sin el contador de usos ninguna demo se abre: así nunca queda una demo sin límite.
const activa = d => ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DEMO_SAL', ...(REQUISITOS[d] || [])].every(v => !!process.env[v])

// ---------- Llamada a Claude con salida JSON validada ----------

function esquema(props, opcionales = []) {
  return { type: 'object', additionalProperties: false, properties: props, required: Object.keys(props).filter(k => !opcionales.includes(k)) }
}
const S = { type: 'string' }, N = { type: 'number' }, B = { type: 'boolean' }
const nul = t => ({ anyOf: [t, { type: 'null' }] })
const lista = t => ({ type: 'array', items: t })

async function pedirJson({ sistema, contenido, schema, esfuerzo = 'low', herramientas, maxTokens = 4000 }) {
  const params = {
    model: MODELO,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: esfuerzo, format: { type: 'json_schema', schema } },
    system: sistema,
    messages: Array.isArray(contenido) && contenido[0]?.role ? contenido : [{ role: 'user', content: contenido }],
  }
  if (herramientas) params.tools = herramientas
  let r = await claude().beta.messages.create(params)
  // Una búsqueda web larga puede pausar el turno: se continúa hasta 3 veces.
  for (let i = 0; r.stop_reason === 'pause_turn' && i < 3; i++) {
    params.messages = [...params.messages, { role: 'assistant', content: r.content }]
    r = await claude().beta.messages.create(params)
  }
  if (r.stop_reason === 'refusal') throw new ErrorDemo('La IA no quiso procesar este contenido. Prueba con otro.', 'RECHAZO', 422)
  const txt = r.content.filter(b => b.type === 'text').map(b => b.text).join('')
  try { return JSON.parse(txt) } catch { throw new ErrorDemo('La IA no devolvió un resultado legible. Vuelve a intentarlo.', 'IA_JSON', 502) }
}

// ---------- Las 10 demos ----------

const DEMOS = {
  // 1. Foto de un documento de identidad → formulario lleno (Asistenzia / Renta Corta)
  async documento(b) {
    return pedirJson({
      sistema: 'Lees documentos de identidad (DNI peruano, carné de extranjería, pasaporte, cédula, licencia) para llenar un formulario de registro. Si la imagen no es un documento de identidad, pon es_documento=false y deja el resto en null. Fechas en formato AAAA-MM-DD. No inventes datos que no se lean.',
      contenido: [imagen(b.archivo, b.mime, 'foto del documento'), { type: 'text', text: 'Llena el formulario con lo que se lee en este documento.' }],
      schema: esquema({
        es_documento: B, tipo_documento: nul(S), numero: nul(S), nombres: nul(S), apellidos: nul(S),
        nacionalidad: nul(S), fecha_nacimiento: nul(S), sexo: nul(S), fecha_vencimiento: nul(S), observacion: nul(S),
      }),
    })
  },

  // 2. Reconocimiento facial: corre en el navegador; aquí solo se descuenta el uso.
  async facial() { return { ok: true } },

  // 3. Audio de una reunión → acta con acuerdos (Junta de Propietarios)
  async acta(b) {
    if (!b.archivo || b.archivo.length > 4_000_000) throw new ErrorDemo('Graba o sube un audio de hasta 2 minutos.', 'AUDIO')
    const mime = String(b.mime || 'audio/webm').split(';')[0]
    const ext = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/aac': 'm4a' }[mime]
    if (!ext) throw new ErrorDemo('Formato de audio no soportado. Usa MP3, M4A, WAV, OGG o WEBM.', 'AUDIO_TIPO')
    const fd = new FormData()
    fd.append('file', new Blob([Buffer.from(b.archivo, 'base64')], { type: mime }), 'reunion.' + ext)
    fd.append('model', 'whisper-1')
    fd.append('language', 'es')
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: fd })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new ErrorDemo('No se pudo transcribir el audio. Prueba con otro archivo.', 'WHISPER', 502, j?.error?.message)
    const transcripcion = String(j.text || '').trim()
    if (transcripcion.length < 20) throw new ErrorDemo('No se entendió lo que se dijo en el audio. Habla más cerca del micrófono.', 'AUDIO_VACIO', 422)
    const acta = await pedirJson({
      sistema: 'Eres secretario de una junta de propietarios en Perú. A partir de la transcripción de una reunión redactas un acta breve y formal en español. Solo usa lo que se dijo; si algo no se mencionó (responsable, fecha) déjalo en null. Si la transcripción no es una reunión, resume igual lo que se habló como «temas».',
      contenido: `Transcripción:\n"""${transcripcion.slice(0, 12000)}"""`,
      schema: esquema({
        titulo: S, resumen: S,
        temas: lista(S),
        acuerdos: lista(esquema({ acuerdo: S, responsable: nul(S), fecha_limite: nul(S) })),
        pendientes: lista(S),
      }),
    })
    return { transcripcion, ...acta }
  },

  // 4. Foto de una boleta → gasto registrado (Junta de Propietarios)
  async boleta(b) {
    return pedirJson({
      sistema: 'Lees comprobantes peruanos (boleta, factura, ticket, recibo por honorarios) para registrar un gasto. Montos con punto decimal. Fechas AAAA-MM-DD. Si la imagen no es un comprobante, pon es_comprobante=false.',
      contenido: [imagen(b.archivo, b.mime, 'foto del comprobante'), { type: 'text', text: 'Registra este gasto.' }],
      schema: esquema({
        es_comprobante: B, tipo: nul(S), serie_numero: nul(S), fecha: nul(S), ruc_emisor: nul(S), proveedor: nul(S),
        items: lista(esquema({ descripcion: S, cantidad: nul(N), importe: nul(N) })),
        subtotal: nul(N), igv: nul(N), total: nul(N), moneda: nul(S),
        categoria_sugerida: nul(S), concepto: nul(S),
      }),
    })
  },

  // 5. Comparador de cotizaciones (Junta de Propietarios)
  async cotizaciones(b) {
    const archivos = Array.isArray(b.archivos) ? b.archivos.slice(0, 3) : []
    if (archivos.length < 2) throw new ErrorDemo('Sube al menos 2 cotizaciones para compararlas.', 'POCAS')
    const contenido = []
    archivos.forEach((a, i) => { contenido.push({ type: 'text', text: `Cotización ${i + 1}:` }, imagen(a.archivo, a.mime, `cotización ${i + 1}`)) })
    contenido.push({ type: 'text', text: 'Compara estas cotizaciones para la junta de propietarios.' })
    return pedirJson({
      sistema: 'Ayudas a una junta de propietarios a elegir proveedor. Comparas cotizaciones del mismo servicio: precio total (con IGV si se indica), plazo, garantía, forma de pago, qué incluye y qué NO incluye. Señala diferencias de alcance que hagan engañosa la comparación por precio. Recomienda una con su motivo, en lenguaje simple. Si alguna no es una cotización, dilo en advertencias.',
      contenido,
      esfuerzo: 'medium',
      schema: esquema({
        servicio: S,
        cotizaciones: lista(esquema({ numero: N, proveedor: nul(S), total: nul(N), moneda: nul(S), plazo: nul(S), garantia: nul(S), forma_pago: nul(S), incluye: lista(S), no_incluye: lista(S) })),
        diferencias_clave: lista(S), recomendada: nul(N), motivo: S, advertencias: lista(S),
      }),
    })
  },

  // 6. Pregúntale a tus datos (Junta de Propietarios) — con un edificio de ejemplo
  async datos(b) {
    const pregunta = texto(b.pregunta, 300, 'tu pregunta')
    return pedirJson({
      sistema: [
        { type: 'text', text: 'Eres el asistente de datos de la administración de un edificio. Respondes SOLO con los datos de abajo, en español simple, con montos en soles (S/). Calcula con cuidado. Si la pregunta no se puede responder con estos datos, dilo y sugiere una que sí. Cuando ayude, agrega una tabla corta (máximo 12 filas).' },
        { type: 'text', text: DATOS_EDIFICIO, cache_control: { type: 'ephemeral' } },
      ],
      contenido: pregunta,
      esfuerzo: 'medium',
      schema: esquema({ respuesta: S, cifra_clave: nul(S), tabla: nul(esquema({ columnas: lista(S), filas: lista(lista(S)) })) }),
    })
  },

  // 7. Investigador de proveedores con búsqueda web (Junta de Propietarios)
  async proveedor(b) {
    const consulta = texto(b.consulta, 120, 'el nombre o RUC de la empresa')
    return pedirJson({
      sistema: 'Investigas empresas proveedoras en Perú antes de que un edificio las contrate. Busca en la web: estado del RUC en SUNAT, sanciones o multas (Indecopi, SUNAFIL, OSCE), reclamos públicos (Libro de reclamaciones, Reclamos.pe, redes) y presencia profesional (web, reseñas). Para cada punto da un veredicto corto y el enlace de la fuente. Si no encuentras algo, dilo; no inventes. Sé breve.',
      contenido: `Empresa a investigar: ${consulta}`,
      esfuerzo: 'low',
      maxTokens: 8000,
      herramientas: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
      schema: esquema({
        empresa: S, ruc: nul(S),
        marcadores: lista(esquema({ tema: S, estado: { type: 'string', enum: ['bien', 'atencion', 'alerta', 'sin_datos'] }, detalle: S, fuente: nul(S) })),
        conclusion: S,
      }),
    })
  },

  // 8. Busca un DNI, carné de extranjería o RUC (Factiliza). DNI y CE salen enmascarados.
  async identidad(b) {
    const numero = String(b.numero || '').trim().toUpperCase()
    const tipo = tipoDocumento(numero)
    if (!tipo) throw new ErrorDemo('Escribe un DNI (8 dígitos), un carné de extranjería (9 a 12) o un RUC (11 dígitos).', 'NUMERO')
    if (tipo === 'RUC' && !rucValido(numero)) throw new ErrorDemo('Ese RUC no es válido: revisa el último dígito.', 'RUC_INVALIDO')
    const ruta = { DNI: 'dni', CE: 'cee', RUC: 'ruc' }[tipo]
    const r = await fetch(`https://api.factiliza.com/v1/${ruta}/info/${encodeURIComponent(numero)}`, { headers: { Authorization: `Bearer ${process.env.FACTILIZA_TOKEN}`, Accept: 'application/json' } })
    const j = await r.json().catch(() => ({}))
    if (r.status === 404 || r.status === 400 || j?.success === false || (r.ok && !j?.data)) return { tipo, encontrado: false }
    if (!r.ok) throw new ErrorDemo('El servicio de consulta no respondió. Inténtalo en un momento.', 'FACTILIZA', 502)
    const d = j.data
    if (tipo === 'RUC') {
      return {
        tipo, encontrado: true, numero,
        razon_social: d.nombre_o_razon_social || d.razon_social || null,
        estado: d.estado || null, condicion: d.condicion || null,
        direccion: d.direccion_completa || d.direccion || null,
        distrito: d.distrito || null, departamento: d.departamento || null,
      }
    }
    // El número consultado no se devuelve ni se guarda; el nombre sale enmascarado.
    return { tipo, encontrado: true, nombre: enmascararNombre(d.nombres, d.apellido_paterno, d.apellido_materno) }
  },

  // 9. Calendario de Airbnb / Booking → reservas ordenadas (Renta Corta)
  async calendario(b) {
    let ics
    if (b.ejemplo) ics = ICAL_EJEMPLO()
    else {
      if (!urlCalendarioPermitida(b.url)) throw new ErrorDemo('Pega el enlace del calendario (iCal) de Airbnb, Booking o Vrbo. Empieza con https://', 'URL')
      const r = await fetch(String(b.url).trim(), { redirect: 'error', signal: AbortSignal.timeout(10000) }).catch(() => null)
      if (!r?.ok) throw new ErrorDemo('No se pudo leer ese calendario. Revisa que el enlace sea el de «Exportar calendario».', 'ICAL', 422)
      ics = (await r.text()).slice(0, 2_000_000)
      if (!ics.includes('BEGIN:VCALENDAR')) throw new ErrorDemo('Ese enlace no es un calendario iCal.', 'ICAL', 422)
    }
    const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10)   // hora de Lima
    const eventos = leerIcal(ics).filter(e => e.fin >= hoy)
    return { hoy, eventos: eventos.slice(0, 40), mes: ocupacion(eventos, hoy, 30), trimestre: ocupacion(eventos, hoy, 90) }
  },

  // 10. Bot de WhatsApp que entiende lenguaje libre (Renta Corta). 1 uso = 1 conversación de hasta 8 mensajes.
  async bot(b) {
    const historial = Array.isArray(b.historial) ? b.historial.slice(-16) : []
    const mensajes = historial
      .filter(m => (m.rol === 'huesped' || m.rol === 'bot') && typeof m.texto === 'string')
      .map(m => ({ role: m.rol === 'huesped' ? 'user' : 'assistant', content: m.texto.slice(0, 500) }))
    if (!mensajes.length || mensajes[mensajes.length - 1].role !== 'user') throw new ErrorDemo('Escribe un mensaje.', 'SIN_TEXTO')
    while (mensajes[0]?.role !== 'user') mensajes.shift()
    return pedirJson({
      sistema: 'Eres el asistente de WhatsApp de «Casa Luna», un departamento de alquiler temporal en Miraflores, Lima (es un ejemplo de demostración). Tu tarea: registrar la llegada del huésped. Necesitas: nombre del titular, número de huéspedes, fecha y hora aproximada de llegada, y si viene con mascota. Entiendes lenguaje libre («llegamos el viernes como a las 3 de la tarde», «somos 2 adultos y un bebé»). Pide UN dato a la vez, con mensajes cortos y cálidos estilo WhatsApp (máximo 2 líneas, un emoji como mucho). Nunca pidas el número de documento ni datos bancarios: es una demo. Si preguntan otra cosa (wifi, check-out a las 11:00, estacionamiento disponible, no se permiten fiestas) responde breve y vuelve al registro. Cuando tengas todo, confirma el resumen y marca completo=true. Hoy es ' + new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10) + '.',
      contenido: mensajes,
      maxTokens: 1500,
      schema: esquema({
        respuesta: S,
        datos: esquema({ titular: nul(S), huespedes: nul(S), fecha_llegada: nul(S), hora_llegada: nul(S), mascota: nul(S) }),
        completo: B,
      }),
    })
  },
}

// ---------- Manejador ----------

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const ip = ipDe(req), huella = huellaIp(ip)

  if (req.method === 'GET') {
    const u = await usados(huella)
    const estado = {}
    for (const d of Object.keys(DEMOS)) estado[d] = { activa: activa(d), quedan: Math.max(LIMITE_POR_IP - (u[d] || 0), 0) }
    return res.status(200).json({ limite: LIMITE_POR_IP, captcha: process.env.TURNSTILE_SITE_KEY || null, demos: estado })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const b = req.body || {}
  const demo = String(b.demo || '')
  if (!DEMOS[demo]) return res.status(404).json({ error: 'Demo desconocida' })
  if (!activa(demo)) return res.status(503).json({ error: 'Esta demo estará disponible muy pronto.', codigo: 'INACTIVA' })

  let consumido = false
  try {
    let quedan, sesion
    if (demo === 'bot') {
      // El primer mensaje consume el uso y abre una conversación firmada; los siguientes la continúan.
      const s = b.sesion ? leerFirma(b.sesion) : null
      if (s && s.h === huella && s.exp > Date.now()) {
        if (s.n >= 8) throw new ErrorDemo('La conversación llegó a su límite de mensajes. Empieza otra.', 'FIN_CONVERSACION', 429)
        sesion = firmar({ ...s, n: s.n + 1 }); quedan = s.q
      } else {
        await verificarCaptcha(b.captcha, ip)
        quedan = await consumir(huella, demo); consumido = true
        sesion = firmar({ h: huella, n: 1, q: quedan, exp: Date.now() + 30 * 60000 })
      }
    } else {
      // La consulta de documentos exige el captcha; en las demás se pide si está configurado.
      await verificarCaptcha(b.captcha, ip, { obligatorio: demo === 'identidad' })
      quedan = await consumir(huella, demo); consumido = true
    }
    const resultado = await DEMOS[demo](b, { ip })
    return res.status(200).json({ ok: true, quedan, sesion, resultado })
  } catch (e) {
    // Si la demo no llegó a dar un resultado (dato mal ingresado, IA o servicio caído), el uso se devuelve.
    if (consumido) await devolver(huella, demo)
    if (e instanceof ErrorDemo) {
      if (e.detalle) console.error(`demo ${demo}:`, e.codigo, e.detalle)
      return res.status(e.estado).json({ error: e.message, codigo: e.codigo })
    }
    console.error(`demo ${demo}:`, e?.status || '', e?.message || e)
    const ocupado = e?.status === 429 || e?.status === 529
    return res.status(502).json({ error: ocupado ? 'La IA está muy ocupada ahora. Vuelve a intentarlo en un minuto.' : 'Algo falló de nuestro lado. Vuelve a intentarlo.', codigo: 'ERROR' })
  }
}
