const DB_NAME = 'aula-docente'
const STORE_NAME = 'snapshots'
const SNAPSHOT_KEY = 'database'

let databasePromise = null

function openDatabase() {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return databasePromise
}

export async function loadSnapshot() {
  try {
    const database = await openDatabase()
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).get(SNAPSHOT_KEY)
      request.onsuccess = () => {
        const value = request.result
        resolve(value ? new Uint8Array(value) : null)
      }
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('No se pudo leer la base de datos local', error)
    return null
  }
}

export async function saveSnapshot(bytes) {
  try {
    const database = await openDatabase()
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(bytes, SNAPSHOT_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    return true
  } catch (error) {
    console.error('No se pudo guardar la base de datos local', error)
    return false
  }
}

export async function clearSnapshot() {
  try {
    const database = await openDatabase()
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).delete(SNAPSHOT_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } catch (error) {
    console.error('No se pudo borrar la copia local', error)
  }
}
