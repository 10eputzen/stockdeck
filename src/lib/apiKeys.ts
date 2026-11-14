import { supabase } from './supabase'

export type ApiKey = { id: string; label: string; created_at: string; last_used_at: string | null }

/** Adresse des MCP-Servers dieser Instanz. */
export const MCP_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp`

/** Neuer Schlüssel: Präfix + 32 Zufallsbytes base64url. Sieht nie wie ein JWT aus (der MCP-Server unterscheidet beides). */
export function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const b64 = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  return `sdk_${b64}`
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const { data, error } = await supabase.rpc('list_api_keys')
  if (error) throw error
  return (data ?? []) as ApiKey[]
}

/** Legt einen Schlüssel an und gibt den Klartext zurück; gespeichert wird nur der Hash. */
export async function createApiKey(label: string): Promise<string> {
  const key = generateKey()
  const { error } = await supabase.rpc('create_api_key', { p_label: label, p_hash: await sha256Hex(key) })
  if (error) throw error
  return key
}

export async function revokeApiKey(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('revoke_api_key', { p_id: id })
  if (error) throw error
  return data === true
}
