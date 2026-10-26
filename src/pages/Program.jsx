import { useState } from 'react'
import { run } from '../db/database'
import { useData } from '../context/data-context'
import { useSqlQuery } from '../hooks/useSqlQuery'
import { useToast } from '../context/toast-context'
import { Icon } from '../components/Icon'
import { RichTextEditor } from '../components/RichTextEditor'
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
} from '../components/UI'

const EMPTY_TOPIC = {
  title: '',
  class_count: '1',
  description: '',
  objectives: '',
}

export default function Program({ navigate, params = {} }) {
  const { mutate, mutateMany } = useData()
  const toast = useToast()
  const [assignmentId, setAssignmentId] = useState(
    params.assignment ? String(params.assignment) : '',
  )
  const [topicForm, setTopicForm] = useState(null)

  const assignments = useSqlQuery(
    `SELECT a.*, c.name AS course_name, c.division,
            sh.name AS school_name,
            sub.name AS subject_name, sub.color AS subject_color,
            sub.description AS subject_description
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
    `SELECT t.*,
      (SELECT COUNT(*) FROM plans pl WHERE pl.topic_id = t.id) AS plan_count
     FROM topics t
     WHERE t.assignment_id = ?
     ORDER BY t.position, t.id`,
    [assignment?.id ?? 0],
  )
  const totalClasses = topics.reduce(
    (total, topic) => total + Math.max(1, Number(topic.class_count) || 1),
    0,
  )

  function openNewTopic() {
    if (!assignment) return
    const nextPosition =
      topics.reduce((max, topic) => Math.max(max, topic.position), 0) + 1
    setTopicForm({ ...EMPTY_TOPIC, position: nextPosition })
  }

  function saveTopic(event) {
    event.preventDefault()
    if (!assignment) return
    const title = topicForm.title.trim()
    if (!title) {
      toast('El título del tema es obligatorio.', 'error')
      return
    }
    const classCount = Number(topicForm.class_count)
    if (!Number.isInteger(classCount) || classCount < 1) {
      toast('La cantidad de clases debe ser un número entero mayor que cero.', 'error')
      return
    }
    if (topicForm.id) {
      mutate(
        `UPDATE topics
         SET title = ?, description = ?, objectives = ?, class_count = ?
         WHERE id = ?`,
        [
          title,
          topicForm.description.trim(),
          topicForm.objectives.trim(),
          classCount,
          topicForm.id,
        ],
      )
      toast('Tema actualizado.')
    } else {
      mutate(
        `INSERT INTO topics
          (assignment_id, position, title, description, objectives, class_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          assignment.id,
          topicForm.position,
          title,
          topicForm.description.trim(),
          topicForm.objectives.trim(),
          classCount,
        ],
      )
      toast('Tema agregado al programa.')
    }
    setTopicForm(null)
  }

  function deleteTopic(topic) {
    const confirmed = window.confirm(
      `¿Eliminar el tema "${topic.title}"? Las planificaciones que lo usan quedarán sin tema asociado.`,
    )
    if (!confirmed) return
    mutate('DELETE FROM topics WHERE id = ?', [topic.id])
    toast('Tema eliminado.')
  }

  function moveTopic(topic, direction) {
    const index = topics.findIndex((item) => item.id === topic.id)
    const neighbor = topics[index + direction]
    if (!neighbor) return
    mutateMany(() => {
      run('UPDATE topics SET position = ? WHERE id = ?', [
        neighbor.position,
        topic.id,
      ])
      run('UPDATE topics SET position = ? WHERE id = ?', [
        topic.position,
        neighbor.id,
      ])
    })
  }

  if (assignments.length === 0) {
    return (
      <div className="page-stack">
        <PageHeader
          eyebrow="Programa"
          title="Programa de cada cátedra"
          description="Organizá los contenidos tema por tema para después planificar cada clase."
        />
        <Card>
          <EmptyState
            icon="book"
            title="Primero necesitás una cátedra"
            description="El programa se organiza dentro de cada cátedra, con su curso y materia."
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
        eyebrow="Programa"
        title="Contenidos tema por tema"
        description="Cada cátedra tiene su propio programa. Después podés asociar cada tema a una clase planificada."
        actions={
          <button type="button" className="btn primary" onClick={openNewTopic}>
            <Icon name="plus" size={17} /> Nuevo tema
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
            <span
              className="subject-dot"
              style={{ color: assignment.subject_color }}
            >
              <Icon name="book" size={18} />
            </span>
            <div>
              <strong>{assignment.subject_name}</strong>
              <small>
                {assignment.course_name}
                {assignment.division ? ` · ${assignment.division}` : ''} ·{' '}
                {assignment.school_name}
              </small>
            </div>
          </div>
        </div>
        <div className="planning-meta">
          <span className="muted small">
            {topics.length} tema{topics.length === 1 ? '' : 's'} ·{' '}
            {totalClasses} clase{totalClasses === 1 ? '' : 's'} prevista
            {totalClasses === 1 ? '' : 's'}
          </span>
          <Badge tone="neutral">{assignment.school_year}</Badge>
        </div>
        {assignment.subject_description ? (
          <p className="subject-description">
            {assignment.subject_description}
          </p>
        ) : null}
      </Card>

      <Card>
        {topics.length === 0 ? (
          <EmptyState
            icon="list"
            title="El programa está vacío"
            description={`Agregá el primer tema de ${assignment.subject_name} para ${assignment.course_name} y después planificá las clases.`}
            action={
              <button
                type="button"
                className="btn primary"
                onClick={openNewTopic}
              >
                <Icon name="plus" size={17} /> Agregar tema
              </button>
            }
          />
        ) : (
          <div className="topic-list">
            {topics.map((topic, index) => (
              <article className="topic-card" key={topic.id}>
                <div className="topic-number">{index + 1}</div>
                <div className="topic-content">
                  <div className="topic-head">
                    <h3>{topic.title}</h3>
                    <div className="topic-actions">
                      <Badge tone="neutral">
                        {Math.max(1, Number(topic.class_count) || 1)} clase
                        {Math.max(1, Number(topic.class_count) || 1) === 1 ? '' : 's'}
                      </Badge>
                      {topic.plan_count > 0 ? (
                        <Badge tone="info">
                          {topic.plan_count} planificada
                          {topic.plan_count === 1 ? '' : 's'}
                        </Badge>
                      ) : null}
                      <button
                        type="button"
                        className="icon-button"
                        title="Subir tema"
                        disabled={index === 0}
                        onClick={() => moveTopic(topic, -1)}
                      >
                        <Icon name="arrow-up" size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title="Bajar tema"
                        disabled={index === topics.length - 1}
                        onClick={() => moveTopic(topic, 1)}
                      >
                        <Icon name="arrow-down" size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title="Editar tema"
                        onClick={() =>
                          setTopicForm({
                            ...topic,
                            class_count: String(topic.class_count ?? 1),
                          })
                        }
                      >
                        <Icon name="edit" size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        title="Eliminar tema"
                        onClick={() => deleteTopic(topic)}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </div>
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
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(topicForm)}
        title={topicForm?.id ? 'Editar tema' : 'Nuevo tema'}
        description={
          assignment
            ? `${assignment.subject_name} · ${assignment.course_name}`
            : ''
        }
        onClose={() => setTopicForm(null)}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setTopicForm(null)}
            >
              Cancelar
            </button>
            <button type="submit" form="topic-form" className="btn primary">
              Guardar
            </button>
          </>
        }
      >
        {topicForm ? (
          <form id="topic-form" className="form-grid" onSubmit={saveTopic}>
            <Field label="Título del tema" className="full">
              <input
                className="input"
                value={topicForm.title}
                onChange={(event) =>
                  setTopicForm({ ...topicForm, title: event.target.value })
                }
                placeholder="Ej. La Revolución Francesa"
                autoFocus
              />
            </Field>
            <Field
              label="Clases estimadas"
              hint="Cuántos encuentros le vas a dedicar a este tema."
              className="full"
            >
              <input
                className="input"
                type="number"
                min="1"
                step="1"
                value={topicForm.class_count}
                onChange={(event) =>
                  setTopicForm({ ...topicForm, class_count: event.target.value })
                }
              />
            </Field>
            <Field label="Contenidos" className="full">
              <textarea
                className="input"
                rows="4"
                value={topicForm.description}
                onChange={(event) =>
                  setTopicForm({ ...topicForm, description: event.target.value })
                }
                placeholder="Contenidos, conceptos y actividades previstas"
              />
            </Field>
            <div className="field full">
              <span className="field-label">Objetivos de aprendizaje</span>
              <RichTextEditor
                value={topicForm.objectives}
                onChange={(value) =>
                  setTopicForm((current) => ({ ...current, objectives: value }))
                }
                placeholder="Qué se espera que logren los alumnos"
              />
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
