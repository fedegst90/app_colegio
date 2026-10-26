import { useMemo, useRef, useState } from 'react'
import {
  exportDatabaseBytes,
  getSetting,
  importDatabaseBytes,
  persistNow,
  resetDatabase,
  setSetting,
} from '../db/database'
import { useSqlQuery } from '../hooks/useSqlQuery'
import { useData } from '../context/data-context'
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
import { downloadFile, formatDate, todayISO } from '../lib/format'
import { getNationalHolidays } from '../lib/holidays'

const EMPTY_SCHOOL = { name: '', address: '', notes: '' }
const EMPTY_SUBJECT = {
  name: '',
  code: '',
  color: '#4f46e5',
  description: '',
}
const EMPTY_COURSE = {
  school_id: '',
  name: '',
  year: '',
  division: '',
  notes: '',
}

export default function Settings() {
  const { mutate, refresh } = useData()
  const toast = useToast()
  const [tab, setTab] = useState('colegios')
  const [schoolForm, setSchoolForm] = useState(null)
  const [subjectForm, setSubjectForm] = useState(null)
  const [courseForm, setCourseForm] = useState(null)
  const [schoolFilter, setSchoolFilter] = useState('')
  const [defaultPassing, setDefaultPassing] = useState(() =>
    getSetting('default_passing_grade', '6'),
  )
  const [defaultYear, setDefaultYear] = useState(() =>
    getSetting('default_school_year', String(new Date().getFullYear())),
  )
  const [teacherName, setTeacherName] = useState(() =>
    getSetting('teacher_name', ''),
  )
  const [teacherEmail, setTeacherEmail] = useState(() =>
    getSetting('teacher_email', ''),
  )
  const [teacherPhone, setTeacherPhone] = useState(() =>
    getSetting('teacher_phone', ''),
  )
  const [calendarYear, setCalendarYear] = useState(() =>
    getSetting('default_school_year', String(new Date().getFullYear())),
  )
  const [exceptionForm, setExceptionForm] = useState(null)
  const importRef = useRef(null)

  const schools = useSqlQuery(
    `SELECT sh.*,
      (SELECT COUNT(*) FROM courses c WHERE c.school_id = sh.id) AS course_count,
      (SELECT COUNT(*) FROM students st
       JOIN courses c ON c.id = st.course_id
       WHERE c.school_id = sh.id AND st.active = 1) AS student_count
     FROM schools sh
     ORDER BY sh.name COLLATE NOCASE`,
  )

  const subjects = useSqlQuery(
    `SELECT sub.*,
      (SELECT COUNT(*) FROM topics t
       JOIN assignments a ON a.id = t.assignment_id
       WHERE a.subject_id = sub.id) AS topic_count,
      (SELECT COUNT(*) FROM assignments a WHERE a.subject_id = sub.id) AS assignment_count
     FROM subjects sub
     ORDER BY sub.name COLLATE NOCASE`,
  )

  const courses = useSqlQuery(
    `SELECT c.*, sh.name AS school_name,
      (SELECT COUNT(*) FROM students st WHERE st.course_id = c.id AND st.active = 1) AS student_count,
      (SELECT COUNT(*) FROM assignments a WHERE a.course_id = c.id) AS assignment_count
     FROM courses c
     JOIN schools sh ON sh.id = c.school_id
     ORDER BY sh.name COLLATE NOCASE, c.year, c.name COLLATE NOCASE`,
  )

  const calendarExceptions = useSqlQuery(
    `SELECT * FROM calendar_exceptions
     WHERE school_year = ?
     ORDER BY date`,
    [Number(calendarYear) || 0],
  )

  const nationalHolidays = useMemo(
    () => getNationalHolidays(Number(calendarYear)),
    [calendarYear],
  )

  const filteredCourses = schoolFilter
    ? courses.filter((course) => String(course.school_id) === String(schoolFilter))
    : courses

  const groupedCourses = useMemo(() => {
    const groups = new Map()
    for (const course of filteredCourses) {
      if (!groups.has(course.school_name)) groups.set(course.school_name, [])
      groups.get(course.school_name).push(course)
    }
    return [...groups.entries()]
  }, [filteredCourses])

  function saveSchool(event) {
    event.preventDefault()
    const name = schoolForm.name.trim()
    if (!name) {
      toast('El nombre del colegio es obligatorio.', 'error')
      return
    }
    if (schoolForm.id) {
      mutate('UPDATE schools SET name = ?, address = ?, notes = ? WHERE id = ?', [
        name,
        schoolForm.address.trim(),
        schoolForm.notes.trim(),
        schoolForm.id,
      ])
      toast('Colegio actualizado.')
    } else {
      mutate('INSERT INTO schools (name, address, notes) VALUES (?, ?, ?)', [
        name,
        schoolForm.address.trim(),
        schoolForm.notes.trim(),
      ])
      toast('Colegio creado.')
    }
    setSchoolForm(null)
  }

  function deleteSchool(school) {
    const confirmed = window.confirm(
      `¿Eliminar el colegio "${school.name}"? Se eliminarán también sus cursos, alumnos, cátedras y notas.`,
    )
    if (!confirmed) return
    mutate('DELETE FROM schools WHERE id = ?', [school.id])
    if (String(schoolFilter) === String(school.id)) setSchoolFilter('')
    toast('Colegio eliminado.')
  }

  function saveSubject(event) {
    event.preventDefault()
    const name = subjectForm.name.trim()
    if (!name) {
      toast('El nombre de la materia es obligatorio.', 'error')
      return
    }
    if (subjectForm.id) {
      mutate(
        'UPDATE subjects SET name = ?, code = ?, color = ?, description = ? WHERE id = ?',
        [
          name,
          subjectForm.code.trim(),
          subjectForm.color,
          subjectForm.description.trim(),
          subjectForm.id,
        ],
      )
      toast('Materia actualizada.')
    } else {
      mutate(
        'INSERT INTO subjects (name, code, color, description) VALUES (?, ?, ?, ?)',
        [
          name,
          subjectForm.code.trim(),
          subjectForm.color,
          subjectForm.description.trim(),
        ],
      )
      toast('Materia creada.')
    }
    setSubjectForm(null)
  }

  function deleteSubject(subject) {
    const confirmed = window.confirm(
      `¿Eliminar la materia "${subject.name}"? Se eliminarán sus cátedras con sus programas, alumnos y notas.`,
    )
    if (!confirmed) return
    mutate('DELETE FROM subjects WHERE id = ?', [subject.id])
    toast('Materia eliminada.')
  }

  function saveCourse(event) {
    event.preventDefault()
    if (!courseForm.school_id) {
      toast('Seleccioná un colegio.', 'error')
      return
    }
    const name = courseForm.name.trim()
    if (!name) {
      toast('El nombre del curso es obligatorio.', 'error')
      return
    }
    const year = courseForm.year === '' ? null : Number(courseForm.year)
    if (courseForm.id) {
      mutate(
        'UPDATE courses SET school_id = ?, name = ?, year = ?, division = ?, notes = ? WHERE id = ?',
        [
          Number(courseForm.school_id),
          name,
          year,
          courseForm.division.trim(),
          courseForm.notes.trim(),
          courseForm.id,
        ],
      )
      toast('Curso actualizado.')
    } else {
      mutate(
        'INSERT INTO courses (school_id, name, year, division, notes) VALUES (?, ?, ?, ?, ?)',
        [
          Number(courseForm.school_id),
          name,
          year,
          courseForm.division.trim(),
          courseForm.notes.trim(),
        ],
      )
      toast('Curso creado.')
    }
    setCourseForm(null)
  }

  function deleteCourse(course) {
    const confirmed = window.confirm(
      `¿Eliminar el curso "${course.name}" de ${course.school_name}? Se eliminarán sus alumnos, cátedras y notas.`,
    )
    if (!confirmed) return
    mutate('DELETE FROM courses WHERE id = ?', [course.id])
    toast('Curso eliminado.')
  }

  function openCalendarException() {
    const today = todayISO()
    setExceptionForm({
      date: today.startsWith(`${calendarYear}-`)
        ? today
        : `${calendarYear}-01-01`,
      name: '',
    })
  }

  function saveCalendarException(event) {
    event.preventDefault()
    if (!exceptionForm.date) {
      toast('Indicá la fecha sin clases.', 'error')
      return
    }
    const year = Number(exceptionForm.date.slice(0, 4))
    if (year !== Number(calendarYear)) {
      toast(`La fecha debe pertenecer al año ${calendarYear}.`, 'error')
      return
    }
    const name = exceptionForm.name.trim()
    if (!name) {
      toast('Indicá el motivo del día sin clases.', 'error')
      return
    }
    mutate(
      `INSERT INTO calendar_exceptions (school_year, date, name)
       VALUES (?, ?, ?)
       ON CONFLICT(school_year, date) DO UPDATE SET name = excluded.name`,
      [year, exceptionForm.date, name],
    )
    setExceptionForm(null)
    toast('Día sin clases guardado.')
  }

  function deleteCalendarException(exception) {
    mutate('DELETE FROM calendar_exceptions WHERE id = ?', [exception.id])
    toast('Día sin clases eliminado.')
  }

  async function handleExport() {
    const bytes = exportDatabaseBytes()
    downloadFile(
      `aula-docente-${todayISO()}.sqlite`,
      new Blob([bytes], { type: 'application/octet-stream' }),
    )
    await persistNow()
    toast('Copia de seguridad descargada.')
  }

  async function handleImport(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const confirmed = window.confirm(
      'Importar una copia reemplazará todos los datos actuales. ¿Continuar?',
    )
    if (!confirmed) return
    try {
      const bytes = await file.arrayBuffer()
      await importDatabaseBytes(bytes)
      const importedYear = getSetting(
        'default_school_year',
        String(new Date().getFullYear()),
      )
      setDefaultPassing(getSetting('default_passing_grade', '6'))
      setDefaultYear(importedYear)
      setCalendarYear(importedYear)
      refresh()
      toast('Copia de seguridad restaurada.')
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  async function handleReset() {
    const confirmed = window.confirm(
      'Esto borrará TODOS los datos de la aplicación de forma permanente. ¿Querés continuar?',
    )
    if (!confirmed) return
    if (window.prompt('Escribí BORRAR para confirmar') !== 'BORRAR') return
    try {
      await resetDatabase()
      setDefaultPassing('6')
      setDefaultYear(String(new Date().getFullYear()))
      setCalendarYear(String(new Date().getFullYear()))
      setExceptionForm(null)
      setSchoolFilter('')
      setTab('colegios')
      refresh()
      toast('Base de datos restablecida.')
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  function savePreferences(event) {
    event.preventDefault()
    const passing = Number(defaultPassing)
    if (!Number.isFinite(passing) || passing < 1 || passing > 10) {
      toast('La nota mínima debe estar entre 1 y 10.', 'error')
      return
    }
    setSetting('default_passing_grade', passing)
    setSetting('default_school_year', defaultYear)
    refresh()
    toast('Preferencias guardadas.')
  }

  function saveTeacher(event) {
    event.preventDefault()
    setSetting('teacher_name', teacherName.trim())
    setSetting('teacher_email', teacherEmail.trim())
    setSetting('teacher_phone', teacherPhone.trim())
    refresh()
    toast('Datos del docente guardados.')
  }

  const tabs = [
    { value: 'colegios', label: 'Colegios', count: schools.length },
    { value: 'materias', label: 'Materias', count: subjects.length },
    { value: 'cursos', label: 'Cursos', count: courses.length },
    { value: 'docente', label: 'Docente' },
    {
      value: 'calendario',
      label: 'Calendario',
      count: calendarExceptions.length,
    },
    { value: 'datos', label: 'Datos y respaldo' },
  ]

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Configuración"
        title="Tu estructura de trabajo"
        description="Cargá colegios, materias y cursos. Después vas a poder armar las cátedras y asociar alumnos."
      />

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === 'colegios' ? (
        <Card>
          <CardHeader
            title="Colegios"
            subtitle="Podés trabajar con tantos colegios como necesites."
            actions={
              <button
                type="button"
                className="btn primary"
                onClick={() => setSchoolForm({ ...EMPTY_SCHOOL })}
              >
                <Icon name="plus" size={17} /> Nuevo colegio
              </button>
            }
          />
          {schools.length === 0 ? (
            <EmptyState
              icon="school"
              title="Todavía no hay colegios"
              description="Agregá el primer colegio para empezar a organizar cursos y cátedras."
              action={
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setSchoolForm({ ...EMPTY_SCHOOL })}
                >
                  <Icon name="plus" size={17} /> Agregar colegio
                </button>
              }
            />
          ) : (
            <div className="entity-grid">
              {schools.map((school) => (
                <article className="entity-card" key={school.id}>
                  <div className="entity-top">
                    <span className="entity-icon">
                      <Icon name="school" size={20} />
                    </span>
                    <div className="entity-actions">
                      <button
                        type="button"
                        className="icon-button"
                        title="Editar colegio"
                        onClick={() => setSchoolForm({ ...school })}
                      >
                        <Icon name="edit" size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        title="Eliminar colegio"
                        onClick={() => deleteSchool(school)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                  <h3>{school.name}</h3>
                  <p className={school.address ? '' : 'muted'}>
                    {school.address || 'Sin dirección cargada'}
                  </p>
                  <div className="entity-meta">
                    <Badge tone="info">{school.course_count} cursos</Badge>
                    <Badge tone="neutral">{school.student_count} alumnos</Badge>
                  </div>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      setSchoolFilter(String(school.id))
                      setTab('cursos')
                    }}
                  >
                    Ver cursos
                  </button>
                </article>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'materias' ? (
        <Card>
          <CardHeader
            title="Materias"
            subtitle="Cada materia puede dictarse en varios cursos y cátedras."
            actions={
              <button
                type="button"
                className="btn primary"
                onClick={() => setSubjectForm({ ...EMPTY_SUBJECT })}
              >
                <Icon name="plus" size={17} /> Nueva materia
              </button>
            }
          />
          {subjects.length === 0 ? (
            <EmptyState
              icon="book"
              title="Todavía no hay materias"
              description="Creá las materias que dictás y después asociálas a un curso. El programa se carga en cada cátedra."
              action={
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setSubjectForm({ ...EMPTY_SUBJECT })}
                >
                  <Icon name="plus" size={17} /> Agregar materia
                </button>
              }
            />
          ) : (
            <div className="entity-grid">
              {subjects.map((subject) => (
                <article className="entity-card subject-card" key={subject.id}>
                  <div className="subject-color" style={{ background: subject.color }} />
                  <div className="entity-top">
                    <span
                      className="entity-icon subject-dot"
                      style={{ background: `${subject.color}1f`, color: subject.color }}
                    >
                      <Icon name="book" size={20} />
                    </span>
                    <div className="entity-actions">
                      <button
                        type="button"
                        className="icon-button"
                        title="Editar materia"
                        onClick={() => setSubjectForm({ ...subject })}
                      >
                        <Icon name="edit" size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        title="Eliminar materia"
                        onClick={() => deleteSubject(subject)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                  <h3>{subject.name}</h3>
                  <p className={subject.description ? '' : 'muted'}>
                    {subject.description || 'Sin descripción'}
                  </p>
                  <div className="entity-meta">
                    {subject.code ? <Badge tone="neutral">{subject.code}</Badge> : null}
                    <Badge tone="info">{subject.topic_count} temas</Badge>
                    <Badge tone="neutral">
                      {subject.assignment_count} cátedras
                    </Badge>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'cursos' ? (
        <Card>
          <CardHeader
            title="Cursos"
            subtitle="Un colegio puede tener muchos cursos. Cada curso agrupa a sus alumnos."
            actions={
              <div className="inline-actions">
                <select
                  className="input input-compact"
                  value={schoolFilter}
                  onChange={(event) => setSchoolFilter(event.target.value)}
                >
                  <option value="">Todos los colegios</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn primary"
                  disabled={schools.length === 0}
                  onClick={() =>
                    setCourseForm({
                      ...EMPTY_COURSE,
                      school_id: schoolFilter || schools[0]?.id || '',
                    })
                  }
                >
                  <Icon name="plus" size={17} /> Nuevo curso
                </button>
              </div>
            }
          />
          {schools.length === 0 ? (
            <EmptyState
              icon="school"
              title="Primero necesitás un colegio"
              description="Los cursos pertenecen a un colegio. Creá uno desde la pestaña Colegios."
              action={
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setTab('colegios')}
                >
                  Ir a Colegios
                </button>
              }
            />
          ) : filteredCourses.length === 0 ? (
            <EmptyState
              icon="graduation"
              title="No hay cursos en esta selección"
              description="Agregá un curso para poder inscribir alumnos y armar cátedras."
              action={
                <button
                  type="button"
                  className="btn primary"
                  onClick={() =>
                    setCourseForm({
                      ...EMPTY_COURSE,
                      school_id: schoolFilter || schools[0]?.id || '',
                    })
                  }
                >
                  <Icon name="plus" size={17} /> Nuevo curso
                </button>
              }
            />
          ) : (
            <div className="course-groups">
              {groupedCourses.map(([schoolName, schoolCourses]) => (
                <div className="course-group" key={schoolName}>
                  <div className="course-group-head">
                    <Icon name="school" size={17} />
                    <h3>{schoolName}</h3>
                    <span>{schoolCourses.length} cursos</span>
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Curso</th>
                          <th>Año</th>
                          <th>División</th>
                          <th>Alumnos</th>
                          <th>Cátedras</th>
                          <th className="align-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schoolCourses.map((course) => (
                          <tr key={course.id}>
                            <td>
                              <strong>{course.name}</strong>
                            </td>
                            <td>{course.year ?? '—'}</td>
                            <td>{course.division || '—'}</td>
                            <td>{course.student_count}</td>
                            <td>{course.assignment_count}</td>
                            <td className="align-right">
                              <div className="row-actions">
                                <button
                                  type="button"
                                  className="icon-button"
                                  title="Editar curso"
                                  onClick={() =>
                                    setCourseForm({
                                      ...course,
                                      school_id: String(course.school_id),
                                      year: course.year ?? '',
                                    })
                                  }
                                >
                                  <Icon name="edit" size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-button danger"
                                  title="Eliminar curso"
                                  onClick={() => deleteCourse(course)}
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
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'docente' ? (
        <Card>
          <CardHeader
            title="Datos del docente"
            subtitle="Se usan en las planificaciones descargadas."
          />
          <form className="form-grid" onSubmit={saveTeacher}>
            <Field label="Nombre y apellido" className="full">
              <input
                className="input"
                value={teacherName}
                onChange={(event) => setTeacherName(event.target.value)}
                placeholder="Ej. Gustavo Federico Salinas Talamilla"
              />
            </Field>
            <Field label="Correo">
              <input
                className="input"
                type="email"
                value={teacherEmail}
                onChange={(event) => setTeacherEmail(event.target.value)}
                placeholder="opcional"
              />
            </Field>
            <Field label="Teléfono">
              <input
                className="input"
                value={teacherPhone}
                onChange={(event) => setTeacherPhone(event.target.value)}
                placeholder="opcional"
              />
            </Field>
            <div className="form-actions full">
              <button type="submit" className="btn primary">
                Guardar datos del docente
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      {tab === 'calendario' ? (
        <Card>
          <CardHeader
            title="Calendario académico"
            subtitle="Los feriados nacionales de Argentina se excluyen automáticamente al generar la planificación."
            actions={
              <label className="calendar-year">
                <span className="field-label">Año</span>
                <input
                  className="input"
                  type="number"
                  min="2000"
                  max="2100"
                  value={calendarYear}
                  onChange={(event) => setCalendarYear(event.target.value)}
                />
              </label>
            }
          />
          <div className="calendar-grid">
            <section className="calendar-section">
              <div className="calendar-section-head">
                <h3>Feriados nacionales</h3>
                <Badge tone="info">{nationalHolidays.length}</Badge>
              </div>
              <p className="muted small">
                Incluye feriados inamovibles, Carnaval, Viernes Santo y feriados
                trasladables según la Ley 27.399.
              </p>
              <div className="calendar-list">
                {nationalHolidays.map((holiday) => (
                  <div className="calendar-row" key={holiday.date}>
                    <span className="calendar-date">
                      {formatDate(holiday.date)}
                    </span>
                    <span className="calendar-name">{holiday.name}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="calendar-section">
              <div className="calendar-section-head">
                <h3>Días sin clases</h3>
                <button
                  type="button"
                  className="btn small"
                  onClick={openCalendarException}
                >
                  <Icon name="plus" size={15} /> Agregar
                </button>
              </div>
              <p className="muted small">
                Agregá feriados puente, jornadas institucionales u otras fechas
                que no deban planificarse.
              </p>
              {calendarExceptions.length === 0 ? (
                <p className="muted small">
                  No hay días personalizados para {calendarYear}.
                </p>
              ) : (
                <div className="calendar-list">
                  {calendarExceptions.map((exception) => (
                    <div className="calendar-row" key={exception.id}>
                      <span className="calendar-date">
                        {formatDate(exception.date)}
                      </span>
                      <span className="calendar-name">{exception.name}</span>
                      <button
                        type="button"
                        className="icon-button danger"
                        title="Eliminar día sin clases"
                        onClick={() => deleteCalendarException(exception)}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </Card>
      ) : null}

      {tab === 'datos' ? (
        <div className="settings-data-grid">
          <Card>
            <CardHeader
              title="Copia de seguridad"
              subtitle="Tus datos viven en este navegador. Descargá una copia cada tanto."
            />
            <div className="data-actions">
              <div className="data-action">
                <span className="entity-icon">
                  <Icon name="download" size={20} />
                </span>
                <div>
                  <strong>Exportar base de datos</strong>
                  <p>Descargá un archivo SQLite con toda la información.</p>
                </div>
                <button type="button" className="btn" onClick={handleExport}>
                  Descargar
                </button>
              </div>
              <div className="data-action">
                <span className="entity-icon">
                  <Icon name="upload" size={20} />
                </span>
                <div>
                  <strong>Importar copia</strong>
                  <p>Restaurá una copia exportada previamente.</p>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => importRef.current?.click()}
                >
                  Importar
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept=".sqlite,.db,.sqlite3,application/octet-stream"
                  className="visually-hidden"
                  onChange={handleImport}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Preferencias"
              subtitle="Valores sugeridos al crear nuevas cátedras."
            />
            <form className="form-grid" onSubmit={savePreferences}>
              <Field label="Nota mínima de aprobación" hint="Se usa por defecto en cada cátedra.">
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="10"
                  step="0.1"
                  value={defaultPassing}
                  onChange={(event) => setDefaultPassing(event.target.value)}
                />
              </Field>
              <Field label="Año lectivo actual" hint="Se sugiere al crear cátedras y alumnos.">
                <input
                  className="input"
                  type="number"
                  min="2000"
                  max="2100"
                  value={defaultYear}
                  onChange={(event) => setDefaultYear(event.target.value)}
                />
              </Field>
              <div className="form-actions full">
                <button type="submit" className="btn primary">
                  Guardar preferencias
                </button>
              </div>
            </form>
          </Card>

          <Card className="danger-zone">
            <CardHeader
              title="Zona de riesgo"
              subtitle="Estas acciones no se pueden deshacer."
            />
            <div className="data-action">
              <span className="entity-icon danger">
                <Icon name="trash" size={20} />
              </span>
              <div>
                <strong>Borrar todos los datos</strong>
                <p>Elimina colegios, cursos, alumnos, notas y planificaciones.</p>
              </div>
              <button type="button" className="btn danger" onClick={handleReset}>
                Restablecer
              </button>
            </div>
          </Card>
        </div>
      ) : null}

      <Modal
        open={Boolean(schoolForm)}
        title={schoolForm?.id ? 'Editar colegio' : 'Nuevo colegio'}
        description="Los cursos y cátedras se organizan dentro de cada colegio."
        onClose={() => setSchoolForm(null)}
        footer={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setSchoolForm(null)}
            >
              Cancelar
            </button>
            <button type="submit" form="school-form" className="btn primary">
              Guardar
            </button>
          </>
        }
      >
        {schoolForm ? (
          <form id="school-form" className="form-grid" onSubmit={saveSchool}>
            <Field label="Nombre del colegio" className="full">
              <input
                className="input"
                value={schoolForm.name}
                onChange={(event) =>
                  setSchoolForm({ ...schoolForm, name: event.target.value })
                }
                placeholder="Ej. Colegio San Martín"
                autoFocus
              />
            </Field>
            <Field label="Dirección" className="full">
              <input
                className="input"
                value={schoolForm.address}
                onChange={(event) =>
                  setSchoolForm({ ...schoolForm, address: event.target.value })
                }
                placeholder="Calle, número, localidad"
              />
            </Field>
            <Field label="Notas" className="full">
              <textarea
                className="input"
                rows="3"
                value={schoolForm.notes}
                onChange={(event) =>
                  setSchoolForm({ ...schoolForm, notes: event.target.value })
                }
                placeholder="Información útil del colegio"
              />
            </Field>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(subjectForm)}
        title={subjectForm?.id ? 'Editar materia' : 'Nueva materia'}
        description="Después podés asociarla a una cátedra para cargar su programa tema por tema."
        onClose={() => setSubjectForm(null)}
        footer={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setSubjectForm(null)}
            >
              Cancelar
            </button>
            <button type="submit" form="subject-form" className="btn primary">
              Guardar
            </button>
          </>
        }
      >
        {subjectForm ? (
          <form id="subject-form" className="form-grid" onSubmit={saveSubject}>
            <Field label="Nombre de la materia" className="full">
              <input
                className="input"
                value={subjectForm.name}
                onChange={(event) =>
                  setSubjectForm({ ...subjectForm, name: event.target.value })
                }
                placeholder="Ej. Historia"
                autoFocus
              />
            </Field>
            <Field label="Código">
              <input
                className="input"
                value={subjectForm.code}
                onChange={(event) =>
                  setSubjectForm({ ...subjectForm, code: event.target.value })
                }
                placeholder="Ej. HIS-3"
              />
            </Field>
            <Field label="Color">
              <div className="color-field">
                <input
                  type="color"
                  value={subjectForm.color}
                  onChange={(event) =>
                    setSubjectForm({ ...subjectForm, color: event.target.value })
                  }
                  aria-label="Color de la materia"
                />
                <span>{subjectForm.color}</span>
              </div>
            </Field>
            <Field label="Descripción" className="full">
              <textarea
                className="input"
                rows="3"
                value={subjectForm.description}
                onChange={(event) =>
                  setSubjectForm({ ...subjectForm, description: event.target.value })
                }
                placeholder="Una breve descripción de la materia"
              />
            </Field>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(courseForm)}
        title={courseForm?.id ? 'Editar curso' : 'Nuevo curso'}
        description="Un curso pertenece a un colegio y reúne a sus alumnos."
        onClose={() => setCourseForm(null)}
        footer={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setCourseForm(null)}
            >
              Cancelar
            </button>
            <button type="submit" form="course-form" className="btn primary">
              Guardar
            </button>
          </>
        }
      >
        {courseForm ? (
          <form id="course-form" className="form-grid" onSubmit={saveCourse}>
            <Field label="Colegio" className="full">
              <select
                className="input"
                value={courseForm.school_id}
                onChange={(event) =>
                  setCourseForm({ ...courseForm, school_id: event.target.value })
                }
              >
                <option value="">Seleccioná un colegio</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nombre del curso">
              <input
                className="input"
                value={courseForm.name}
                onChange={(event) =>
                  setCourseForm({ ...courseForm, name: event.target.value })
                }
                placeholder="Ej. 3° Año"
                autoFocus
              />
            </Field>
            <Field label="Año">
              <input
                className="input"
                type="number"
                min="1"
                max="7"
                value={courseForm.year}
                onChange={(event) =>
                  setCourseForm({ ...courseForm, year: event.target.value })
                }
                placeholder="Ej. 3"
              />
            </Field>
            <Field label="División">
              <input
                className="input"
                value={courseForm.division}
                onChange={(event) =>
                  setCourseForm({ ...courseForm, division: event.target.value })
                }
                placeholder="Ej. A"
              />
            </Field>
            <Field label="Notas" className="full">
              <textarea
                className="input"
                rows="2"
                value={courseForm.notes}
                onChange={(event) =>
                  setCourseForm({ ...courseForm, notes: event.target.value })
                }
                placeholder="Observaciones del curso"
              />
            </Field>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(exceptionForm)}
        title="Día sin clases"
        description={`Calendario académico ${calendarYear}`}
        onClose={() => setExceptionForm(null)}
        footer={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setExceptionForm(null)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="calendar-exception-form"
              className="btn primary"
            >
              Guardar
            </button>
          </>
        }
      >
        {exceptionForm ? (
          <form
            id="calendar-exception-form"
            className="form-grid"
            onSubmit={saveCalendarException}
          >
            <Field label="Fecha" className="full">
              <input
                className="input"
                type="date"
                min={`${calendarYear}-01-01`}
                max={`${calendarYear}-12-31`}
                value={exceptionForm.date}
                onChange={(event) =>
                  setExceptionForm({ ...exceptionForm, date: event.target.value })
                }
              />
            </Field>
            <Field label="Motivo" className="full">
              <input
                className="input"
                value={exceptionForm.name}
                onChange={(event) =>
                  setExceptionForm({ ...exceptionForm, name: event.target.value })
                }
                placeholder="Ej. Feriado puente, jornada institucional"
                autoFocus
              />
            </Field>
          </form>
        ) : null}
      </Modal>

      <div className="privacy-note">
        <Icon name="database" size={16} />
        <span>
          Los datos se guardan automáticamente en este navegador mediante SQLite
          y IndexedDB. No se envía información a ningún servidor.
        </span>
      </div>
    </div>
  )
}
