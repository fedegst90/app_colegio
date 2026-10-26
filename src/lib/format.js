export const PERIOD_TYPES = {
  trimestre: {
    value: 'trimestre',
    label: 'Trimestre',
    plural: 'Trimestres',
    count: 3,
  },
  cuatrimestre: {
    value: 'cuatrimestre',
    label: 'Cuatrimestre',
    plural: 'Cuatrimestres',
    count: 2,
  },
  semestre: {
    value: 'semestre',
    label: 'Semestre',
    plural: 'Semestres',
    count: 2,
  },
}

export const PERIOD_TYPE_OPTIONS = Object.values(PERIOD_TYPES)

export const WEEKDAYS = [
  { value: 1, label: 'Lunes', short: 'Lun' },
  { value: 2, label: 'Martes', short: 'Mar' },
  { value: 3, label: 'Miércoles', short: 'Mié' },
  { value: 4, label: 'Jueves', short: 'Jue' },
  { value: 5, label: 'Viernes', short: 'Vie' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
  { value: 7, label: 'Domingo', short: 'Dom' },
]

export function periodTypeMeta(type) {
  return PERIOD_TYPES[type] ?? PERIOD_TYPES.trimestre
}

export function periodNames(type) {
  const meta = periodTypeMeta(type)
  return Array.from(
    { length: meta.count },
    (_, index) => `${index + 1}° ${meta.label}`,
  )
}

export function formatGrade(value) {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return number.toFixed(2)
}

export function gradeTone(value, passingGrade = 6) {
  if (value === null || value === undefined || value === '') return 'empty'
  const number = Number(value)
  if (!Number.isFinite(number)) return 'empty'
  if (number >= passingGrade + 2) return 'success'
  if (number >= passingGrade) return 'warning'
  return 'danger'
}

export function todayISO() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function formatDate(value, options = {}) {
  if (!value) return 'Sin fecha'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  })
}

export function formatLongDate(value) {
  if (!value) return 'Sin fecha'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function weekdayLabel(weekday) {
  return WEEKDAYS.find((day) => Number(day.value) === Number(weekday))?.label ?? ''
}

export function weekdayShort(weekday) {
  return WEEKDAYS.find((day) => Number(day.value) === Number(weekday))?.short ?? ''
}

export function formatTimeRange(start, end) {
  if (!start && !end) return ''
  if (!end) return start
  if (!start) return end
  return `${start} – ${end}`
}

export function initials(firstName = '', lastName = '') {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?'
}

export function studentFullName(student) {
  if (!student) return ''
  return `${student.last_name}, ${student.first_name}`
}

export function parseStudentLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (trimmed.includes(',')) {
    const [lastName, ...rest] = trimmed.split(',')
    return {
      lastName: lastName.trim(),
      firstName: rest.join(',').trim(),
    }
  }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { lastName: parts[0], firstName: '' }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.at(-1),
  }
}

export function downloadFile(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  if (/[";\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`
  return text
}

export function buildCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(';')).join('\r\n')
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}
