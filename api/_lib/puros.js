// Funciones puras de las demos (sin red ni claves), cubiertas por pruebas/puros.test.js.

/** «JUAN CARLOS» + «PÉREZ» + «GÓMEZ» → «JUAN C***** P**** G****». Solo el primer nombre queda entero. */
export function enmascararNombre(nombres, apPaterno, apMaterno) {
  const palabras = [nombres, apPaterno, apMaterno]
    .map(s => String(s || '').trim()).join(' ').split(/\s+/).filter(Boolean)
  return palabras.map((p, i) => (i === 0 ? p : p[0] + '*'.repeat(Math.max(p.length - 1, 3)))).join(' ')
}

/** DNI: 8 dígitos. CE: 9 a 12 caracteres. RUC: 11 dígitos que empiezan en 10, 15, 16, 17 o 20. */
export function tipoDocumento(numero) {
  const n = String(numero || '').trim().toUpperCase()
  if (/^\d{8}$/.test(n)) return 'DNI'
  if (/^(10|15|16|17|20)\d{9}$/.test(n)) return 'RUC'
  if (/^[A-Z0-9]{9,12}$/.test(n)) return 'CE'
  return null
}

/** Dígito verificador del RUC (módulo 11 de SUNAT). */
export function rucValido(ruc) {
  if (!/^\d{11}$/.test(ruc)) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((s, p, i) => s + p * Number(ruc[i]), 0)
  const dv = (11 - (suma % 11)) % 10
  return dv === Number(ruc[10])
}

// ---------- Calendario iCal (Airbnb, Booking, Vrbo) ----------

function fechaIcal(v) {
  const m = String(v || '').match(/(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function dias(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) }

/** Lee un .ics y devuelve los eventos {inicio, fin, noches, tipo}. No conserva nombres ni teléfonos. */
export function leerIcal(ics) {
  const lineas = String(ics || '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)
  const eventos = []
  let ev = null
  for (const l of lineas) {
    if (l === 'BEGIN:VEVENT') { ev = {}; continue }
    if (l === 'END:VEVENT') {
      if (ev?.inicio && ev?.fin) {
        const resumen = (ev.resumen || '').toLowerCase()
        const bloqueo = /not available|no disponible|blocked|closed|bloquead/.test(resumen)
        eventos.push({ inicio: ev.inicio, fin: ev.fin, noches: Math.max(dias(ev.inicio, ev.fin), 0), tipo: bloqueo ? 'bloqueo' : 'reserva' })
      }
      ev = null; continue
    }
    if (!ev) continue
    const i = l.indexOf(':'); if (i < 0) continue
    const clave = l.slice(0, i).split(';')[0].toUpperCase(), valor = l.slice(i + 1)
    if (clave === 'DTSTART') ev.inicio = fechaIcal(valor)
    else if (clave === 'DTEND') ev.fin = fechaIcal(valor)
    else if (clave === 'SUMMARY') ev.resumen = valor
  }
  return eventos.sort((a, b) => a.inicio.localeCompare(b.inicio))
}

/** Resumen de ocupación desde `hoy` (YYYY-MM-DD) para los próximos `n` días. */
export function ocupacion(eventos, hoy, n) {
  const finVentana = new Date(Date.parse(hoy + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
  let reservadas = 0, bloqueadas = 0
  for (const e of eventos) {
    const a = e.inicio > hoy ? e.inicio : hoy, b = e.fin < finVentana ? e.fin : finVentana
    const d = Math.max(dias(a, b), 0)
    if (e.tipo === 'reserva') reservadas += d; else bloqueadas += d
  }
  const disponibles = Math.max(n - reservadas - bloqueadas, 0)
  return { dias: n, reservadas, bloqueadas, disponibles, porcentaje: Math.round((reservadas * 100) / n) }
}

/** Solo se aceptan calendarios de las plataformas conocidas (evita usar la demo para pedir cualquier URL). */
export function urlCalendarioPermitida(u) {
  let url
  try { url = new URL(String(u || '').trim()) } catch { return false }
  if (url.protocol !== 'https:') return false
  const h = url.hostname.toLowerCase()
  return ['airbnb.com', 'airbnb.com.pe', 'airbnb.es', 'airbnb.mx', 'booking.com', 'vrbo.com', 'homeaway.com']
    .some(d => h === d || h.endsWith('.' + d))
}
