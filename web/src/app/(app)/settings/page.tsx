'use client'

import { useState, FormEvent, ChangeEvent } from 'react'
import {
  User,
  Users,
  Settings as SettingsIcon,
  Upload,
  Trash2,
  KeyRound,
  Plus,
  Edit3,
  RotateCcw,
  Cloud,
  Download,
  ShieldCheck,
  Ban,
  CheckCircle2,
} from 'lucide-react'
import {
  api,
  ApiError,
  type ArchivedProject,
  type DriveStatus,
  type UserRecord,
} from '@/lib/api/client'
import { canManage, isAdmin, useAuth } from '@/lib/stores/auth'
import { useApp, useSettingsData } from '@/lib/stores/app'
import { Modal } from '@/components/ui/Modal'
import {
  downloadTextFile,
  fileToAvatarDataUrl,
  initials,
  ROLE_META,
  todayStr,
} from '@/lib/erp-helpers'

type TabKey = 'profile' | 'users' | 'system'

export default function SettingsPage() {
  const { user, updateUser } = useAuth()
  const { refresh, data: appData } = useApp()
  const serverSettings = useSettingsData()

  const allowAdmin = isAdmin(user?.role)
  const allowManage = canManage(user?.role)

  const [tab, setTab] = useState<TabKey>('profile')
  const [toast, setToast] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  // Profile state
  const [avatarUrlDraft, setAvatarUrlDraft] = useState<string | null>(null)
  const avatarUrl = avatarUrlDraft ?? (user?.avatar ?? '')
  const setAvatarUrl = (v: string) => setAvatarUrlDraft(v)
  const [savingAvatar, setSavingAvatar] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [savingPw, setSavingPw] = useState(false)

  // Users admin state
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'staff',
    status: 'active',
    password: '',
  })
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null)
  const [resetPw, setResetPw] = useState('')
  const [savingUser, setSavingUser] = useState(false)

  // System & Vault state
  const [archived, setArchived] = useState<ArchivedProject[]>([])
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null)
  const serverOffice = (serverSettings.office as {
    name?: string
    lat?: number
    lng?: number
    radius?: number
  }) || { name: 'MNG Groups HQ (Bangkok)', lat: 13.7563, lng: 100.5018, radius: 250 }

  const [prefsDraft, setPrefsDraft] = useState<{
    orgName: string
    announce: string
    workStart: string
    workEnd: string
    officeName: string
    officeLat: number
    officeLng: number
    officeRadius: number
    aiEnabled: boolean
    notifyDueSoon: boolean
    notifyOverdueInvoice: boolean
    weeklyDigest: boolean
  } | null>(null)
  const prefs = prefsDraft ?? {
    orgName: (serverSettings.orgName as string) ?? 'MNG Groups Co., Ltd.',
    announce: (serverSettings.announce as string) ?? '',
    workStart: (serverSettings.workStart as string) ?? '09:30',
    workEnd: (serverSettings.workEnd as string) ?? '18:30',
    officeName: serverOffice.name ?? 'MNG Groups HQ (Bangkok)',
    officeLat: Number(serverOffice.lat ?? 13.7563),
    officeLng: Number(serverOffice.lng ?? 100.5018),
    officeRadius: Number(serverOffice.radius ?? 250),
    aiEnabled: serverSettings.aiEnabled !== false,
    notifyDueSoon: serverSettings.notifyDueSoon !== undefined ? Boolean(serverSettings.notifyDueSoon) : true,
    notifyOverdueInvoice:
      serverSettings.notifyOverdueInvoice !== undefined ? Boolean(serverSettings.notifyOverdueInvoice) : true,
    weeklyDigest: serverSettings.weeklyDigest !== undefined ? Boolean(serverSettings.weeklyDigest) : true,
  }
  const setPrefs = (next: typeof prefs) => setPrefsDraft(next)
  const [savingPrefs, setSavingPrefs] = useState(false)

  function notify(tone: 'ok' | 'err', text: string) {
    setToast({ tone, text })
    setTimeout(() => setToast(null), 4000)
  }

  async function loadUsers() {
    if (!allowAdmin) return
    setLoadingUsers(true)
    try {
      const list = await api.users.list()
      setUsers(list)
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ')
    } finally {
      setLoadingUsers(false)
    }
  }

  function loadSystemTab() {
    if (allowManage) {
      api.projects
        .archived()
        .then(setArchived)
        .catch(() => setArchived([]))
    }
    api.drive
      .status()
      .then(setDriveStatus)
      .catch(() => setDriveStatus({ connected: false }))
  }

  function selectTab(nextTab: TabKey) {
    setTab(nextTab)
    if (nextTab === 'users') loadUsers()
    if (nextTab === 'system') loadSystemTab()
  }

  /* -------- Profile Handlers -------- */
  async function onPickAvatarFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSavingAvatar(true)
    try {
      const dataUrl = await fileToAvatarDataUrl(file, 256)
      await api.users.setMyAvatar(dataUrl)
      setAvatarUrl(dataUrl)
      updateUser({ avatar: dataUrl })
      await refresh()
      notify('ok', 'อัปเดตรูปโปรไฟล์เรียบร้อยแล้ว')
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'อัปโหลดรูปโปรไฟล์ไม่สำเร็จ')
    } finally {
      setSavingAvatar(false)
      e.target.value = ''
    }
  }

  async function onSaveAvatarUrl(e: FormEvent) {
    e.preventDefault()
    setSavingAvatar(true)
    try {
      const val = avatarUrl.trim() || null
      await api.users.setMyAvatar(val)
      updateUser({ avatar: val })
      await refresh()
      notify('ok', val ? 'บันทึกลิงก์รูปโปรไฟล์แล้ว' : 'ลบรูปโปรไฟล์แล้ว')
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'บันทึกรูปไม่สำเร็จ')
    } finally {
      setSavingAvatar(false)
    }
  }

  async function onClearAvatar() {
    setSavingAvatar(true)
    try {
      await api.users.setMyAvatar(null)
      setAvatarUrl('')
      updateUser({ avatar: null })
      await refresh()
      notify('ok', 'ลบรูปโปรไฟล์เรียบร้อยแล้ว')
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'ลบรูปไม่สำเร็จ')
    } finally {
      setSavingAvatar(false)
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault()
    if (pwForm.next.length < 4) {
      notify('err', 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร')
      return
    }
    if (pwForm.next !== pwForm.confirm) {
      notify('err', 'รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน')
      return
    }
    setSavingPw(true)
    try {
      await api.users.changeMyPassword(pwForm.current, pwForm.next)
      setPwForm({ current: '', next: '', confirm: '' })
      notify('ok', 'เปลี่ยนรหัสผ่านสำเร็จแล้ว')
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'เปลี่ยนรหัสผ่านไม่สำเร็จ')
    } finally {
      setSavingPw(false)
    }
  }

  /* -------- Admin User Management Handlers -------- */
  function openCreateUser() {
    setEditingUser(null)
    setUserForm({
      name: '',
      email: '',
      phone: '',
      role: 'staff',
      status: 'active',
      password: '',
    })
    setUserModalOpen(true)
  }

  function openEditUser(u: UserRecord) {
    setEditingUser(u)
    setUserForm({
      name: u.name,
      email: u.email,
      phone: u.phone ?? '',
      role: u.role,
      status: u.status,
      password: '',
    })
    setUserModalOpen(true)
  }

  async function onSaveUser(e: FormEvent) {
    e.preventDefault()
    setSavingUser(true)
    try {
      if (editingUser) {
        await api.users.update(editingUser.id, {
          name: userForm.name.trim(),
          email: userForm.email.trim(),
          phone: userForm.phone.trim(),
          role: userForm.role,
          status: userForm.status,
        })
        notify('ok', `อัปเดตข้อมูลผู้ใช้ ${userForm.name} แล้ว`)
      } else {
        await api.users.create({
          name: userForm.name.trim(),
          email: userForm.email.trim(),
          phone: userForm.phone.trim(),
          role: userForm.role,
          password: userForm.password,
        })
        notify('ok', `สร้างบัญชีผู้ใช้ ${userForm.name} แล้ว`)
      }
      setUserModalOpen(false)
      await loadUsers()
      await refresh()
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'บันทึกผู้ใช้ไม่สำเร็จ')
    } finally {
      setSavingUser(false)
    }
  }

  async function onResetUserPassword(e: FormEvent) {
    e.preventDefault()
    if (!resetTarget) return
    setSavingUser(true)
    try {
      await api.users.resetPassword(resetTarget.id, resetPw)
      notify('ok', `รีเซ็ตรหัสผ่านของ ${resetTarget.name} สำเร็จ (เซสชันเดิมถูกยกเลิก)`)
      setResetTarget(null)
      setResetPw('')
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'รีเซ็ตรหัสผ่านไม่สำเร็จ')
    } finally {
      setSavingUser(false)
    }
  }

  async function onToggleSuspend(u: UserRecord) {
    const nextStatus = u.status === 'active' ? 'suspended' : 'active'
    const label = nextStatus === 'suspended' ? 'ระงับบัญชี' : 'เปิดใช้งานบัญชี'
    if (!window.confirm(`ยืนยันการ${label} "${u.name}" ?`)) return
    try {
      if (nextStatus === 'suspended') {
        await api.users.remove(u.id)
      } else {
        await api.users.update(u.id, { status: 'active' })
      }
      notify('ok', `${label} ${u.name} เรียบร้อย`)
      await loadUsers()
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'ดำเนินการไม่สำเร็จ')
    }
  }

  /* -------- System & Vault Handlers -------- */
  async function onRestoreProject(p: ArchivedProject) {
    try {
      await api.projects.restore(p.id)
      notify('ok', `กู้คืนโปรเจกต์ "${p.name}" กลับสู่ระบบแล้ว`)
      await loadSystemTab()
      await refresh()
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'กู้คืนโปรเจกต์ไม่สำเร็จ')
    }
  }

  async function onSavePrefs(e: FormEvent) {
    e.preventDefault()
    setSavingPrefs(true)
    try {
      await api.settings.save({
        orgName: prefs.orgName,
        announce: prefs.announce,
        workStart: prefs.workStart,
        workEnd: prefs.workEnd,
        office: {
          name: prefs.officeName,
          lat: Number(prefs.officeLat),
          lng: Number(prefs.officeLng),
          radius: Number(prefs.officeRadius),
        },
        aiEnabled: prefs.aiEnabled,
        notifyDueSoon: prefs.notifyDueSoon,
        notifyOverdueInvoice: prefs.notifyOverdueInvoice,
        weeklyDigest: prefs.weeklyDigest,
      })
      await refresh()
      notify('ok', 'บันทึกการตั้งค่าระบบและ Agency OS แล้ว')
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'บันทึกการตั้งค่าไม่สำเร็จ')
    } finally {
      setSavingPrefs(false)
    }
  }

  async function onConnectDrive() {
    try {
      const { url } = await api.drive.authUrl()
      window.location.href = url
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'ไม่สามารถเริ่มเชื่อมต่อ Google Drive ได้')
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">ตั้งค่า & จัดการผู้ใช้งาน</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          จัดการข้อมูลส่วนตัว สิทธิ์บัญชีผู้ใช้งานในระบบ และคลังโปรเจกต์ที่เก็บถาวร
        </p>
      </div>

      {toast && (
        <div
          className={`rounded-xl px-4 py-3 text-sm border ${
            toast.tone === 'ok'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => selectTab('profile')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition cursor-pointer ${
            tab === 'profile'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <User className="w-4 h-4" /> โปรไฟล์ & รหัสผ่าน
        </button>

        <button
          type="button"
          onClick={() => selectTab('users')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition cursor-pointer ${
            tab === 'users'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" /> จัดการผู้ใช้ระบบ (Admin)
        </button>

        <button
          type="button"
          onClick={() => selectTab('system')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition cursor-pointer ${
            tab === 'system'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <SettingsIcon className="w-4 h-4" /> ระบบ & คลังโปรเจกต์
        </button>
      </div>

      {/* TAB 1: PROFILE */}
      {tab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Avatar & Identity */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
            <h2 className="font-semibold text-white">ข้อมูลบัญชีและรูปโปรไฟล์</h2>

            <div className="flex items-center gap-4">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-20 h-20 rounded-full object-cover border-2 border-amber-500/40 shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-amber-500/20 text-amber-300 font-bold text-2xl flex items-center justify-center shrink-0">
                  {initials(user?.name)}
                </div>
              )}

              <div className="min-w-0">
                <div className="text-lg font-bold text-white truncate">{user?.name}</div>
                <div className="text-xs text-slate-400 truncate">{user?.email}</div>
                <span
                  className={`inline-block mt-2 text-[11px] px-2.5 py-0.5 rounded-full border ${
                    ROLE_META[user?.role ?? '']?.badge ?? 'border-slate-700 text-slate-300'
                  }`}
                >
                  {ROLE_META[user?.role ?? '']?.label ?? user?.role}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <label className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                {savingAvatar ? 'กำลังอัปโหลด…' : 'อัปโหลดรูปจากเครื่อง'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={onPickAvatarFile}
                  className="hidden"
                  disabled={savingAvatar}
                />
              </label>

              {user?.avatar && (
                <button
                  type="button"
                  disabled={savingAvatar}
                  onClick={onClearAvatar}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> ลบรูป
                </button>
              )}
            </div>

            <form onSubmit={onSaveAvatarUrl} className="space-y-2 pt-2 border-t border-slate-800">
              <label className="block text-xs text-slate-400">หรือวางลิงก์รูปภาพโดยตรง (https://...)</label>
              <div className="flex gap-2">
                <input
                  value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="flex-1 rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                />
                <button
                  type="submit"
                  disabled={savingAvatar}
                  className="rounded-lg border border-slate-700 hover:bg-slate-800 px-3.5 py-2 text-xs text-slate-200 cursor-pointer"
                >
                  บันทึกลิงก์
                </button>
              </div>
            </form>
          </section>

          {/* Change Password */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="font-semibold text-white mb-1">เปลี่ยนรหัสผ่านของฉัน</h2>
            <p className="text-xs text-slate-400 mb-4">
              อัปเดตรหัสผ่านบัญชี {user?.email} ในฐานข้อมูลยืนยันตัวตนโดยตรง
            </p>

            <form onSubmit={onChangePassword} className="space-y-3.5">
              <div>
                <label className="block text-xs text-slate-300 mb-1">รหัสผ่านปัจจุบัน *</label>
                <input
                  type="password"
                  required
                  value={pwForm.current}
                  onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">รหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร) *</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={pwForm.next}
                  onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">ยืนยันรหัสผ่านใหม่ *</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>

              <button
                type="submit"
                disabled={savingPw}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                {savingPw ? 'กำลังเปลี่ยนรหัสผ่าน…' : 'บันทึกรหัสผ่านใหม่'}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* TAB 2: ADMIN USERS */}
      {tab === 'users' && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">บัญชีผู้ใช้งานระบบทั้งหมด ({users.length})</h2>
              <p className="text-xs text-slate-400">
                เชื่อมกับตาราง users ของ MNG Hub / ERP ใช้ล็อกอินร่วมกันทั้งระบบ
              </p>
            </div>
            {allowAdmin && (
              <button
                type="button"
                onClick={openCreateUser}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> เพิ่มผู้ใช้ใหม่
              </button>
            )}
          </div>

          {!allowAdmin ? (
            <div className="p-8 text-center text-sm text-slate-400">
              <ShieldCheck className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              เฉพาะผู้ดูแลระบบ (Super Admin / Admin) เท่านั้นที่สามารถจัดการบัญชีผู้ใช้ทั้งหมดได้
            </div>
          ) : loadingUsers ? (
            <div className="p-8 text-center text-sm text-slate-400">กำลังโหลดรายชื่อผู้ใช้…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-950/60 text-xs text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">ผู้ใช้งาน</th>
                    <th className="px-4 py-3">อีเมล</th>
                    <th className="px-4 py-3">สิทธิ์</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3">เข้าใช้ล่าสุด</th>
                    <th className="px-4 py-3 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {users.map((u) => {
                    const rMeta = ROLE_META[u.role] ?? { label: u.role, badge: 'border-slate-700 text-slate-300' }
                    const active = u.status === 'active'
                    return (
                      <tr key={u.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {u.avatar ? (
                              <img
                                src={u.avatar}
                                alt={u.name}
                                className="w-8 h-8 rounded-full object-cover border border-slate-700"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-800 text-amber-300 text-xs font-bold flex items-center justify-center">
                                {initials(u.name)}
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-white">{u.name}</div>
                              {u.phone && <div className="text-[11px] text-slate-500">{u.phone}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300">{u.email}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full border ${rMeta.badge}`}>
                            {rMeta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              active
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-rose-500/15 text-rose-300'
                            }`}
                          >
                            {active ? 'ปกติ' : 'ระงับ'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {u.last_login_at ? String(u.last_login_at).slice(0, 16).replace('T', ' ') : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditUser(u)}
                              className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5 inline mr-1" /> แก้ไข
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setResetTarget(u)
                                setResetPw('')
                              }}
                              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                            >
                              <KeyRound className="w-3.5 h-3.5 inline mr-1" /> รีเซ็ตPW
                            </button>
                            {String(u.id) !== String(user?.authId ?? user?.id) && (
                              <button
                                type="button"
                                onClick={() => onToggleSuspend(u)}
                                className={`rounded-lg border px-2.5 py-1 text-xs cursor-pointer ${
                                  active
                                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                                }`}
                              >
                                {active ? (
                                  <>
                                    <Ban className="w-3.5 h-3.5 inline mr-1" /> ระงับ
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> เปิดใช้
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: SYSTEM & ARCHIVE VAULT */}
      {tab === 'system' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* System Preferences */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h2 className="font-semibold text-white">การตั้งค่าองค์กร, เวลางาน HR & AI Workforce</h2>
            <form onSubmit={onSavePrefs} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">ชื่อองค์กร</label>
                <input
                  value={prefs.orgName}
                  onChange={(e) => setPrefs({ ...prefs, orgName: e.target.value })}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">แถบประกาศบริษัท (แสดงด้านบนทุกหน้า)</label>
                <input
                  value={prefs.announce}
                  onChange={(e) => setPrefs({ ...prefs, announce: e.target.value })}
                  placeholder="เช่น ประชุม All-Hands ทุกวันจันทร์ 10:00 น."
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">เวลาเข้างานมาตรฐาน</label>
                  <input
                    type="time"
                    value={prefs.workStart}
                    onChange={(e) => setPrefs({ ...prefs, workStart: e.target.value })}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">เวลาเลิกงานมาตรฐาน</label>
                  <input
                    type="time"
                    value={prefs.workEnd}
                    onChange={(e) => setPrefs({ ...prefs, workEnd: e.target.value })}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2.5">
                <div className="text-xs font-medium text-slate-300">พิกัดออฟฟิศสำหรับระบบ Check-in (GPS)</div>
                <input
                  value={prefs.officeName}
                  onChange={(e) => setPrefs({ ...prefs, officeName: e.target.value })}
                  placeholder="ชื่อสาขา/ออฟฟิศ"
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-xs text-white"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500">Latitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={prefs.officeLat}
                      onChange={(e) => setPrefs({ ...prefs, officeLat: Number(e.target.value) })}
                      className="w-full rounded bg-slate-950 border border-slate-800 px-2 py-1 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">Longitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={prefs.officeLng}
                      onChange={(e) => setPrefs({ ...prefs, officeLng: Number(e.target.value) })}
                      className="w-full rounded bg-slate-950 border border-slate-800 px-2 py-1 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">รัศมี (เมตร)</label>
                    <input
                      type="number"
                      min={50}
                      value={prefs.officeRadius}
                      onChange={(e) => setPrefs({ ...prefs, officeRadius: Number(e.target.value) })}
                      className="w-full rounded bg-slate-950 border border-slate-800 px-2 py-1 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              <label className="flex items-center justify-between text-xs text-violet-300 cursor-pointer">
                <span>🤖 เปิดใช้งานระบบ AI Workforce ทั้งองค์กร</span>
                <input
                  type="checkbox"
                  checked={prefs.aiEnabled}
                  onChange={(e) => setPrefs({ ...prefs, aiEnabled: e.target.checked })}
                  className="accent-violet-500"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                <span>แจ้งเตือนงานใกล้ครบกำหนด (ภายใน 3 วัน)</span>
                <input
                  type="checkbox"
                  checked={prefs.notifyDueSoon}
                  onChange={(e) => setPrefs({ ...prefs, notifyDueSoon: e.target.checked })}
                  className="accent-amber-500"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                <span>แจ้งเตือนใบแจ้งหนี้เกินกำหนดชำระ</span>
                <input
                  type="checkbox"
                  checked={prefs.notifyOverdueInvoice}
                  onChange={(e) => setPrefs({ ...prefs, notifyOverdueInvoice: e.target.checked })}
                  className="accent-amber-500"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                <span>สรุปผลงานประจำสัปดาห์บนแดชบอร์ด</span>
                <input
                  type="checkbox"
                  checked={prefs.weeklyDigest}
                  onChange={(e) => setPrefs({ ...prefs, weeklyDigest: e.target.checked })}
                  className="accent-amber-500"
                />
              </label>

              <button
                type="submit"
                disabled={savingPrefs}
                className="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
              >
                {savingPrefs ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
              </button>
            </form>

            {/* Google Drive & Backup */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs">
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <Cloud className="w-4 h-4 text-sky-400" /> การจัดเก็บรูปภาพ Rich Text (Google Drive)
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    {driveStatus?.connected
                      ? 'เชื่อมต่อ Google Drive พร้อมใช้งานแล้ว'
                      : driveStatus?.configured
                      ? 'พบไฟล์ตั้งค่า OAuth แล้ว กดปุ่มเพื่อเชื่อมต่อบัญชี Google Drive'
                      : 'ยังไม่ได้ตั้งค่า Google Drive (ระบบบันทึกรูปลงเซิร์ฟเวอร์ให้อัตโนมัติ)'}
                  </div>
                </div>
                {driveStatus?.configured && !driveStatus?.connected && (
                  <button
                    type="button"
                    onClick={onConnectDrive}
                    className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/10 cursor-pointer"
                  >
                    เชื่อมต่อ
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `mng-erp-snapshot-${todayStr()}.json`,
                    JSON.stringify(appData ?? {}, null, 2),
                    'application/json;charset=utf-8'
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3.5 py-2 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" /> ดาวน์โหลดข้อมูลสำรองทั้งระบบ (JSON)
              </button>
            </div>
          </section>

          {/* Archived Projects Vault */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-white">คลังโปรเจกต์ที่เก็บถาวร ({archived.length})</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                โปรเจกต์ที่ถูกซ่อนออกจากหน้าหลัก สามารถกดกู้คืนพร้อมงานทั้งหมดได้ตลอดเวลา
              </p>
            </div>

            {!allowManage ? (
              <p className="text-xs text-slate-500 py-6 text-center">เฉพาะ Admin / Manager ที่เข้าถึงคลังโปรเจกต์ได้</p>
            ) : archived.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">ไม่มีโปรเจกต์ในคลังเก็บถาวร</p>
            ) : (
              <div className="space-y-2.5">
                {archived.map((ap) => (
                  <div
                    key={ap.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{ap.name}</div>
                      <div className="text-xs text-slate-400">
                        {ap.client || 'Internal'} · งานที่ซ่อนอยู่ {ap.tasks} ชิ้น
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRestoreProject(ap)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-300 shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> กู้คืน
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Modal: Create / Edit User */}
      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={editingUser ? `แก้ไขผู้ใช้: ${editingUser.name}` : 'เพิ่มบัญชีผู้ใช้งานใหม่'}
        maxWidth="lg"
      >
        <form onSubmit={onSaveUser} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1">ชื่อ-นามสกุล *</label>
            <input
              required
              value={userForm.name}
              onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">อีเมล *</label>
              <input
                type="email"
                required
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">เบอร์โทร</label>
              <input
                value={userForm.phone}
                onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">ระดับสิทธิ์ (Role)</label>
              <select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
              >
                {Object.entries(ROLE_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label} ({k})
                  </option>
                ))}
              </select>
            </div>

            {editingUser ? (
              <div>
                <label className="block text-xs text-slate-300 mb-1">สถานะบัญชี</label>
                <select
                  value={userForm.status}
                  onChange={(e) => setUserForm({ ...userForm, status: e.target.value })}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                >
                  <option value="active">ใช้งานปกติ (active)</option>
                  <option value="suspended">ระงับชั่วคราว (suspended)</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-slate-300 mb-1">รหัสผ่านเริ่มต้น *</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setUserModalOpen(false)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={savingUser}
              className="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
            >
              {savingUser ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Reset User Password */}
      <Modal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title={resetTarget ? `รีเซ็ตรหัสผ่าน: ${resetTarget.name}` : ''}
        subtitle="เมื่อรีเซ็ตแล้ว เซสชันที่ล็อกอินค้างอยู่ของผู้ใช้นี้จะถูกบังคับออกทั้งหมด"
        maxWidth="md"
      >
        <form onSubmit={onResetUserPassword} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1">รหัสผ่านใหม่ (อย่างน้อย 4 ตัวอักษร) *</label>
            <input
              type="password"
              required
              minLength={4}
              value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={savingUser}
              className="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
            >
              ยืนยันรีเซ็ตรหัสผ่าน
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
