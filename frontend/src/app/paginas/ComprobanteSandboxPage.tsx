import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import { DetalleComprobanteSandbox } from '@/modulos/facturacion/componentes/DetalleComprobanteSandbox'
import { FlujoEmisionSandbox } from '@/modulos/facturacion/componentes/FlujoEmisionSandbox'
import { useComprobanteSandbox } from '@/modulos/facturacion/estado/useComprobanteSandbox'
import { useVigenciaPermisoFiscal, type VigenciaPermisoFiscal } from '@/modulos/facturacion/estado/useVigenciaPermisoFiscal'
import { AMBIENTE_FISCAL_SANDBOX, AVISO_FISCAL_SANDBOX, esquemaReferenciaComprobanteSandbox } from '@/modulos/facturacion/modelo/comprobanteSandbox'
import {
  confirmarComprobanteSandbox,
  crearClaveOperacionFiscal,
  ErrorComandoFiscal,
  ErrorConsultaFiscal,
} from '@/modulos/facturacion/servicios/comprobantesSandboxService'
import { descargarReciboSimulado, simularComprobanteSandbox, type ResultadoSimulacionSandbox } from '@/modulos/facturacion/servicios/simuladorEmisionSandbox'

function ConsultaComprobante({
  organizationId,
  documentId,
  onDocumentIdChange,
  puedeConfirmar,
  vigencia,
}: {
  organizationId: string
  documentId?: string
  onDocumentIdChange: (documentId?: string) => void
  puedeConfirmar: boolean
  vigencia: VigenciaPermisoFiscal
}) {
  const id = useId()
  const campo = useRef<HTMLInputElement>(null)
  const clavesConfirmacion = useRef(new Map<string, string>())
  const queryClient = useQueryClient()
  const [entrada, setEntrada] = useState('')
  const [errorEntrada, setErrorEntrada] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [confirmadoExplicito, setConfirmadoExplicito] = useState(false)
  const [pendingAction, setPendingAction] = useState<'confirm' | 'simulate' | null>(null)
  const [simulacion, setSimulacion] = useState<ResultadoSimulacionSandbox | null>(null)
  const consulta = useComprobanteSandbox(documentId, vigencia)
  const error = consulta.error instanceof ErrorConsultaFiscal ? consulta.error : null
  const idComprobanteConsultado = consulta.comprobante?.documentId
  const estadoComprobanteConsultado = consulta.comprobante?.state

  useEffect(() => {
    if (estadoComprobanteConsultado === 'frozen' && idComprobanteConsultado) {
      clavesConfirmacion.current.delete(`${organizationId}:${AMBIENTE_FISCAL_SANDBOX}:${idComprobanteConsultado}`)
    }
  }, [organizationId, idComprobanteConsultado, estadoComprobanteConsultado])

  useEffect(() => {
    if (documentId) setEntrada(documentId)
    setConfirmadoExplicito(false)
    setErrorAccion(null)
    setSimulacion(null)
  }, [documentId])

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
      onDocumentIdChange(undefined)
      campo.current?.focus()
      return
    }
    setErrorEntrada(null)
    setEntrada(referencia.data.documentId)
    if (documentId === referencia.data.documentId) void consulta.reintentar()
    else onDocumentIdChange(referencia.data.documentId)
  }

  const limpiar = () => {
    setEntrada('')
    onDocumentIdChange(undefined)
    setErrorEntrada(null)
    setErrorAccion(null)
    setSimulacion(null)
    setConfirmadoExplicito(false)
    campo.current?.focus()
  }

  const confirmar = async () => {
    const comprobante = consulta.comprobante
    if (!puedeConfirmar || !comprobante || comprobante.state !== 'prepared' || !confirmadoExplicito) return
    setPendingAction('confirm')
    setErrorAccion(null)
    const scopeConfirmacion = `${organizationId}:${AMBIENTE_FISCAL_SANDBOX}:${comprobante.documentId}`
    let operationKey = clavesConfirmacion.current.get(scopeConfirmacion)
    if (!operationKey) {
      operationKey = crearClaveOperacionFiscal()
      clavesConfirmacion.current.set(scopeConfirmacion, operationKey)
    }
    try {
      await confirmarComprobanteSandbox({
        organizationId,
        environment: AMBIENTE_FISCAL_SANDBOX,
        operationKey,
        documentId: comprobante.documentId,
        expectedVersion: comprobante.version,
      })
      setConfirmadoExplicito(false)
      await queryClient.invalidateQueries({ queryKey: ['electronic-document', organizationId, AMBIENTE_FISCAL_SANDBOX, comprobante.documentId] })
      await queryClient.invalidateQueries({ queryKey: ['electronic-billing-configuration', organizationId] })
      await consulta.reintentar()
    } catch (error) {
      setErrorAccion(error instanceof ErrorComandoFiscal ? error.message : 'No se pudo confirmar la numeración de prueba.')
    } finally {
      setPendingAction(null)
    }
  }

  const simular = async () => {
    const comprobante = consulta.comprobante
    if (!puedeConfirmar || !comprobante || comprobante.state !== 'frozen') return
    setPendingAction('simulate')
    setErrorAccion(null)
    setSimulacion(null)
    try {
      setSimulacion(await simularComprobanteSandbox(comprobante))
    } catch {
      setErrorAccion('No se pudo completar la simulación local del snapshot congelado.')
    } finally {
      setPendingAction(null)
    }
  }

  return <div className="min-w-0 space-y-8">
    <section aria-labelledby={`${id}-buscar`} className="border-b pb-7">
      <h2 id={`${id}-buscar`} className="text-lg font-semibold">Consultar comprobante</h2>
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
            {consulta.comprobante.state === 'prepared' && puedeConfirmar ? <section aria-labelledby={`${id}-confirmar`} className="mt-6 space-y-4 border-t pt-5">
              <h2 id={`${id}-confirmar`} className="text-lg font-semibold">Confirmación interna de prueba</h2>
              <p className="text-sm leading-6 text-muted-foreground">Al confirmar, PostgreSQL asignará un correlativo sandbox. La venta y el inventario no se modifican; no se envía nada a SUNAT.</p>
              <label className="flex items-start gap-3 text-sm leading-6">
                <input type="checkbox" className="mt-1" checked={confirmadoExplicito} onChange={(evento) => setConfirmadoExplicito(evento.target.checked)} />
                Confirmo asignar un número interno de prueba a este documento.
              </label>
              {errorAccion ? <p role="alert" className="field-error">{errorAccion}</p> : null}
              <Button type="button" disabled={!confirmadoExplicito || pendingAction !== null} onClick={() => void confirmar()}>
                {pendingAction === 'confirm' ? 'Confirmando…' : 'Confirmar numeración sandbox'}
              </Button>
            </section> : null}
            {consulta.comprobante.state === 'frozen' && puedeConfirmar ? <section aria-labelledby={`${id}-simular`} className="mt-6 space-y-4 border-t pt-5">
              <div>
                <h2 id={`${id}-simular`} className="text-lg font-semibold">Simulación local del resultado</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">El simulador trabaja solo en memoria en este navegador. No llama a un proveedor, no usa la outbox y no crea una respuesta SUNAT ni un CDR.</p>
              </div>
              <Button type="button" variant="outline" disabled={pendingAction !== null} onClick={() => void simular()}>
                {pendingAction === 'simulate' ? 'Simulando…' : 'Ejecutar simulación local'}
              </Button>
              {errorAccion ? <p role="alert" className="field-error">{errorAccion}</p> : null}
              {simulacion ? <section aria-label="Resultado ficticio del simulador" className="space-y-3 rounded-md border border-amber-500/40 bg-amber-50/50 p-4">
                <p className="font-semibold">SIN VALIDEZ TRIBUTARIA · resultado ficticio</p>
                <p className="text-sm">{simulacion.resultado.status === 'accepted' ? 'Simulación local favorable' : simulacion.resultado.status === 'rejected' ? 'Simulación local de rechazo' : 'Simulación local pendiente'}</p>
                <p className="text-sm leading-6">{simulacion.resultado.message}</p>
                <p className="break-all font-mono text-xs">Referencia local: {simulacion.resultado.providerReference}</p>
                <Button type="button" variant="outline" onClick={() => descargarReciboSimulado(simulacion.recibo)}>
                  Descargar recibo JSON simulado
                </Button>
              </section> : null}
            </section> : null}
          </> : !documentId && !errorEntrada ? <section aria-labelledby={`${id}-vacio`} className="py-6">
            <h2 id={`${id}-vacio`} className="text-lg font-medium">Ningún comprobante seleccionado</h2>
            <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">Prepara uno desde una venta o ingresa el UUID de un documento sandbox para revisar su snapshot.</p>
          </section> : null}
    </div>
  </div>
}

export function ComprobanteSandboxPage() {
  const { access, user, session, isLoading, hasPermission } = useAuth()
  const vigencia = useVigenciaPermisoFiscal(access?.organizationId ?? '')
  const identity = access && user ? `${access.organizationId}:${user.id}` : ''
  const [selection, setSelection] = useState<{ identity: string; documentId?: string }>({ identity: '', documentId: undefined })
  const documentId = selection.identity === identity ? selection.documentId : undefined
  const selectDocument = (nextDocumentId?: string) => setSelection({ identity, documentId: nextDocumentId })
  return <div className="min-w-0 space-y-7">
    <header className="border-b pb-7">
      <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Facturación · pruebas sandbox</h1>
      <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">Configura perfiles ficticios, prepara desde una venta existente, revisa el snapshot y asigna numeración solo para una prueba local.</p>
    </header>
    <p role="note" aria-label="Aviso de entorno sandbox" className="rounded-md border border-primary/30 bg-accent px-4 py-3 text-sm font-medium leading-6 text-accent-foreground">{AVISO_FISCAL_SANDBOX}</p>
    {isLoading ? <p role="status">Verificando acceso fiscal…</p>
      : !session || !user ? <p role="alert">Inicia sesión para consultar comprobantes sandbox.</p>
        : !access || !hasPermission(PERMISSIONS.BILLING_VIEW) ? <p role="alert">No tienes permiso para consultar comprobantes fiscales.</p>
          : !vigencia.permitido ? <p role={vigencia.estado === 'verificando' ? 'status' : 'alert'}>
            {vigencia.estado === 'verificando'
              ? 'Verificando autorización fiscal…'
              : 'Tu permiso fiscal no está vigente o no pudo verificarse; los datos se ocultaron.'}
          </p>
          : <div key={`${access.organizationId}:${user.id}`} className="min-w-0 space-y-8">
            <FlujoEmisionSandbox organizationId={access.organizationId} userId={user.id}
              puedeConfigurar={hasPermission(PERMISSIONS.BILLING_CONFIGURE)}
              puedePreparar={hasPermission(PERMISSIONS.BILLING_PREPARE)}
              permisoFiscalVigente={vigencia.permitido}
              onPrepared={selectDocument} />
            <ConsultaComprobante organizationId={access.organizationId} documentId={documentId}
              onDocumentIdChange={selectDocument} puedeConfirmar={hasPermission(PERMISSIONS.BILLING_ISSUE)}
              vigencia={vigencia} />
          </div>}
  </div>
}
