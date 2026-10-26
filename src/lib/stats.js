import { all, get, getSetting } from '../db/database'
import { todayISO } from './format'

export function weightedAverage(items) {
  const valid = items.filter(
    (item) =>
      item.value !== null &&
      item.value !== undefined &&
      item.value !== '' &&
      Number.isFinite(Number(item.value)) &&
      Number(item.weight) > 0,
  )
  if (valid.length === 0) return null
  const totalWeight = valid.reduce((sum, item) => sum + Number(item.weight), 0)
  if (totalWeight <= 0) return null
  const weighted = valid.reduce(
    (sum, item) => sum + Number(item.value) * Number(item.weight),
    0,
  )
  return weighted / totalWeight
}

export function yearlyAverage(values) {
  const valid = values.filter(
    (value) => value !== null && value !== undefined && Number.isFinite(Number(value)),
  )
  if (valid.length === 0) return null
  return valid.reduce((sum, value) => sum + Number(value), 0) / valid.length
}

export function getAssignmentDetail(assignmentId) {
  if (!assignmentId) return null
  return get(
    `SELECT a.*, c.name AS course_name, c.division, c.school_id,
            sh.name AS school_name,
            sub.name AS subject_name, sub.color AS subject_color
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     JOIN schools sh ON sh.id = c.school_id
     JOIN subjects sub ON sub.id = a.subject_id
     WHERE a.id = ?`,
    [assignmentId],
  )
}

export function getAssignmentStudents(assignmentId) {
  return all(
    `SELECT st.*
     FROM students st
     JOIN assignments a
       ON a.course_id = st.course_id
      AND a.school_year = st.school_year
     WHERE a.id = ? AND st.active = 1
     ORDER BY st.last_name COLLATE NOCASE, st.first_name COLLATE NOCASE`,
    [assignmentId],
  )
}

export function getAssignmentPeriods(assignmentId) {
  return all(
    'SELECT * FROM periods WHERE assignment_id = ? ORDER BY position, id',
    [assignmentId],
  )
}

export function getPeriodScores(periodId) {
  const rows = all(
    `SELECT student_id, value, weight FROM (
       SELECT g.student_id AS student_id, g.value AS value, a.weight AS weight
       FROM grades g
       JOIN activities a ON a.id = g.activity_id
       WHERE a.period_id = ? AND g.value IS NOT NULL AND a.weight > 0
       UNION ALL
       SELECT e.student_id AS student_id, e.grade AS value, e.weight AS weight
       FROM evaluations e
       WHERE e.period_id = ? AND e.grade IS NOT NULL AND e.weight > 0
     )`,
    [periodId, periodId],
  )

  const totals = new Map()
  for (const row of rows) {
    const current = totals.get(row.student_id) ?? { sum: 0, weight: 0 }
    current.sum += Number(row.value) * Number(row.weight)
    current.weight += Number(row.weight)
    totals.set(row.student_id, current)
  }

  const scores = new Map()
  for (const [studentId, total] of totals) {
    if (total.weight > 0) scores.set(studentId, total.sum / total.weight)
  }
  return scores
}

export function getYearResults(assignmentId, assignmentInput = null) {
  const assignment = assignmentInput ?? getAssignmentDetail(assignmentId)
  if (!assignment) {
    return { assignment: null, periods: [], rows: [] }
  }

  const periods = getAssignmentPeriods(assignmentId)
  const periodScores = periods.map((period) => ({
    ...period,
    scores: getPeriodScores(period.id),
  }))
  const students = getAssignmentStudents(assignmentId)

  const rows = students.map((student) => {
    const periodFinals = periodScores.map(
      (period) => period.scores.get(student.id) ?? null,
    )
    const final = yearlyAverage(periodFinals)
    return {
      student,
      periodFinals,
      final,
      approved: final !== null && final >= Number(assignment.passing_grade),
      hasData: final !== null,
    }
  })

  return { assignment, periods: periodScores, rows }
}

export function getAssignmentStats(assignmentId) {
  const assignment = getAssignmentDetail(assignmentId)
  if (!assignment) return null

  const { periods, rows } = getYearResults(assignmentId, assignment)
  const passing = Number(assignment.passing_grade)

  const periodAverages = periods.map((period, index) => {
    const values = rows
      .map((row) => row.periodFinals[index])
      .filter((value) => value !== null)
    return {
      id: period.id,
      name: period.name,
      position: period.position,
      average: values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null,
      gradedStudents: values.length,
    }
  })

  const yearValues = rows
    .map((row) => row.final)
    .filter((value) => value !== null)
  const yearAverage = yearValues.length
    ? yearValues.reduce((sum, value) => sum + value, 0) / yearValues.length
    : null

  const approved = rows.filter((row) => row.hasData && row.final >= passing).length
  const failed = rows.filter((row) => row.hasData && row.final < passing).length
  const withoutData = rows.filter((row) => !row.hasData).length

  const distribution = [
    { label: '1 a 3,9', min: 1, max: 4, tone: 'danger' },
    { label: '4 a 5,9', min: 4, max: 6, tone: 'warning' },
    { label: '6 a 7,9', min: 6, max: 8, tone: 'info' },
    { label: '8 a 8,9', min: 8, max: 9, tone: 'success' },
    { label: '9 a 10', min: 9, max: 10.01, tone: 'success' },
  ].map((bin) => ({
    ...bin,
    count: rows.filter(
      (row) =>
        row.hasData && row.final >= bin.min && row.final < bin.max,
    ).length,
  }))

  const ranking = [...rows].sort((a, b) => {
    if (a.final === null && b.final === null) return 0
    if (a.final === null) return 1
    if (b.final === null) return -1
    return b.final - a.final
  })

  const activityStats = get(
    `SELECT COUNT(*) AS activities,
            (SELECT COUNT(*) FROM grades g
             JOIN activities a2 ON a2.id = g.activity_id
             JOIN periods p2 ON p2.id = a2.period_id
             WHERE p2.assignment_id = ? AND g.value IS NOT NULL) AS filled_grades
     FROM activities a
     JOIN periods p ON p.id = a.period_id
     WHERE p.assignment_id = ?`,
    [assignmentId, assignmentId],
  )

  const totalGrades = rows.length * Number(activityStats?.activities ?? 0)
  const filledGrades = Number(activityStats?.filled_grades ?? 0)
  const completion = totalGrades > 0 ? (filledGrades / totalGrades) * 100 : 0

  return {
    assignment,
    periods,
    rows,
    ranking,
    periodAverages,
    yearAverage,
    approved,
    failed,
    withoutData,
    distribution,
    passing,
    activityCount: Number(activityStats?.activities ?? 0),
    filledGrades,
    completion,
  }
}

export function getOverallStats() {
  return (
    get(
      `SELECT
        (SELECT COUNT(*) FROM schools) AS schools,
        (SELECT COUNT(*) FROM subjects) AS subjects,
        (SELECT COUNT(*) FROM courses) AS courses,
        (SELECT COUNT(*) FROM students WHERE active = 1) AS students,
        (SELECT COUNT(*) FROM assignments) AS assignments,
        (SELECT COUNT(*) FROM topics) AS topics,
        (SELECT COUNT(*) FROM plans) AS plans`,
    ) ?? {
      schools: 0,
      subjects: 0,
      courses: 0,
      students: 0,
      assignments: 0,
      topics: 0,
      plans: 0,
    }
  )
}

export function getWeeklySchedule(schoolYear = null) {
  const params = []
  let where = ''
  if (schoolYear) {
    where = 'WHERE a.school_year = ?'
    params.push(schoolYear)
  }

  return all(
    `SELECT sl.*, a.id AS assignment_id, a.school_year,
            c.name AS course_name, c.division,
            sh.name AS school_name,
            sub.name AS subject_name, sub.color AS subject_color
     FROM schedule_slots sl
     JOIN assignments a ON a.id = sl.assignment_id
     JOIN courses c ON c.id = a.course_id
     JOIN schools sh ON sh.id = c.school_id
     JOIN subjects sub ON sub.id = a.subject_id
     ${where}
     ORDER BY sl.weekday, sl.start_time, sh.name, c.name`,
    params,
  )
}

export function getUpcomingPlans(assignmentId, limit = 5) {
  return all(
    `SELECT pl.*, t.title AS topic_title
     FROM plans pl
     LEFT JOIN topics t ON t.id = pl.topic_id
     WHERE pl.assignment_id = ? AND pl.date >= ?
     ORDER BY pl.date, pl.start_time
     LIMIT ?`,
    [assignmentId, todayISO(), limit],
  )
}

export function getDefaultSchoolYear() {
  return Number(getSetting('default_school_year', String(new Date().getFullYear())))
}

export function getDefaultPassingGrade() {
  return Number(getSetting('default_passing_grade', '6'))
}
