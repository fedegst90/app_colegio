import { ref, get, set } from 'firebase/database'
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

export async function uploadSnapshot(uid, bytes) {
  if (!uid) return
  const base64 = bytesToBase64(bytes)
  await set(ref(db, `users/${uid}/snapshot`), base64)
}

export async function downloadSnapshot(uid) {
  if (!uid) return null
  const snapshot = await get(ref(db, `users/${uid}/snapshot`))
  if (!snapshot.exists()) return null
  const value = snapshot.val()
  if (typeof value !== 'string' || value.length === 0) return null
  return base64ToBytes(value)
}