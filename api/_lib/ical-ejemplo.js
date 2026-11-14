// Calendario FICTICIO con el formato que exporta Airbnb, para probar la demo sin enlace propio.
// Las fechas se arman desde hoy, así el ejemplo siempre muestra reservas futuras.

const f = (base, dias) => new Date(base + dias * 86400000).toISOString().slice(0, 10).replace(/-/g, '')

export function ICAL_EJEMPLO() {
  const hoy = Date.parse(new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10) + 'T00:00:00Z')
  const tramos = [
    [-2, 2, 'Reserved'], [3, 6, 'Reserved'], [8, 10, 'Airbnb (Not available)'], [11, 15, 'Reserved'],
    [18, 20, 'Reserved'], [24, 31, 'Reserved'], [35, 37, 'Reserved'], [40, 43, 'Airbnb (Not available)'],
    [47, 52, 'Reserved'], [60, 63, 'Reserved'], [70, 77, 'Reserved'], [84, 86, 'Reserved'],
  ]
  const ev = tramos.map(([a, b, s], i) => [
    'BEGIN:VEVENT', `DTSTAMP:${f(hoy, 0)}T120000Z`, `DTSTART;VALUE=DATE:${f(hoy, a)}`, `DTEND;VALUE=DATE:${f(hoy, b)}`,
    `SUMMARY:${s}`, `UID:demo-${i}@pragma-ti.com`, 'END:VEVENT',
  ].join('\r\n'))
  return ['BEGIN:VCALENDAR', 'PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN', 'VERSION:2.0', ...ev, 'END:VCALENDAR'].join('\r\n')
}
