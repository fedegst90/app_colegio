import { useMemo, useState } from 'react'
import { run, getSetting } from '../db/database'
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
} from '../components/UI'
import {
  downloadFile,
  formatDate,
  formatLongDate,
  formatTimeRange,
  todayISO,
  weekdayLabel,
} from '../lib/format'
import { buildAutoPlan, resolveAcademicRange } from '../lib/planner'
import { RichTextEditor } from '../components/RichTextEditor'
// Word editable via HTML (no external lib needed)

const EMPTY_PLAN = {
  date: '',
  start_time: '',
  end_time: '',
  topic_id: '',
  activity_id: '',
  title: '',
  description: '',
  status: 'pendiente',
}

const STATUS_META = {
  pendiente: { label: 'Pendiente', tone: 'warning' },
  en_curso: { label: 'En curso', tone: 'info' },
  completada: { label: 'Completada', tone: 'success' },
}

export default function Planning({ navigate, params = {} }) {
  const { mutate, mutateMany } = useData()
  const toast = useToast()
  const [assignmentId, setAssignmentId] = useState(
    params.assignment ? String(params.assignment) : '',
  )
  const [filter, setFilter] = useState('todas')
  const [planForm, setPlanForm] = useState(null)
  const [detailPlan, setDetailPlan] = useState(null)
  const [autoOpen, setAutoOpen] = useState(false)
  const [autoFill, setAutoFill] = useState(true)

  const assignments = useSqlQuery(
    `SELECT a.*, c.name AS course_name, c.division, c.notes AS course_notes, c.year AS course_year,
            sh.name AS school_name, sh.address AS school_address,
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

  const topics = useSqlQuery(
    'SELECT * FROM topics WHERE assignment_id = ? ORDER BY position, id',
    [assignment?.id ?? 0],
  )

  const slots = useSqlQuery(
    `SELECT * FROM schedule_slots
     WHERE assignment_id = ?
     ORDER BY weekday, start_time`,
    [assignment?.id ?? 0],
  )

  const activities = useSqlQuery(
    `SELECT a.*, p.name AS period_name, p.position AS period_position,
            (SELECT COUNT(*) FROM grades g WHERE g.activity_id = a.id AND g.value IS NOT NULL) AS graded_count
     FROM activities a
     JOIN periods p ON p.id = a.period_id
     WHERE p.assignment_id = ?
     ORDER BY p.position, a.date, a.id`,
    [assignment?.id ?? 0],
  )

  const plans = useSqlQuery(
    `SELECT pl.*, t.title AS topic_title, a.name AS activity_name
     FROM plans pl
     LEFT JOIN topics t ON t.id = pl.topic_id
     LEFT JOIN activities a ON a.id = pl.activity_id
     WHERE pl.assignment_id = ?
     ORDER BY pl.date, pl.start_time, pl.id`,
    [assignment?.id ?? 0],
  )


  const exceptions = useSqlQuery(
    `SELECT * FROM calendar_exceptions
     WHERE school_year = ?
     ORDER BY date`,
    [assignment?.school_year ?? 0],
  )

  const academicRange = useMemo(
    () => (assignment ? resolveAcademicRange(assignment) : null),
    [assignment],
  )

  const autoPlan = useMemo(() => {
    if (!assignment || !academicRange || topics.length === 0 || slots.length === 0) {
      return null
    }
    return buildAutoPlan({
      topics,
      slots,
      startDate: academicRange.startDate,
      endDate: academicRange.endDate,
      exceptions,
      existingPlans: plans.filter((plan) => plan.source !== 'automatica'),
      fillRemaining: autoFill,
    })
  }, [assignment, academicRange, topics, slots, exceptions, plans, autoFill])

  const visiblePlans = useMemo(() => {
    const today = todayISO()
    if (filter === 'proximas') {
      return plans.filter((plan) => plan.date >= today)
    }
    if (filter === 'pasadas') {
      return plans.filter((plan) => plan.date < today)
    }
    return plans
  }, [plans, filter])

  const grouped = useMemo(() => {
    const groups = new Map()
    for (const plan of visiblePlans) {
      if (!groups.has(plan.date)) groups.set(plan.date, [])
      groups.get(plan.date).push(plan)
    }
    return [...groups.entries()]
  }, [visiblePlans])

  const stats = useMemo(
    () => ({
      total: plans.length,
      pending: plans.filter((plan) => plan.status === 'pendiente').length,
      done: plans.filter((plan) => plan.status === 'completada').length,
    }),
    [plans],
  )

  function openNewPlan() {
    if (!assignment) return
    setPlanForm({ ...EMPTY_PLAN, date: todayISO() })
  }

  function openEditPlan(plan) {
    setPlanForm({
      id: plan.id,
      date: plan.date,
      start_time: plan.start_time,
      end_time: plan.end_time,
      topic_id: plan.topic_id ? String(plan.topic_id) : '',
      activity_id: plan.activity_id ? String(plan.activity_id) : '',
      title: plan.title,
      description: plan.description,
      status: plan.status,
    })
  }

  function savePlan(event) {
    event.preventDefault()
    if (!planForm.date) {
      toast('Indicá la fecha de la clase.', 'error')
      return
    }
    if (!planForm.title.trim()) {
      toast('El título de la planificación es obligatorio.', 'error')
      return
    }
    if (
      planForm.start_time &&
      planForm.end_time &&
      planForm.start_time >= planForm.end_time
    ) {
      toast('La hora de fin debe ser posterior a la de inicio.', 'error')
      return
    }
    const topicId = planForm.topic_id ? Number(planForm.topic_id) : null
    const activityId = planForm.activity_id ? Number(planForm.activity_id) : null

    if (planForm.id) {
      mutate(
        `UPDATE plans
         SET date = ?, start_time = ?, end_time = ?, topic_id = ?, activity_id = ?,
             title = ?, description = ?, status = ?, source = 'manual'
         WHERE id = ?`,
        [
          planForm.date,
          planForm.start_time,
          planForm.end_time,
          topicId,
          activityId,
          planForm.title.trim(),
          planForm.description.trim(),
          planForm.status,
          planForm.id,
        ],
      )
      toast('Planificación actualizada.')
    } else {
      mutate(
        `INSERT INTO plans
          (assignment_id, topic_id, activity_id, date, start_time, end_time, title, description, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assignment.id,
          topicId,
          activityId,
          planForm.date,
          planForm.start_time,
          planForm.end_time,
          planForm.title.trim(),
          planForm.description.trim(),
          planForm.status,
        ],
      )
      toast('Clase planificada.')
    }
    setPlanForm(null)
  }

  function openAutoPlan() {
    if (!assignment) return
    if (topics.length === 0) {
      toast('Primero cargá el programa de la cátedra.', 'error')
      return
    }
    if (slots.length === 0) {
      toast('Primero cargá los días y horarios de clase.', 'error')
      return
    }
    if (!academicRange || academicRange.startDate > academicRange.endDate) {
      toast('Revisá las fechas de inicio y fin de cursada.', 'error')
      return
    }
    setAutoOpen(true)
  }

  function applyAutoPlan() {
    if (!assignment || !autoPlan) return
    if (autoPlan.plans.length === 0) {
      toast('No se generaron clases con el horario y el rango indicados.', 'error')
      return
    }
    mutateMany(() => {
      run("DELETE FROM plans WHERE assignment_id = ? AND source = 'automatica'", [
        assignment.id,
      ])
      for (const plan of autoPlan.plans) {
        run(
          `INSERT INTO plans
            (assignment_id, topic_id, date, start_time, end_time, title,
             description, status, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            assignment.id,
            plan.topic_id,
            plan.date,
            plan.start_time,
            plan.end_time,
            plan.title,
            plan.description,
            plan.status,
            plan.source,
          ],
        )
      }
    })
    setAutoOpen(false)
    const uncovered = autoPlan.stats.uncoveredTopics.length
    toast(
      uncovered > 0
        ? `Se generaron ${autoPlan.plans.length} clases. Quedaron ${uncovered} temas sin fecha.`
        : `Se generaron ${autoPlan.plans.length} clases para la cátedra.`,
    )
  }

  function deletePlan(plan) {
    const confirmed = window.confirm(
      `¿Eliminar la planificación "${plan.title}" del ${formatLongDate(plan.date)}?`,
    )
    if (!confirmed) return
    mutate('DELETE FROM plans WHERE id = ?', [plan.id])
    toast('Planificación eliminada.')
  }

  function toggleStatus(plan) {
    const next = plan.status === 'completada' ? 'pendiente' : 'completada'
    mutate('UPDATE plans SET status = ? WHERE id = ?', [next, plan.id])
  }

  function buildPlanHtml(plan) {
    if (!plan) return ''
    const escapeHtml = (value) =>
      String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')

    const topic = plan.topic_id
      ? topics.find((item) => String(item.id) === String(plan.topic_id))
      : null
    const teacher = getSetting('teacher_name', '')
    const schoolName = assignment?.school_name ?? ''
    const schoolAddress = assignment?.school_address ?? ''
    const subjectName = assignment?.subject_name ?? ''
    const schoolYear = assignment?.school_year ?? ''
    const courseName = assignment?.course_name ?? ''
    const courseDivision = assignment?.division ?? ''
    const courseNotes = assignment?.course_notes ?? ''
    const modalidad = courseNotes || ''

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Planificación aulica · ${escapeHtml(plan.title)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 28px; font-size: 12.5px; line-height: 1.5; }
  .header-line { margin: 2px 0; font-size: 12.5px; }
  .header-line b { font-weight: 700; }
  h1 { font-size: 17px; margin: 16px 0 6px; text-align: center; letter-spacing: 0.02em; }
  .tema { font-size: 13px; margin: 0 0 12px; }
  .tema b { font-weight: 700; }
  h2 { font-size: 13.5px; margin: 14px 0 4px; color: #0f172a; }
  p { margin: 4px 0; white-space: pre-line; }
  ul { margin: 4px 0 4px 20px; padding: 0; }
  li { margin: 2px 0; }
  .section { margin-bottom: 10px; }
  @media print { body { margin: 15mm; } }
</style>
</head>
<body>
  <p class="header-line"><b>Institución:</b> ${escapeHtml(schoolName)}${schoolAddress ? ` · ${escapeHtml(schoolAddress)}` : ''}</p>
  <p class="header-line"><b>Materia:</b> ${escapeHtml(subjectName)}</p>
  <p class="header-line"><b>Año:</b> ${escapeHtml(schoolYear)}</p>
  <p class="header-line"><b>Curso:</b> ${escapeHtml(courseName)}${courseDivision ? ` ${escapeHtml(courseDivision)}` : ''}</p>
  ${modalidad ? `<p class="header-line"><b>Modalidad:</b> ${escapeHtml(modalidad)}</p>` : ''}
  <p class="header-line"><b>Docente:</b> ${escapeHtml(teacher || '—')}</p>

  <h1>PLANIFICACION AULICA</h1>
  <p class="tema"><b>Tema:</b> ${escapeHtml(plan.title || topic?.title || '')}</p>

  ${
    topic?.objectives
      ? `<div class="section"><h2>Objetivos</h2><div>${topic.objectives}</div></div>`
      : ''
  }

  ${
    topic?.description
      ? `<div class="section"><h2>Contenidos</h2><p>${escapeHtml(topic.description)}</p></div>`
      : ''
  }

  ${
    plan.description
      ? `<div class="section"><h2>Actividades / Recursos / Bibliografía</h2><div>${plan.description}</div></div>`
      : ''
  }

</body>
</html>`

  }

  async function downloadSinglePlan(plan) {
    if (!plan) return
    const html = buildPlanHtml(plan)
    const baseName = String(plan.title || 'clase')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .toLowerCase()
    const filename = `${baseName}.doc`
    const blob = new Blob([html], {
      type: 'application/msword',
    })
    downloadFile(filename, blob)
  }

  function openPlanPreview(plan) {
    if (!plan) return
    const html = buildPlanHtml(plan)
    const printHtml = html.replace(
      '<body>',
      '<body><div style="text-align:center;margin:12px 0;"><button onclick="var a=document.createElement(\'a\');a.href=\'data:application/msword;charset=utf-8,\'+encodeURIComponent(document.getElementById(\'doc-content\').innerHTML);a.download=\'planificacion.doc\';a.click();" style="padding:8px 16px;font-size:14px;cursor:pointer;">Descargar Word (.doc)</button></div><div id="doc-content">',
    ).replace(
      '</body>',
      '</div></body>',
    )
    const win = window.open('', '_blank')
    if (!win) {
      toast('Permití las ventanas emergentes para ver la planificación.', 'error')
      return
    }
    win.document.open()
    win.document.write(printHtml)
    win.document.close()
  }

  function handleTopicChange(value) {
    const topic = topics.find((item) => String(item.id) === value)
    setPlanForm((current) => ({
      ...current,
      topic_id: value,
      title:
        current.title.trim() === '' && topic ? topic.title : current.title,
    }))
  }

  function handleActivityChange(value) {
    setPlanForm((current) => ({ ...current, activity_id: value }))
  }

  const usedActivityIds = new Set(
    (planForm?.id
      ? plans.filter((plan) => String(plan.id) !== String(planForm.id))
      : plans
    )
      .map((plan) => plan.activity_id)
      .filter(Boolean),
  )

  const availableActivities = activities.filter(
    (activity) =>
      !usedActivityIds.has(activity.id) ||
      String(activity.id) === String(planForm?.activity_id),
  )

  if (assignments.length === 0) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="Planificación"
          title="Clases día por día"
          description="Planificá cada encuentro y vinculalo con los temas del programa."
        />
        <Card>
          <EmptyState
            icon="calendar"
            title="Primero necesitás una cátedra"
            description="La planificación diaria se organiza dentro de cada cátedra."
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

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Planificación"
        title="Clases día por día"
        description="Armá cada clase o distribuí el programa en el año lectivo, salteando feriados y días sin clases."
        actions={
          <button type="button" className="btn primary" onClick={openNewPlan}>
            <Icon name="plus" size={17} /> Nueva clase
          </button>
        }
      />

      <Card className="filter-card">
        <div className="filter-row">
          <Field label="Cátedra" className="grow">
            <select
              className="input"
              value={assignment.id}
              onChange={(event) => setAssignmentId(event.target.value)}
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
              <Icon name="calendar" size={18} />
            </span>
            <div>
              <strong>{assignment.subject_name}</strong>
              <small>
                {assignment.course_name} · {assignment.school_name}
              </small>
            </div>
          </div>
        </div>
        <div className="planning-meta">
          <div className="schedule-chips">
            {slots.length === 0 ? (
              <span className="muted small">Sin horario semanal cargado</span>
            ) : (
              slots.map((slot) => (
                <span className="schedule-chip" key={slot.id}>
                  {weekdayLabel(slot.weekday)}{' '}
                  {formatTimeRange(slot.start_time, slot.end_time)}
                </span>
              ))
            )}
          </div>
          <div className="planning-stats">
            <Badge tone="neutral">{stats.total} clases</Badge>
            <Badge tone="warning">{stats.pending} pendientes</Badge>
            <Badge tone="success">{stats.done} completadas</Badge>
          </div>
        </div>
        {topics.length === 0 ? (
          <p className="muted small">
            Esta cátedra todavía no tiene temas.{' '}
            <button
              type="button"
              className="link-button"
              onClick={() =>
                navigate('programa', { assignment: assignment.id })
              }
            >
              Cargar el programa
            </button>
          </p>
        ) : null}
      </Card>

      <div className="planning-toolbar">
        <div className="segmented">
          {[
            { value: 'todas', label: 'Todas' },
            { value: 'proximas', label: 'Próximas' },
            { value: 'pasadas', label: 'Pasadas' },
          ].map((item) => (
            <button
              type="button"
              key={item.value}
              className={filter === item.value ? 'active' : ''}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="inline-actions">
          <button type="button" className="btn" onClick={openAutoPlan}>
            <Icon name="calendar" size={16} /> Generar automáticamente
          </button>
        </div>
      </div>

      {grouped.length === 0 ? (
        <Card>
          <EmptyState
            icon="calendar"
            title={
              plans.length === 0
                ? 'Todavía no hay clases planificadas'
                : 'No hay clases en este filtro'
            }
            description={
              plans.length === 0
                ? 'Agregá la primera clase, elegí una fecha y asociá un tema del programa.'
                : 'Probá con otro filtro para ver las planificaciones.'
            }
            action={
              plans.length === 0 ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={openNewPlan}
                >
                  <Icon name="plus" size={17} /> Nueva clase
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setFilter('todas')}
                >
                  Ver todas
                </button>
              )
            }
          />
        </Card>
      ) : (
        <div className="plan-days">
          {grouped.map(([date, datePlans]) => (
            <section className="plan-day" key={date}>
              <div className="plan-day-head">
                <span className="plan-day-date">
                  {date === todayISO() ? 'Hoy · ' : ''}
                  {formatLongDate(date)}
                </span>
                <span className="plan-day-count">
                  {datePlans.length} clase{datePlans.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="plan-day-list">
                {datePlans.map((plan) => {
                  const status = STATUS_META[plan.status] ?? STATUS_META.pendiente
                  return (
                    <article
                      className={`plan-card ${plan.status === 'completada' ? 'done' : ''}`}
                      key={plan.id}
                    >
                      <div className="plan-time">
                        {plan.start_time ? (
                          <>
                            <strong>{plan.start_time}</strong>
                            <span>{plan.end_time || '—'}</span>
                          </>
                        ) : (
                          <span className="muted">Sin hora</span>
                        )}
                      </div>
                      <div className="plan-content">
                        <div className="plan-head">
                          <h3>{plan.title}</h3>
                          <div className="inline-actions">
                            {plan.source === 'automatica' ? (
                              <Badge tone="neutral">Auto</Badge>
                            ) : null}
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </div>
                        </div>
                        {plan.topic_title ? (
                          <span className="plan-topic">
                            <Icon name="book" size={13} /> {plan.topic_title}
                          </span>
                        ) : (
                          <span className="plan-topic muted">Sin tema asociado</span>
                        )}
                        {plan.activity_name ? (
                          <span className="plan-topic">
                            <Icon name="clipboard" size={13} /> {plan.activity_name}
                          </span>
                        ) : null}
                        {plan.description ? (
                          <div
                            className="plan-description"
                            dangerouslySetInnerHTML={{ __html: plan.description }}
                          />
                        ) : null}
                      </div>
                      <div className="plan-actions">
                        <button
                          type="button"
                          className="icon-button"
                          title="Ver planificación en nueva pestaña"
                          onClick={() => openPlanPreview(plan)}
                        >
                          <Icon name="file" size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          title={
                            plan.status === 'completada'
                              ? 'Marcar como pendiente'
                              : 'Marcar como completada'
                          }
                          onClick={() => toggleStatus(plan)}
                        >
                          <Icon name="check" size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          title="Editar planificación"
                          onClick={() => openEditPlan(plan)}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          title="Eliminar planificación"
                          onClick={() => deletePlan(plan)}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={autoOpen}
        title="Planificación automática"
        description={
          assignment
            ? `${assignment.subject_name} · ${assignment.course_name}`
            : ''
        }
        onClose={() => setAutoOpen(false)}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setAutoOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={applyAutoPlan}
              disabled={!autoPlan || autoPlan.plans.length === 0}
            >
              <Icon name="calendar" size={16} /> Generar{' '}
              {autoPlan ? autoPlan.plans.length : 0} clases
            </button>
          </>
        }
      >
        {autoPlan ? (
          <div className="auto-plan-preview">
            <div className="auto-plan-grid">
              <div className="auto-plan-stat">
                <span>Cursada</span>
                <strong>
                  {formatDate(autoPlan.range.startDate)} –{' '}
                  {formatDate(autoPlan.range.endDate)}
                </strong>
              </div>
              <div className="auto-plan-stat">
                <span>Encuentros a generar</span>
                <strong>{autoPlan.plans.length}</strong>
              </div>
              <div className="auto-plan-stat">
                <span>Temas cubiertos</span>
                <strong>
                  {autoPlan.stats.coveredTopics}/{autoPlan.stats.totalTopics}
                </strong>
              </div>
              <div className="auto-plan-stat">
                <span>Feriados y días sin clase</span>
                <strong>{autoPlan.stats.skippedCount}</strong>
              </div>
            </div>

            {autoPlan.stats.reviewCount > 0 ? (
              <p className="form-note">
                El programa se cubre antes de fin de año: se agregarán{' '}
                {autoPlan.stats.reviewCount} clases de repaso y cierre.
              </p>
            ) : null}

            {autoPlan.stats.uncoveredTopics.length > 0 ? (
              <div className="auto-plan-warning">
                <Icon name="alert" size={17} />
                <p>
                  No alcanzan las clases del año para todos los temas. Quedan sin
                  fecha: {autoPlan.stats.uncoveredTopics.map((topic) => topic.title).join(', ')}.
                </p>
              </div>
            ) : null}

            {autoPlan.skipped.length > 0 ? (
              <div className="auto-plan-section">
                <h4>Fechas sin clase</h4>
                <div className="auto-plan-list">
                  {autoPlan.skipped.slice(0, 8).map((item) => (
                    <div
                      className="auto-plan-row"
                      key={`${item.date}-${item.name}`}
                    >
                      <span>{formatDate(item.date)}</span>
                      <strong>{item.name}</strong>
                      <Badge tone={item.scope === 'nacional' ? 'info' : 'neutral'}>
                        {item.scope === 'nacional' ? 'Feriado nacional' : 'Personalizado'}
                      </Badge>
                    </div>
                  ))}
                </div>
                {autoPlan.skipped.length > 8 ? (
                  <p className="muted small">
                    y {autoPlan.skipped.length - 8} fechas más.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="auto-plan-section">
              <h4>Primeras clases</h4>
              <div className="auto-plan-list">
                {autoPlan.plans.slice(0, 8).map((plan) => (
                  <div
                    className="auto-plan-row"
                    key={`${plan.date}-${plan.start_time}`}
                  >
                    <span>{formatDate(plan.date)}</span>
                    <span className="muted">
                      {formatTimeRange(plan.start_time, plan.end_time)}
                    </span>
                    <strong>{plan.title}</strong>
                  </div>
                ))}
              </div>
              {autoPlan.plans.length > 8 ? (
                <p className="muted small">
                  y {autoPlan.plans.length - 8} clases más.
                </p>
              ) : null}
            </div>

            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={autoFill}
                onChange={(event) => setAutoFill(event.target.checked)}
              />
              <span>Completar los días restantes con clases de repaso y cierre</span>
            </label>
            <p className="muted small">
              Se reemplazan las clases generadas automáticamente. Las clases
              manuales se conservan.
            </p>
          </div>
        ) : (
          <p className="muted">
            Cargá el programa y el horario semanal para generar la planificación.
          </p>
        )}
      </Modal>

      <Modal
        open={Boolean(detailPlan)}
        title={detailPlan ? detailPlan.title : 'Clase'}
        description={
          detailPlan
            ? `${formatLongDate(detailPlan.date)}${
                detailPlan.start_time ? ` · ${formatTimeRange(detailPlan.start_time, detailPlan.end_time)}` : ''
              }`
            : ''
        }
        onClose={() => setDetailPlan(null)}
        size="lg"
      >
        {detailPlan ? (
          <div className="page-stack">
            <div className="inline-actions">
              <Badge
                tone={
                  (STATUS_META[detailPlan.status] ?? STATUS_META.pendiente).tone
                }
              >
                {(STATUS_META[detailPlan.status] ?? STATUS_META.pendiente).label}
              </Badge>
              {detailPlan.source === 'automatica' ? (
                <Badge tone="neutral">Auto</Badge>
              ) : null}
              <button
                type="button"
                className="btn small"
                onClick={() => downloadSinglePlan(detailPlan)}
              >
                <Icon name="download" size={15} /> Descargar esta clase
              </button>
            </div>

            <Card>
              <CardHeader title="Desarrollo de la clase" />
              {detailPlan.description ? (
                <div
                  className="plan-description"
                  dangerouslySetInnerHTML={{ __html: detailPlan.description }}
                />
              ) : (
                <p className="muted">Sin desarrollo cargado.</p>
              )}
              {detailPlan.activity_name ? (
                <p className="muted small" style={{ marginTop: 8 }}>
                  <Icon name="clipboard" size={13} /> Actividad vinculada:{' '}
                  <strong>{detailPlan.activity_name}</strong>
                </p>
              ) : null}
            </Card>

            <Card>
              <CardHeader title="Contenido del tema" />
              {detailPlan.topic_id ? (
                (() => {
                  const topic = topics.find(
                    (item) => String(item.id) === String(detailPlan.topic_id),
                  )
                  if (!topic) {
                    return <p className="muted">Tema no encontrado.</p>
                  }
                  return (
                    <div className="topic-content">
                      <h3>{topic.title}</h3>
                      {topic.description ? (
                        <p className="topic-description">{topic.description}</p>
                      ) : (
                        <p className="muted small">Sin descripción del contenido.</p>
                      )}
                      {topic.objectives ? (
                        <div className="topic-objectives">
                          <span>Objetivos</span>
                          <div dangerouslySetInnerHTML={{ __html: topic.objectives }} />
                        </div>
                      ) : null}
                      <p className="muted small">
                        Clases estimadas: {Math.max(1, Number(topic.class_count) || 1)}
                      </p>
                    </div>
                  )
                })()
              ) : (
                <p className="muted">Esta clase no tiene un tema asociado.</p>
              )}
            </Card>

          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(planForm)}
        title={planForm?.id ? 'Editar planificación' : 'Nueva clase'}
        description={
          assignment
            ? `${assignment.subject_name} · ${assignment.course_name}`
            : ''
        }
        onClose={() => setPlanForm(null)}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setPlanForm(null)}
            >
              Cancelar
            </button>
            <button type="submit" form="plan-form" className="btn primary">
              Guardar
            </button>
          </>
        }
      >
        {planForm ? (
          <form id="plan-form" className="form-grid" onSubmit={savePlan}>
            <Field label="Fecha" className="full">
              <input
                className="input"
                type="date"
                value={planForm.date}
                onChange={(event) =>
                  setPlanForm({ ...planForm, date: event.target.value })
                }
              />
            </Field>
            <Field label="Desde">
              <input
                className="input"
                type="time"
                value={planForm.start_time}
                onChange={(event) =>
                  setPlanForm({ ...planForm, start_time: event.target.value })
                }
              />
            </Field>
            <Field label="Hasta">
              <input
                className="input"
                type="time"
                value={planForm.end_time}
                onChange={(event) =>
                  setPlanForm({ ...planForm, end_time: event.target.value })
                }
              />
            </Field>
            <Field label="Tema del programa" className="full">
              <select
                className="input"
                value={planForm.topic_id}
                onChange={(event) => handleTopicChange(event.target.value)}
              >
                <option value="">Sin tema asociado</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.position}. {topic.title}
                  </option>
                ))}
              </select>
            </Field>
            {planForm.topic_id ? (
              (() => {
                const topic = topics.find(
                  (item) => String(item.id) === String(planForm.topic_id),
                )
                if (!topic) return null
                return (
                  <div className="form-note full">
                    <strong>{topic.title}</strong>
                    {topic.description ? <p>{topic.description}</p> : null}
                    {topic.objectives ? (
                      <div>
                        <b>Objetivos:</b>{' '}
                        <span dangerouslySetInnerHTML={{ __html: topic.objectives }} />
                      </div>
                    ) : null}
                  </div>
                )
              })()
            ) : null}
            <Field label="Título de la clase" className="full">
              <input
                className="input"
                value={planForm.title}
                onChange={(event) =>
                  setPlanForm({ ...planForm, title: event.target.value })
                }
                placeholder="Ej. Introducción al tema y actividad inicial"
                autoFocus
              />
            </Field>
            <Field label="Actividad de notas vinculada" className="full">
              <select
                className="input"
                value={planForm.activity_id}
                onChange={(event) => handleActivityChange(event.target.value)}
              >
                <option value="">Sin actividad vinculada</option>
                {availableActivities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.period_name} · {activity.name}
                    {activity.date ? ` (${formatDate(activity.date)})` : ''} · peso {activity.weight}
                    {activity.graded_count > 0
                      ? ` · ${activity.graded_count} nota${activity.graded_count === 1 ? '' : 's'}`
                      : ' · sin notas'}
                  </option>
                ))}
              </select>
              <small className="field-hint">
                Solo se listan las actividades que no están vinculadas a otra clase.
              </small>
            </Field>
            <div className="field full">
              <span className="field-label">Desarrollo de la clase</span>
              <RichTextEditor
                value={planForm.description}
                onChange={(value) =>
                  setPlanForm((current) => ({ ...current, description: value }))
                }
                placeholder="Actividades, recursos, consignas, evaluación prevista…"
              />
            </div>
            <Field label="Estado">
              <select
                className="input"
                value={planForm.status}
                onChange={(event) =>
                  setPlanForm({ ...planForm, status: event.target.value })
                }
              >
                <option value="pendiente">Pendiente</option>
                <option value="en_curso">En curso</option>
                <option value="completada">Completada</option>
              </select>
            </Field>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
