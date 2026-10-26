import { createContext, useContext } from 'react'

export const DataContext = createContext(null)

export function useData() {
  const context = useContext(DataContext)
  if (!context) {
    throw new Error('useData debe usarse dentro de DataProvider')
  }
  return context
}
