const FIXED_HOLIDAYS = [
  [1, 1, 'Año Nuevo'],
  [3, 24, 'Día Nacional de la Memoria por la Verdad y la Justicia'],
  [4, 2, 'Día del Veterano y de los Caídos en la Guerra de Malvinas'],
  [5, 1, 'Día del Trabajo'],
  [5, 25, 'Día de la Revolución de Mayo'],
  [6, 20, 'Paso a la Inmortalidad del General Manuel Belgrano'],
  [7, 9, 'Día de la Independencia'],
  [12, 8, 'Inmaculada Concepción de María'],
  [12, 25, 'Navidad'],
]

const TRANSFERABLE_HOLIDAYS = [
  [6, 17, 'Paso a la Inmortalidad del General Martín Miguel de Güemes'],
  [8, 17, 'Paso a la Inmortalidad del General José de San Martín'],
  [10, 12, 'Día del Respeto a la Diversidad Cultural'],
  [11, 20, 'Día de la Soberanía Nacional'],
]

function moveDays(date, days) {
  return new Date(date.getTime() + days * 86400000)
}

function easterSunday(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function transferableDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay()
  if (weekday === 2) return moveDays(date, -1)
  if (weekday === 3) return moveDays(date, -2)
  if (weekday === 4) return moveDays(date, 4)
  if (weekday === 5) return moveDays(date, 3)
  return date
}

export function getNationalHolidays(year) {
  const targetYear = Number(year)
  if (!Number.isInteger(targetYear) || targetYear < 1) return []
  const holidays = new Map()

  function add(date, name) {
    const iso = date.toISOString().slice(0, 10)
    const current = holidays.get(iso)
    if (current) {
      current.names.push(name)
    } else {
      holidays.set(iso, { date: iso, names: [name] })
    }
  }

  for (const [month, day, name] of FIXED_HOLIDAYS) {
    add(new Date(Date.UTC(targetYear, month - 1, day)), name)
  }

  const easter = easterSunday(targetYear)
  add(moveDays(easter, -48), 'Lunes de Carnaval')
  add(moveDays(easter, -47), 'Martes de Carnaval')
  add(moveDays(easter, -2), 'Viernes Santo')

  for (const [month, day, name] of TRANSFERABLE_HOLIDAYS) {
    add(transferableDate(targetYear, month, day), name)
  }

  return [...holidays.values()]
    .map((holiday) => ({
      date: holiday.date,
      name: holiday.names.join(' / '),
      scope: 'nacional',
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
