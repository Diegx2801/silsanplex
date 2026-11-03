import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction, type SubmitEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import type { Cliente } from '@/modulos/clientes/modelo/cliente'
import { buscarClientes } from '@/modulos/clientes/servicios/customerService'
import type { ConfiguracionEmisionSandbox } from '@/modulos/facturacion/servicios/comprobantesSandboxService'
import {
  consultarConfiguracionEmisionSandbox,
  crearClaveOperacionFiscal,
  ErrorComandoFiscal,
  ErrorConfiguracionFiscal,
  guardarPerfilEmisorSandbox,
  configurarSerieSandbox,
  prepararComprobanteSandbox,
} from '@/modulos/facturacion/servicios/comprobantesSandboxService'
import { AMBIENTE_FISCAL_SANDBOX } from '@/modulos/facturacion/modelo/comprobanteSandbox'
import { crearPerfilVacio, type BorradorEmisionSandbox, type PerfilFormulario } from '@/modulos/facturacion/estado/borradorEmisionSandbox'
import { listarVentasPersistentes } from '@/modulos/ventas/servicios/ventasService'

const HASH_REGLAS_FISCALES = 'cb5e871cfe3b81abea7faf25b156e5d35b21e8c4837979350919926612da73b6'
const PERFIL_NUEVO = '__nuevo__'
const SERIE_NUEVA = '__nueva__'
const PERFILES_VACIOS: ConfiguracionEmisionSandbox['profiles'] = []
const SERIES_VACIAS: ConfiguracionEmisionSandbox['profiles'][number]['series'] = []

function useCampoBorrador<K extends keyof BorradorEmisionSandbox>(
  borrador: BorradorEmisionSandbox,
  actualizarBorrador: Dispatch<SetStateAction<BorradorEmisionSandbox>>,
  campo: K,
) {
  const actualizar = useCallback<Dispatch<SetStateAction<BorradorEmisionSandbox[K]>>>((valor) => {
    actualizarBorrador((actual) => ({
      ...actual,
      [campo]: typeof valor === 'function'
        ? (valor as (anterior: BorradorEmisionSandbox[K]) => BorradorEmisionSandbox[K])(actual[campo])
        : valor,
    }))
  }, [actualizarBorrador, campo])

  return [borrador[campo], actualizar] as const
}

function perfilAFormulario(perfil: ConfiguracionEmisionSandbox['profiles'][number]): PerfilFormulario {
  return {
    ruc: perfil.ruc,
    nombre: perfil.legalName.replace(/^SANDBOX\s+/, ''),
    direccion: perfil.fiscalAddress.line,
    distrito: perfil.fiscalAddress.district,
    provincia: perfil.fiscalAddress.province,
    departamento: perfil.fiscalAddress.department,
    ubigeo: perfil.fiscalAddress.ubigeo,
    establecimiento: perfil.establishmentCode,
  }
}

function mensajeSeguro(error: unknown) {
  if (error instanceof ErrorComandoFiscal || error instanceof ErrorConfiguracionFiscal) return error.message
  return 'No se pudo completar esta operación sandbox. Actualiza la configuración o vuelve a consultar la venta.'
}

export function FlujoEmisionSandbox({
  organizationId,
  userId,
  puedeConfigurar,
  puedePreparar,
  permisoFiscalVigente,
  borrador,
  actualizarBorrador,
  onPrepared,
}: {
  organizationId: string
  userId: string
  puedeConfigurar: boolean
  puedePreparar: boolean
  permisoFiscalVigente: boolean
  borrador: BorradorEmisionSandbox
  actualizarBorrador: Dispatch<SetStateAction<BorradorEmisionSandbox>>
  onPrepared: (documentId: string) => void
}) {
  const { hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const puedeVerVentas = hasPermission(PERMISSIONS.SALES_VIEW)
  const puedeConsultarConfiguracion = puedeConfigurar || puedePreparar
  const [selectedProfileId, setSelectedProfileId] = useCampoBorrador(borrador, actualizarBorrador, 'selectedProfileId')
  const [profileForm, setProfileForm] = useCampoBorrador(borrador, actualizarBorrador, 'profileForm')
  const [profileFormDirty, setProfileFormDirty] = useCampoBorrador(borrador, actualizarBorrador, 'profileFormDirty')
  const [documentType, setDocumentType] = useCampoBorrador(borrador, actualizarBorrador, 'documentType')
  const [editorSeriesId, setEditorSeriesId] = useCampoBorrador(borrador, actualizarBorrador, 'editorSeriesId')
  const [preparationSeriesId, setPreparationSeriesId] = useCampoBorrador(borrador, actualizarBorrador, 'preparationSeriesId')
  const [seriesCode, setSeriesCode] = useCampoBorrador(borrador, actualizarBorrador, 'seriesCode')
  const [nextNumber, setNextNumber] = useCampoBorrador(borrador, actualizarBorrador, 'nextNumber')
  const [seriesEnabled, setSeriesEnabled] = useCampoBorrador(borrador, actualizarBorrador, 'seriesEnabled')
  const [seriesFormDirty, setSeriesFormDirty] = useCampoBorrador(borrador, actualizarBorrador, 'seriesFormDirty')
  const [saleId, setSaleId] = useCampoBorrador(borrador, actualizarBorrador, 'saleId')
  const [issueDate, setIssueDate] = useCampoBorrador(borrador, actualizarBorrador, 'issueDate')
  const [paymentKind, setPaymentKind] = useCampoBorrador(borrador, actualizarBorrador, 'paymentKind')
  const [outstanding, setOutstanding] = useCampoBorrador(borrador, actualizarBorrador, 'outstanding')
  const [outstandingDirty, setOutstandingDirty] = useCampoBorrador(borrador, actualizarBorrador, 'outstandingDirty')
  const [dueDate, setDueDate] = useCampoBorrador(borrador, actualizarBorrador, 'dueDate')
  const [profileCommand, setProfileCommand] = useCampoBorrador(borrador, actualizarBorrador, 'profileCommand')
  const [seriesCommand, setSeriesCommand] = useCampoBorrador(borrador, actualizarBorrador, 'seriesCommand')
  const [prepareOperationKey, setPrepareOperationKey] = useCampoBorrador(borrador, actualizarBorrador, 'prepareOperationKey')
  const [operationError, setOperationError] = useState<string | null>(null)
  const [configurationError, setConfigurationError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<'profile' | 'series' | 'prepare' | null>(null)

  const resetProfileCommand = () => setProfileCommand(null)
  const resetSeriesCommand = () => setSeriesCommand(null)

  const configQuery = useQuery({
    queryKey: ['electronic-billing-configuration', organizationId, userId],
    queryFn: ({ signal }) => consultarConfiguracionEmisionSandbox(organizationId, signal),
    enabled: permisoFiscalVigente && puedeConsultarConfiguracion,
    staleTime: 0,
    retry: false,
  })
  const config = configQuery.data
  const profiles = config?.profiles ?? PERFILES_VACIOS
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId)
    ?? (!selectedProfileId ? profiles[0] : undefined)
  const profileSeries = selectedProfile?.series ?? SERIES_VACIAS
  const seriesForType = useMemo(
    () => profileSeries.filter((series) => series.documentType === documentType),
    [profileSeries, documentType],
  )
  const editableSeries = seriesForType.find((series) => series.id === editorSeriesId)
    ?? (editorSeriesId === SERIE_NUEVA ? undefined : seriesForType[0])
  const activeSeries = useMemo(
    () => profileSeries.filter((series) => series.enabled && series.documentType === documentType),
    [profileSeries, documentType],
  )
  const selectedSeries = activeSeries.find((series) => series.id === preparationSeriesId) ?? activeSeries[0]

  const salesQuery = useQuery({
    queryKey: ['fiscal-source-sales', organizationId, userId],
    queryFn: () => listarVentasPersistentes(organizationId),
    enabled: permisoFiscalVigente && puedePreparar && puedeVerVentas,
    staleTime: 0,
    retry: false,
  })
  const ventas = salesQuery.data ?? []
  const selectedSale = ventas.find((sale) => sale.id === saleId)
  const selectedSaleTotal = selectedSale?.total
  const customerQuery = useQuery({
    queryKey: ['fiscal-source-customer', organizationId, userId, selectedSale?.id],
    queryFn: async () => {
      if (!selectedSale) return undefined
      const result = await buscarClientes(organizationId, selectedSale.clienteDocumento, 20)
      return result.find((customer) => customer.id === selectedSale.clienteId)
    },
    enabled: Boolean(permisoFiscalVigente && puedePreparar && puedeVerVentas && selectedSale),
    staleTime: 0,
    retry: false,
  })
  const customer = customerQuery.data as Cliente | undefined
  const fiscalAddressId = customer?.direccionFiscalId ?? null

  useEffect(() => {
    if (!selectedProfileId && profiles.length) setSelectedProfileId(profiles[0].id)
    if (!selectedProfileId && !profiles.length && config) setSelectedProfileId(PERFIL_NUEVO)
  }, [config, profiles, selectedProfileId, setSelectedProfileId])

  useEffect(() => {
    if (profileFormDirty) return
    if (selectedProfile) setProfileForm(perfilAFormulario(selectedProfile))
    else if (selectedProfileId === PERFIL_NUEVO || (config && !profiles.length)) setProfileForm(crearPerfilVacio())
  }, [config, profileFormDirty, profiles.length, selectedProfile, selectedProfileId, setProfileForm])

  useEffect(() => {
    if (seriesFormDirty) return
    if (editableSeries) {
      setSeriesCode(editableSeries.series)
      setNextNumber(editableSeries.nextNumber)
      setSeriesEnabled(editableSeries.enabled)
    } else {
      setSeriesCode(documentType === '01' ? 'F001' : 'B001')
      setNextNumber('1')
      setSeriesEnabled(true)
    }
  }, [documentType, editableSeries, seriesFormDirty, setNextNumber, setSeriesCode, setSeriesEnabled])

  useEffect(() => {
    const first = seriesForType[0]
    setEditorSeriesId((current) => current === SERIE_NUEVA || seriesForType.some((series) => series.id === current)
      ? current
      : first?.id ?? SERIE_NUEVA)
    setPreparationSeriesId((current) => activeSeries.some((series) => series.id === current)
      ? current
      : activeSeries[0]?.id ?? '')
  }, [activeSeries, seriesForType, setEditorSeriesId, setPreparationSeriesId])

  useEffect(() => {
    if (selectedSaleTotal !== undefined && !outstandingDirty) setOutstanding(selectedSaleTotal.toFixed(2))
  }, [outstandingDirty, selectedSaleTotal, setOutstanding])

  useEffect(() => {
    if (!activeSeries.some((series) => series.id === preparationSeriesId)) {
      setPreparationSeriesId(activeSeries[0]?.id ?? '')
    }
  }, [activeSeries, preparationSeriesId, setPreparationSeriesId])

  const actualizarPerfil = (campo: keyof PerfilFormulario, valor: string) => {
    resetProfileCommand()
    setConfigurationError(null)
    setProfileForm((actual) => ({ ...actual, [campo]: valor }))
    setProfileFormDirty(true)
  }
  const guardarPerfil = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!permisoFiscalVigente || !puedeConfigurar || !config || !profileForm.ruc.trim() || !profileForm.nombre.trim()) return
    setConfigurationError(null)
    setPendingAction('profile')
    const comando = profileCommand ?? {
      operationKey: crearClaveOperacionFiscal(),
      id: selectedProfile?.id ?? crypto.randomUUID(),
    }
    if (!profileCommand) setProfileCommand(comando)
    const profileId = selectedProfile?.id ?? comando.id
    try {
      const result = await guardarPerfilEmisorSandbox({
        organizationId,
        environment: AMBIENTE_FISCAL_SANDBOX,
        operationKey: comando.operationKey,
        id: profileId,
        expectedVersion: selectedProfile?.version ?? '0',
        ruc: profileForm.ruc.trim(),
        legalName: `SANDBOX ${profileForm.nombre.trim()}`,
        fiscalAddress: {
          line: profileForm.direccion.trim(), district: profileForm.distrito.trim(),
          province: profileForm.provincia.trim(), department: profileForm.departamento.trim(),
          ubigeo: profileForm.ubigeo.trim(), country: 'PE',
        },
        establishmentCode: profileForm.establecimiento.trim(),
        ruleSetHash: HASH_REGLAS_FISCALES,
        testOnly: true,
      })
      setProfileCommand(null)
      setProfileFormDirty(false)
      setSelectedProfileId(result.id)
      await queryClient.invalidateQueries({ queryKey: ['electronic-billing-configuration', organizationId, userId] })
    } catch (error) {
      setConfigurationError(mensajeSeguro(error))
    } finally {
      setPendingAction(null)
    }
  }

  const guardarSerie = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!permisoFiscalVigente || !puedeConfigurar || !selectedProfile || !config) return
    setConfigurationError(null)
    setPendingAction('series')
    const comando = seriesCommand ?? {
      operationKey: crearClaveOperacionFiscal(),
      id: editableSeries?.id ?? crypto.randomUUID(),
    }
    if (!seriesCommand) setSeriesCommand(comando)
    const seriesId = editableSeries?.id ?? comando.id
    try {
      const result = await configurarSerieSandbox({
        organizationId,
        environment: AMBIENTE_FISCAL_SANDBOX,
        operationKey: comando.operationKey,
        id: seriesId,
        expectedVersion: editableSeries?.version ?? '0',
        issuerProfileId: selectedProfile.id,
        documentType,
        series: seriesCode.trim().toUpperCase(),
        nextNumber,
        enabled: seriesEnabled,
      })
      setSeriesCommand(null)
      setSeriesFormDirty(false)
      setEditorSeriesId(result.id)
      setPreparationSeriesId(result.id)
      await queryClient.invalidateQueries({ queryKey: ['electronic-billing-configuration', organizationId, userId] })
    } catch (error) {
      setConfigurationError(mensajeSeguro(error))
    } finally {
      setPendingAction(null)
    }
  }

  const preparar = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!permisoFiscalVigente || !puedePreparar || !selectedSale || !selectedProfile || !selectedSeries || !config) return
    if (documentType === '01' && !fiscalAddressId) {
      setOperationError('Para una factura, el cliente debe tener una dirección fiscal activa con ubigeo.')
      return
    }
    setOperationError(null)
    setPendingAction('prepare')
    const operationKey = prepareOperationKey ?? crearClaveOperacionFiscal()
    if (!prepareOperationKey) setPrepareOperationKey(operationKey)
    const payment = paymentKind === 'contado'
      ? { kind: 'contado' as const }
      : { kind: 'credito' as const, outstanding, installments: [{ id: 'Cuota001', amount: outstanding, dueDate }] }
    try {
      const result = await prepararComprobanteSandbox({
        organizationId,
        environment: AMBIENTE_FISCAL_SANDBOX,
        operationKey,
        schemaVersion: 'CPE-PE-DOM-PEN-1',
        saleId: selectedSale.id,
        issuerProfileId: selectedProfile.id,
        expectedIssuerVersion: selectedProfile.version,
        seriesId: selectedSeries.id,
        expectedSeriesVersion: selectedSeries.version,
        issueDate,
        buyerFiscalAddressId: documentType === '01' ? fiscalAddressId : null,
        payment,
      })
      setPrepareOperationKey(null)
      onPrepared(result.documentId)
    } catch (error) {
      setOperationError(mensajeSeguro(error))
    } finally {
      setPendingAction(null)
    }
  }

  if (!permisoFiscalVigente || (!puedeConsultarConfiguracion && !puedePreparar)) return null

  return <section aria-labelledby="flujo-emision-sandbox" className="min-w-0 space-y-7 border-t pt-7">
    <header>
      <h2 id="flujo-emision-sandbox" className="text-2xl font-semibold">Preparar comprobante de prueba</h2>
      <p className="mt-2 max-w-[72ch] text-sm leading-6 text-muted-foreground">
        La configuración y los comandos se autorizan en PostgreSQL. Los importes, impuestos y snapshot los calcula el servidor al preparar.
      </p>
    </header>

    {puedeConsultarConfiguracion ? <section aria-labelledby="configuracion-fiscal" className="space-y-5 rounded-lg border p-4 sm:p-6">
      <h3 id="configuracion-fiscal" className="text-lg font-semibold">1. Perfil emisor y series sandbox</h3>
      {configQuery.isLoading ? <p role="status">Cargando configuración fiscal sandbox…</p>
        : configQuery.error ? <div role="alert" className="space-y-3">
          <p>{mensajeSeguro(configQuery.error)}</p>
          <Button type="button" variant="outline" onClick={() => void configQuery.refetch()}>Reintentar configuración</Button>
        </div> : null}

      {config && puedePreparar && !puedeConfigurar && profiles.length > 1 ? <div>
        <label className="field-label" htmlFor="perfil-emisor-para-preparar">Perfil emisor para preparar</label>
        <select id="perfil-emisor-para-preparar" className="field-control"
          value={selectedProfile?.id ?? profiles[0].id}
          onChange={(event) => {
            setSelectedProfileId(event.target.value)
            setProfileFormDirty(false)
            setPreparationSeriesId('')
            resetSeriesCommand()
            setPrepareOperationKey(null)
          }}>
          {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.legalName} · {profile.ruc}</option>)}
        </select>
      </div> : null}

      {config && puedeConfigurar ? <>
        <div className="grid gap-5 md:grid-cols-2">
          <form aria-label="Configuración de perfil emisor sandbox" onSubmit={guardarPerfil} className="space-y-4">
            <h4 className="font-medium">Perfil emisor de prueba</h4>
            {profiles.length > 0 ? <div>
              <label className="field-label" htmlFor="perfil-emisor-sandbox">Perfil guardado</label>
              <select id="perfil-emisor-sandbox" className="field-control" value={selectedProfileId || profiles[0]?.id || PERFIL_NUEVO}
                onChange={(event) => {
                  setSelectedProfileId(event.target.value)
                  setProfileFormDirty(false)
                  setSeriesFormDirty(false)
                  resetProfileCommand()
                  resetSeriesCommand()
                  setPrepareOperationKey(null)
                }}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.legalName} · {profile.ruc}</option>)}
                <option value={PERFIL_NUEVO}>Crear perfil ficticio</option>
              </select>
            </div> : null}
            {profiles.length > 0 && selectedProfileId === PERFIL_NUEVO ? <p className="text-sm text-muted-foreground">El RUC debe ser único para esta organización sandbox.</p> : null}
            <div>
              <label className="field-label" htmlFor="perfil-ruc">RUC de prueba</label>
              <input id="perfil-ruc" className="field-control" inputMode="numeric" pattern="(?:10|20)[0-9]{9}" maxLength={11}
                value={profileForm.ruc} disabled={Boolean(selectedProfile)} required
                onChange={(event) => actualizarPerfil('ruc', event.target.value)} />
              {selectedProfile ? <p className="field-help">La identidad del RUC queda inmutable al guardar.</p> : null}
            </div>
            <div>
              <label className="field-label" htmlFor="perfil-razon-social">Nombre ficticio del emisor</label>
              <input id="perfil-razon-social" className="field-control" minLength={3} maxLength={1492} value={profileForm.nombre} required
                onChange={(event) => actualizarPerfil('nombre', event.target.value)} />
              <p className="field-help">Se guardará con el prefijo SANDBOX para distinguirlo de un perfil real.</p>
            </div>
            <div>
              <label className="field-label" htmlFor="perfil-direccion">Domicilio fiscal ficticio</label>
              <input id="perfil-direccion" className="field-control" minLength={2} maxLength={240} value={profileForm.direccion} required
                onChange={(event) => actualizarPerfil('direccion', event.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ['distrito', 'Distrito'], ['provincia', 'Provincia'], ['departamento', 'Departamento'],
              ] as const).map(([field, label]) => <div key={field}>
                <label className="field-label" htmlFor={`perfil-${field}`}>{label}</label>
                <input id={`perfil-${field}`} className="field-control" minLength={2} maxLength={240} value={profileForm[field]} required
                  onChange={(event) => actualizarPerfil(field, event.target.value)} />
              </div>)}
              <div>
                <label className="field-label" htmlFor="perfil-ubigeo">Ubigeo</label>
                <input id="perfil-ubigeo" className="field-control" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={profileForm.ubigeo} required
                  onChange={(event) => actualizarPerfil('ubigeo', event.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="perfil-establecimiento">Código de establecimiento</label>
                <input id="perfil-establecimiento" className="field-control" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
                  value={profileForm.establecimiento} required onChange={(event) => actualizarPerfil('establecimiento', event.target.value)} />
              </div>
            </div>
            <Button type="submit" disabled={pendingAction !== null || configQuery.isFetching}>
              {pendingAction === 'profile' ? 'Guardando…' : selectedProfile ? 'Guardar cambios de perfil sandbox' : 'Guardar perfil sandbox'}
            </Button>
          </form>

          <form aria-label="Configuración de serie sandbox" onSubmit={guardarSerie} className="space-y-4">
            <h4 className="font-medium">Serie de prueba</h4>
            <div>
              <label className="field-label" htmlFor="tipo-documento-serie">Tipo de comprobante</label>
              <select id="tipo-documento-serie" className="field-control" value={documentType}
                onChange={(event) => { setDocumentType(event.target.value as '01' | '03'); setEditorSeriesId(''); setPreparationSeriesId(''); setSeriesFormDirty(false); resetSeriesCommand(); setPrepareOperationKey(null) }}>
                <option value="01">Factura (01)</option><option value="03">Boleta (03)</option>
              </select>
            </div>
            {seriesForType.length ? <div>
              <label className="field-label" htmlFor="serie-configurada">Serie existente</label>
              <select id="serie-configurada" className="field-control" value={editorSeriesId || seriesForType[0].id}
                onChange={(event) => { setEditorSeriesId(event.target.value); setSeriesFormDirty(false); resetSeriesCommand() }}>
                {seriesForType.map((series) => <option key={series.id} value={series.id}>{series.series} · siguiente {series.nextNumber}</option>)}
                <option value={SERIE_NUEVA}>Agregar otra serie de prueba</option>
              </select>
            </div> : null}
            <div>
              <label className="field-label" htmlFor="serie-codigo">Serie {documentType === '01' ? 'de factura' : 'de boleta'}</label>
              <input id="serie-codigo" className="field-control font-mono" pattern={documentType === '01' ? 'F[A-Z0-9]{3}' : 'B[A-Z0-9]{3}'}
                maxLength={4} value={seriesCode} disabled={Boolean(editableSeries)} required
                onChange={(event) => { setSeriesCode(event.target.value.toUpperCase()); setSeriesFormDirty(true); resetSeriesCommand() }} />
              <p className="field-help">La serie queda inmutable cuando se crea.</p>
            </div>
            <div>
              <label className="field-label" htmlFor="serie-correlativo">Siguiente correlativo de prueba</label>
              <input id="serie-correlativo" className="field-control" inputMode="numeric" pattern="[1-9][0-9]{0,7}"
                value={nextNumber} required onChange={(event) => { setNextNumber(event.target.value); setSeriesFormDirty(true); resetSeriesCommand() }} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={seriesEnabled} onChange={(event) => { setSeriesEnabled(event.target.checked); setSeriesFormDirty(true); resetSeriesCommand() }} />
              Serie habilitada para preparación sandbox
            </label>
            <Button type="submit" disabled={!selectedProfile || pendingAction !== null || configQuery.isFetching}>
              {pendingAction === 'series' ? 'Guardando…' : editableSeries ? 'Guardar cambios de serie sandbox' : 'Guardar serie sandbox'}
            </Button>
          </form>
        </div>
      </> : null}
      {configurationError ? <p role="alert" className="field-error">{configurationError}</p> : null}
      {!puedeConfigurar && puedePreparar ? <p className="text-sm text-muted-foreground">
        Configuración guardada para consulta. Para crear o editar el emisor y las series se requiere BILLING_CONFIGURE.
      </p> : null}
    </section> : null}

    {puedePreparar ? <form aria-label="Preparar comprobante fiscal sandbox" onSubmit={preparar} className="space-y-5 rounded-lg border p-4 sm:p-6">
      <h3 className="text-lg font-semibold">2. Selecciona la venta y prepara</h3>
      {!puedeVerVentas ? <p role="alert">Para seleccionar una venta necesitas el permiso independiente SALES_VIEW. No se concede automáticamente desde Facturación.</p>
        : salesQuery.isLoading ? <p role="status">Cargando ventas de la organización…</p>
          : salesQuery.error ? <div role="alert" className="space-y-3">
            <p>No se pudo cargar el listado de ventas.</p>
            <Button type="button" variant="outline" onClick={() => void salesQuery.refetch()}>Reintentar ventas</Button>
          </div> : <>
            <div>
              <label className="field-label" htmlFor="venta-fiscal">Venta existente</label>
              <select id="venta-fiscal" className="field-control" value={saleId} required
                onChange={(event) => { setSaleId(event.target.value); setOutstandingDirty(false); setPrepareOperationKey(null); setOperationError(null) }}>
                <option value="">Selecciona una venta</option>
                {ventas.map((sale) => <option key={sale.id} value={sale.id}>
                  {sale.numeroInterno} · {sale.clienteNombre} · {sale.fechaVenta} · S/ {sale.total.toFixed(2)}
                </option>)}
              </select>
              <p className="field-help">PostgreSQL vuelve a comprobar que la venta y sus líneas se puedan facturar.</p>
            </div>
            {selectedSale ? <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="font-medium">Venta {selectedSale.numeroInterno} · {selectedSale.clienteNombre}</p>
              <p className="mt-1">Documento del cliente: {selectedSale.clienteDocumento} · Total comercial de referencia: S/ {selectedSale.total.toFixed(2)}</p>
              {customerQuery.isLoading ? <p role="status" className="mt-1">Consultando dirección fiscal del cliente…</p>
                : customerQuery.error ? <p role="alert" className="mt-1">No se pudieron consultar los datos fiscales del cliente.</p>
                  : fiscalAddressId ? <p className="mt-1">Dirección fiscal activa disponible para factura.</p>
                    : <p className="mt-1">Sin dirección fiscal activa; las facturas requieren una dirección del cliente con ubigeo.</p>}
            </div> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="tipo-comprobante-fiscal">Tipo de comprobante</label>
                <select id="tipo-comprobante-fiscal" className="field-control" value={documentType}
                  onChange={(event) => { setDocumentType(event.target.value as '01' | '03'); setSeriesFormDirty(false); setPreparationSeriesId(''); setPrepareOperationKey(null) }}>
                  <option value="01">Factura (01)</option><option value="03">Boleta (03)</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="serie-fiscal">Serie habilitada</label>
                <select id="serie-fiscal" className="field-control" value={selectedSeries?.id ?? ''}
                  onChange={(event) => { setPreparationSeriesId(event.target.value); setPrepareOperationKey(null) }} required disabled={!activeSeries.length}>
                  <option value="">Selecciona una serie activa</option>
                  {activeSeries.map((series) => <option key={series.id} value={series.id}>{series.series} · siguiente {series.nextNumber}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="fecha-fiscal">Fecha declarada</label>
                <input id="fecha-fiscal" type="date" className="field-control" value={issueDate} required
                  onChange={(event) => { setIssueDate(event.target.value); setPrepareOperationKey(null) }} />
              </div>
              <div>
                <label className="field-label" htmlFor="forma-pago-fiscal">Forma de pago</label>
                <select id="forma-pago-fiscal" className="field-control" value={paymentKind}
                  onChange={(event) => { setPaymentKind(event.target.value as 'contado' | 'credito'); setPrepareOperationKey(null) }}>
                  <option value="contado">Contado</option><option value="credito">Crédito · una cuota inicial</option>
                </select>
              </div>
              {paymentKind === 'credito' ? <>
                <div>
                  <label className="field-label" htmlFor="saldo-credito">Importe pendiente (PEN)</label>
                  <input id="saldo-credito" className="field-control" inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,11})\.[0-9]{2}"
                    value={outstanding} required onChange={(event) => { setOutstanding(event.target.value); setOutstandingDirty(true); setPrepareOperationKey(null) }} />
                </div>
                <div>
                  <label className="field-label" htmlFor="vencimiento-cuota">Vencimiento de Cuota001</label>
                  <input id="vencimiento-cuota" type="date" className="field-control" value={dueDate} required
                    onChange={(event) => { setDueDate(event.target.value); setPrepareOperationKey(null) }} />
                </div>
              </> : null}
            </div>
            {operationError ? <p role="alert" className="field-error">{operationError}</p> : null}
            <Button type="submit" disabled={pendingAction !== null || configQuery.isLoading || salesQuery.isLoading
              || customerQuery.isLoading || !selectedProfile || !selectedSeries || !selectedSale}>
              {pendingAction === 'prepare' ? 'Preparando…' : 'Preparar factura o boleta sandbox'}
            </Button>
          </>}
    </form> : null}
    {puedePreparar && puedeVerVentas && (configQuery.error || !selectedProfile || !selectedSeries)
      ? <p className="text-sm text-muted-foreground">Para preparar, configura un perfil emisor y una serie activa del tipo seleccionado. Las reglas fiscales se validan nuevamente en PostgreSQL.</p>
      : null}
  </section>
}
