import { KeyRound, MailCheck, Power, PowerOff, type LucideIcon } from 'lucide-react'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'

export type UserActionKind = 'activate' | 'deactivate' | 'reset-password' | 'resend-invitation'

interface UserActionDialogProps {
  open: boolean
  kind: UserActionKind
  userName: string
  userEmail: string
  processing: boolean
  error?: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

const contentByKind = {
  activate: { title: 'Reactivar usuario', description: 'La cuenta recuperará sus accesos asignados.', confirm: 'Reactivar', Icon: Power },
  deactivate: { title: 'Desactivar usuario', description: 'La cuenta perderá acceso hasta que un administrador la reactive.', confirm: 'Desactivar', Icon: PowerOff },
  'reset-password': { title: 'Enviar recuperación', description: 'Se enviará un enlace de recuperación al correo de la cuenta.', confirm: 'Enviar correo', Icon: KeyRound },
  'resend-invitation': { title: 'Reenviar invitación', description: 'Se enviará una nueva invitación para que la persona active su cuenta.', confirm: 'Reenviar invitación', Icon: MailCheck },
} satisfies Record<UserActionKind, { title: string; description: string; confirm: string; Icon: LucideIcon }>

export function UserActionDialog({ open, kind, userName, userEmail, processing, error, onOpenChange, onConfirm }: UserActionDialogProps) {
  const content = contentByKind[kind]
  const destructive = kind === 'deactivate'

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(nextOpen) => { if (!processing) onOpenChange(nextOpen) }}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-60 bg-foreground/30" />
        <AlertDialogPrimitive.Content className="fixed start-1/2 top-1/2 z-70 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-xl outline-none">
          <div className={`flex size-11 items-center justify-center rounded-full ${destructive ? 'bg-destructive/10 text-destructive' : 'bg-accent text-primary'}`}>
            <content.Icon className="size-5" aria-hidden="true" />
          </div>
          <AlertDialogPrimitive.Title className="mt-4 text-xl font-semibold">{content.title}</AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            {content.description}<br /><span className="font-medium text-foreground">{userName}</span> · {userEmail}
          </AlertDialogPrimitive.Description>
          {error ? <p role="alert" className="mt-4 border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild><Button type="button" variant="outline" disabled={processing}>Cancelar</Button></AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button type="button" variant={destructive ? 'destructive' : 'default'} disabled={processing} onClick={(event) => { event.preventDefault(); onConfirm() }}>
                {processing ? 'Procesando…' : content.confirm}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
