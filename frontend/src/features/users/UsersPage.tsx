import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Users } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { UserForm } from '@/features/users/UserForm'
import { UsersTable } from '@/features/users/UsersTable'
import {
  createUser,
  listUsers,
  resendInvitation,
  sendPasswordReset,
  setUserStatus,
  updateUser,
} from '@/features/users/userService'
import type { ManagedUser, UserInput } from '@/features/users/userTypes'

const usersQueryKey = ['admin-users'] as const

export function UsersPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  const usersQuery = useQuery({ queryKey: usersQueryKey, queryFn: listUsers })

  const saveMutation = useMutation({
    mutationFn: async (input: UserInput) => {
      if (selectedUser) return updateUser(selectedUser.id, input)
      return createUser(input)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: usersQueryKey })
      setNotice(selectedUser ? 'Usuario actualizado.' : 'Invitación enviada.')
      setFormOpen(false)
      setSelectedUser(null)
    },
  })

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('es')
    if (!normalizedSearch) return usersQuery.data ?? []

    return (usersQuery.data ?? []).filter((user) =>
      [user.fullName, user.email, user.phone ?? '', ...user.roleCodes]
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(normalizedSearch),
    )
  }, [search, usersQuery.data])

  async function executeUserAction(
    user: ManagedUser,
    action: () => Promise<unknown>,
    successMessage: string,
  ) {
    setActionError(null)
    setNotice(null)
    setBusyUserId(user.id)

    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: usersQueryKey })
      setNotice(successMessage)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'La operación falló.')
    } finally {
      setBusyUserId(null)
    }
  }

  function openCreateForm() {
    setSelectedUser(null)
    setNotice(null)
    setActionError(null)
    saveMutation.reset()
    setFormOpen(true)
  }

  function openEditForm(user: ManagedUser) {
    setSelectedUser(user)
    setNotice(null)
    setActionError(null)
    saveMutation.reset()
    setFormOpen(true)
  }

  function toggleStatus(user: ManagedUser) {
    const nextStatus = !user.isActive
    const verb = nextStatus ? 'reactivar' : 'desactivar'

    if (!window.confirm(`¿Deseas ${verb} a ${user.fullName}?`)) return

    void executeUserAction(
      user,
      () => setUserStatus(user.id, nextStatus),
      nextStatus ? 'Usuario reactivado.' : 'Usuario desactivado.',
    )
  }

  function resetPassword(user: ManagedUser) {
    if (!window.confirm(`¿Enviar recuperación de contraseña a ${user.email}?`)) return

    void executeUserAction(
      user,
      () => sendPasswordReset(user.id),
      'Correo de recuperación enviado.',
    )
  }

  function resendPendingInvitation(user: ManagedUser) {
    if (!window.confirm(`¿Reenviar la invitación a ${user.email}?`)) return

    void executeUserAction(
      user,
      () => resendInvitation(user.id),
      'Invitación reenviada.',
    )
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-wider text-primary">CONFIGURACIÓN</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            Control de usuarios
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Invita integrantes, asigna roles y administra su acceso a SILSAN.
          </p>
        </div>
        <Button size="lg" onClick={openCreateForm}>
          <Plus aria-hidden="true" />
          Invitar usuario
        </Button>
      </header>

      {notice ? (
        <p role="status" className="border border-primary/30 bg-accent px-4 py-3 text-sm">
          {notice}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <section aria-labelledby="users-table-title" className="ledger-sheet">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Users aria-hidden="true" className="size-5 text-primary" />
            <div>
              <h2 id="users-table-title" className="font-semibold">Usuarios</h2>
              <p className="text-xs text-muted-foreground">
                {usersQuery.data?.length ?? 0} registrados
              </p>
            </div>
          </div>

          <label className="relative block w-full sm:max-w-sm">
            <span className="sr-only">Buscar usuarios</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, correo o rol"
              className="h-10 w-full rounded-md border bg-background ps-9 pe-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>

        {usersQuery.isLoading ? (
          <p role="status" className="border-t px-6 py-14 text-center text-sm text-muted-foreground">
            Cargando usuarios…
          </p>
        ) : usersQuery.isError ? (
          <div className="border-t px-6 py-14 text-center">
            <p role="alert" className="text-sm text-destructive">
              {usersQuery.error.message}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void usersQuery.refetch()}
            >
              Reintentar
            </Button>
          </div>
        ) : (
          <UsersTable
            users={filteredUsers}
            busyUserId={busyUserId}
            currentUserId={currentUser?.id ?? null}
            onEdit={openEditForm}
            onToggleStatus={toggleStatus}
            onResetPassword={resetPassword}
            onResendInvitation={resendPendingInvitation}
          />
        )}
      </section>

      <UserForm
        open={formOpen}
        user={selectedUser}
        isSubmitting={saveMutation.isPending}
        currentUserId={currentUser?.id ?? null}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setSelectedUser(null)
        }}
        onSubmit={async (values) => {
          setActionError(null)
          setNotice(null)
          try {
            await saveMutation.mutateAsync(values)
          } catch (error) {
            setActionError(error instanceof Error ? error.message : 'No se pudo guardar.')
          }
        }}
      />
    </div>
  )
}
