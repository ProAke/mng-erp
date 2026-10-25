// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tokenStore } from '../web/src/lib/api/client'
import { useAuth } from '../web/src/lib/stores/auth'
import { useApp } from '../web/src/lib/stores/app'

describe('Logout & Session State Regression Suite', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuth.getState().clear()
    useApp.getState().clear()
    vi.restoreAllMocks()
  })

  it('clears token from localStorage and resets both auth and app stores upon logout', () => {
    useAuth.getState().setSession('mock-jwt-token-123', {
      id: '1',
      email: 'test@mng.local',
      name: 'Test User',
      role: 'admin',
      avatar: 'https://example.com/a.png',
    })

    expect(tokenStore.get()).toBe('mock-jwt-token-123')
    expect(useAuth.getState().isAuthenticated).toBe(true)

    useAuth.getState().updateUser({ avatar: 'https://example.com/b.png' })
    expect(useAuth.getState().user?.avatar).toBe('https://example.com/b.png')

    useAuth.getState().clear()

    expect(tokenStore.get()).toBeNull()
    expect(useAuth.getState().isAuthenticated).toBe(false)
    expect(useAuth.getState().user).toBeNull()
    expect(useApp.getState().data).toBeNull()
    expect(useAuth.getState().bootstrapped).toBe(true)
  })

  it('remains logged out when bootstrapping without a stored token', async () => {
    expect(tokenStore.get()).toBeNull()

    await useAuth.getState().bootstrap()

    expect(useAuth.getState().isAuthenticated).toBe(false)
    expect(useAuth.getState().user).toBeNull()
    expect(useAuth.getState().bootstrapped).toBe(true)
  })

  it('clears invalid token if bootstrap API call fails (401 Unauthorized)', async () => {
    tokenStore.set('expired-or-invalid-token')

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'unauthorized' }),
    })

    await useAuth.getState().bootstrap()

    expect(tokenStore.get()).toBeNull()
    expect(useAuth.getState().isAuthenticated).toBe(false)
    expect(useAuth.getState().user).toBeNull()
    expect(useAuth.getState().bootstrapped).toBe(true)
  })
})
