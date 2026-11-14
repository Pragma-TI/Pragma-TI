// Edificio FICTICIO para la demo «Pregúntale a tus datos». Se genera igual en cada arranque
// (semilla fija) para que las respuestas sean reproducibles.

function azar(semilla) {
  let s = semilla >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

const MESES = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']
const NOMBRE_MES = { '2026-06': 'junio', '2026-07': 'julio', '2026-08': 'agosto', '2026-09': 'septiembre', '2026-10': 'octubre', '2026-11': 'noviembre' }

function construir() {
  const r = azar(20261114)
  const dptos = []
  for (let piso = 1; piso <= 6; piso++) for (let n = 1; n <= 4; n++) {
    const area = [68, 82, 95, 120][n - 1] + (piso === 6 ? 25 : 0)
    dptos.push({ dpto: `${piso}0${n}`, area, cuota: Math.round(area * 3.2) })
  }
  // Algunos departamentos pagan tarde o dejan de pagar: así hay morosos que encontrar.
  const perfil = d => ({ '203': 'moroso', '402': 'moroso', '504': 'tarde', '101': 'tarde', '304': 'dejo' }[d] || 'puntual')

  const pagos = []
  for (const d of dptos) MESES.forEach((m, i) => {
    const p = perfil(d.dpto)
    let paga = true, dia = 3 + Math.floor(r() * 10)
    if (p === 'moroso') paga = i < 2
    if (p === 'dejo') paga = i < 4
    if (p === 'tarde') dia = 18 + Math.floor(r() * 10)
    if (m === '2026-11' && r() < 0.35) paga = false            // el mes en curso aún no está completo
    if (paga) pagos.push([d.dpto, m, `${m}-${String(Math.min(dia, 28)).padStart(2, '0')}`, d.cuota])
  })

  const gastos = []
  MESES.forEach((m, i) => {
    gastos.push([m, 'Vigilancia (2 turnos)', 7800])
    gastos.push([m, 'Limpieza de áreas comunes', 2600])
    gastos.push([m, 'Luz de áreas comunes', Math.round(980 + r() * 260)])
    gastos.push([m, 'Agua de áreas comunes', Math.round(410 + r() * 120)])
    gastos.push([m, 'Mantenimiento de ascensores', 950])
    gastos.push([m, 'Administración', 1500])
    if (i % 2 === 0) gastos.push([m, 'Jardinería', 600])
    if (m === '2026-08') gastos.push([m, 'Reparación de bomba de agua', 3450])
    if (m === '2026-10') gastos.push([m, 'Pintura de fachada (1.ª cuota)', 6200])
  })

  const reservas = [
    ['2026-07-12', '403', 'Salón de usos múltiples', 150], ['2026-08-23', '102', 'Parrilla', 80],
    ['2026-09-06', '601', 'Salón de usos múltiples', 150], ['2026-10-18', '304', 'Parrilla', 80],
    ['2026-10-31', '202', 'Salón de usos múltiples', 150], ['2026-11-08', '502', 'Parrilla', 80],
  ]

  const t = []
  t.push('# Edificio «Residencial Las Brisas» (DATOS FICTICIOS DE DEMOSTRACIÓN), Lima. 24 departamentos, 6 pisos.')
  t.push(`# Periodo: junio a noviembre de 2026 (noviembre está en curso). Cuota de mantenimiento mensual = área × S/ 3.20.`)
  t.push('# Un departamento es moroso si debe 2 o más cuotas.')
  t.push('\n## Departamentos (dpto,area_m2,cuota_mensual_S/)')
  for (const d of dptos) t.push(`${d.dpto},${d.area},${d.cuota}`)
  t.push('\n## Pagos de cuota (dpto,mes,fecha_pago,monto_S/)')
  for (const p of pagos) t.push(p.join(','))
  t.push('\n## Gastos (mes,concepto,monto_S/)')
  for (const g of gastos) t.push(g.join(','))
  t.push('\n## Reservas de áreas comunes (fecha,dpto,area,monto_S/)')
  for (const x of reservas) t.push(x.join(','))
  t.push(`\n# Meses: ${MESES.map(m => `${m} = ${NOMBRE_MES[m]}`).join('; ')}`)
  return t.join('\n')
}

export const DATOS_EDIFICIO = construir()
