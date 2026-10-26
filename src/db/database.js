import initSqlJs from 'sql.js'
import schema from './schema.sql?raw'
import { clearSnapshot, loadSnapshot, saveSnapshot } from './storage'

const SCHEMA_VERSION = 5

let SQL = null
let db = null
let initPromise = null
let persistTimer = null
let persistPromise = null
let transactionDepth = 0

function ensureDatabase() {
  if (!db) throw new Error('La base de datos todavía no está inicializada.')
  return db
}

function rawAll(sql, params = []) {
  const database = ensureDatabase()
  const statement = database.prepare(sql)
  try {
    if (params && params.length > 0) statement.bind(params)
    const rows = []
    while (statement.step()) rows.push(statement.getAsObject())
    return rows
  } finally {
    statement.free()
  }
}

function rawRun(sql, params = []) {
  const database = ensureDatabase()
  if (params && params.length > 0) {
    database.run(sql, params)
  } else {
    database.run(sql)
  }
}

function seedSettings() {
  const year = new Date().getFullYear()
  rawRun(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
    ['default_passing_grade', '6'],
  )
  rawRun('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [
    'default_school_year',
    String(year),
  ])
}

function applySchema() {
  rawRun(schema)
  seedSettings()
}

function hasColumn(table, column) {
  return rawAll(`PRAGMA table_info(${table})`).some((row) => row.name === column)
}

function addColumn(table, column, definition) {
  if (!hasColumn(table, column)) {
    rawRun(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function migratePlanningSchema() {
  addColumn('assignments', 'start_date', "TEXT NOT NULL DEFAULT ''")
  addColumn('assignments', 'end_date', "TEXT NOT NULL DEFAULT ''")
  addColumn('topics', 'class_count', 'INTEGER NOT NULL DEFAULT 1')
  addColumn('plans', 'source', "TEXT NOT NULL DEFAULT 'manual'")
  addColumn('plans', 'activity_id', 'INTEGER REFERENCES activities(id) ON DELETE SET NULL')
}

function migrateTopicsToAssignments() {
  if (!hasColumn('topics', 'subject_id') || hasColumn('topics', 'assignment_id')) {
    return
  }

  rawRun('PRAGMA foreign_keys = OFF')
  let inTransaction = false
  try {
    rawRun('BEGIN')
    inTransaction = true

    rawRun(
      `CREATE TABLE topics_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 1,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        objectives TEXT NOT NULL DEFAULT ''
      )`,
    )

    const oldTopics = rawAll('SELECT * FROM topics')
    const assignments = rawAll('SELECT id, subject_id FROM assignments')

    for (const topic of oldTopics) {
      for (const assignment of assignments) {
        if (assignment.subject_id !== topic.subject_id) continue
        rawRun(
          `INSERT INTO topics_next
            (assignment_id, position, title, description, objectives)
           VALUES (?, ?, ?, ?, ?)`,
          [
            assignment.id,
            topic.position,
            topic.title,
            topic.description,
            topic.objectives,
          ],
        )
        const nextId = rawAll('SELECT last_insert_rowid() AS id')[0]?.id
        rawRun(
          'UPDATE plans SET topic_id = ? WHERE topic_id = ? AND assignment_id = ?',
          [nextId, topic.id, assignment.id],
        )
      }
    }

    rawRun(
      `UPDATE plans SET topic_id = NULL
       WHERE topic_id IS NOT NULL
         AND topic_id NOT IN (
           SELECT t.id FROM topics_next t WHERE t.assignment_id = plans.assignment_id
         )`,
    )

    rawRun('DROP TABLE topics')
    rawRun('ALTER TABLE topics_next RENAME TO topics')
    rawRun('COMMIT')
    inTransaction = false
  } catch (error) {
    if (inTransaction) rawRun('ROLLBACK')
    throw error
  } finally {
    rawRun('PRAGMA foreign_keys = ON')
  }
}

function upgradeSchema() {
  const hasSchema =
    rawAll(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schools'",
    ).length > 0

  if (!hasSchema) {
    applySchema()
    rawRun(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    return true
  }

  migrateTopicsToAssignments()
  migratePlanningSchema()
  applySchema()
  rawRun(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  return true
}

export async function initDatabase() {
  if (db) return db
  if (initPromise) return initPromise

  initPromise = (async () => {
    SQL = await initSqlJs({
      locateFile: (file) => `${import.meta.env.BASE_URL}${file}`,
    })

    const snapshot = await loadSnapshot()
    db = snapshot ? new SQL.Database(snapshot) : new SQL.Database()

    rawRun('PRAGMA foreign_keys = ON')

    const upgraded = upgradeSchema()
    seedSettings()
    if (upgraded) await saveSnapshot(db.export())

    return db
  })()

  try {
    return await initPromise
  } catch (error) {
    db = null
    throw error
  } finally {
    initPromise = null
  }
}

export function isReady() {
  return Boolean(db)
}

export function all(sql, params = []) {
  return rawAll(sql, params)
}

export function get(sql, params = []) {
  return rawAll(sql, params)[0] ?? null
}

export function run(sql, params = []) {
  rawRun(sql, params)
  if (transactionDepth === 0) schedulePersist()
  return rawAll('SELECT last_insert_rowid() AS id')[0]?.id ?? null
}

export function cancelScheduledPersist() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
}

export function schedulePersist() {
  cancelScheduledPersist()
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistNow()
  }, 200)
}

export async function persistNow() {
  if (!db) return false
  if (persistPromise) return persistPromise
  persistPromise = saveSnapshot(db.export()).finally(() => {
    persistPromise = null
  })
  return persistPromise
}

export function transaction(callback) {
  cancelScheduledPersist()
  transactionDepth += 1
  rawRun('BEGIN')
  try {
    const result = callback()
    rawRun('COMMIT')
    return result
  } catch (error) {
    rawRun('ROLLBACK')
    throw error
  } finally {
    transactionDepth -= 1
    if (transactionDepth === 0) schedulePersist()
  }
}

export function getSetting(key, fallback = '') {
  const row = get('SELECT value FROM settings WHERE key = ?', [key])
  return row ? row.value : fallback
}

export function setSetting(key, value) {
  run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value)],
  )
}

export function exportDatabaseBytes() {
  return ensureDatabase().export()
}

export async function importDatabaseBytes(bytes) {
  if (!SQL) throw new Error('SQLite no está inicializado.')
  const nextDatabase = new SQL.Database(new Uint8Array(bytes))
  const hasSchema =
    nextDatabase.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schools'",
    ).length > 0
  if (!hasSchema) {
    nextDatabase.close()
    throw new Error('El archivo no parece ser una copia válida de Aula Docente.')
  }
  nextDatabase.run('PRAGMA foreign_keys = ON')
  if (db) db.close()
  db = nextDatabase
  upgradeSchema()
  seedSettings()
  await saveSnapshot(db.export())
}

export async function resetDatabase() {
  const database = ensureDatabase()
  const tables = rawAll(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  )
  rawRun('PRAGMA foreign_keys = OFF')
  for (const table of tables) {
    rawRun(`DROP TABLE IF EXISTS "${table.name.replaceAll('"', '""')}"`)
  }
  applySchema()
  rawRun(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  rawRun('PRAGMA foreign_keys = ON')
  cancelScheduledPersist()
  await saveSnapshot(database.export())
  await clearSnapshot().catch(() => {})
  await saveSnapshot(database.export())
}
