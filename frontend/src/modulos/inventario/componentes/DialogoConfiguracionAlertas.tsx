import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { inventoryQueryKeys } from '../estado/inventoryQueryKeys'
import { esquemaConfiguracionAlertasStock, type Almacen, type UbicacionAlmacen } from '../modelo/almacen'
import type { ProductoInventarioOpcion } from '../modelo/productoInventarioRead'
import { obtenerConfiguracionAlertasStock } from '../servicios/almacenService'
import { SelectorProductoInventario } from './SelectorProductoInventario'

interface ConfiguracionAlertas {
  productoId: string
  almacenId: string
  ubicacionId: string
  stockMinimo: number
  diasVencimiento: number
}

interface Props {
  organizationId: string
  almacenes: readonly Almacen[]
  ubicaciones: readonly UbicacionAlmacen[]
  abierto: boolean
  alCambiarAbierto: (abierto: boolean) => void
  alRestaurarFoco?: () => void
  configurar: (datos: ConfiguracionAlertas) => Promise<string | undefined>
}

/** Cada apertura inicia una edición independiente; los refrescos no pisan el borrador. */
export function DialogoConfiguracionAlertas(props: Props) {
  return (
    <DialogPrimitive.Root open={props.abierto} onOpenChange={props.alCambiarAbierto}>
      {props.abierto ? <ContenidoConfiguracion {...props} /> : null}
    </DialogPrimitive.Root>
  )
}

function ContenidoConfiguracion({
  organizationId, almacenes, ubicaciones, alCambiarAbierto, alRestaurarFoco, configurar,
}: Props) {
  const [producto, setProducto] = useState<ProductoInventarioOpcion | null>(null)
  const [productoId, setProductoId] = useState('')
  const [almacenId, setAlmacenId] = useState('')
  const [ubicacionId, setUbicacionId] = useState('')
  const [stockMinimo, setStockMinimo] = useState('0')
  const [diasVencimiento, setDiasVencimiento] = useState('30')
  const [identidadCargada, setIdentidadCargada] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorGuardado, setErrorGuardado] = useState('')
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)
  const identidadHidratada = useRef('')
  const identidad = JSON.stringify([organizationId, productoId, almacenId])
  const almacenesActivos = useMemo(() => almacenes.filter((item) => item.activo), [almacenes])
  const ubicacionesActivas = useMemo(() => ubicaciones.filter(
    (item) => item.activa && item.almacenId === almacenId,
  ), [almacenId, ubicaciones])
  const consulta = useQuery({
    queryKey: inventoryQueryKeys.stockPolicy(organizationId, productoId, almacenId),
    queryFn: () => obtenerConfiguracionAlertasStock(organizationId, productoId, almacenId),
    enabled: Boolean(organizationId && productoId && almacenId),
  })

  useEffect(() => {
    if (!productoId || !almacenId || !consulta.isSuccess || consulta.isFetching
      || identidadHidratada.current === identidad) return
    const guardada = consulta.data
    const ubicacion = ubicacionesActivas.find((item) => item.id === guardada?.ubicacionId)
    setUbicacionId(ubicacion?.id ?? ubicacionesActivas[0]?.id ?? '')
    setStockMinimo(String(guardada?.stockMinimo ?? 0))
    setDiasVencimiento(String(guardada?.diasVencimiento ?? 30))
    identidadHidratada.current = identidad
    setIdentidadCargada(identidad)
  }, [almacenId, consulta.data, consulta.isFetching, consulta.isSuccess, identidad, productoId, ubicacionesActivas])

  const reiniciarConsulta = () => {
    identidadHidratada.current = ''
    setIdentidadCargada('')
    setUbicacionId('')
    setStockMinimo('0')
    setDiasVencimiento('30')
    setErrores({})
    setErrorGuardado('')
  }
  const almacenValido = almacenesActivos.some((item) => item.id === almacenId)
  const ubicacionValida = ubicacionesActivas.some((item) => item.id === ubicacionId)
  const cargada = identidadCargada === identidad && consulta.isSuccess && !consulta.isError
  const puedeGuardar = cargada && almacenValido && ubicacionValida && !consulta.isFetching && !guardando
  const unidad = producto?.unidadMedida || 'unidad base'

  const guardar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    if (!puedeGuardar || enCurso.current) return
    const resultado = esquemaConfiguracionAlertasStock.safeParse({
      productoId, almacenId, ubicacionId, stockMinimo, diasVencimiento,
    })
    if (!resultado.success) {
      const siguientes: Record<string, string> = {}
      for (const error of resultado.error.issues) {
        const campo = String(error.path[0])
        siguientes[campo] ??= error.message
      }
      setErrores(siguientes)
      return
    }
    enCurso.current = true
    setGuardando(true)
    setErrores({})
    setErrorGuardado('')
    try {
      const error = await configurar({
        ...resultado.data,
        stockMinimo: Number(resultado.data.stockMinimo),
        diasVencimiento: Number(resultado.data.diasVencimiento),
      })
      if (error) setErrorGuardado(error)
      else alCambiarAbierto(false)
    } catch {
      setErrorGuardado('No se pudo guardar la configuración. Tus cambios se conservan; vuelve a intentarlo.')
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className="fixed start-1/2 top-1/2 z-50 flex max-h-[92svh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border bg-background shadow-xl outline-none"
        onEscapeKeyDown={(evento) => { if (guardando) evento.preventDefault() }}
        onPointerDownOutside={(evento) => { if (guardando) evento.preventDefault() }}
        onCloseAutoFocus={(evento) => {
          if (alRestaurarFoco) {
            evento.preventDefault()
            alRestaurarFoco()
          }
        }}
      >
        <header className="flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
          <div>
            <DialogPrimitive.Title className="text-xl font-semibold tracking-[-0.025em]">Configurar alertas</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
              Define cuándo avisar por stock bajo y vencimientos para un producto y almacén.
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close asChild>
            <button type="button" disabled={guardando} aria-label="Cerrar configuración de alertas" className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              <X aria-hidden="true" className="size-5" />
            </button>
          </DialogPrimitive.Close>
        </header>
        <form id="formulario-configuracion-alertas" noValidate onSubmit={(evento) => { void guardar(evento) }} className="overflow-y-auto px-5 py-6 sm:px-7">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <SelectorProductoInventario id="alertas-producto" name="productoId" etiqueta="Producto" organizationId={organizationId} value={productoId} selectedOption={producto} autoSeleccionarPrimeraOpcion={false} deshabilitado={guardando} error={errores.productoId}
                onValueChange={(id, opcion) => { reiniciarConsulta(); setProductoId(id); setProducto(opcion ?? null) }} />
            </div>
            <div className="sm:col-span-2">
              <Combobox id="alertas-almacen" label="Almacén" value={almacenId} options={almacenesActivos.map((item) => ({ value: item.id, label: `${item.codigo} · ${item.nombre}` }))} required disabled={guardando || !almacenesActivos.length} placeholder="Buscar por código o nombre" noOptionsMessage="No hay almacenes activos." error={errores.almacenId}
                onChange={(id) => { reiniciarConsulta(); setAlmacenId(id) }} />
              {!almacenesActivos.length ? <p className="field-help">Registra o activa un almacén antes de configurar alertas.</p> : null}
            </div>
            {productoId && almacenId && consulta.isFetching ? <p role="status" className="field-help sm:col-span-2">Cargando configuración…</p> : null}
            {consulta.isError ? (
              <div className="space-y-2 sm:col-span-2">
                <p role="alert" className="field-error">No se pudo consultar la configuración guardada. Reintenta antes de cambiarla.</p>
                <Button type="button" variant="outline" disabled={consulta.isFetching} onClick={() => { void consulta.refetch() }}>Reintentar</Button>
              </div>
            ) : null}
            {cargada ? <p role="status" className="field-help sm:col-span-2">{consulta.data ? 'Se cargó la configuración guardada de este producto y almacén.' : 'Aún no hay configuración guardada. Puedes definir el mínimo y el aviso de vencimiento.'}</p> : null}
            <div>
              <label className="field-label" htmlFor="alertas-stock-minimo">Stock mínimo ({unidad}) *</label>
              <input id="alertas-stock-minimo" type="number" min="0" max="99999999999.999" step="0.001" value={stockMinimo} onChange={(evento) => setStockMinimo(evento.target.value)} disabled={!cargada || guardando} className="field-control" required aria-invalid={Boolean(errores.stockMinimo)} aria-describedby="alertas-stock-ayuda alertas-stock-error" />
              <p id="alertas-stock-ayuda" className="field-help">Se compara con el stock asignable de todo el almacén, en {unidad}. Con 0, avisa al agotarse.</p>
              <p id="alertas-stock-error" className="field-error">{errores.stockMinimo}</p>
            </div>
            <div>
              <label className="field-label" htmlFor="alertas-dias">Avisar antes del vencimiento (días) *</label>
              <input id="alertas-dias" type="number" min="0" max="3650" step="1" value={diasVencimiento} onChange={(evento) => setDiasVencimiento(evento.target.value)} disabled={!cargada || guardando} className="field-control" required aria-invalid={Boolean(errores.diasVencimiento)} aria-describedby="alertas-dias-ayuda alertas-dias-error" />
              <p id="alertas-dias-ayuda" className="field-help">Con 0, avisa solo de lotes vencidos o que vencen hoy. Sin configuración, se usan 30 días.</p>
              <p id="alertas-dias-error" className="field-error">{errores.diasVencimiento}</p>
            </div>
            <div className="sm:col-span-2">
              <Combobox id="alertas-ubicacion" label="Ubicación predeterminada" value={ubicacionId} options={ubicacionesActivas.map((item) => ({ value: item.id, label: `${item.codigo} · ${item.nombre}` }))} required disabled={!cargada || guardando || !ubicacionesActivas.length} onChange={setUbicacionId} error={errores.ubicacionId} noOptionsMessage="No hay ubicaciones activas en este almacén." helperText="Se sugiere en operaciones que usan una ubicación predeterminada. No limita las alertas: se considera todo el almacén." />
              {almacenId && !ubicacionesActivas.length ? <p className="field-help">Registra o activa una ubicación en este almacén para guardar la configuración.</p> : null}
            </div>
          </div>
          {errorGuardado ? <p role="alert" className="field-error mt-5">{errorGuardado}</p> : null}
        </form>
        <footer className="flex flex-col-reverse gap-3 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
          <DialogPrimitive.Close asChild><Button type="button" variant="outline" disabled={guardando}>Cancelar</Button></DialogPrimitive.Close>
          <Button type="submit" form="formulario-configuracion-alertas" disabled={!puedeGuardar}>{guardando ? 'Guardando…' : 'Guardar configuración'}</Button>
        </footer>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
