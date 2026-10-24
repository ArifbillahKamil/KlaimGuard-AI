import { createContext, useContext } from 'react'
import type { Claim, Data, Decision, DecisionValue } from './types'

export interface Workspace {
  data: Data; evaluation: boolean; setEvaluation: (value: boolean) => void
  decisions: Record<string, Decision>; storageError: string
  saveDecision: (claim: Claim, decision: DecisionValue, note: string) => void
  selectClaim: (claim: Claim) => void
}
export const WorkspaceContext = createContext<Workspace | null>(null)
export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('Ruang kerja belum dimuat.')
  return value
}
