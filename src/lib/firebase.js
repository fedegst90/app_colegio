import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: 'AIzaSyBzliWo940_gyVXhFfVs2DJ9JthctAo5jE',
  authDomain: 'app-colegio-ebfac.firebaseapp.com',
  databaseURL: 'https://app-colegio-ebfac-default-rtdb.firebaseio.com',
  projectId: 'app-colegio-ebfac',
  storageBucket: 'app-colegio-ebfac.firebasestorage.app',
  messagingSenderId: '1009620975130',
  appId: '1:1009620975130:web:6a9f391e1303e19eee9ba3',
  measurementId: 'G-TMZ84YJW9P',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getDatabase(app)