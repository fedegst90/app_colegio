import { useMemo, useState } from 'react'
import { get, run } from '../db/database'
import { useData } from '../context/data-context'
import { useSqlQuery } from '../hooks/useSqlQuery'
import { useToast } from '../context/toast-context'
import { Icon } from '../components/Icon'
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
} from '../components/UI'
import {
  PERIOD_TYPE_OPTIONS,
  WEEKDAYS,
  formatDate,
  formatTimeRange,
  periodNames,
  periodTypeMeta,
  weekdayLabel,
} from '../lib/format'
import { getDefaultPassingGrade, getDefaultSchoolYear } from '../lib/stats'
import { resolveAcademicRange } from '../lib/planner'

const EMPTY_FORM = {
  course_id: '',
  subject_id: '',
  period_type: 'trimestre',
  school_year: '',
  start_date: '',
  end_date: '',
  passing_grade: '',
  notes: '',
  weekday: '',
  start_time: '',
  end_time: '',
  room: '',
}

const EMPTY_SLOT = {
  weekday: '1',
  start_time: '',
  end_time: '',
  room: '',
}

export default function Assignments({ navigate }) {
  const { mutate, mutateMany } = useData()
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [scheduleAssignment, setScheduleAssignment] = useState(null)
  const [slotForm, setSlotForm] = useState({ ...EMPTY_SLOT })

  const assignments = useSqlQuery(
    `SELECT a.*, c.name AS course_name, c.division, c.school_id,
            sh.name AS school_name,
            sub.name AS subject_name, sub.color AS subject_color,
            (SELECT COUNT(*) FROM students st
             WHERE st.course_id = a.course_id
               AND st.school_year = a.school_year
               AND st.active = 1) AS student_count
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     JOIN schools sh ON sh.id = c.school_id
     JOIN subjects sub ON sub.id = a.subject_id
     ORDER BY a.school_year DESC, sh.name COLLATE NOCASE,
              c.name COLLATE NOCASE, sub.name COLLATE NOCASE`,
  )

  const courses = useSqlQuery(
    `SELECT c.*, sh.name AS school_name
     FROM courses c
     JOIN schools sh ON sh.id = c.school_id
     ORDER BY sh.name COLLATE NOCASE, c.name COLLATE NOCASE`,
  )

  const subjects = useSqlQuery(
    'SELECT * FROM subjects ORDER BY name COLLATE NOCASE',
  )

  const slots = useSqlQuery(
    `SELECT sl.*, sub.name AS subject_name, sub.color AS subject_color
     FROM schedule_slots sl
     JOIN assignments a ON a.id = sl.assignment_id
     JOIN subjects sub ON sub.id = a.subject_id
     ORDER BY sl.weekday, sl.start_time`,
  )

  const slotsByAssignment = useMemo(() => {
    const map = new Map()
    for (const slot of slots) {
      if (!map.has(slot.assignment_id)) map.set(slot.assignment_id, [])
      map.get(slot.assignment_id).push(slot)
    }
    return map
  }, [slots])

  const grouped = useMemo(() => {
    const groups = new Map()
    for (const assignment of assignments) {
      if (!groups.has(assignment.school_name)) {
        groups.set(assignment.school_name, [])
      }
      groups.get(assignment.school_name).push(assignment)
    }
    return [...groups.entries()]
  }, [assignments])

  const scheduleSlots = scheduleAssignment
    ? slotsByAssignment.get(scheduleAssignment.id) ?? []
    : []

  const canCreate = courses.length > 0 && subjects.length > 0

  function openCreate() {
    if (!canCreate) {
      toast(
        'Primero necesitás al menos un curso y una materia en Configuración.',
        'error',
      )
      return
    }
    const defaultYear = getDefaultSchoolYear()
    setForm({
      ...EMPTY_FORM,
      course_id: String(courses[0].id),
      subject_id: String(subjects[0].id),
      school_year: String(defaultYear),
      start_date: `${defaultYear}-03-01`,
      end_date: `${defaultYear}-12-20`,
      passing_grade: String(getDefaultPassingGrade()),
    })
  }

  function openEdit(assignment) {
    setForm({
      ...EMPTY_FORM,
      id: assignment.id,
      course_id: String(assignment.course_id),
      subject_id: String(assignment.subject_id),
      period_type: assignment.period_type,
      school_year: String(assignment.school_year),
      start_date: assignment.start_date || `${assignment.school_year}-03-01`,
      end_date: assignment.end_date || `${assignment.school_year}-12-20`,
      passing_grade: String(assignment.passing_grade),
      notes: assignment.notes,
    })
  }

  function saveAssignment(event) {
    event.preventDefault()
    if (!form.course_id || !form.subject_id) {
      toast('Seleccioná un curso y una materia.', 'error')
      return
    }
    const schoolYear = Number(form.school_year)
    if (!Number.isInteger(schoolYear) || schoolYear < 2000) {
      toast('Indicá un año lectivo válido.', 'error')
      return
    }
    const passingGrade = Number(form.passing_grade)
    if (
      !Number.isFinite(passingGrade) ||
      passingGrade < 1 ||
      passingGrade > 10
    ) {
      toast('La nota mínima debe estar entre 1 y 10.', 'error')
      return
    }
    const startDate = form.start_date || `${schoolYear}-03-01`
    const endDate = form.end_date || `${schoolYear}-12-20`
    if (startDate > endDate) {
      toast('La fecha de inicio de cursada no puede ser posterior al fin.', 'error')
      return
    }

    const duplicate = get(
      `SELECT id FROM assignments
       WHERE course_id = ? AND subject_id = ? AND school_year = ? AND id != ?`,
      [
        Number(form.course_id),
        Number(form.subject_id),
        schoolYear,
        Number(form.id ?? 0),
      ],
    )
    if (duplicate) {
      toast('Ya existe una cátedra para ese curso, materia y año.', 'error')
      return
    }

    if (form.id) {
      mutate(
        `UPDATE assignments
         SET school_year = ?, start_date = ?, end_date = ?,
             passing_grade = ?, notes = ?
         WHERE id = ?`,
        [
          schoolYear,
          startDate,
          endDate,
          passingGrade,
          form.notes.trim(),
          form.id,
        ],
      )
      setForm(null)
      toast('Cátedra actualizada.')
      return
    }

    const wantsSchedule = Boolean(form.weekday || form.start_time || form.end_time)
    if (wantsSchedule) {
      if (!form.weekday || !form.start_time || !form.end_time) {
        toast('Completá el día, la hora de inicio y la de fin.', 'error')
        return
      }
      if (form.start_time >= form.end_time) {
        toast('La hora de fin debe ser posterior a la de inicio.', 'error')
        return
      }
    }

    mutateMany(() => {
      const assignmentId = run(
        `INSERT INTO assignments
          (course_id, subject_id, period_type, school_year, start_date,
           end_date, passing_grade, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(form.course_id),
          Number(form.subject_id),
          form.period_type,
          schoolYear,
          startDate,
          endDate,
          passingGrade,
          form.notes.trim(),
        ],
      )
      periodNames(form.period_type).forEach((name, index) => {
        run(
          'INSERT INTO periods (assignment_id, name, position) VALUES (?, ?, ?)',
          [assignmentId, name, index + 1],
        )
      })
      if (wantsSchedule) {
        run(
          `INSERT INTO schedule_slots
            (assignment_id, weekday, start_time, end_time, room)
           VALUES (?, ?, ?, ?, ?)`,
          [
            assignmentId,
            Number(form.weekday),
            form.start_time,
            form.end_time,
            form.room.trim(),
          ],
        )
      }
      return assignmentId
    })

    setForm(null)
    toast('Cátedra creada con sus períodos.')
  }

  function deleteAssignment(assignment) {
    const confirmed = window.confirm(
      `¿Eliminar la cátedra de ${assignment.subject_name} en ${assignment.course_name}? Se borrarán su programa, actividades, notas y planificaciones.`,
    )
    if (!confirmed) return
    mutate('DELETE FROM assignments WHERE id = ?', [assignment.id])
    toast('Cátedra eliminada.')
  }

  function openSchedule(assignment) {
    setSlotForm({ ...EMPTY_SLOT })
    setScheduleAssignment(assignment)
  }

  function addSlot(event) {
    event.preventDefault()
    if (!slotForm.start_time || !slotForm.end_time) {
      toast('Indicá la hora de inicio y de fin.', 'error')
      return
    }
    if (slotForm.start_time >= slotForm.end_time) {
      toast('La hora de fin debe ser posterior a la de inicio.', 'error')
      return
    }
    mutate(
      `INSERT INTO schedule_slots
        (assignment_id, weekday, start_time, end_time, room)
       VALUES (?, ?, ?, ?, ?)`,
      [
        scheduleAssignment.id,
        Number(slotForm.weekday),
        slotForm.start_time,
        slotForm.end_time,
        slotForm.room.trim(),
      ],
    )
    setSlotForm({ ...EMPTY_SLOT })
    toast('Horario agregado.')
  }

  function deleteSlot(slot) {
    mutate('DELETE FROM schedule_slots WHERE id = ?', [slot.id])
    toast('Horario eliminado.')
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Cátedras"
        title="Materias, cursos y horarios"
        description="Asociá un colegio, un curso y una materia, elegí el régimen de evaluación y cargá los días de clase."
        actions={
          <button
            type="button"
            className="btn primary"
            onClick={openCreate}
            disabled={!canCreate}
          >
            <Icon name="plus" size={17} /> Nueva cátedra
          </button>
        }
      />

      {!canCreate ? (
        <Card className="notice-card">
          <span className="entity-icon warning">
            <Icon name="alert" size={20} />
          </span>
          <div>
            <strong>Faltan datos para crear cátedras</strong>
            <p>
              Necesitás al menos un curso y una materia. Un curso pertenece a un
              colegio, así que también necesitás un colegio.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => navigate('configuracion')}
          >
            Ir a Configuración
          </button>
        </Card>
      ) : null}

      {assignments.length === 0 ? (
        <Card>
          <EmptyState
            icon="graduation"
            title="Todavía no hay cátedras"
            description="Usá el botón “Nueva cátedra” para crear la primera. Una cátedra es la combinación de un curso, una materia y un régimen de períodos."
          />
        </Card>
      ) : (
        grouped.map(([schoolName, schoolAssignments]) => (
          <div className="assignment-group" key={schoolName}>
            <div className="group-head">
              <span className="group-icon">
                <Icon name="school" size={17} />
              </span>
              <h2>{schoolName}</h2>
              <span>{schoolAssignments.length} cátedras</span>
            </div>
            <div className="assignment-grid">
              {schoolAssignments.map((assignment) => {
                const assignmentSlots = slotsByAssignment.get(assignment.id) ?? []
                const range = resolveAcademicRange(assignment)
                return (
                  <article
                    className="assignment-card"
                    key={assignment.id}
                    style={{ '--subject-color': assignment.subject_color }}
                  >
                    <div className="assignment-stripe" />
                    <div className="assignment-body">
                      <div className="assignment-head">
                        <div>
                          <span className="assignment-course">
                            {assignment.course_name}
                            {assignment.division ? ` · ${assignment.division}` : ''}
                          </span>
                          <h3>{assignment.subject_name}</h3>
                        </div>
                        <div className="assignment-badges">
                          <Badge tone="info">
                            {periodTypeMeta(assignment.period_type).label}
                          </Badge>
                          <Badge tone="neutral">{assignment.school_year}</Badge>
                        </div>
                      </div>

                      <div className="assignment-meta">
                        <span>
                          <Icon name="users" size={15} />
                          {assignment.student_count} alumnos
                        </span>
                        <span>
                          <Icon name="target" size={15} />
                          Aprueba con {Number(assignment.passing_grade)}
                        </span>
                        <span>
                          <Icon name="calendar" size={15} />
                          {formatDate(range.startDate)} – {formatDate(range.endDate)}
                        </span>
                      </div>

                      <div className="schedule-chips">
                        {assignmentSlots.length === 0 ? (
                          <span className="muted small">Sin horario asignado</span>
                        ) : (
                          assignmentSlots.slice(0, 3).map((slot) => (
                            <span className="schedule-chip" key={slot.id}>
                              {weekdayLabel(slot.weekday)}{' '}
                              {formatTimeRange(slot.start_time, slot.end_time)}
                            </span>
                          ))
                        )}
                        {assignmentSlots.length > 3 ? (
                          <span className="schedule-chip more">
                            +{assignmentSlots.length - 3}
                          </span>
                        ) : null}
                      </div>

                      <div className="assignment-actions">
                        <button
                          type="button"
                          className="btn primary small"
                          onClick={() =>
                            navigate('notas', { assignment: assignment.id })
                          }
                        >
                          <Icon name="clipboard" size={15} /> Notas
                        </button>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => openSchedule(assignment)}
                        >
                          <Icon name="clock" size={15} /> Horario
                        </button>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() =>
                            navigate('programa', {
                              assignment: assignment.id,
                            })
                          }
                        >
                          <Icon name="book" size={15} /> Programa
                        </button>
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() =>
                            navigate('planificacion', {
                              assignment: assignment.id,
                            })
                          }
                        >
                          <Icon name="calendar" size={15} /> Planificar
                        </button>
                        <div className="spacer" />
                        <button
                          type="button"
                          className="icon-button"
                          title="Editar cátedra"
                          onClick={() => openEdit(assignment)}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          title="Eliminar cátedra"
                          onClick={() => deleteAssignment(assignment)}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        ))
      )}

      <Modal
        open={Boolean(form)}
        title={form?.id ? 'Editar cátedra' : 'Nueva cátedra'}
        description={
          form?.id
            ? 'Podés ajustar el año, la nota mínima y las notas generales.'
            : 'Se crearán automáticamente los períodos según el régimen elegido.'
        }
        onClose={() => setForm(null)}
        size="lg"
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button type="submit" form="assignment-form" className="btn primary">
              {form?.id ? 'Guardar cambios' : 'Crear cátedra'}
            </button>
          </>
        }
      >
        {form ? (
          <form id="assignment-form" className="form-grid" onSubmit={saveAssignment}>
            <Field label="Curso" className="full">
              <select
                className="input"
                value={form.course_id}
                onChange={(event) =>
                  setForm({ ...form, course_id: event.target.value })
                }
                disabled={Boolean(form.id)}
              >
                <option value="">Seleccioná un curso</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.school_name} · {course.name}
                    {course.division ? ` (${course.division})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Materia">
              <select
                className="input"
                value={form.subject_id}
                onChange={(event) =>
                  setForm({ ...form, subject_id: event.target.value })
                }
                disabled={Boolean(form.id)}
              >
                <option value="">Seleccioná una materia</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Régimen de períodos"
              hint={
                form.id
                  ? 'No se puede cambiar después de crear la cátedra.'
                  : `${periodNames(form.period_type).join(' · ')}`
              }
            >
              <select
                className="input"
                value={form.period_type}
                onChange={(event) =>
                  setForm({ ...form, period_type: event.target.value })
                }
                disabled={Boolean(form.id)}
              >
                {PERIOD_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.plural}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Año lectivo">
              <input
                className="input"
                type="number"
                min="2000"
                max="2100"
                value={form.school_year}
                onChange={(event) =>
                  setForm({ ...form, school_year: event.target.value })
                }
              />
            </Field>
            <Field label="Inicio de cursada" hint="Si no la indicás, se usa el 1 de marzo.">
              <input
                className="input"
                type="date"
                value={form.start_date}
                onChange={(event) =>
                  setForm({ ...form, start_date: event.target.value })
                }
              />
            </Field>
            <Field label="Fin de cursada" hint="Si no la indicás, se usa el 20 de diciembre.">
              <input
                className="input"
                type="date"
                value={form.end_date}
                onChange={(event) =>
                  setForm({ ...form, end_date: event.target.value })
                }
              />
            </Field>
            <Field label="Nota mínima de aprobación">
              <input
                className="input"
                type="number"
                min="1"
                max="10"
                step="0.1"
                value={form.passing_grade}
                onChange={(event) =>
                  setForm({ ...form, passing_grade: event.target.value })
                }
              />
            </Field>
            <Field label="Notas de la cátedra" className="full">
              <textarea
                className="input"
                rows="2"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Observaciones generales"
              />
            </Field>

            {!form.id ? (
              <div className="full schedule-inline">
                <div className="schedule-inline-title">
                  <Icon name="clock" size={16} />
                  Horario inicial <span>(opcional)</span>
                </div>
                <div className="form-grid">
                  <Field label="Día">
                    <select
                      className="input"
                      value={form.weekday}
                      onChange={(event) =>
                        setForm({ ...form, weekday: event.target.value })
                      }
                    >
                      <option value="">Sin día</option>
                      {WEEKDAYS.map((day) => (
                        <option key={day.value} value={day.value}>
                          {day.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Desde">
                    <input
                      className="input"
                      type="time"
                      value={form.start_time}
                      onChange={(event) =>
                        setForm({ ...form, start_time: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Hasta">
                    <input
                      className="input"
                      type="time"
                      value={form.end_time}
                      onChange={(event) =>
                        setForm({ ...form, end_time: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Aula">
                    <input
                      className="input"
                      value={form.room}
                      onChange={(event) =>
                        setForm({ ...form, room: event.target.value })
                      }
                      placeholder="Opcional"
                    />
                  </Field>
                </div>
              </div>
            ) : null}
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(scheduleAssignment)}
        title="Horario de la cátedra"
        description={
          scheduleAssignment
            ? `${scheduleAssignment.subject_name} · ${scheduleAssignment.course_name}`
            : ''
        }
        onClose={() => setScheduleAssignment(null)}
        size="lg"
      >
        {scheduleAssignment ? (
          <div className="schedule-manager">
            <form className="schedule-form" onSubmit={addSlot}>
              <Field label="Día">
                <select
                  className="input"
                  value={slotForm.weekday}
                  onChange={(event) =>
                    setSlotForm({ ...slotForm, weekday: event.target.value })
                  }
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Desde">
                <input
                  className="input"
                  type="time"
                  value={slotForm.start_time}
                  onChange={(event) =>
                    setSlotForm({ ...slotForm, start_time: event.target.value })
                  }
                />
              </Field>
              <Field label="Hasta">
                <input
                  className="input"
                  type="time"
                  value={slotForm.end_time}
                  onChange={(event) =>
                    setSlotForm({ ...slotForm, end_time: event.target.value })
                  }
                />
              </Field>
              <Field label="Aula">
                <input
                  className="input"
                  value={slotForm.room}
                  onChange={(event) =>
                    setSlotForm({ ...slotForm, room: event.target.value })
                  }
                  placeholder="Opcional"
                />
              </Field>
              <button type="submit" className="btn primary schedule-add">
                <Icon name="plus" size={16} /> Agregar
              </button>
            </form>

            <div className="slot-list">
              {scheduleSlots.length === 0 ? (
                <p className="muted">
                  Todavía no cargaste horarios para esta cátedra.
                </p>
              ) : (
                scheduleSlots.map((slot) => (
                  <div className="slot-row" key={slot.id}>
                    <span className="slot-day">{weekdayLabel(slot.weekday)}</span>
                    <span className="slot-time">
                      {formatTimeRange(slot.start_time, slot.end_time)}
                    </span>
                    <span className="slot-room">{slot.room || 'Sin aula'}</span>
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => deleteSlot(slot)}
                      title="Quitar horario"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
