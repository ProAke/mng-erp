// lib/api/client.ts
// Typed API client for MNG ERP
// Backend: Express + Bearer token (erp_sessions table)
// NOTE: token เก็บใน localStorage เท่านั้น (backend รับแค่ Authorization: Bearer)
import { z } from 'zod'

/* ---------- zod schemas (typed contract) ---------- */

export const userSchema = z.object({
  id: z.string(),
  authId: z.number().optional(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
})

export const bootstrapSchema = z.object({
  user: z.object({
    user_id: z.number(),
    name: z.string(),
    email: z.string(),
    role: z.string(),
  }),
  team: z.array(z.any()),
  projects: z.array(z.any()),
  tasks: z.array(z.any()),
  events: z.array(z.any()),
  clients: z.array(z.any()),
  invoices: z.array(z.any()),
  activity: z.array(z.any()),
})

export const loginResponseSchema = z.object({
  token: z.string(),
  user: userSchema,
})

/* ---------- token storage (backend รับ Bearer header เท่านั้น) ---------- */

const TOKEN_KEY = 'mng_token'

export const tokenStore = {
  get(): string | null {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(TOKEN_KEY)
  },
  set(t: string) {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TOKEN_KEY, t)
  },
  clear() {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(TOKEN_KEY)
  },
}

/* ---------- fetch wrapper ---------- */

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, message: string, code = '') {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init: RequestInit = {}, schema?: z.ZodType<T>): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`/api${path}`, { ...init, headers })

  let body: any = null
  try { body = await res.json() } catch { /* empty body */ }

  if (!res.ok) {
    throw new ApiError(res.status, body?.error || body?.detail || `HTTP ${res.status}`, body?.error || '')
  }
  if (schema) return schema.parse(body)
  return body as T
}

/* ---------- endpoints ---------- */

export const api = {
  health: () => request('/health'),

  login: (email: string, password: string) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, loginResponseSchema),

  logout: () => request('/auth/logout', { method: 'POST' }),

  bootstrap: () => request('/bootstrap', {}, bootstrapSchema),

  /* projects */
  projects: {
    list: () => request('/projects'),
    archived: () => request('/projects/archived'),
    create: (data: unknown) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number | string, data: unknown) =>
      request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: number | string) => request(`/projects/${id}`, { method: 'DELETE' }),
    restore: (id: number | string) =>
      request(`/projects/${id}/restore`, { method: 'POST' }),
  },

  /* tasks */
  tasks: {
    create: (data: unknown) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number | string, data: unknown) =>
      request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: number | string) => request(`/tasks/${id}`, { method: 'DELETE' }),
  },

  /* events */
  events: {
    create: (data: unknown) => request('/events', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number | string, data: unknown) =>
      request(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: number | string) => request(`/events/${id}`, { method: 'DELETE' }),
  },

  /* invoices */
  invoices: {
    create: (data: unknown) => request('/invoices', { method: 'POST', body: JSON.stringify(data) }),
    pay: (id: number | string) => request(`/invoices/${id}/pay`, { method: 'POST' }),
  },

  /* teams */
  teams: {
    create: (data: unknown) => request('/teams', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number | string, data: unknown) =>
      request(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: number | string) => request(`/teams/${id}`, { method: 'DELETE' }),
  },

  /* settings */
  settings: {
    update: (data: unknown) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },

  /* users (admin) */
  users: {
    me: () => request('/users/me'),
    list: () => request('/users'),
    create: (data: unknown) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number | string, data: unknown) =>
      request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    setPassword: (id: number | string, password: string) =>
      request(`/users/${id}/password`, { method: 'POST', body: JSON.stringify({ password }) }),
    changeMyPassword: (oldPassword: string, newPassword: string) =>
      request('/users/me/password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
      }),
  },
}

export type Bootstrap = z.infer<typeof bootstrapSchema>
export type User = z.infer<typeof userSchema>
