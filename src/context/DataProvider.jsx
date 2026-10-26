import { useCallback, useEffect, useMemo, useState } from 'react'
import { initDatabase, persistNow, run, transaction } from '../db/database'
import { DataContext } from './data-context'

export function DataProvider({ children }) {
  const [status, setStatus] = useState({
    ready: false,
    error: null,
    version: 0,
  })

  useEffect(() => {
    let active = true
    initDatabase()
      .then(() => {
        if (active) {
          setStatus({ ready: true, error: null, version: 1 })
        }
      })
      .catch((error) => {
        console.error(error)
        if (active) {
          setStatus({ ready: false, error, version: 0 })
        }
      })

    const handleUnload = () => {
      persistNow()
    }
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      active = false
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [])

  const refresh = useCallback(() => {
    setStatus((previous) => ({ ...previous, version: previous.version + 1 }))
  }, [])

  const mutate = useCallback(
    (sql, params = []) => {
      const result = run(sql, params)
      refresh()
      return result
    },
    [refresh],
  )

  const mutateMany = useCallback(
    (callback) => {
      const result = transaction(callback)
      refresh()
      return result
    },
    [refresh],
  )

  const value = useMemo(
    () => ({
      ready: status.ready,
      error: status.error,
      version: status.version,
      mutate,
      mutateMany,
      refresh,
      persist: persistNow,
    }),
    [status, mutate, mutateMany, refresh],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
