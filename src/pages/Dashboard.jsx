import { useMemo, useState } from 'react'
import { useData } from '../context/data-context'
import { useSqlQuery } from '../hooks/useSqlQuery'
import { Icon } from '../components/Icon'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  StatCard,
} from '../components/UI'
import {
  DistributionBars,
  DonutChart,
  PeriodBars,
} from '../components/Charts'
import {
  WEEKDAYS,
  formatDate,
  formatGrade,
  formatTimeRange,
  gradeTone,
  studentFullName,
} from '../lib/format'
import {
  getAssignmentStats,
  getOverallStats,
  getUpcomingPlans,
  getWeeklySchedule,
} from '../lib/stats'

const STATUS_LABELS = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  completada: 'Completada',
}

export default function Dashboard({ navigate }) {
  const { version } = useData()
  const [selectedId, setSelectedId] = useState('')

  const overview = useMemo(() => {
    void version
    return getOverallStats()
  }, [version])

  const assignments = useSqlQuery(
    `SELECT a.*, c.name AS course_name, c.division,
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
    assignments.find((item) => String(item.id) === String(selectedId)) ??
    assignments[0]

  const stats = useMemo(
    () => (assignment ? getAssignmentStats(assignment.id) : null),
    [assignment],
  )

  const upcoming = useMemo(
    () => (assignment ? getUpcomingPlans(assignment.id, 5) : []),
    [assignment],
  )

  const weekly = useMemo(
    () =>
      assignment ? getWeeklySchedule(assignment.school_year) : [],
    [assignment],
  )

  const weeklyByDay = useMemo(() => {
    const map = new Map()
    for (const slot of weekly) {
      if (!map.has(slot.weekday)) map.set(slot.weekday, [])
      map.get(slot.weekday).push(slot)
    }
    return map
  }, [weekly])

  const now = new Date()
  const todayLabel = now.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  if (overview.schools === 0 && overview.subjects === 0) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="Panel de control"
          title="Bienvenido a Aula Docente"
          description="Organizá tu trabajo docente en cuatro pasos. Los datos quedan guardados en este navegador."
        />
        <Card className="welcome-card">
          <div className="welcome-hero">
            <span className="welcome-icon">
              <Icon name="graduation" size={34} />
            </span>
            <div>
              <h2>Empecemos por lo básico</h2>
              <p>
                Cargá tu estructura de trabajo y después armá las cátedras con
                alumnos, notas y planificaciones.
              </p>
            </div>
          </div>
          <div className="steps-grid">
            <div className="step-card">
              <span className="step-number">1</span>
              <h3>Colegios</h3>
              <p>Agregá todos los colegios en los que trabajás.</p>
              <button
                type="button"
                className="btn small"
                onClick={() => navigate('configuracion')}
              >
                Configurar colegios
              </button>
            </div>
            <div className="step-card">
              <span className="step-number">2</span>
              <h3>Materias</h3>
              <p>Creá las materias que vas a dictar en tus cátedras.</p>
              <button
                type="button"
                className="btn small"
                onClick={() => navigate('configuracion')}
              >
                Configurar materias
              </button>
            </div>
            <div className="step-card">
              <span className="step-number">3</span>
              <h3>Cursos</h3>
              <p>Cada colegio puede tener varios cursos y divisiones.</p>
              <button
                type="button"
                className="btn small"
                onClick={() => navigate('configuracion')}
              >
                Configurar cursos
              </button>
            </div>
            <div className="step-card">
              <span className="step-number">4</span>
              <h3>Cátedras</h3>
              <p>Uní curso, materia y régimen. Después cargá su programa y planificación.</p>
              <button
                type="button"
                className="btn small"
                onClick={() => navigate('catedras')}
              >
                Crear cátedra
              </button>
            </div>
          </div>
        </Card>
        <Card className="notice-card">
          <span className="entity-icon">
            <Icon name="database" size={20} />
          </span>
          <div>
            <strong>Privacidad y respaldo</strong>
            <p>
              La información se guarda localmente con SQLite. Podés descargar
              una copia de seguridad desde Configuración → Datos y respaldo.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => navigate('configuracion')}
          >
            Ver configuración
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Panel de control"
        title="Resumen del trabajo"
        description={`${todayLabel.charAt(0).toUpperCase()}${todayLabel.slice(1)}`}
        actions={
          <button
            type="button"
            className="btn"
            onClick={() => navigate('configuracion')}
          >
            <Icon name="settings" size={16} /> Configuración
          </button>
        }
      />

      <div className="overview-grid">
        <StatCard
          icon="school"
          label="Colegios"
          value={overview.schools}
          detail={`${overview.courses} cursos`}
          tone="accent"
        />
        <StatCard
          icon="book"
          label="Materias"
          value={overview.subjects}
          detail={`${overview.topics} temas de programa`}
          tone="info"
        />
        <StatCard
          icon="graduation"
          label="Cátedras"
          value={overview.assignments}
          detail={`${overview.courses} cursos activos`}
          tone="success"
        />
        <StatCard
          icon="users"
          label="Alumnos"
          value={overview.students}
          detail={`${overview.plans} clases planificadas`}
          tone="warning"
        />
      </div>

      {assignments.length === 0 ? (
        <Card>
          <EmptyState
            icon="graduation"
            title="Ya tenés la base, falta crear las cátedras"
            description="Usá el paso 4 o el botón “Crear cátedra” para asociar un colegio, un curso y una materia y empezar a cargar alumnos y notas."
          />
        </Card>
      ) : (
        <>
          <Card className="filter-card">
            <div className="filter-row">
              <Field label="Cátedra para analizar" className="grow">
                <select
                  className="input"
                  value={assignment.id}
                  onChange={(event) => setSelectedId(event.target.value)}
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
                <span
                  className="subject-dot"
                  style={{ color: assignment.subject_color }}
                >
                  <Icon name="chart" size={18} />
                </span>
                <div>
                  <strong>{assignment.subject_name}</strong>
                  <small>
                    {assignment.course_name} · {assignment.school_name}
                  </small>
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  navigate('notas', { assignment: assignment.id })
                }
              >
                <Icon name="clipboard" size={16} /> Ver notas
              </button>
            </div>
          </Card>

          {stats ? (
            <>
              <div className="overview-grid stats-overview">
                <StatCard
                  icon="users"
                  label="Alumnos"
                  value={stats.rows.length}
                  detail={`${stats.activityCount} actividades en el año`}
                  tone="accent"
                />
                <StatCard
                  icon="chart"
                  label="Promedio anual"
                  value={formatGrade(stats.yearAverage)}
                  detail={`Aprueba con ${stats.passing}`}
                  tone={
                    stats.yearAverage === null
                      ? 'neutral'
                      : stats.yearAverage >= stats.passing
                        ? 'success'
                        : 'danger'
                  }
                />
                <StatCard
                  icon="check"
                  label="Aprobados"
                  value={stats.approved}
                  detail={`${stats.withoutData} sin datos`}
                  tone="success"
                />
                <StatCard
                  icon="alert"
                  label="Desaprobados"
                  value={stats.failed}
                  detail={`${Math.round(stats.completion)}% de notas cargadas`}
                  tone="danger"
                />
              </div>

              <div className="dashboard-grid">
                <Card>
                  <CardHeader
                    title="Promedio por período"
                    subtitle="La nota de cada período incluye actividades y concepto."
                  />
                  {stats.periodAverages.every(
                    (period) => period.average === null,
                  ) ? (
                    <EmptyState
                      icon="chart"
                      title="Todavía no hay notas"
                      description="Cargá actividades en Notas para ver la evolución del grupo."
                      action={
                        <button
                          type="button"
                          className="btn primary small"
                          onClick={() =>
                            navigate('notas', { assignment: assignment.id })
                          }
                        >
                          Cargar notas
                        </button>
                      }
                    />
                  ) : (
                    <>
                      <PeriodBars
                        items={stats.periodAverages}
                        passing={stats.passing}
                      />
                      <div className="completion">
                        <span>Notas cargadas</span>
                        <div className="progress">
                          <span
                            style={{
                              width: `${Math.min(100, stats.completion)}%`,
                            }}
                          />
                        </div>
                        <strong>{Math.round(stats.completion)}%</strong>
                      </div>
                    </>
                  )}
                </Card>

                <Card>
                  <CardHeader
                    title="Situación del grupo"
                    subtitle="Resultado anual según la nota mínima."
                  />
                  <DonutChart
                    centerValue={`${stats.approved}/${stats.rows.length}`}
                    centerLabel="aprobados"
                    segments={[
                      {
                        label: 'Aprobados',
                        value: stats.approved,
                        color: '#16a34a',
                      },
                      {
                        label: 'Desaprobados',
                        value: stats.failed,
                        color: '#dc2626',
                      },
                      {
                        label: 'Sin datos',
                        value: stats.withoutData,
                        color: '#cbd5e1',
                      },
                    ]}
                  />
                </Card>
              </div>

              <div className="dashboard-grid">
                <Card>
                  <CardHeader
                    title="Distribución de notas finales"
                    subtitle="Cantidad de alumnos por rango."
                  />
                  <DistributionBars
                    bins={stats.distribution}
                    total={stats.rows.filter((row) => row.hasData).length}
                  />
                </Card>

                <Card>
                  <CardHeader
                    title="Ranking del grupo"
                    subtitle="Ordenado por nota final anual."
                  />
                  {stats.ranking.length === 0 ? (
                    <EmptyState
                      icon="users"
                      title="No hay alumnos inscriptos"
                      description="Cargá el listado del curso para ver el ranking."
                      action={
                        <button
                          type="button"
                          className="btn primary small"
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
                    <div className="ranking-list">
                      {stats.ranking.map((row, index) => (
                        <div className="ranking-row" key={row.student.id}>
                          <span className="ranking-position">{index + 1}</span>
                          <div className="ranking-name">
                            <strong>{studentFullName(row.student)}</strong>
                            <small>
                              {row.periodFinals.filter((value) => value !== null).length}{' '}
                              períodos con notas
                            </small>
                          </div>
                          <span
                            className={`grade-pill tone-${gradeTone(
                              row.final,
                              stats.passing,
                            )}`}
                          >
                            {formatGrade(row.final)}
                          </span>
                          {row.hasData ? (
                            <Badge tone={row.approved ? 'success' : 'danger'}>
                              {row.approved ? 'Aprobado' : 'Desaprobado'}
                            </Badge>
                          ) : (
                            <Badge tone="neutral">Sin datos</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <div className="dashboard-grid">
                <Card>
                  <CardHeader
                    title="Mejores 5 del grupo"
                    subtitle="Alumnos con mejor nota final anual."
                  />
                  {stats.ranking.filter((row) => row.hasData).length === 0 ? (
                    <EmptyState
                      icon="users"
                      title="Sin notas cargadas"
                      description="Cargá actividades y notas para ver el ranking."
                    />
                  ) : (
                    <div className="ranking-list">
                      {stats.ranking
                        .filter((row) => row.hasData)
                        .slice(0, 5)
                        .map((row, index) => (
                          <div className="ranking-row" key={row.student.id}>
                            <span className="ranking-position">{index + 1}</span>
                            <div className="ranking-name">
                              <strong>{studentFullName(row.student)}</strong>
                              <small>
                                {row.periodFinals.filter((value) => value !== null).length}{' '}
                                períodos con notas
                              </small>
                            </div>
                            <span
                              className={`grade-pill tone-${gradeTone(
                                row.final,
                                stats.passing,
                              )}`}
                            >
                              {formatGrade(row.final)}
                            </span>
                            <Badge tone={row.approved ? 'success' : 'danger'}>
                              {row.approved ? 'Aprobado' : 'Desaprobado'}
                            </Badge>
                          </div>
                        ))}
                    </div>
                  )}
                </Card>

                <Card>
                  <CardHeader
                    title="Peores 5 del grupo"
                    subtitle="Alumnos con menor nota final anual."
                  />
                  {stats.ranking.filter((row) => row.hasData).length === 0 ? (
                    <EmptyState
                      icon="users"
                      title="Sin notas cargadas"
                      description="Cargá actividades y notas para ver el ranking."
                    />
                  ) : (
                    <div className="ranking-list">
                      {[...stats.ranking]
                        .filter((row) => row.hasData)
                        .sort((a, b) => (a.final ?? 0) - (b.final ?? 0))
                        .slice(0, 5)
                        .map((row, index) => (
                          <div className="ranking-row" key={row.student.id}>
                            <span className="ranking-position">{index + 1}</span>
                            <div className="ranking-name">
                              <strong>{studentFullName(row.student)}</strong>
                              <small>
                                {row.periodFinals.filter((value) => value !== null).length}{' '}
                                períodos con notas
                              </small>
                            </div>
                            <span
                              className={`grade-pill tone-${gradeTone(
                                row.final,
                                stats.passing,
                              )}`}
                            >
                              {formatGrade(row.final)}
                            </span>
                            <Badge tone={row.approved ? 'success' : 'danger'}>
                              {row.approved ? 'Aprobado' : 'Desaprobado'}
                            </Badge>
                          </div>
                        ))}
                    </div>
                  )}
                </Card>
              </div>

              <div className="dashboard-grid">
                <Card>
                  <CardHeader
                    title="Próximas clases"
                    subtitle="Planificaciones de esta cátedra."
                    actions={
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() =>
                          navigate('planificacion', {
                            assignment: assignment.id,
                          })
                        }
                      >
                        Ver todas
                      </button>
                    }
                  />
                  {upcoming.length === 0 ? (
                    <EmptyState
                      icon="calendar"
                      title="No hay clases próximas"
                      description="Planificá el próximo encuentro y asociá un tema del programa."
                      action={
                        <button
                          type="button"
                          className="btn primary small"
                          onClick={() =>
                            navigate('planificacion', {
                              assignment: assignment.id,
                            })
                          }
                        >
                          Planificar clase
                        </button>
                      }
                    />
                  ) : (
                    <div className="upcoming-list">
                      {upcoming.map((plan) => (
                        <div className="upcoming-row" key={plan.id}>
                          <div className="upcoming-date">
                            <strong>{formatDate(plan.date)}</strong>
                            <span>{plan.start_time || '—'}</span>
                          </div>
                          <div className="upcoming-content">
                            <strong>{plan.title}</strong>
                            <small>
                              {plan.topic_title || 'Sin tema asociado'} ·{' '}
                              {STATUS_LABELS[plan.status] ?? plan.status}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card>
                  <CardHeader
                    title="Horario semanal"
                    subtitle={`Todas las cátedras del año ${assignment.school_year}.`}
                  />
                  {weekly.length === 0 ? (
                    <EmptyState
                      icon="clock"
                      title="Sin horarios cargados"
                      description="Agregá días y horarios a las cátedras para ver el calendario semanal."
                      action={
                        <button
                          type="button"
                          className="btn primary small"
                          onClick={() => navigate('catedras')}
                        >
                          Ir a Cátedras
                        </button>
                      }
                    />
                  ) : (
                    <div className="week-board">
                      {WEEKDAYS.filter((day) => day.value <= 6).map((day) => {
                        const daySlots = weeklyByDay.get(day.value) ?? []
                        return (
                          <div className="week-day" key={day.value}>
                            <span className="week-day-name">{day.short}</span>
                            {daySlots.length === 0 ? (
                              <span className="week-empty">—</span>
                            ) : (
                              daySlots.map((slot) => (
                                <div
                                  className="week-slot"
                                  key={slot.id}
                                  style={{
                                    '--slot-color': slot.subject_color,
                                  }}
                                >
                                  <span className="week-slot-time">
                                    {formatTimeRange(
                                      slot.start_time,
                                      slot.end_time,
                                    )}
                                  </span>
                                  <strong>{slot.subject_name}</strong>
                                  <small>
                                    {slot.course_name}
                                    {slot.room ? ` · ${slot.room}` : ''}
                                  </small>
                                </div>
                              ))
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Card>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
