import { createContext, useContext } from 'react'

export type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  /** Rote Bestätigen-Taste für Löschen o. Ä. */
  danger?: boolean
}
export type PromptOptions = {
  title: string
  label?: string
  initial?: string
  confirmLabel?: string
  maxLength?: number
}

export type Api = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  prompt: (opts: PromptOptions) => Promise<string | null>
}

export const Ctx = createContext<Api | null>(null)

export function useDialogs(): Api {
  const api = useContext(Ctx)
  if (!api) throw new Error('useDialogs braucht den DialogProvider')
  return api
}

