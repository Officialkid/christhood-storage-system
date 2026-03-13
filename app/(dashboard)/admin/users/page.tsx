'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Shield, UserPlus, Pencil, Trash2, X, Loader2,
  Check, Search, ChevronDown, UserX, UserCheck,
} from 'lucide-react'
import UserDeleteDialog from '@/components/UserDeleteDialog'

type Role = 'ADMIN' | 'UPLOADER' | 'EDITOR'

interface User {
  id:            string
  username:      string | null
  name:          string | null
  email:         string
  phone:         string | null
  role:          Role
  createdAt:     string
  isActive:      boolean
  deactivatedAt: string | null
}

const ROLE_COLORS: Record<Role, string> = {
  ADMIN:    'bg-violet-500/15 text-violet-300 border border-violet-500/30',
  UPLOADER: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30',
  EDITOR:   'bg-sky-500/15 text-sky-300 border border-sky-500/30',
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[role]}`}>
      {role}
    </span>
  )
}

// ── Create / Edit Modal ─────────────────────────────────────────
interface ModalProps {
  onClose:  () => void
  onSaved:  () => void
  editUser: User | null
}

function UserModal({ onClose, onSaved, editUser }: ModalProps) {
  const [form, setForm] = useState({
    username: editUser?.username ?? '',
    email:    editUser?.email    ?? '',
    phone:    editUser?.phone    ?? '',
    password: '',
    role:     (editUser?.role ?? 'UPLOADER') as Role,
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const url    = editUser ? `/api/admin/users/${editUser.id}` : '/api/admin/users'
    const method = editUser ? 'PATCH' : 'POST'
    const body   = editUser
      ? { role: form.role }
      : { username: form.username, email: form.email, phone: form.phone || undefined,
          password: form.password, role: form.role }

    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const data = await res.json()

    setLoading(false)

    if (!res.ok) { setError(data.error ?? 'Something went wrong.'); return }

    onSaved()
    onClose()
  }

  const inputCls = `w-full bg-slate-800/60 border border-slate-700/50 rounded-xl
    px-4 py-2.5 text-sm text-white placeholder-slate-500
    focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4
                    bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800
                      rounded-2xl shadow-2xl p-7">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-white">
            {editUser ? 'Edit User Role' : 'Create User'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-500/10 border
                          border-red-500/30 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!editUser && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Username</label>
                <input type="text" value={form.username} onChange={update('username')}
                       required pattern="[a-zA-Z0-9_]{3,30}" className={inputCls}
                       placeholder="john_doe" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={update('email')}
                       required className={inputCls} placeholder="john@example.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Phone <span className="text-slate-600">(optional)</span>
                </label>
                <input type="tel" value={form.phone} onChange={update('phone')}
                       className={inputCls} placeholder="+1 555 000 0000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
                <input type="password" value={form.password} onChange={update('password')}
                       required minLength={8} className={inputCls} placeholder="••••••••" />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Role</label>
            <div className="relative">
              <select
                value={form.role}
                onChange={update('role')}
                className={`${inputCls} appearance-none pr-10`}
              >
                <option value="UPLOADER">UPLOADER</option>
                <option value="EDITOR">EDITOR</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2
                                       w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium
                               text-slate-400 border border-slate-700 hover:bg-slate-800 transition">
              Cancel
            </button>
            <button type="submit" disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5
                               rounded-xl text-sm font-semibold text-white
                               bg-gradient-to-r from-indigo-600 to-violet-600
                               hover:from-indigo-500 hover:to-violet-500
                               disabled:opacity-60 transition">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {loading ? 'Saving…' : (editUser ? 'Update Role' : 'Create User')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────
export default function AdminUsersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [users,      setUsers]      = useState<User[]>([])
  const [filtered,   setFiltered]   = useState<User[]>([])
  const [search,     setSearch]     = useState('')
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState<'create' | 'edit' | null>(null)
  const [editUser,   setEditUser]   = useState<User | null>(null)
  const [deleteUser, setDeleteUser] = useState<User | null>(null)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/admin/users')
    const data = await res.json()
    setUsers(data.users ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated' || (status === 'authenticated' && session?.user?.role !== 'ADMIN')) {
      router.replace('/dashboard')
    }
  }, [status, session, router])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(
      q
        ? users.filter(u =>
            (u.username ?? '').toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.role.toLowerCase().includes(q)
          )
        : users
    )
  }, [search, users])

  async function handleDeactivate(user: User) {
    setDeactivatingId(user.id)
    const action = user.isActive ? 'deactivate' : 'reactivate'
    await fetch(`/api/admin/users/${user.id}/deactivate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action }),
    })
    setDeactivatingId(null)
    fetchUsers()
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    )
  }

  return (
    <>
      {(modal === 'create' || modal === 'edit') && (
        <UserModal
          onClose={() => { setModal(null); setEditUser(null) }}
          onSaved={fetchUsers}
          editUser={modal === 'edit' ? editUser : null}
        />
      )}

      {/* 3-step account deletion dialog */}
      {deleteUser && (
        <UserDeleteDialog
          user={deleteUser}
          adminUsers={users.filter(u => u.role === 'ADMIN' && u.id !== deleteUser.id)}
          onClose={() => setDeleteUser(null)}
          onDeleted={() => { setDeleteUser(null); fetchUsers() }}
        />
      )}

      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">User Management</h1>
              <p className="text-sm text-slate-500">{users.length} total users</p>
            </div>
          </div>
          <button
            onClick={() => { setEditUser(null); setModal('create') }}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600
                       hover:from-indigo-500 hover:to-violet-500 text-white text-sm
                       font-semibold px-4 py-2.5 rounded-xl transition shadow-lg shadow-indigo-500/20"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by username, email or role…"
            className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl
                       pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500
                       focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition"
          />
        </div>

        {/* Table — desktop (md+) */}
        <div className="hidden md:block bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800/80">
                <th className="text-left text-xs font-medium text-slate-500 px-5 py-4">User</th>
                <th className="text-left text-xs font-medium text-slate-500 px-5 py-4 hidden md:table-cell">Email</th>
                <th className="text-left text-xs font-medium text-slate-500 px-5 py-4">Role</th>
                <th className="text-left text-xs font-medium text-slate-500 px-5 py-4 hidden lg:table-cell">Joined</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr key={u.id}
                    className={`${i < filtered.length - 1 ? 'border-b border-slate-800/40' : ''}
                                ${!u.isActive ? 'opacity-60' : ''}
                                hover:bg-slate-800/30 transition`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center
                                      justify-center text-xs font-semibold text-indigo-300 uppercase">
                        {(u.username ?? u.email)[0]}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-white">
                          {u.username ?? <span className="text-slate-500 italic">no username</span>}
                        </span>
                        {!u.isActive && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium
                                           bg-slate-700/60 text-slate-400 border border-slate-600/40">
                            Deactivated
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-400 hidden md:table-cell">{u.email}</td>
                  <td className="px-5 py-4"><RoleBadge role={u.role} /></td>
                  <td className="px-5 py-4 text-sm text-slate-500 hidden lg:table-cell">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => { setEditUser(u); setModal('edit') }}
                        title="Edit role"
                        className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10
                                   rounded-lg transition"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {u.id !== session?.user?.id && (
                        <>
                          <button
                            onClick={() => handleDeactivate(u)}
                            disabled={deactivatingId === u.id}
                            title={u.isActive ? 'Deactivate user' : 'Reactivate user'}
                            className={`p-1.5 rounded-lg transition
                              ${u.isActive
                                ? 'text-slate-500 hover:text-amber-400 hover:bg-amber-500/10'
                                : 'text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10'}`}
                          >
                            {deactivatingId === u.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : u.isActive
                                ? <UserX className="w-4 h-4" />
                                : <UserCheck className="w-4 h-4" />
                            }
                          </button>
                          <button
                            onClick={() => setDeleteUser(u)}
                            title="Delete account"
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10
                                       rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                    {search ? 'No users match your search.' : 'No users found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Cards — mobile (< md) */}
        <div className="md:hidden space-y-3">
          {filtered.length === 0 && (
            <p className="text-center text-sm text-slate-500 py-10">
              {search ? 'No users match your search.' : 'No users found.'}
            </p>
          )}
          {filtered.map(u => (
            <div key={u.id}
                 className={`bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4
                             ${!u.isActive ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center
                                justify-center text-sm font-semibold text-indigo-300 uppercase shrink-0">
                  {(u.username ?? u.email)[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">
                      {u.username ?? <span className="text-slate-500 italic">no username</span>}
                    </p>
                    {!u.isActive && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0
                                       bg-slate-700/60 text-slate-400 border border-slate-600/40">
                        Deactivated
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 truncate">{u.email}</p>
                </div>
                <RoleBadge role={u.role} />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-800/50 pt-3">
                <span className="text-xs text-slate-500">
                  Joined {new Date(u.createdAt).toLocaleDateString()}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditUser(u); setModal('edit') }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                               text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 transition"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit role
                  </button>
                  {u.id !== session?.user?.id && (
                    <>
                      <button
                        onClick={() => handleDeactivate(u)}
                        disabled={deactivatingId === u.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition
                          ${u.isActive
                            ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                            : 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'}`}
                      >
                        {deactivatingId === u.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : u.isActive
                            ? <><UserX className="w-3.5 h-3.5" />Deactivate</>
                            : <><UserCheck className="w-3.5 h-3.5" />Reactivate</>
                        }
                      </button>
                      <button
                        onClick={() => setDeleteUser(u)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                                   text-red-400 bg-red-500/10 hover:bg-red-500/20 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
