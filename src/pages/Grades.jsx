import { useMemo, useState } from 'react'
import { useData } from '../context/data-context'
import { useSqlQuery } from '../hooks/useSqlQuery'
import { useToast } from '../context/toast-context'
import { Icon } from '../components/Icon'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Tabs,
} from '../components/UI'
import {
  buildCsv,
  downloadFile,
  formatDate,
  formatGrade,
  gradeTone,
  initials,
  studentFullName,
  todayISO,
} from '../lib/format'
import {
  getAssignmentStudents,
  getYearResults,
  weightedAverage,
  yearlyAverage,
} from '../lib/stats'

const EMPTY_ACTIVITY = {
  name: '',
  date: '',
  weight: '1',
  description: '',
}

export default function Grades({ navigate, params = {} }) {
  const { mutate } = useData()
  const toast = useToast()
  const [assignmentId, setAssignmentId] = useState(
    params.assignment ? String(params.assignment) : '',
  )
  const [periodId, setPeriodId] = useState('')
  const [view, setView] = useState('actividades')
  const [activityForm, setActivityForm] = useState(null)
  const [conceptForm, setConceptForm] = useState(null)
  const [groupCount, setGroupCount] = useState('4')
  const [groupMode, setGroupMode] = useState('balanced')
  const [randomSeed, setRandomSeed] = useState(0)

  const assignments = useSqlQuery(
    `SELECT a.*, c.name AS course_name, c.division, c.id AS course_id,
            sh.name AS school_name,
            sub.name AS subject_name, sub.color AS subject_color
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     JOIN schools sh ON sh.id = c.school_id
     JOIN subjects sub ON sub.id = a.subject_id
     ORDER BY a.school_year DESC, sh.name COLLATE NOCASE,
              c.name COLLATE NOCASE, sub.name COLLATE NOCASE`,
  )

  const assignment =
    assignments.find((item) => String(item.id) === String(assignmentId)) ??
    assignments[0]

  const periods = useSqlQuery(
    'SELECT * FROM periods WHERE assignment_id = ? ORDER BY position, id',
    [assignment?.id ?? 0],
  )

  const countRows = useSqlQuery(
    `SELECT p.id, COUNT(a.id) AS activity_count
     FROM periods p
     LEFT JOIN activities a ON a.period_id = p.id
     WHERE p.assignment_id = ?
     GROUP BY p.id`,
    [assignment?.id ?? 0],
  )

  const counts = useMemo(
    () => new Map(countRows.map((row) => [row.id, row.activity_count])),
    [countRows],
  )

  const period =
    periods.find((item) => String(item.id) === String(periodId)) ?? periods[0]

  const students = useMemo(
    () => (assignment ? getAssignmentStudents(assignment.id) : []),
    [assignment],
  )

  const activities = useSqlQuery(
    'SELECT * FROM activities WHERE period_id = ? ORDER BY date, id',
    [period?.id ?? 0],
  )

  const gradeRows = useSqlQuery(
    `SELECT g.*
     FROM grades g
     JOIN activities a ON a.id = g.activity_id
     WHERE a.period_id = ?`,
    [period?.id ?? 0],
  )

  const evaluations = useSqlQuery(
    'SELECT * FROM evaluations WHERE period_id = ?',
    [period?.id ?? 0],
  )

  const gradeMap = useMemo(
    () =>
      new Map(
        gradeRows.map((grade) => [
          `${grade.activity_id}:${grade.student_id}`,
          grade.value,
        ]),
      ),
    [gradeRows],
  )

  const evaluationByStudent = useMemo(
    () =>
      new Map(evaluations.map((evaluation) => [evaluation.student_id, evaluation])),
    [evaluations],
  )

  const scores = useMemo(() => {
    const map = new Map()
    for (const student of students) {
      const evaluation = evaluationByStudent.get(student.id)
      const items = activities.map((activity) => ({
        value: gradeMap.get(`${activity.id}:${student.id}`) ?? null,
        weight: activity.weight,
      }))
      if (evaluation) {
        items.push({ value: evaluation.grade, weight: evaluation.weight })
      }
      map.set(student.id, weightedAverage(items))
    }
    return map
  }, [students, activities, gradeMap, evaluationByStudent])

  const periodAverage = yearlyAverage([...scores.values()])

  const yearResults = useMemo(
    () => (assignment ? getYearResults(assignment.id, assignment) : null),
    [assignment],
  )

  const groupStudents = useMemo(
    () =>
      students.map((student) => {
        const periodScore = scores.get(student.id)
        const annualRow = yearResults?.rows?.find(
          (row) => row.student.id === student.id,
        )
        const score = periodScore ?? annualRow?.final ?? null
        return { ...student, score }
      }),
    [students, scores, yearResults],
  )

  const generatedGroups = useMemo(() => {
    const count = Math.max(
      1,
      Math.min(Number(groupCount) || 1, groupStudents.length || 1),
    )
    if (groupStudents.length === 0) return []
    const list = [...groupStudents]
    if (groupMode === 'random') {
      const arr = [...list]
      let seed = randomSeed + 1
      const rand = () => {
        seed = (seed * 9301 + 49297) % 233280
        return seed / 233280
      }
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      const groups = Array.from({ length: count }, () => [])
      arr.forEach((student, index) => {
        groups[index % count].push(student)
      })
      return groups.map((group) => ({
        students: group,
        average:
          group.filter((student) => student.score !== null).length > 0
            ? group
                .filter((student) => student.score !== null)
                .reduce((sum, student) => sum + Number(student.score), 0) /
              group.filter((student) => student.score !== null).length
            : null,
      }))
    }

    const withScore = list
      .filter((student) => student.score !== null)
      .sort((a, b) => Number(b.score) - Number(a.score))
    const withoutScore = list.filter((student) => student.score === null)
    const groups = Array.from({ length: count }, () => [])
    withScore.slice(0, count).forEach((student, index) => {
      groups[index].push(student)
    })
    const rest = [...withScore.slice(count), ...withoutScore]
    for (const student of rest) {
      let target = 0
      let bestKey = null
      groups.forEach((group, index) => {
        const groupCountMembers = group.length
        const groupSum = group.reduce(
          (sum, item) => sum + Number(item.score || 0),
          0,
        )
        const key = groupCountMembers * 1000 + groupSum
        if (bestKey === null || key < bestKey) {
          bestKey = key
          target = index
        }
      })
      groups[target].push(student)
    }
    return groups.map((group) => ({
      students: group,
      average:
        group.filter((student) => student.score !== null).length > 0
          ? group
              .filter((student) => student.score !== null)
              .reduce((sum, student) => sum + Number(student.score), 0) /
            group.filter((student) => student.score !== null).length
          : null,
    }))
  }, [groupStudents, groupCount, groupMode, randomSeed])

  function changeAssignment(value) {
    setAssignmentId(value)
    setPeriodId('')
  }

  function saveGrade(activityId, studentId, value) {
    if (value === null) {
      mutate(
        'DELETE FROM grades WHERE activity_id = ? AND student_id = ?',
        [activityId, studentId],
      )
      return true
    }
    if (!Number.isFinite(value) || value < 1 || value > 10) {
      toast('La nota debe estar entre 1 y 10.', 'error')
      return false
    }
    mutate(
      `INSERT INTO grades (activity_id, student_id, value)
       VALUES (?, ?, ?)
       ON CONFLICT(activity_id, student_id)
       DO UPDATE SET value = excluded.value`,
      [activityId, studentId, value],
    )
    return true
  }

  function openNewActivity() {
    if (!period) {
      toast('Seleccioná un período.', 'error')
      return
    }
    setActivityForm({ ...EMPTY_ACTIVITY, date: todayISO() })
  }

  function saveActivity(event) {
    event.preventDefault()
    const name = activityForm.name.trim()
    if (!name) {
      toast('El nombre de la actividad es obligatorio.', 'error')
      return
    }
    const weight = Number(activityForm.weight)
    if (!Number.isFinite(weight) || weight <= 0) {
      toast('El peso debe ser mayor que cero.', 'error')
      return
    }
    if (activityForm.id) {
      mutate(
        `UPDATE activities
         SET name = ?, date = ?, weight = ?, description = ?
         WHERE id = ?`,
        [
          name,
          activityForm.date,
          weight,
          activityForm.description.trim(),
          activityForm.id,
        ],
      )
      toast('Actividad actualizada.')
    } else {
      mutate(
        `INSERT INTO activities (period_id, name, date, weight, description)
         VALUES (?, ?, ?, ?, ?)`,
        [period.id, name, activityForm.date, weight, activityForm.description.trim()],
      )
      toast('Actividad agregada.')
    }
    setActivityForm(null)
  }

  function deleteActivity(activity) {
    const confirmed = window.confirm(
      `¿Eliminar la actividad "${activity.name}"? Se borrarán las notas cargadas para esta actividad.`,
    )
    if (!confirmed) return
    mutate('DELETE FROM activities WHERE id = ?', [activity.id])
    toast('Actividad eliminada.')
  }

  function openConcept(student) {
    const evaluation = evaluationByStudent.get(student.id)
    setConceptForm({
      student,
      concept: evaluation?.concept ?? '',
      grade: evaluation?.grade ?? '',
      weight: evaluation?.weight ?? 1,
      exists: Boolean(evaluation),
    })
  }

  function saveConcept(event) {
    event.preventDefault()
    const gradeText = String(conceptForm.grade).trim()
    const grade = gradeText === '' ? null : Number(gradeText.replace(',', '.'))
    if (
      grade !== null &&
      (!Number.isFinite(grade) || grade < 1 || grade > 10)
    ) {
      toast('La nota conceptual debe estar entre 1 y 10.', 'error')
      return
    }
    const weight = Number(conceptForm.weight)
    if (!Number.isFinite(weight) || weight <= 0) {
      toast('El peso debe ser mayor que cero.', 'error')
      return
    }
    const concept = conceptForm.concept.trim()
    if (!concept && grade === null) {
      mutate('DELETE FROM evaluations WHERE period_id = ? AND student_id = ?', [
        period.id,
        conceptForm.student.id,
      ])
    } else {
      mutate(
        `INSERT INTO evaluations (period_id, student_id, concept, grade, weight)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(period_id, student_id)
         DO UPDATE SET concept = excluded.concept,
                       grade = excluded.grade,
                       weight = excluded.weight`,
        [period.id, conceptForm.student.id, concept, grade, weight],
      )
    }
    setConceptForm(null)
    toast('Concepto guardado.')
  }

  function deleteConcept() {
    mutate('DELETE FROM evaluations WHERE period_id = ? AND student_id = ?', [
      period.id,
      conceptForm.student.id,
    ])
    setConceptForm(null)
    toast('Concepto eliminado.')
  }

  function exportCsv() {
    if (!assignment) return
    const baseName = safeName(
      `${assignment.subject_name}-${assignment.course_name}-${
        view === 'anual' ? 'anual' : period?.name ?? 'periodo'
      }`,
    )

    if (view === 'anual' && yearResults) {
      const header = [
        'Alumno',
        ...yearResults.periods.map((item) => item.name),
        'Nota final anual',
        'Estado',
      ]
      const rows = yearResults.rows.map((row) => [
        studentFullName(row.student),
        ...row.periodFinals.map((value) => csvGrade(value)),
        csvGrade(row.final),
        row.final === null
          ? 'Sin datos'
          : row.final >= Number(assignment.passing_grade)
            ? 'Aprobado'
            : 'Desaprobado',
      ])
      downloadFile(
        `${baseName}.csv`,
        `\uFEFF${buildCsv([header, ...rows])}`,
        'text/csv;charset=utf-8',
      )
      toast('Resumen anual exportado.')
      return
    }

    const header = [
      'Alumno',
      ...activities.map((activity) => activity.name),
      'Concepto',
      'Nota conceptual',
      'Nota final del período',
    ]
    const rows = students.map((student) => {
      const evaluation = evaluationByStudent.get(student.id)
      return [
        studentFullName(student),
        ...activities.map((activity) =>
          csvGrade(gradeMap.get(`${activity.id}:${student.id}`)),
        ),
        evaluation?.concept ?? '',
        csvGrade(evaluation?.grade),
        csvGrade(scores.get(student.id)),
      ]
    })
    downloadFile(
      `${baseName}.csv`,
      `\uFEFF${buildCsv([header, ...rows])}`,
      'text/csv;charset=utf-8',
    )
    toast('Notas del período exportadas.')
  }

  if (assignments.length === 0) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="Notas"
          title="Actividades y calificaciones"
          description="Primero creá una cátedra para cargar actividades y alumnos."
        />
        <Card>
          <EmptyState
            icon="clipboard"
            title="Todavía no hay cátedras"
            description="Una cátedra asocia un curso, una materia y un régimen de períodos."
            action={
              <button
                type="button"
                className="btn primary"
                onClick={() => navigate('catedras')}
              >
                Ir a Cátedras
              </button>
            }
          />
        </Card>
      </div>
    )
  }

  const conceptNote =
    'La nota conceptual se promedia junto con las actividades del período según el peso indicado.'

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Notas"
        title="Actividades y calificaciones"
        description="Cargá actividades con notas del 1 al 10. La nota final del período se calcula automáticamente."
        actions={
          <>
            <button type="button" className="btn" onClick={exportCsv}>
              <Icon name="download" size={16} /> Exportar CSV
            </button>
            {view === 'actividades' ? (
              <button
                type="button"
                className="btn primary"
                onClick={openNewActivity}
              >
                <Icon name="plus" size={17} /> Nueva actividad
              </button>
            ) : null}
          </>
        }
      />

      <Card className="filter-card">
        <div className="filter-row">
          <Field label="Cátedra" className="grow">
            <select
              className="input"
              value={assignment.id}
              onChange={(event) => changeAssignment(event.target.value)}
            >
              {assignments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.school_name} · {item.course_name} · {item.subject_name} ·{' '}
                  {item.school_year}
                </option>
              ))}
            </select>
          </Field>
          <div className="filter-summary">
            <span className="subject-dot" style={{ color: assignment.subject_color }}>
              <Icon name="book" size={18} />
            </span>
            <div>
              <strong>{assignment.subject_name}</strong>
              <small>
                {assignment.course_name} · {assignment.school_name}
              </small>
            </div>
          </div>
        </div>
        <div className="grade-legend">
          <Badge tone="success">Nota alta</Badge>
          <Badge tone="warning">Aprobado</Badge>
          <Badge tone="danger">Desaprobado</Badge>
          <span className="muted small">
            Aprueba con {Number(assignment.passing_grade)} · {conceptNote}
          </span>
        </div>
      </Card>

      <Tabs
        items={[
          { value: 'actividades', label: 'Actividades del período' },
          { value: 'anual', label: 'Resumen anual' },
          { value: 'grupos', label: 'Grupos' },
        ]}
        value={view}
        onChange={setView}
      />

      {view === 'actividades' ? (
        <>
          <div className="period-toolbar">
            <Tabs
              items={periods.map((item) => ({
                value: String(item.id),
                label: item.name,
                count: counts.get(item.id) ?? 0,
              }))}
              value={period ? String(period.id) : ''}
              onChange={setPeriodId}
            />
            <div className="period-average">
              <span>Promedio del período</span>
              <strong className={`tone-${gradeTone(periodAverage, Number(assignment.passing_grade))}`}>
                {formatGrade(periodAverage)}
              </strong>
            </div>
          </div>

          <Card className="grades-card">
            <CardHeader
              title={period ? period.name : 'Período'}
              subtitle={`${students.length} alumnos · ${activities.length} actividades · ${
                period
                  ? 'Las notas se guardan al salir del campo'
                  : 'Seleccioná un período'
              }`}
              actions={
                <button
                  type="button"
                  className="btn primary small"
                  onClick={openNewActivity}
                >
                  <Icon name="plus" size={16} /> Actividad
                </button>
              }
            />

            {students.length === 0 ? (
              <EmptyState
                icon="users"
                title="No hay alumnos en esta cátedra"
                description={`Cargá el listado del curso ${assignment.course_name} para el año ${assignment.school_year}.`}
                action={
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() =>
                      navigate('alumnos', {
                        course: assignment.course_id,
                        year: assignment.school_year,
                      })
                    }
                  >
                    Cargar alumnos
                  </button>
                }
              />
            ) : (
              <div className="table-wrap grades-table-wrap">
                <table className="data-table grades-table">
                  <thead>
                    <tr>
                      <th className="sticky-col">Alumno</th>
                      {activities.map((activity) => (
                        <th key={activity.id} className="activity-col">
                          <div className="activity-th">
                            <strong>{activity.name}</strong>
                            <span>
                              {activity.date ? formatDate(activity.date) : 'Sin fecha'}
                              {Number(activity.weight) !== 1
                                ? ` · peso ${activity.weight}`
                                : ''}
                            </span>
                            <div className="activity-th-actions">
                              <button
                                type="button"
                                className="icon-button tiny"
                                title="Editar actividad"
                                onClick={() =>
                                  setActivityForm({
                                    ...activity,
                                    weight: String(activity.weight),
                                  })
                                }
                              >
                                <Icon name="edit" size={13} />
                              </button>
                              <button
                                type="button"
                                className="icon-button tiny danger"
                                title="Eliminar actividad"
                                onClick={() => deleteActivity(activity)}
                              >
                                <Icon name="trash" size={13} />
                              </button>
                            </div>
                          </div>
                        </th>
                      ))}
                      <th className="concept-col">Concepto</th>
                      <th className="final-col">Final período</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => {
                      const evaluation = evaluationByStudent.get(student.id)
                      const score = scores.get(student.id)
                      return (
                        <tr key={student.id}>
                          <td className="sticky-col">
                            <div className="student-cell compact">
                              <span className="avatar small">
                                {initials(student.first_name, student.last_name)}
                              </span>
                              <strong>{studentFullName(student)}</strong>
                            </div>
                          </td>
                          {activities.map((activity) => (
                            <td key={activity.id} className="grade-cell">
                              <GradeInput
                                key={`${activity.id}-${student.id}-${
                                  gradeMap.get(`${activity.id}:${student.id}`) ?? ''
                                }`}
                                value={gradeMap.get(`${activity.id}:${student.id}`) ?? ''}
                                passing={Number(assignment.passing_grade)}
                                onSave={(value) =>
                                  saveGrade(activity.id, student.id, value)
                                }
                                label={`${studentFullName(student)} · ${activity.name}`}
                              />
                            </td>
                          ))}
                          <td className="concept-col">
                            <button
                              type="button"
                              className={`concept-button ${
                                evaluation ? 'has-concept' : ''
                              }`}
                              onClick={() => openConcept(student)}
                              title={
                                evaluation?.concept ||
                                'Agregar concepto y nota conceptual'
                              }
                            >
                              <Icon name="file" size={15} />
                              <span>
                                {evaluation?.concept
                                  ? truncate(evaluation.concept, 34)
                                  : 'Agregar'}
                              </span>
                              {evaluation?.grade !== null &&
                              evaluation?.grade !== undefined ? (
                                <b
                                  className={`tone-${gradeTone(
                                    evaluation.grade,
                                    Number(assignment.passing_grade),
                                  )}`}
                                >
                                  {formatGrade(evaluation.grade)}
                                </b>
                              ) : null}
                            </button>
                          </td>
                          <td className="final-col">
                            <span
                              className={`grade-pill tone-${gradeTone(
                                score,
                                Number(assignment.passing_grade),
                              )}`}
                            >
                              {formatGrade(score)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="sticky-col">
                        <strong>Promedio del período</strong>
                      </td>
                      {activities.map((activity) => {
                        const values = students
                          .map((student) =>
                            gradeMap.get(`${activity.id}:${student.id}`),
                          )
                          .filter((value) => value !== null && value !== undefined)
                        const average = values.length
                          ? values.reduce((sum, value) => sum + Number(value), 0) /
                            values.length
                          : null
                        return (
                          <td key={activity.id} className="grade-cell">
                            <span className="activity-average">
                              {formatGrade(average)}
                            </span>
                          </td>
                        )
                      })}
                      <td className="concept-col" />
                      <td className="final-col">
                        <span
                          className={`grade-pill tone-${gradeTone(
                            periodAverage,
                            Number(assignment.passing_grade),
                          )}`}
                        >
                          {formatGrade(periodAverage)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {activities.length === 0 && students.length > 0 ? (
              <div className="inline-empty">
                <p>
                  Todavía no hay actividades en {period?.name ?? 'este período'}.
                  Usá el botón "Nueva actividad" para agregar la primera.
                </p>
              </div>
            ) : null}
          </Card>
        </>
      ) : view === 'anual' ? (
        <Card>
          <CardHeader
            title="Resumen anual"
            subtitle="La nota final del año es el promedio de las notas finales de cada período."
            actions={
              <Badge tone="info">
                Aprueba con {Number(assignment.passing_grade)}
              </Badge>
            }
          />
          {yearResults && yearResults.rows.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table annual-table">
                <thead>
                  <tr>
                    <th className="sticky-col">Alumno</th>
                    {yearResults.periods.map((item) => (
                      <th key={item.id}>{item.name}</th>
                    ))}
                    <th>Nota final anual</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {yearResults.rows.map((row) => (
                    <tr key={row.student.id}>
                      <td className="sticky-col">
                        <div className="student-cell compact">
                          <span className="avatar small">
                            {initials(row.student.first_name, row.student.last_name)}
                          </span>
                          <strong>{studentFullName(row.student)}</strong>
                        </div>
                      </td>
                      {row.periodFinals.map((value, index) => (
                        <td key={yearResults.periods[index].id}>
                          <span
                            className={`grade-pill tone-${gradeTone(
                              value,
                              Number(assignment.passing_grade),
                            )}`}
                          >
                            {formatGrade(value)}
                          </span>
                        </td>
                      ))}
                      <td>
                        <span
                          className={`grade-pill large tone-${gradeTone(
                            row.final,
                            Number(assignment.passing_grade),
                          )}`}
                        >
                          {formatGrade(row.final)}
                        </span>
                      </td>
                      <td>
                        {row.final === null ? (
                          <Badge tone="neutral">Sin datos</Badge>
                        ) : row.approved ? (
                          <Badge tone="success">Aprobado</Badge>
                        ) : (
                          <Badge tone="danger">Desaprobado</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon="chart"
              title="Todavía no hay notas para promediar"
              description="Cargá actividades y conceptos en los períodos para ver el resumen anual."
            />
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Grupos de alumnos"
            subtitle="Distribución equilibrada por notas. Cada grupo intenta tener al menos un alumno con buenas calificaciones."
            actions={
              <div className="inline-actions">
                <Field label="Cantidad de grupos">
                  <input
                    className="input input-compact"
                    type="number"
                    min="1"
                    max={Math.max(1, students.length)}
                    value={groupCount}
                    onChange={(event) => setGroupCount(event.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setGroupMode('balanced')
                    setRandomSeed((value) => value + 1)
                  }}
                >
                  Distribuir equilibrado
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    setGroupMode('random')
                    setRandomSeed((value) => value + 1)
                  }}
                >
                  Mezcla aleatoria
                </button>
              </div>
            }
          />
          {groupStudents.length === 0 ? (
            <EmptyState
              icon="users"
              title="No hay alumnos para agrupar"
              description="Cargá alumnos y notas para generar grupos."
            />
          ) : (
            <div className="entity-grid">
              {generatedGroups.map((group, index) => (
                <article className="entity-card" key={index}>
                  <div className="entity-top">
                    <span className="entity-icon">
                      <Icon name="users" size={20} />
                    </span>
                    <Badge tone="info">
                      Promedio {formatGrade(group.average)}
                    </Badge>
                  </div>
                  <h3>Grupo {index + 1}</h3>
                  <p className="muted small">{group.students.length} alumnos</p>
                  <ul className="group-student-list">
                    {group.students.map((student) => (
                      <li key={student.id}>
                        <span>{studentFullName(student)}</span>
                        <b
                          className={`tone-${gradeTone(
                            student.score,
                            Number(assignment.passing_grade),
                          )}`}
                        >
                          {formatGrade(student.score)}
                        </b>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal
        open={Boolean(activityForm)}
        title={activityForm?.id ? 'Editar actividad' : 'Nueva actividad'}
        description={
          period
            ? `${period.name} · ${assignment.subject_name} · ${assignment.course_name}`
            : ''
        }
        onClose={() => setActivityForm(null)}
        footer={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setActivityForm(null)}
            >
              Cancelar
            </button>
            <button type="submit" form="activity-form" className="btn primary">
              Guardar
            </button>
          </>
        }
      >
        {activityForm ? (
          <form id="activity-form" className="form-grid" onSubmit={saveActivity}>
            <Field label="Nombre de la actividad" className="full">
              <input
                className="input"
                value={activityForm.name}
                onChange={(event) =>
                  setActivityForm({ ...activityForm, name: event.target.value })
                }
                placeholder="Ej. Trabajo práctico 1"
                autoFocus
              />
            </Field>
            <Field label="Fecha">
              <input
                className="input"
                type="date"
                value={activityForm.date}
                onChange={(event) =>
                  setActivityForm({ ...activityForm, date: event.target.value })
                }
              />
            </Field>
            <Field
              label="Peso"
              hint="1 = mismo peso que el resto. Usá 2 para duplicarlo."
            >
              <input
                className="input"
                type="number"
                min="0.1"
                step="0.1"
                value={activityForm.weight}
                onChange={(event) =>
                  setActivityForm({ ...activityForm, weight: event.target.value })
                }
              />
            </Field>
            <Field label="Descripción" className="full">
              <textarea
                className="input"
                rows="2"
                value={activityForm.description}
                onChange={(event) =>
                  setActivityForm({
                    ...activityForm,
                    description: event.target.value,
                  })
                }
                placeholder="Consigna, criterios de evaluación…"
              />
            </Field>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(conceptForm)}
        title="Concepto y nota del período"
        description={
          conceptForm
            ? `${studentFullName(conceptForm.student)} · ${period?.name ?? ''}`
            : ''
        }
        onClose={() => setConceptForm(null)}
        footer={
          <div className="modal-footer-split">
            {conceptForm?.exists ? (
              <button type="button" className="btn danger ghost" onClick={deleteConcept}>
                <Icon name="trash" size={15} /> Quitar concepto
              </button>
            ) : (
              <span />
            )}
            <div className="inline-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setConceptForm(null)}
              >
                Cancelar
              </button>
              <button type="submit" form="concept-form" className="btn primary">
                Guardar
              </button>
            </div>
          </div>
        }
      >
        {conceptForm ? (
          <form id="concept-form" className="form-grid" onSubmit={saveConcept}>
            <Field label="Concepto escrito" className="full">
              <textarea
                className="input"
                rows="6"
                value={conceptForm.concept}
                onChange={(event) =>
                  setConceptForm({ ...conceptForm, concept: event.target.value })
                }
                placeholder="Observaciones, fortalezas, aspectos a mejorar…"
                autoFocus
              />
            </Field>
            <Field
              label="Nota conceptual"
              hint="Se promedia con las actividades del período."
            >
              <input
                className="input"
                type="number"
                min="1"
                max="10"
                step="0.01"
                value={conceptForm.grade}
                onChange={(event) =>
                  setConceptForm({ ...conceptForm, grade: event.target.value })
                }
                placeholder="1 a 10"
              />
            </Field>
            <Field label="Peso de la nota conceptual" hint="1 = igual que una actividad.">
              <input
                className="input"
                type="number"
                min="0.1"
                step="0.1"
                value={conceptForm.weight}
                onChange={(event) =>
                  setConceptForm({ ...conceptForm, weight: event.target.value })
                }
              />
            </Field>
            <p className="form-note full">{conceptNote}</p>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}

function GradeInput({ value, onSave, passing, label }) {
  const [draft, setDraft] = useState(value)
  const numeric = Number(String(draft).replace(',', '.'))

  function commit() {
    const text = String(draft).trim()
    if (text === '') {
      const ok = onSave(null)
      if (!ok) setDraft(value)
      return
    }
    const parsed = Number(text.replace(',', '.'))
    const ok = onSave(parsed)
    if (!ok) setDraft(value)
  }

  return (
    <input
      className={`grade-input ${
        String(draft).trim() === ''
          ? ''
          : `tone-${gradeTone(numeric, passing)}`
      }`}
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
      aria-label={label}
      placeholder="—"
    />
  )
}

function truncate(text, length) {
  if (text.length <= length) return text
  return `${text.slice(0, length - 1)}…`
}

function csvGrade(value) {
  if (value === null || value === undefined || value === '') return ''
  return Number(value).toFixed(2).replace('.', ',')
}

function safeName(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}
