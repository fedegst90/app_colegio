import { useMemo } from 'react'
import { all } from '../db/database'
import { useData } from '../context/data-context'

export function useSqlQuery(sql, params = []) {
  const { version } = useData()
  const paramKey = JSON.stringify(params)

  return useMemo(() => {
    void version
    return all(sql, JSON.parse(paramKey))
  }, [version, sql, paramKey])
}
