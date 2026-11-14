// node --test pruebas/
import test from 'node:test'
import assert from 'node:assert/strict'
import { enmascararNombre, tipoDocumento, rucValido, leerIcal, ocupacion, urlCalendarioPermitida } from '../api/_lib/puros.js'

test('enmascara todo menos el primer nombre', () => {
  assert.equal(enmascararNombre('JUAN CARLOS', 'PEREZ', 'GOMEZ'), 'JUAN C***** P**** G****')
  assert.equal(enmascararNombre('ANA', 'LI', ''), 'ANA L***')
})

test('reconoce DNI, RUC y CE', () => {
  assert.equal(tipoDocumento('12345678'), 'DNI')
  assert.equal(tipoDocumento('20100047218'), 'RUC')
  assert.equal(tipoDocumento('001234567'), 'CE')
  assert.equal(tipoDocumento('12-34'), null)
})

test('dígito verificador del RUC', () => {
  assert.equal(rucValido('20100047218'), true)   // BCP
  assert.equal(rucValido('20100047219'), false)
})

const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261123', 'SUMMARY:Reserved',
  'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABC\\nPhone Number (Last 4 Dig',
  ' its): 1234', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261203', 'SUMMARY:Airbnb (Not available)', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261115', 'DTEND;VALUE=DATE:20261117', 'SUMMARY:Reserved', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

test('lee reservas y bloqueos del iCal, ordenados y sin teléfonos', () => {
  const ev = leerIcal(ICS)
  assert.deepEqual(ev, [
    { inicio: '2026-11-15', fin: '2026-11-17', noches: 2, tipo: 'reserva' },
    { inicio: '2026-11-20', fin: '2026-11-23', noches: 3, tipo: 'reserva' },
    { inicio: '2026-12-01', fin: '2026-12-03', noches: 2, tipo: 'bloqueo' },
  ])
  assert.ok(!JSON.stringify(ev).includes('1234'))
})

test('ocupación recorta las reservas a la ventana', () => {
  const ev = leerIcal(ICS)
  assert.deepEqual(ocupacion(ev, '2026-11-16', 30), { dias: 30, reservadas: 4, bloqueadas: 2, disponibles: 24, porcentaje: 13 })
})

test('solo calendarios de plataformas conocidas', () => {
  assert.equal(urlCalendarioPermitida('https://www.airbnb.com/calendar/ical/123.ics?s=abc'), true)
  assert.equal(urlCalendarioPermitida('https://admin.booking.com/hotel/hoteladmin/ical.html?t=x'), true)
  assert.equal(urlCalendarioPermitida('http://www.airbnb.com/x.ics'), false)
  assert.equal(urlCalendarioPermitida('https://airbnb.com.evil.io/x.ics'), false)
  assert.equal(urlCalendarioPermitida('https://169.254.169.254/'), false)
})
