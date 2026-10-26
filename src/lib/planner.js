import { getNationalHolidays } from './holidays.js'

function parseISO(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(Date.UTC(year, month - 1, day))
}

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

export function addDaysISO(value, days) {
  const date = parseISO(value)
  if (!date) return ''
  return isoDate(new Date(date.getTime() + days * 86400000))
}

export function eachDateISO(startDate, endDate) {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  if (!start || !end || start > end) return []
  const dates = []
  let current = start
  while (current <= end) {
    dates.push(isoDate(current))
    current = new Date(current.getTime() + 86400000)
  }
  return dates
}

export function weekdayNumber(dateISO) {
  const date = parseISO(dateISO)
  if (!date) return 0
  const weekday = date.getUTCDay()
  return weekday === 0 ? 7 : weekday
}

export function resolveAcademicRange(assignment) {
  const year = Number(assignment?.school_year) || new Date().getFullYear()
  return {
    startDate: assignment?.start_date || `${year}-03-01`,
    endDate: assignment?.end_date || `${year}-12-20`,
  }
}

export function buildAutoPlan({
  topics = [],
  slots = [],
  startDate,
  endDate,
  exceptions = [],
  existingPlans = [],
  fillRemaining = true,
}) {
  const sortedTopics = [...topics].sort(
    (a, b) => Number(a.position) - Number(b.position) || Number(a.id) - Number(b.id),
  )
  const sortedSlots = [...slots].sort(
    (a, b) => Number(a.weekday) - Number(b.weekday) ||
      String(a.start_time).localeCompare(String(b.start_time)) ||
      Number(a.id) - Number(b.id),
  )

  const sessions = []
  for (const topic of sortedTopics) {
    const count = Math.max(1, Number(topic.class_count) || 1)
    for (let index = 0; index < count; index += 1) {
      sessions.push({ topic, index, total: count })
    }
  }

  const holidayMap = new Map()
  const startYear = Number(String(startDate).slice(0, 4))
  const endYear = Number(String(endDate).slice(0, 4))
  if (Number.isInteger(startYear) && Number.isInteger(endYear)) {
    for (let year = startYear; year <= endYear; year += 1) {
      for (const holiday of getNationalHolidays(year)) {
        holidayMap.set(holiday.date, holiday)
      }
    }
  }

  const exceptionMap = new Map(
    exceptions.map((exception) => [exception.date, exception.name]),
  )
  const manualKeys = new Set(
    existingPlans
      .filter((plan) => plan.source !== 'automatica')
      .map((plan) => `${plan.date}|${plan.start_time}`),
  )

  const plans = []
  const skipped = []
  const coveredTopics = new Set()
  let sessionIndex = 0
  let reviewCount = 0
  let manualSkipped = 0
  let exhausted = false

  const dates = eachDateISO(startDate, endDate)
  for (const date of dates) {
    const weekday = weekdayNumber(date)
    const daySlots = sortedSlots.filter(
      (slot) => Number(slot.weekday) === weekday,
    )
    if (daySlots.length === 0) continue

    const holiday = holidayMap.get(date)
    const exceptionName = exceptionMap.get(date)
    if (holiday || exceptionName) {
      skipped.push({
        date,
        name: holiday?.name || exceptionName,
        scope: holiday ? 'nacional' : 'personalizado',
      })
      continue
    }

    for (const slot of daySlots) {
      const key = `${date}|${slot.start_time}`
      if (manualKeys.has(key)) {
        manualSkipped += 1
        continue
      }

      const session = sessions[sessionIndex] ?? null
      if (!session && !fillRemaining) {
        exhausted = true
        break
      }

      if (session) {
        coveredTopics.add(session.topic.id)
        sessionIndex += 1
      } else {
        reviewCount += 1
      }

      plans.push({
        topic_id: session?.topic.id ?? null,
        date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        title: session?.topic.title ?? 'Repaso y cierre',
        description: '',
        status: 'pendiente',
        source: 'automatica',
      })
    }

    if (exhausted) break
  }

  const uncoveredTopics = sortedTopics.filter(
    (topic) => !coveredTopics.has(topic.id),
  )

  return {
    plans,
    skipped,
    range: { startDate, endDate },
    stats: {
      sessionCount: sessions.length,
      plannedTopicSessions: plans.filter((plan) => plan.topic_id).length,
      classDays: new Set(plans.map((plan) => plan.date)).size,
      totalTopics: sortedTopics.length,
      coveredTopics: coveredTopics.size,
      uncoveredTopics,
      reviewCount,
      skippedCount: skipped.length,
      manualSkipped,
    },
  }
}
