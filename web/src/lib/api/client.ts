/**
 * Typed HTTP client for Express backend (/api/*).
 * Same-origin in prod (Express serves Next static export) and via Next rewrites in dev.
 */

import { z } from 'zod'

const TOKEN_KEY = 'mng.token'

export const tokenStore = {
  get: (): string | null => {
    if (typeof window === 'undefined') return null
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  },
  set: (token: string) => {
    try { localStorage.setItem(TOKEN_KEY, token) } catch {}
  },
  clear: () => {
    try { localStorage.removeItem(TOKEN_KEY) } catch {}
  },
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}, schema?: z.ZodType<T>): Promise<T> {
  const token = tokenStore.get()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  }
  const res = await fetch(`/api${path}`, { ...init, headers, cache: 'no-store' })
  const text = await res.text()
  let json: unknown = null
  try { json = text ? JSON.parse(text) : null } catch { /* non-json */ }

  if (!res.ok) {
    const msg = (json as { error?: string })?.error ?? `HTTP ${res.status}`
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/logout') {
      tokenStore.clear()
    }
    throw new ApiError(res.status, msg, json)
  }
  return schema ? schema.parse(json) : (json as T)
}

/* ---------- Schemas matching Express shapes in server/routes.js ---------- */

export const userSchema = z.object({
  id: z.string(),
  authId: z.number().optional(),
  user_id: z.number().optional(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['super_admin', 'admin', 'manager', 'staff', 'viewer']).or(z.string()),
  avatar: z.string().nullable().optional(),
})

export const loginResponseSchema = z.object({
  token: z.string(),
  expires: z.string(),
  user: userSchema,
})

export const teamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  nickname: z.string().optional(),
  kind: z.enum(['human', 'ai']).or(z.string()).optional(),
  state: z.enum(['online', 'working', 'focus', 'away']).or(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  model: z.string().nullable().optional(),
  paused: z.boolean().optional(),
  autonomy: z.number().optional(),
  runs: z.number().optional(),
  successRate: z.number().optional(),
  tokensToday: z.number().optional(),
  currentTaskId: z.string().nullable().optional(),
  load: z.number().optional(),
  capacity: z.number().optional(),
  role: z.string(),
  color: z.string(),
  email: z.string(),
  phone: z.string(),
  me: z.boolean(),
  avatar: z.string().nullable(),
  authUserId: z.number().nullable(),
  authRole: z.string().nullable(),
  authStatus: z.string().nullable(),
})

export const taskSchema = z.object({
  id: z.string(),
  code: z.string(),
  project: z.string(),
  title: z.string(),
  desc: z.string(),
  status: z.enum(['todo', 'doing', 'review', 'done']).or(z.string()),
  priority: z.enum(['urgent', 'high', 'med', 'low']).or(z.string()),
  assignee: z.string().nullable(),
  start: z.string().nullable(),
  due: z.string().nullable(),
  progress: z.number(),
  est: z.number(),
  spent: z.number().optional(),
  blocked: z.boolean().optional(),
  blockReason: z.string().optional(),
  aiGenerated: z.boolean().optional(),
  tags: z.array(z.string()),
  subtasks: z.array(z.any()),
  comments: z.array(z.any()),
})

export const projectSchema = z.object({
  id: z.string(),
  code: z.string().optional(),
  name: z.string(),
  short: z.string(),
  client: z.string(),
  clientName: z.string(),
  grad: z.string(),
  color: z.string(),
  status: z.string(),
  progress: z.number(),
  budget: z.number(),
  spent: z.number(),
  start: z.string(),
  end: z.string(),
  owner: z.string(),
  members: z.array(z.string()),
  desc: z.string(),
  icon: z.string(),
  hub: z.string().nullable().optional(),
  open: z.number(),
  taskCount: z.number(),
})

export const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
  cat: z.string(),
  date: z.string(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  allday: z.boolean(),
  loc: z.string(),
  desc: z.string(),
  members: z.array(z.string()),
  project: z.string().optional(),
  task: z.string().optional(),
})

export const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  short: z.string(),
  color: z.string(),
  contact: z.string(),
  phone: z.string(),
  email: z.string(),
  addr: z.string(),
  since: z.string(),
})

export const invoiceSchema = z.object({
  id: z.string(),
  no: z.string(),
  client: z.string(),
  title: z.string(),
  amount: z.number(),
  vat: z.number(),
  issue: z.string().nullable(),
  due: z.string().nullable(),
  paid: z.string().optional(),
  status: z.string(),
  items: z.array(z.any()),
})

export const aiRunSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  taskId: z.string().nullable(),
  action: z.string(),
  detail: z.string(),
  output: z.string().optional(),
  durationSec: z.number(),
  tokens: z.number(),
  status: z.string(),
  at: z.string(),
})

export const channelSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string(),
  type: z.string(),
  topic: z.string().optional(),
  projectId: z.string().nullable().optional(),
  members: z.array(z.string()),
  pinned: z.boolean(),
})

export const chatMessageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  authorId: z.string(),
  text: z.string(),
  kind: z.string(),
  attachmentUrl: z.string().nullable().optional(),
  attachmentName: z.string().nullable().optional(),
  pinned: z.boolean(),
  reactions: z.record(z.string(), z.array(z.string())).optional(),
  at: z.string(),
})

export const checkinSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  date: z.string(),
  clockIn: z.string(),
  clockOut: z.string().nullable(),
  mode: z.string(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  distanceM: z.number().nullable().optional(),
  note: z.string().optional(),
  lateMin: z.number().optional(),
})

export const leaveSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  leaveType: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  days: z.number(),
  reason: z.string(),
  status: z.string(),
  approvedBy: z.string().nullable().optional(),
})

export const roomSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  capacity: z.number(),
  floor: z.string(),
  color: z.string(),
  equipment: z.array(z.string()),
  status: z.string(),
})

export const bookingSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  teamId: z.string(),
  title: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  attendees: z.array(z.string()),
  note: z.string(),
})

export const eventCatMetaSchema = z.object({
  label: z.string(),
  cls: z.string(),
  color: z.string(),
})

export const trendSchema = z.object({
  months: z.array(z.string()),
  created: z.array(z.number()),
  completed: z.array(z.number()),
  revenue: z.array(z.number()),
  workload: z.array(z.tuple([z.string(), z.number(), z.string()])),
})

export const bootstrapSchema = z
  .object({
    user: z.any(),
    team: z.array(teamMemberSchema),
    projects: z.array(projectSchema),
    tasks: z.array(taskSchema),
    events: z.array(eventSchema),
    clients: z.array(clientSchema),
    invoices: z.array(invoiceSchema),
    activity: z.array(z.object({ at: z.string(), u: z.string(), text: z.string() })),
    aiRuns: z.array(aiRunSchema).optional(),
    channels: z.array(channelSchema).optional(),
    messages: z.array(chatMessageSchema).optional(),
    checkins: z.array(checkinSchema).optional(),
    leaves: z.array(leaveSchema).optional(),
    rooms: z.array(roomSchema).optional(),
    bookings: z.array(bookingSchema).optional(),
    eventCats: z.record(z.string(), eventCatMetaSchema).optional(),
    settings: z.record(z.string(), z.any()).optional(),
    trend: trendSchema.optional(),
  })
  .passthrough()

export type Bootstrap = z.infer<typeof bootstrapSchema>
export type Project = z.infer<typeof projectSchema>
export type Task = z.infer<typeof taskSchema>
export type EventItem = z.infer<typeof eventSchema>
export type TeamMember = z.infer<typeof teamMemberSchema>
export type Client = z.infer<typeof clientSchema>
export type Invoice = z.infer<typeof invoiceSchema>
export type AiRun = z.infer<typeof aiRunSchema>
export type Channel = z.infer<typeof channelSchema>
export type ChatMessage = z.infer<typeof chatMessageSchema>
export type CheckinRecord = z.infer<typeof checkinSchema>
export type LeaveRecord = z.infer<typeof leaveSchema>
export type Room = z.infer<typeof roomSchema>
export type Booking = z.infer<typeof bookingSchema>
export type TrendData = z.infer<typeof trendSchema>
export type EventCatMeta = z.infer<typeof eventCatMetaSchema>

export interface UserRecord {
  id: number
  email: string
  name: string
  role: string
  status: string
  phone?: string | null
  avatar?: string | null
  last_login_at?: string | null
  created_at?: string | null
}

export interface ArchivedProject {
  id: string
  name: string
  client: string
  grad: string
  color: string
  tasks: number
}

export interface DriveStatus {
  connected: boolean
  configured?: boolean
  fallback?: string
}

export interface HealthInfo {
  ok: boolean
  auth: boolean
  work: boolean
  latencyMs?: number
  checkedAt?: string
}

/* ---------- Endpoints ---------- */

export const api = {
  health: () => request<HealthInfo>('/health'),

  auth: {
    login: (email: string, password: string) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, loginResponseSchema),
    logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  },

  bootstrap: () => request('/bootstrap', {}, bootstrapSchema),

  me: {
    setState: (state: 'online' | 'working' | 'focus' | 'away') =>
      request<{ ok: boolean; teamId: string; state: string }>('/me/state', {
        method: 'PATCH',
        body: JSON.stringify({ state }),
      }),
  },

  tasks: {
    create: (data: Partial<Task> & { title: string }) =>
      request<{ id: string; code: string }>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Task>) =>
      request<{ ok: boolean }>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) => request<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
  },

  projects: {
    list: () => request<Project[]>('/projects'),
    get: (id: string) => request<Project>(`/projects/${id}`),
    create: (data: Partial<Project> & { name: string }) =>
      request<{ id: string; code?: string }>('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Project>) =>
      request<{ ok: boolean }>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    archive: (id: string) => request<{ ok: boolean; tasksHidden?: number }>(`/projects/${id}`, { method: 'DELETE' }),
    restore: (id: string) => request<{ ok: boolean }>(`/projects/${id}/restore`, { method: 'POST' }),
    archived: () => request<ArchivedProject[]>('/projects/archived'),
  },

  events: {
    create: (data: Partial<EventItem> & { title: string; date: string }) =>
      request<{ id: string }>('/events', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<EventItem>) =>
      request<{ ok: boolean }>(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) => request<{ ok: boolean }>(`/events/${id}`, { method: 'DELETE' }),
  },

  invoices: {
    create: (data: Partial<Invoice>) =>
      request<{ ok: boolean; id?: string; no: string }>('/invoices', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Invoice>) =>
      request<{ ok: boolean }>(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    pay: (id: string) => request<{ ok: boolean }>(`/invoices/${id}/pay`, { method: 'POST' }),
    remove: (id: string) => request<{ ok: boolean }>(`/invoices/${id}`, { method: 'DELETE' }),
  },

  clients: {
    create: (data: Partial<Client> & { name: string }) =>
      request<{ id: string }>('/clients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Client>) =>
      request<{ ok: boolean }>(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) => request<{ ok: boolean }>(`/clients/${id}`, { method: 'DELETE' }),
  },

  teams: {
    create: (data: Partial<TeamMember> & { name: string }) =>
      request<{ id: string; authUserId: number | null }>('/teams', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<TeamMember>) =>
      request<{ ok: boolean }>(`/teams/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) => request<{ ok: boolean; unassigned: number }>(`/teams/${id}`, { method: 'DELETE' }),
  },

  ai: {
    runAgent: (agentId: string, data: { taskId?: string; prompt?: string } = {}) =>
      request<{ ok: boolean; runId: string; output: string; tokens: number; durationSec: number; taskId: string | null }>(
        `/ai/agents/${agentId}/run`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
    toggleAll: (enabled: boolean) =>
      request<{ ok: boolean; aiEnabled: boolean }>('/ai/toggle-all', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      }),
  },

  channels: {
    create: (data: { name: string; emoji?: string; topic?: string; projectId?: string; pinned?: boolean }) =>
      request<{ id: string }>('/channels', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Channel>) =>
      request<{ ok: boolean }>(`/channels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) => request<{ ok: boolean }>(`/channels/${id}`, { method: 'DELETE' }),
    sendMessage: (channelId: string, data: { text: string; attachmentUrl?: string; attachmentName?: string }) =>
      request<{ id: string }>(`/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify(data) }),
    reactOrPinMessage: (messageId: string, data: { emoji?: string; pinned?: boolean }) =>
      request<{ ok: boolean }>(`/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteMessage: (messageId: string) =>
      request<{ ok: boolean }>(`/messages/${messageId}`, { method: 'DELETE' }),
  },

  hr: {
    clockIn: (data: { mode?: 'office' | 'wfh' | 'onsite'; lat?: number; lng?: number; note?: string }) =>
      request<{ ok: boolean; date: string; clockIn: string; distanceM: number | null; lateMin: number }>(
        '/checkins/in',
        { method: 'POST', body: JSON.stringify(data) }
      ),
    clockOut: () =>
      request<{ ok: boolean; date: string; clockOut: string }>('/checkins/out', { method: 'POST' }),
    createLeave: (data: { leaveType: string; startDate: string; endDate: string; days?: number; reason?: string }) =>
      request<{ id: string }>('/leaves', { method: 'POST', body: JSON.stringify(data) }),
    updateLeaveStatus: (id: string, status: 'approved' | 'rejected' | 'pending') =>
      request<{ ok: boolean }>(`/leaves/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    deleteLeave: (id: string) =>
      request<{ ok: boolean }>(`/leaves/${id}`, { method: 'DELETE' }),
  },

  rooms: {
    create: (data: Partial<Room> & { name: string }) =>
      request<{ id: string }>('/rooms', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Room>) =>
      request<{ ok: boolean }>(`/rooms/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) => request<{ ok: boolean }>(`/rooms/${id}`, { method: 'DELETE' }),
    book: (data: { roomId: string; title: string; date: string; startTime: string; endTime: string; attendees?: string[]; note?: string }) =>
      request<{ id: string }>('/bookings', { method: 'POST', body: JSON.stringify(data) }),
    cancelBooking: (id: string) =>
      request<{ ok: boolean }>(`/bookings/${id}`, { method: 'DELETE' }),
  },

  users: {
    list: () => request<UserRecord[]>('/users'),
    create: (data: { name: string; email: string; password: string; role?: string; phone?: string; avatar?: string | null }) =>
      request<{ id: number }>('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<UserRecord>) =>
      request<{ ok: boolean }>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    resetPassword: (id: number, password: string) =>
      request<{ ok: boolean }>(`/users/${id}/password`, { method: 'POST', body: JSON.stringify({ password }) }),
    changeMyPassword: (current: string, password: string) =>
      request<{ ok: boolean }>('/users/me/password', { method: 'POST', body: JSON.stringify({ current, password }) }),
    setMyAvatar: (avatar: string | null) =>
      request<{ ok: boolean; avatar?: string | null }>('/users/me/avatar', { method: 'PATCH', body: JSON.stringify({ avatar }) }),
    setUserAvatar: (id: number, avatar: string | null) =>
      request<{ ok: boolean }>(`/users/${id}/avatar`, { method: 'PATCH', body: JSON.stringify({ avatar }) }),
    remove: (id: number) => request<{ ok: boolean }>(`/users/${id}`, { method: 'DELETE' }),
  },

  settings: {
    save: (data: Record<string, unknown>) =>
      request<{ ok: boolean }>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },

  drive: {
    status: () => request<DriveStatus>('/drive/status'),
    authUrl: () => request<{ url: string }>('/drive/auth'),
    upload: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return request<{ url: string; id: string; name: string; storage?: string }>('/drive/upload', {
        method: 'POST',
        body: formData,
      })
    },
  },
}
