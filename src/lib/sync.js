import { ref, get, update } from 'firebase/database'
import { db } from './firebase'

function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, chunk)
  }
  return btoa(binary)
}

function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export async function compressBytes(bytes) {
  if (typeof CompressionStream === 'undefined') {
    return { bytes, encoding: 'raw' }
  }
  try {
    const stream = new CompressionStream('gzip')
    const writer = stream.writable.getWriter()
    writer.write(bytes)
    writer.close()
    const reader = stream.readable.getReader()
    const chunks = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const output = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      output.set(chunk, offset)
      offset += chunk.length
    }
    // Solo conviene si realmente reduce el tamaño.
    if (output.length >= bytes.length) {
      return { bytes, encoding: 'raw' }
    }
    return { bytes: output, encoding: 'gzip' }
  } catch (error) {
    console.error('No se pudo comprimir el snapshot', error)
    return { bytes, encoding: 'raw' }
  }
}

export async function decompressBytes(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream no disponible')
  }
  const stream = new DecompressionStream('gzip')
  const writer = stream.writable.getWriter()
  writer.write(bytes)
  writer.close()
  const reader = stream.readable.getReader()
  const chunks = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

export async function sha256Hex(bytes) {
  if (!crypto?.subtle) return null
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function getRemoteMeta(uid) {
  if (!uid) return null
  try {
    const snapshot = await get(ref(db, `users/${uid}/meta`))
    if (!snapshot.exists()) return null
    const value = snapshot.val()
    return value && typeof value === 'object' ? value : null
  } catch (error) {
    console.error('No se pudo leer la metadata remota', error)
    return null
  }
}

export async function uploadSnapshot(uid, bytes) {
  if (!uid) return
  const { bytes: payload, encoding } = await compressBytes(bytes)
  const base64 = bytesToBase64(payload)
  const hash = await sha256Hex(bytes)
  const snapshotValue = { v: 2, encoding, data: base64 }
  const meta = {
    hash,
    updatedAt: Date.now(),
    size: bytes.length,
    compressedSize: payload.length,
    encoding,
  }
  // Escritura atómica de snapshot + metadata.
  await update(ref(db, `users/${uid}`), {
    snapshot: snapshotValue,
    meta,
  })
  return hash
}

export async function downloadSnapshot(uid) {
  if (!uid) return null
  try {
    const snapshot = await get(ref(db, `users/${uid}/snapshot`))
    if (!snapshot.exists()) return null
    const value = snapshot.val()

    let bytes = null
    let encoding = 'raw'

    if (typeof value === 'string') {
      // Snapshot legacy (base64 sin comprimir ni envoltorio).
      bytes = base64ToBytes(value)
      encoding = 'raw'
    } else if (value && typeof value === 'object' && typeof value.data === 'string') {
      bytes = base64ToBytes(value.data)
      encoding = value.encoding || 'raw'
    } else {
      return null
    }

    if (encoding === 'gzip') {
      try {
        bytes = await decompressBytes(bytes)
      } catch (error) {
        console.error('No se pudo descomprimir el snapshot remoto', error)
        // Intentar usar los bytes crudos como fallback.
      }
    }

    const meta = await getRemoteMeta(uid)
    const hash = meta?.hash || (await sha256Hex(bytes))
    return { bytes, hash }
  } catch (error) {
    console.error('No se pudo descargar la base desde Firebase', error)
    return null
  }
}