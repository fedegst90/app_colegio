import { useMemo, useState } from 'react'
import { run } from '../db/database'
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
  initials,
  parseStudentLine,
  studentFullName,
} from '../lib/format'
import { getDefaultSchoolYear } from '../lib/stats'

const EMPTY_STUDENT = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  notes: '',
}

export default function Students({ navigate, params = {} }) {
  const { mutate, mutateMany } = useData()
  const toast = useToast()
  const [courseId, setCourseId] = useState(
    params.course ? String(params.course) : '',
  )
  const [schoolYear, setSchoolYear] = useState(
    params.year ? String(params.year) : String(getDefaultSchoolYear()),
  )
  const [search, setSearch] = useState('')
  const [studentForm, setStudentForm] = useState(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')

  const courses = useSqlQuery(
    `SELECT c.*, sh.name AS school_name
     FROM courses c
     JOIN schools sh ON sh.id = c.school_id
     ORDER BY sh.name COLLATE NOCASE, c.name COLLATE NOCASE`,
  )

  const groupedCourses = useMemo(() => {
    const groups = new Map()
    for (const course of courses) {
      if (!groups.has(course.school_name)) groups.set(course.school_name, [])
      groups.get(course.school_name).push(course)
    }
    return [...groups.entries()]
  }, [courses])

  const course = courses.find((item) => String(item.id) === String(courseId)) ?? courses[0]

  const yearRows = useSqlQuery(
    `SELECT school_year FROM students
     UNION
     SELECT school_year FROM assignments
     ORDER BY school_year DESC`,
  )

  const yearOptions = useMemo(() => {
    const values = new Set(yearRows.map((row) => String(row.school_year)))
    values.add(String(getDefaultSchoolYear()))
    values.add(String(schoolYear))
    return [...values].sort((a, b) => Number(b) - Number(a))
  }, [yearRows, schoolYear])

  const students = useSqlQuery(
    `SELECT * FROM students
     WHERE course_id = ? AND school_year = ? AND active = 1
     ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE`,
    [course?.id ?? 0, Number(schoolYear)],
  )

  const assignments = useSqlQuery(
    `SELECT a.id, a.period_type, sub.name AS subject_name, sub.color AS subject_color
     FROM assignments a
     JOIN subjects sub ON sub.id = a.subject_id
     WHERE a.course_id = ? AND a.school_year = ?
     ORDER BY sub.name COLLATE NOCASE`,
    [course?.id ?? 0, Number(schoolYear)],
  )

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return students
    return students.filter((student) =>
      `${student.last_name} ${student.first_name} ${student.email} ${student.phone}`
        .toLowerCase()
        .includes(term),
    )
  }, [students, search])

  function openNewStudent() {
    if (!course) {
      toast('Primero creá un curso en Configuración.', 'error')
      return
    }
    setStudentForm({ ...EMPTY_STUDENT })
  }

  function saveStudent(event) {
    event.preventDefault()
    if (!studentForm.last_name.trim() || !studentForm.first_name.trim()) {
      toast('El apellido y el nombre son obligatorios.', 'error')
      return
    }
    if (!course) {
      toast('Seleccioná un curso.', 'error')
      return
    }
    if (studentForm.id) {
      mutate(
        `UPDATE students
         SET first_name = ?, last_name = ?, email = ?, phone = ?, notes = ?
         WHERE id = ?`,
        [
          studentForm.first_name.trim(),
          studentForm.last_name.trim(),
          studentForm.email.trim(),
          studentForm.phone.trim(),
          studentForm.notes.trim(),
          studentForm.id,
        ],
      )
      toast('Alumno actualizado.')
    } else {
      mutate(
        `INSERT INTO students
          (course_id, school_year, first_name, last_name, email, phone, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          course.id,
          Number(schoolYear),
          studentForm.first_name.trim(),
          studentForm.last_name.trim(),
          studentForm.email.trim(),
          studentForm.phone.trim(),
          studentForm.notes.trim(),
        ],
      )
      toast('Alumno agregado.')
    }
    setStudentForm(null)
  }

  function deleteStudent(student) {
    const confirmed = window.confirm(
      `¿Eliminar a ${studentFullName(student)}? Se borrarán todas sus notas y conceptos.`,
    )
    if (!confirmed) return
    mutate('DELETE FROM students WHERE id = ?', [student.id])
    toast('Alumno eliminado.')
  }

  function openBulk() {
    if (!course) {
      toast('Primero creá un curso en Configuración.', 'error')
      return
    }
    setBulkText('')
    setBulkOpen(true)
  }

  function saveBulk(event) {
    event.preventDefault()
    if (!course) return
    const lines = bulkText
      .split('\n')
      .map((line) => parseStudentLine(line))
      .filter((item) => item?.lastName)
    if (lines.length === 0) {
      toast('Escribí al menos un alumno.', 'error')
      return
    }

    const existing = new Set(
      students.map(
        (student) =>
          `${student.last_name.toLowerCase()}|${student.first_name.toLowerCase()}`,
      ),
    )
    let added = 0
    let skipped = 0

    mutateMany(() => {
      for (const item of lines) {
        const key = `${item.lastName.toLowerCase()}|${item.firstName.toLowerCase()}`
        if (existing.has(key)) {
          skipped += 1
          continue
        }
        run(
          `INSERT INTO students
            (course_id, school_year, first_name, last_name)
           VALUES (?, ?, ?, ?)`,
          [course.id, Number(schoolYear), item.firstName, item.lastName],
        )
        existing.add(key)
        added += 1
      }
    })

    setBulkOpen(false)
    setBulkText('')
    if (added > 0) {
      toast(
        `${added} alumno${added === 1 ? '' : 's'} agregado${added === 1 ? '' : 's'}${
          skipped ? ` (${skipped} repetido${skipped === 1 ? '' : 's'})` : ''
        }.`,
      )
    } else {
      toast('No se agregaron alumnos nuevos.', 'error')
    }
  }

  if (courses.length === 0) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="Alumnos"
          title="Listados por curso"
          description="Los alumnos se organizan por curso y año lectivo."
        />
        <Card>
          <EmptyState
            icon="users"
            title="Primero necesitás un curso"
            description="Creá un colegio y un curso en Configuración para poder cargar alumnos."
            action={
              <button
                type="button"
                className="btn primary"
                onClick={() => navigate('configuracion')}
              >
                Ir a Configuración
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
        eyebrow="Alumnos"
        title="Listados por curso"
        description="Cargá el listado de cada curso y año lectivo. Después las cátedras los toman automáticamente."
        actions={
          <>
            <button type="button" className="btn" onClick={openBulk}>
              <Icon name="list" size={16} /> Carga masiva
            </button>
            <button type="button" className="btn primary" onClick={openNewStudent}>
              <Icon name="plus" size={17} /> Nuevo alumno
            </button>
          </>
        }
      />

      <Card className="filter-card">
        <div className="filter-row">
          <Field label="Curso">
            <select
              className="input"
              value={course?.id ?? ''}
              onChange={(event) => setCourseId(event.target.value)}
            >
              {groupedCourses.map(([schoolName, schoolCourses]) => (
                <optgroup label={schoolName} key={schoolName}>
                  {schoolCourses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.division ? ` · ${item.division}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Año lectivo">
            <select
              className="input"
              value={schoolYear}
              onChange={(event) => setSchoolYear(event.target.value)}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Buscar" className="grow">
            <input
              className="input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre, apellido, correo o teléfono"
            />
          </Field>
        </div>
        {assignments.length > 0 ? (
          <div className="course-subjects">
            <span className="muted small">Cátedras del curso:</span>
            {assignments.map((assignment) => (
              <button
                type="button"
                className="subject-pill"
                key={assignment.id}
                style={{ '--pill-color': assignment.subject_color }}
                onClick={() =>
                  navigate('notas', { assignment: assignment.id })
                }
              >
                <i />
                {assignment.subject_name}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">
            Este curso todavía no tiene cátedras para el año {schoolYear}.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title={`Alumnos de ${course.name}${course.division ? ` · ${course.division}` : ''}`}
          subtitle={`${studentFullNameCount(students.length)} · ${course.school_name} · Año ${schoolYear}`}
          actions={
            <Badge tone={students.length > 0 ? 'success' : 'neutral'}>
              {students.length} inscriptos
            </Badge>
          }
        />
        {students.length === 0 ? (
          <EmptyState
            icon="users"
            title="No hay alumnos en este curso y año"
            description="Podés cargarlos de a uno o pegar un listado completo con la carga masiva."
            action={
              <div className="inline-actions">
                <button type="button" className="btn" onClick={openBulk}>
                  Carga masiva
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={openNewStudent}
                >
                  <Icon name="plus" size={17} /> Agregar alumno
                </button>
              </div>
            }
          />
        ) : filteredStudents.length === 0 ? (
          <EmptyState
            icon="list"
            title="Sin coincidencias"
            description="Probá con otro nombre o limpiá la búsqueda."
            action={
              <button
                type="button"
                className="btn"
                onClick={() => setSearch('')}
              >
                Limpiar búsqueda
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table students-table">
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>Correo</th>
                  <th>Teléfono</th>
                  <th>Notas</th>
                  <th className="align-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <div className="student-cell">
                        <span className="avatar">
                          {initials(student.first_name, student.last_name)}
                        </span>
                        <div>
                          <strong>{studentFullName(student)}</strong>
                          <small>
                            {student.email || 'Sin correo cargado'}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{student.email || '—'}</td>
                    <td>{student.phone || '—'}</td>
                    <td className="notes-cell">{student.notes || '—'}</td>
                    <td className="align-right">
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          title="Editar alumno"
                          onClick={() => setStudentForm({ ...student })}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          title="Eliminar alumno"
                          onClick={() => deleteStudent(student)}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(studentForm)}
        title={studentForm?.id ? 'Editar alumno' : 'Nuevo alumno'}
        description={`Se agregará a ${course.name} en el año ${schoolYear}.`}
        onClose={() => setStudentForm(null)}
        footer={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setStudentForm(null)}
            >
              Cancelar
            </button>
            <button type="submit" form="student-form" className="btn primary">
              Guardar
            </button>
          </>
        }
      >
        {studentForm ? (
          <form id="student-form" className="form-grid" onSubmit={saveStudent}>
            <Field label="Apellido">
              <input
                className="input"
                value={studentForm.last_name}
                onChange={(event) =>
                  setStudentForm({ ...studentForm, last_name: event.target.value })
                }
                autoFocus
              />
            </Field>
            <Field label="Nombre">
              <input
                className="input"
                value={studentForm.first_name}
                onChange={(event) =>
                  setStudentForm({ ...studentForm, first_name: event.target.value })
                }
              />
            </Field>
            <Field label="Correo">
              <input
                className="input"
                type="email"
                value={studentForm.email}
                onChange={(event) =>
                  setStudentForm({ ...studentForm, email: event.target.value })
                }
                placeholder="opcional"
              />
            </Field>
            <Field label="Teléfono">
              <input
                className="input"
                value={studentForm.phone}
                onChange={(event) =>
                  setStudentForm({ ...studentForm, phone: event.target.value })
                }
                placeholder="opcional"
              />
            </Field>
            <Field label="Notas" className="full">
              <textarea
                className="input"
                rows="3"
                value={studentForm.notes}
                onChange={(event) =>
                  setStudentForm({ ...studentForm, notes: event.target.value })
                }
                placeholder="Observaciones, adecuaciones, información de contacto…"
              />
            </Field>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={bulkOpen}
        title="Carga masiva de alumnos"
        description="Un alumno por línea. Usá el formato Apellido, Nombre."
        onClose={() => setBulkOpen(false)}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setBulkOpen(false)}
            >
              Cancelar
            </button>
            <button type="submit" form="bulk-form" className="btn primary">
              Agregar alumnos
            </button>
          </>
        }
      >
        <form id="bulk-form" onSubmit={saveBulk}>
          <Field
            label="Listado"
            hint="Ejemplo: Gómez, Ana · Pérez, Juan · Si no ponés coma, la última palabra se toma como apellido."
          >
            <textarea
              className="input bulk-textarea"
              rows="12"
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              placeholder={'Gómez, Ana\nPérez, Juan\nLópez, María'}
              autoFocus
            />
          </Field>
        </form>
      </Modal>
    </div>
  )
}

function studentFullNameCount(count) {
  return `${count} alumno${count === 1 ? '' : 's'}`
}
