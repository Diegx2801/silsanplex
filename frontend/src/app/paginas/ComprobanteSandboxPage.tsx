import { useId, useRef, useState, type SubmitEvent } from 'react'

import { Button } from '@/components/ui/button'
import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import { DetalleComprobanteSandbox } from '@/modulos/facturacion/componentes/DetalleComprobanteSandbox'
import { useComprobanteSandbox } from '@/modulos/facturacion/estado/useComprobanteSandbox'
import { AVISO_FISCAL_SANDBOX, esquemaReferenciaComprobanteSandbox } from '@/modulos/facturacion/modelo/comprobanteSandbox'
import { ErrorConsultaFiscal } from '@/modulos/facturacion/servicios/comprobantesSandboxService'

function ConsultaComprobante({ organizationId }: { organizationId: string }) {
  const id = useId()
  const campo = useRef<HTMLInputElement>(null)
  const [entrada, setEntrada] = useState('')
  const [documentId, setDocumentId] = useState<string>()
  const [errorEntrada, setErrorEntrada] = useState<string | null>(null)
  const consulta = useComprobanteSandbox(documentId)
  const error = consulta.error instanceof ErrorConsultaFiscal ? consulta.error : null

  if (consulta.estadoAutorizacion !== 'permitido') {
    const mensaje = consulta.estadoAutorizacion === 'denegado'
      ? 'Tu permiso para consultar comprobantes fiscales ya no está vigente.'
      : 'No se pudo verificar tu permiso. El snapshot se ocultó por seguridad.'
    return <section role={consulta.estadoAutorizacion === 'verificando' ? 'status' : 'alert'}
      aria-live="assertive" className="border bg-card p-6">
      <h2 className="text-lg font-semibold">{consulta.estadoAutorizacion === 'verificando'
        ? 'Verificando autorización fiscal…'
        : 'Consulta fiscal bloqueada'}</h2>
      {consulta.estadoAutorizacion !== 'verificando' ? <p className="mt-2 text-sm leading-6">{mensaje}</p> : null}
    </section>
  }

  const consultar = (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const referencia = esquemaReferenciaComprobanteSandbox.safeParse({ organizationId, documentId: entrada.trim() })
    if (!referencia.success) {
      setErrorEntrada('Ingresa un UUID de comprobante válido')
      setDocumentId(undefined)
      campo.current?.focus()
      return
    }
    setErrorEntrada(null)
    setEntrada(referencia.data.documentId)
    if (documentId === referencia.data.documentId) void consulta.reintentar()
    else setDocumentId(referencia.data.documentId)
  }

  const limpiar = () => {
    setEntrada('')
    setDocumentId(undefined)
    setErrorEntrada(null)
    campo.current?.focus()
  }

  return <div className="min-w-0 space-y-8">
    <section aria-labelledby={`${id}-buscar`} className="border-b pb-7">
      <h2 id={`${id}-buscar`} className="text-lg font-semibold">Buscar comprobante</h2>
      <form aria-label="Consultar comprobante sandbox" onSubmit={consultar} noValidate className="mt-4">
        <label className="field-label" htmlFor={`${id}-uuid`}>UUID del comprobante</label>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <input ref={campo} id={`${id}-uuid`} name="documentId" type="text" value={entrada} maxLength={80} required
            autoComplete="off" autoCapitalize="none" spellCheck={false}
            aria-invalid={Boolean(errorEntrada)} aria-describedby={`${id}-ayuda${errorEntrada ? ` ${id}-error` : ''}`}
            className="field-control max-w-lg font-mono" onChange={(evento) => { setEntrada(evento.target.value); setErrorEntrada(null) }} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-10 px-4" disabled={consulta.cargando}>Consultar</Button>
            <Button type="button" variant="outline" className="min-h-10 px-4" onClick={limpiar}>Limpiar consulta</Button>
          </div>
        </div>
        <p id={`${id}-ayuda`} className="field-help">Consulta únicamente snapshots sandbox de tu organización. No se modifica la venta.</p>
        {errorEntrada ? <p id={`${id}-error`} role="alert" className="field-error">{errorEntrada}</p> : null}
      </form>
    </section>

    <div aria-busy={consulta.cargando} className="min-w-0">
      {consulta.cargando ? <p role="status" className="py-8 text-sm text-muted-foreground">Consultando comprobante sandbox…</p>
        : consulta.error ? <section aria-labelledby={`${id}-fallo`} className="border bg-card p-6">
          <h2 id={`${id}-fallo`} className="text-lg font-semibold">{error?.codigo === 'NO_ENCONTRADO' ? 'Documento no disponible' : 'No se pudo completar la consulta'}</h2>
          <p role="alert" className="mt-2 text-sm leading-6">{error?.message ?? 'No se pudo consultar el comprobante sandbox; vuelve a intentarlo'}</p>
          <Button type="button" variant="outline" className="mt-4 min-h-10" onClick={() => void consulta.reintentar()}>Reintentar consulta</Button>
        </section>
          : consulta.comprobante ? <>
            <p role="status" className="sr-only">Consulta completada. {consulta.comprobante.state === 'prepared' ? 'Documento preparado, sin número.' : 'Documento congelado para prueba interna.'}</p>
            <DetalleComprobanteSandbox comprobante={consulta.comprobante} />
          </> : !documentId && !errorEntrada ? <section aria-labelledby={`${id}-vacio`} className="py-6">
            <h2 id={`${id}-vacio`} className="text-lg font-medium">Ningún comprobante seleccionado</h2>
            <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">Ingresa el UUID de un documento sandbox preparado previamente para revisar su snapshot fiscal.</p>
          </section> : null}
    </div>
  </div>
}

export function ComprobanteSandboxPage() {
  const { access, user, session, isLoading, hasPermission } = useAuth()
  return <div className="min-w-0 space-y-7">
    <header className="border-b pb-7">
      <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Consulta fiscal sandbox</h1>
      <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">Revisa los datos fiscales guardados de una venta. Esta pantalla es de consulta y no emite comprobantes.</p>
    </header>
    <p role="note" aria-label="Aviso de entorno sandbox" className="rounded-md border border-primary/30 bg-accent px-4 py-3 text-sm font-medium leading-6 text-accent-foreground">{AVISO_FISCAL_SANDBOX}</p>
    {isLoading ? <p role="status">Verificando acceso fiscal…</p>
      : !session || !user ? <p role="alert">Inicia sesión para consultar comprobantes sandbox.</p>
        : !access || !hasPermission(PERMISSIONS.BILLING_VIEW) ? <p role="alert">No tienes permiso para consultar comprobantes fiscales.</p>
          : <ConsultaComprobante key={`${access.organizationId}:${user.id}`} organizationId={access.organizationId} />}
  </div>
}
