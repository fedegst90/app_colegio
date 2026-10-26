import { useState } from 'react'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { Card, Field, PageHeader } from '../components/UI'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password)
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <Card className="login-card">
        <PageHeader
          eyebrow="Aula Docente"
          title={isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
          description="Tus datos se sincronizan con tu cuenta."
        />
        <form className="form-grid" onSubmit={handleSubmit}>
          <Field label="Correo electrónico" className="full">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Contraseña" className="full">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </Field>
          {error ? (
            <p className="form-note full" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}>
              {error}
            </p>
          ) : null}
          <div className="form-actions full">
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? 'Procesando…' : isRegister ? 'Registrarse' : 'Entrar'}
            </button>
          </div>
        </form>
        <button
          type="button"
          className="link-button"
          onClick={() => setIsRegister((value) => !value)}
        >
          {isRegister ? 'Ya tengo cuenta' : 'Crear una cuenta nueva'}
        </button>
      </Card>
    </div>
  )
}