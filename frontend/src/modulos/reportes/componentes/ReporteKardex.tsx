import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import { EstadoListadoInventario } from '@/modulos/inventario/componentes/EstadoListadoInventario'
import { SelectorProductoInventario } from '@/modulos/inventario/componentes/SelectorProductoInventario'
import { etiquetasEstadoStock, type Almacen } from '@/modulos/inventario/modelo/almacen'
import type { ProductoInventarioOpcion } from '@/modulos/inventario/modelo/productoInventarioRead'
import { crearPeriodoUltimos30Dias } from '@/modulos/reportes/modelo/reporteMovimientos'
import {
  MAXIMO_FILAS_EXPORTACION_KARDEX,
  type ConsultaKardexReporte,
  type MovimientoKardexReporte,
} from '@/modulos/reportes/modelo/reporteKardex'
import { useReporteKardex } from '@/modulos/reportes/estado/useReporteKardex'
import { listarKardexReporte } from '@/modulos/reportes/servicios/kardexReporteService'

interface Props {
  organizationId: string
  almacenes: Almacen[]
}

const formatoCantidad = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 })

function fechaCalendario(valor: string) {
  const partes = valor.slice(0, 10).split('-')
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : valor
}

function etiquetaTipoMovimiento(tipo: MovimientoKardexReporte['tipo']) {
  switch (tipo) {
    case 'entrada': return 'Entrada'
    case 'salida': return 'Salida'
    case 'ajuste-positivo': return 'Ajuste positivo'
    case 'ajuste-negativo': return 'Ajuste negativo'
  }
}

function etiquetaOrigen(movimiento: MovimientoKardexReporte) {
  if (movimiento.documentoReferencia) return movimiento.documentoReferencia
  const etiquetas: Record<string, string> = {
    manual: 'Movimiento manual',
    'purchase-receipt': 'Recepción de compra',
    'warehouse-transfer': 'Transferencia de almacén',
    'stock-reclassification': 'Reclasificación de stock',
    'supplier-return': 'Devolución a proveedor',
    'repair-consumption': 'Consumo de reparación',
  }
  return etiquetas[movimiento.tipoOrigen] ?? 'Sin referencia registrada'
}

export function ReporteKardex({ organizationId, almacenes }: Props) {
  const { hasPermission } = useAuth()
  const puedeExportar = hasPermission(PERMISSIONS.INVENTORY_EXPORT)
  const [consulta, setConsulta] = useState<ConsultaKardexReporte>(() => ({
    pagina: 1,
    ...crearPeriodoUltimos30Dias(),
    productoId: '',
    almacenId: '',
    lote: '',
  }))
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoInventarioOpcion | null>(null)
  const [exportando, setExportando] = useState(false)
  const [mensajeExportacion, setMensajeExportacion] = useState('')
  const [errorExportacion, setErrorExportacion] = useState('')
  const rangoInvalido = Boolean(consulta.fechaDesde && consulta.fechaHasta && consulta.fechaDesde > consulta.fechaHasta)
  const periodoCompleto = Boolean(consulta.fechaDesde && consulta.fechaHasta)
  const kardex = useReporteKardex(organizationId, consulta, periodoCompleto && !rangoInvalido)
  const elementos = kardex.data?.elementos ?? []

  const cambiarFiltro = (cambios: Partial<ConsultaKardexReporte>) => {
    setConsulta((actual) => ({ ...actual, ...cambios, pagina: 1 }))
    setMensajeExportacion('')
    setErrorExportacion('')
  }

  const exportar = async () => {
    if (!puedeExportar || !consulta.productoId || rangoInvalido || !periodoCompleto || exportando) return
    setExportando(true)
    setMensajeExportacion('')
    setErrorExportacion('')
    try {
      const resultado = await listarKardexReporte(organizationId, consulta, true)
      const productoCodigo = productoSeleccionado?.codigo ?? elementos[0]?.productoCodigo ?? 'producto'
      const productoDescripcion = productoSeleccionado?.descripcion ?? elementos[0]?.productoDescripcion ?? ''
      const almacen = almacenes.find((opcion) => opcion.id === consulta.almacenId)?.nombre ?? ''
      const { descargarKardex } = await import('@/modulos/reportes/servicios/exportarKardex')
      descargarKardex(resultado.elementos, {
        productoCodigo,
        productoDescripcion,
        almacen,
        lote: consulta.lote.trim(),
        fechaDesde: consulta.fechaDesde,
        fechaHasta: consulta.fechaHasta,
      })
      setMensajeExportacion(`${resultado.total} movimientos exportados en Excel.`)
    } catch (error) {
      setErrorExportacion(error instanceof Error ? error.message : 'No se pudo exportar el Kardex.')
    } finally {
      setExportando(false)
    }
  }

  return (
    <section aria-labelledby="reporte-kardex-titulo" className="ledger-sheet">
      <div className="grid gap-4 border-b px-5 py-5 sm:px-6 xl:grid-cols-[minmax(16rem,1fr)_14rem_12rem_12rem] xl:items-end">
        <div>
          <h2 id="reporte-kardex-titulo" className="text-lg font-semibold">Kardex detallado</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {kardex.data
              ? `${kardex.data.total} movimientos · saldo independiente por almacén, ubicación, condición y lote.`
              : 'Consulta el historial físico con saldos acumulados y trazabilidad.'}
          </p>
        </div>
        <label className="field-label">
          Desde
          <input type="date" value={consulta.fechaDesde} onChange={(evento) => cambiarFiltro({ fechaDesde: evento.target.value })} className="field-control" />
        </label>
        <label className="field-label">
          Hasta
          <input type="date" value={consulta.fechaHasta} onChange={(evento) => cambiarFiltro({ fechaHasta: evento.target.value })} className="field-control" />
        </label>
        <label className="field-label">
          Almacén
          <select value={consulta.almacenId} onChange={(evento) => cambiarFiltro({ almacenId: evento.target.value })} className="field-control">
            <option value="">Todos</option>
            {almacenes.map((almacen) => <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-4 border-b bg-muted/20 px-5 py-4 sm:px-6 md:grid-cols-2">
        <SelectorProductoInventario
          id="reporte-kardex-producto"
          name="productoId"
          etiqueta="Producto"
          organizationId={organizationId}
          requerido={false}
          autoSeleccionarPrimeraOpcion={false}
          value={consulta.productoId}
          selectedOption={productoSeleccionado}
          onValueChange={(productoId, producto) => {
            setProductoSeleccionado(producto ?? null)
            cambiarFiltro({ productoId })
          }}
        />
        <label className="field-label">
          Lote (opcional)
          <input
            type="search"
            value={consulta.lote}
            onChange={(evento) => cambiarFiltro({ lote: evento.target.value })}
            className="field-control"
            maxLength={60}
            placeholder="Buscar por número de lote"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 sm:px-6">
        <p className="text-sm text-muted-foreground">
          El saldo anterior y posterior se calcula por producto, almacén, ubicación, condición y lote. El reporte no muestra costos.
        </p>
        {puedeExportar ? (
          <Button
            type="button"
            variant="outline"
            disabled={!consulta.productoId || !periodoCompleto || rangoInvalido || !kardex.data?.total || kardex.data.total > MAXIMO_FILAS_EXPORTACION_KARDEX || exportando}
            onClick={() => void exportar()}
          >
            <Download aria-hidden="true" />
            {exportando ? 'Preparando…' : 'Exportar Excel'}
          </Button>
        ) : null}
      </div>

      {rangoInvalido ? (
        <p role="alert" className="px-5 py-8 text-sm text-destructive sm:px-6">La fecha inicial no puede ser posterior a la fecha final.</p>
      ) : !periodoCompleto ? (
        <p role="status" className="px-5 py-8 text-sm text-muted-foreground sm:px-6">Selecciona ambas fechas para consultar el periodo.</p>
      ) : !consulta.productoId ? (
        <p role="status" className="px-5 py-8 text-sm text-muted-foreground sm:px-6">Selecciona un producto para consultar su Kardex detallado.</p>
      ) : (
        <EstadoListadoInventario
          cargando={kardex.isLoading}
          error={kardex.error}
          vacio={!elementos.length}
          mensajeVacio="No hay movimientos para el producto y los filtros seleccionados."
          alReintentar={() => void kardex.refetch()}
        >
          <div aria-busy={kardex.isFetching || exportando} className={kardex.isFetching ? 'opacity-70' : undefined}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[92rem] text-left text-sm">
                <caption className="sr-only">Kardex detallado con cantidades de entrada, salida, saldos acumulados y trazabilidad</caption>
                <thead>
                  <tr className="border-b bg-muted/45 font-mono text-[0.68rem] uppercase tracking-[0.06em] text-muted-foreground">
                    <th scope="col" className="px-5 py-3">Fecha / movimiento</th>
                    <th scope="col" className="px-4 py-3">Almacén / ubicación</th>
                    <th scope="col" className="px-4 py-3">Lote / condición</th>
                    <th scope="col" className="px-4 py-3">Documento / motivo</th>
                    <th scope="col" className="px-4 py-3 text-end">Entrada</th>
                    <th scope="col" className="px-4 py-3 text-end">Salida</th>
                    <th scope="col" className="px-4 py-3 text-end">Saldo anterior</th>
                    <th scope="col" className="px-4 py-3 text-end">Saldo posterior</th>
                    <th scope="col" className="px-5 py-3">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {elementos.map((movimiento) => (
                    <tr key={movimiento.id}>
                      <th scope="row" className="px-5 py-4 font-normal">
                        <span className="font-mono text-xs">{fechaCalendario(movimiento.fechaOperacion)}</span>
                        <p className="mt-1 font-medium">{etiquetaTipoMovimiento(movimiento.tipo)}</p>
                        <p className="text-xs text-muted-foreground">Registro: {new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(movimiento.fechaRegistro))}</p>
                      </th>
                      <td className="px-4 py-4">{movimiento.almacen}<p className="text-xs text-muted-foreground">{movimiento.ubicacionCodigo} · {movimiento.ubicacionNombre}</p></td>
                      <td className="px-4 py-4">{movimiento.lote || 'Sin lote'}<p className="text-xs text-muted-foreground">{movimiento.fechaVencimiento ? `Vence ${fechaCalendario(movimiento.fechaVencimiento)}` : 'Sin vencimiento'} · {etiquetasEstadoStock[movimiento.estado]}</p></td>
                      <td className="px-4 py-4"><span className="font-mono text-xs">{etiquetaOrigen(movimiento)}</span><p className="mt-1 text-xs text-muted-foreground">{movimiento.motivo}</p></td>
                      <td className="px-4 py-4 text-end font-mono tabular-nums">{movimiento.entrada ? formatoCantidad.format(movimiento.entrada) : '—'} <span className="text-xs text-muted-foreground">{movimiento.unidadMedida}</span></td>
                      <td className="px-4 py-4 text-end font-mono tabular-nums">{movimiento.salida ? formatoCantidad.format(movimiento.salida) : '—'} <span className="text-xs text-muted-foreground">{movimiento.unidadMedida}</span></td>
                      <td className="px-4 py-4 text-end font-mono tabular-nums">{formatoCantidad.format(movimiento.saldoAnterior)}</td>
                      <td className="px-4 py-4 text-end font-mono font-semibold tabular-nums">{formatoCantidad.format(movimiento.saldoPosterior)} <span className="text-xs font-normal text-muted-foreground">{movimiento.unidadMedida}</span></td>
                      <td className="px-5 py-4">{movimiento.responsable}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {kardex.data ? (
              <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-sm text-muted-foreground">
                  {kardex.isFetching ? 'Actualizando… ' : ''}
                  Mostrando {elementos.length ? (consulta.pagina - 1) * kardex.data.tamanioPagina + 1 : 0}–{(consulta.pagina - 1) * kardex.data.tamanioPagina + elementos.length} de {kardex.data.total} movimientos
                  {puedeExportar && kardex.data.total > MAXIMO_FILAS_EXPORTACION_KARDEX ? ' · Reduce el filtro para exportar (máximo 10 000).' : ''}
                </p>
                <nav aria-label="Paginación del Kardex detallado" className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" aria-label="Página anterior del Kardex" disabled={kardex.isFetching || consulta.pagina <= 1} onClick={() => setConsulta((actual) => ({ ...actual, pagina: actual.pagina - 1 }))}><ChevronLeft aria-hidden="true" /></Button>
                  <span className="min-w-24 text-center font-mono text-xs tabular-nums text-muted-foreground">PÁGINA {consulta.pagina} / {kardex.data.totalPaginas}</span>
                  <Button type="button" variant="outline" size="icon" aria-label="Página siguiente del Kardex" disabled={kardex.isFetching || consulta.pagina >= kardex.data.totalPaginas} onClick={() => setConsulta((actual) => ({ ...actual, pagina: actual.pagina + 1 }))}><ChevronRight aria-hidden="true" /></Button>
                </nav>
              </div>
            ) : null}
          </div>
        </EstadoListadoInventario>
      )}
      {mensajeExportacion ? <p role="status" aria-live="polite" className="border-t px-5 py-3 text-sm text-primary sm:px-6">{mensajeExportacion}</p> : null}
      {errorExportacion ? <p role="alert" className="border-t px-5 py-3 text-sm text-destructive sm:px-6">{errorExportacion}</p> : null}
    </section>
  )
}
