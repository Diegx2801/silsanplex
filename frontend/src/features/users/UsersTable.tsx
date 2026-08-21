import { KeyRound, MailCheck, Pencil, Power, PowerOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ManagedUser } from '@/features/users/userTypes'

interface UsersTableProps {
  users: ManagedUser[]
  hasActiveFilters?: boolean
  busyUserId: string | null
  currentUserId: string | null
  onEdit: (user: ManagedUser) => void
  onToggleStatus: (user: ManagedUser) => void
  onResetPassword: (user: ManagedUser) => void
  onResendInvitation: (user: ManagedUser) => void
}

const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

type UserActionsProps = Omit<UsersTableProps, 'users' | 'hasActiveFilters'> & {
  user: ManagedUser
}

function UserActions({
  user,
  busyUserId,
  currentUserId,
  onEdit,
  onToggleStatus,
  onResetPassword,
  onResendInvitation,
}: UserActionsProps) {
  const busy = busyUserId === user.id
  const isCurrentUser = currentUserId === user.id
  const invitationPending = !user.authConfirmedAt

  return (
    <div className="flex justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Editar a ${user.fullName}`}
        disabled={busy}
        onClick={() => onEdit(user)}
      >
        <Pencil aria-hidden="true" />
      </Button>
      {invitationPending ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Reenviar invitación a ${user.fullName}`}
          title="Reenviar invitación"
          disabled={busy || !user.isActive}
          onClick={() => onResendInvitation(user)}
        >
          <MailCheck aria-hidden="true" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Restablecer contraseña de ${user.fullName}`}
          title="Restablecer contraseña"
          disabled={busy || !user.isActive}
          onClick={() => onResetPassword(user)}
        >
          <KeyRound aria-hidden="true" />
        </Button>
      )}
      <Button
        type="button"
        variant={user.isActive ? 'destructive' : 'ghost'}
        size="icon"
        aria-label={`${user.isActive ? 'Desactivar' : 'Reactivar'} a ${user.fullName}`}
        title={
          isCurrentUser
            ? 'No puedes desactivar tu propia cuenta'
            : user.isActive
              ? 'Desactivar usuario'
              : 'Reactivar usuario'
        }
        disabled={busy || isCurrentUser}
        onClick={() => onToggleStatus(user)}
      >
        {user.isActive ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
      </Button>
    </div>
  )
}

export function UsersTable({
  users,
  hasActiveFilters = false,
  busyUserId,
  currentUserId,
  onEdit,
  onToggleStatus,
  onResetPassword,
  onResendInvitation,
}: UsersTableProps) {
  if (users.length === 0) {
    return (
      <div className="border-t px-6 py-14 text-center">
        <p className="font-medium">No se encontraron usuarios</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasActiveFilters
            ? 'Ajusta la búsqueda o el filtro de estado.'
            : 'Invita al primer integrante de la organización.'}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="divide-y border-t md:hidden">
        {users.map((user) => {
          const invitationPending = !user.authConfirmedAt
          const status = !user.isActive
            ? 'Inactivo'
            : invitationPending
              ? 'Invitación pendiente'
              : 'Activo'

          return (
            <article key={user.id} className="space-y-4 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-medium">{user.fullName}</h3>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <span
                  className="status-label shrink-0"
                  data-tone={user.isActive && !invitationPending ? 'listo' : 'revision'}
                >
                  {status}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Teléfono</dt>
                  <dd className="mt-1">{user.phone || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Registro</dt>
                  <dd className="mt-1">{dateFormatter.format(new Date(user.createdAt))}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-1">
                {user.roleCodes.map((role) => (
                  <span key={role} className="rounded-full bg-secondary px-2 py-1 text-xs">
                    {role}
                  </span>
                ))}
              </div>
              <UserActions
                user={user}
                busyUserId={busyUserId}
                currentUserId={currentUserId}
                onEdit={onEdit}
                onToggleStatus={onToggleStatus}
                onResetPassword={onResetPassword}
                onResendInvitation={onResendInvitation}
              />
            </article>
          )
        })}
      </div>

      <div className="hidden overflow-x-auto border-t md:block">
      <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
        <thead className="bg-muted/70 text-xs uppercase text-muted-foreground">
          <tr>
            <th scope="col" className="px-5 py-3 font-medium">Usuario</th>
            <th scope="col" className="px-5 py-3 font-medium">Teléfono</th>
            <th scope="col" className="px-5 py-3 font-medium">Roles</th>
            <th scope="col" className="px-5 py-3 font-medium">Estado</th>
            <th scope="col" className="px-5 py-3 font-medium">Registro</th>
            <th scope="col" className="px-5 py-3 text-right font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map((user) => {
            const invitationPending = !user.authConfirmedAt
            const status = !user.isActive
              ? 'Inactivo'
              : invitationPending
                ? 'Invitación pendiente'
                : 'Activo'

            return (
              <tr key={user.id} className="align-middle hover:bg-muted/30">
                <td className="px-5 py-4">
                  <p className="font-medium">{user.fullName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p>
                </td>
                <td className="px-5 py-4 text-muted-foreground">{user.phone || '—'}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1">
                    {user.roleCodes.map((role) => (
                      <span key={role} className="rounded-full bg-secondary px-2 py-1 text-xs">
                        {role}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span
                    className="status-label"
                    data-tone={user.isActive && !invitationPending ? 'listo' : 'revision'}
                  >
                    {status}
                  </span>
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {dateFormatter.format(new Date(user.createdAt))}
                </td>
                <td className="px-5 py-4">
                  <UserActions
                    user={user}
                    busyUserId={busyUserId}
                    currentUserId={currentUserId}
                    onEdit={onEdit}
                    onToggleStatus={onToggleStatus}
                    onResetPassword={onResetPassword}
                    onResendInvitation={onResendInvitation}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </>
  )
}
