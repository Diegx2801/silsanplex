import { useState } from 'react'
import { Tabs } from 'radix-ui'

import { useAuth } from '@/features/auth/useAuth'
import { useAlmacenes } from '@/modulos/inventario/estado/useAlmacenes'
import type { ProductoInventarioOpcion } from '@/modulos/inventario/modelo/productoInventarioRead'
import { obtenerOpcionProductoInventarioPorId } from '@/modulos/inventario/servicios/productoInventarioReadService'
import { fechaActualPeru, fechaPeruEnDias } from '@/lib/fechas'
import { ReporteKardex } from '@/modulos/reportes/componentes/ReporteKardex'
import { ReporteResumenMovimientos } from '@/modulos/reportes/componentes/ReporteResumenMovimientos'
import type { ResumenMovimientoInventario } from '@/modulos/reportes/modelo/reporteMovimientos'

type PeriodoRapido = '7d' | '30d' | 'mes' | 'personalizado'
type PestanaReportes = 'resumen' | 'kardex'

function crearRangoPeriodo(periodo: Exclude<PeriodoRapido, 'personalizado'>) {
  const hasta = fechaActualPeru()
  if (periodo === '7d') return { fechaDesde: fechaPeruEnDias(-6), fechaHasta: hasta }
  if (periodo === 'mes') return { fechaDesde: `${hasta.slice(0, 7)}-01`, fechaHasta: hasta }
  return { fechaDesde: fechaPeruEnDias(-29), fechaHasta: hasta }
}

function mostrarFecha(fecha: string) {
  return fecha ? fecha.split('-').reverse().join('/') : '—'
}

export function ReportesPage() {
  const { access } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const gestion = useAlmacenes()
  const [pestana, setPestana] = useState<PestanaReportes>('resumen')
  const [periodo, setPeriodo] = useState<PeriodoRapido>('30d')
  const [rango, setRango] = useState(() => crearRangoPeriodo('30d'))
  const [almacenId, setAlmacenId] = useState('')
  const [paginaResumen, setPaginaResumen] = useState(1)
  const [paginaKardex, setPaginaKardex] = useState(1)
  const [productoInicialKardex, setProductoInicialKardex] = useState<ProductoInventarioOpcion | null>(null)
  const [productoCargandoId, setProductoCargandoId] = useState<string | null>(null)
  const [errorProducto, setErrorProducto] = useState('')

  const periodoCompleto = Boolean(rango.fechaDesde && rango.fechaHasta)
  const rangoInvalido = periodoCompleto && rango.fechaDesde > rango.fechaHasta
  const rangoHabilitado = periodoCompleto && !rangoInvalido

  const reiniciarPaginas = () => {
    setPaginaResumen(1)
    setPaginaKardex(1)
  }

  const cambiarPeriodo = (nuevoPeriodo: PeriodoRapido) => {
    setPeriodo(nuevoPeriodo)
    if (nuevoPeriodo !== 'personalizado') setRango(crearRangoPeriodo(nuevoPeriodo))
    reiniciarPaginas()
  }

  const cambiarFecha = (campo: 'fechaDesde' | 'fechaHasta', valor: string) => {
    setPeriodo('personalizado')
    setRango((actual) => ({ ...actual, [campo]: valor }))
    reiniciarPaginas()
  }

  const abrirKardex = async (fila: ResumenMovimientoInventario) => {
    if (!organizationId || productoCargandoId) return
    setProductoCargandoId(fila.productoId)
    setErrorProducto('')
    try {
      const producto = await obtenerOpcionProductoInventarioPorId(organizationId, fila.productoId)
      if (!producto) {
        setErrorProducto('El producto ya no está disponible para consultar su Kardex.')
        return
      }
      setProductoInicialKardex(producto)
      setAlmacenId(fila.almacenId ?? '')
      reiniciarPaginas()
      setPestana('kardex')
    } catch {
      setErrorProducto('No se pudo preparar el producto. Inténtalo nuevamente.')
    } finally {
      setProductoCargandoId(null)
    }
  }

  return (
    <div className="space-y-6">
      <header className="border-b pb-6">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Reportes</h1>
        <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">
          Revisa los cambios del inventario y abre el Kardex detallado cuando necesites rastrear un producto.
        </p>
      </header>

      {gestion.error ? (
        <p role="status" className="text-sm text-muted-foreground">
          No se pudo cargar el catálogo de almacenes; los reportes siguen disponibles sin ese filtro.
        </p>
      ) : null}

      <section aria-label="Filtros comunes de reportes" className="ledger-sheet space-y-4 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-1 border-b pb-4 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="text-sm font-medium">Periodo del reporte</p>
          <p className="text-sm text-muted-foreground">
            {mostrarFecha(rango.fechaDesde)} – {mostrarFecha(rango.fechaHasta)}
          </p>
        </div>
        <div className="grid items-end gap-4 sm:grid-cols-2">
          <label className="field-label">
            Periodo rápido
            <select value={periodo} onChange={(evento) => cambiarPeriodo(evento.target.value as PeriodoRapido)} className="field-control">
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
              <option value="mes">Este mes</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </label>
          <label className="field-label">
            Almacén
            <select value={almacenId} onChange={(evento) => { setAlmacenId(evento.target.value); reiniciarPaginas() }} className="field-control">
              <option value="">Todos los almacenes</option>
              {gestion.almacenes.map((almacen) => <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>)}
            </select>
          </label>
        </div>
        {periodo === 'personalizado' ? <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <label className="field-label">
            Desde
            <input type="date" value={rango.fechaDesde} onChange={(evento) => cambiarFecha('fechaDesde', evento.target.value)} className="field-control" />
          </label>
          <label className="field-label">
            Hasta
            <input type="date" value={rango.fechaHasta} onChange={(evento) => cambiarFecha('fechaHasta', evento.target.value)} className="field-control" />
          </label>
        </div> : null}
      </section>

      {rangoInvalido ? <p role="alert" className="text-sm text-destructive">La fecha inicial no puede ser posterior a la fecha final.</p> : !periodoCompleto ? <p role="status" className="text-sm text-muted-foreground">Selecciona ambas fechas para consultar los reportes.</p> : null}
      {errorProducto ? <p role="alert" className="text-sm text-destructive">{errorProducto}</p> : null}

      <Tabs.Root value={pestana} onValueChange={(valor) => {
        if (valor === 'resumen' || valor === 'kardex') setPestana(valor)
      }}>
        <Tabs.List aria-label="Tipo de reporte" className="flex gap-6 border-b">
          <Tabs.Trigger value="resumen" className="border-b-2 border-transparent px-1 py-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-primary">
            Resumen de movimientos
          </Tabs.Trigger>
          <Tabs.Trigger value="kardex" className="border-b-2 border-transparent px-1 py-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-primary">
            Kardex por producto
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="resumen" forceMount hidden={pestana !== 'resumen'} className="mt-5 outline-none">
          <ReporteResumenMovimientos
            organizationId={organizationId}
            almacenes={gestion.almacenes}
            usarFiltrosCompartidos
            fechaDesde={rango.fechaDesde}
            fechaHasta={rango.fechaHasta}
            almacenId={almacenId}
            pagina={paginaResumen}
            habilitado={pestana === 'resumen' && rangoHabilitado}
            alCambiarPagina={setPaginaResumen}
            alVerKardex={(fila) => void abrirKardex(fila)}
            productoKardexCargandoId={productoCargandoId}
          />
        </Tabs.Content>

        <Tabs.Content value="kardex" forceMount hidden={pestana !== 'kardex'} className="mt-5 outline-none">
          <ReporteKardex
            organizationId={organizationId}
            almacenes={gestion.almacenes}
            usarFiltrosCompartidos
            fechaDesde={rango.fechaDesde}
            fechaHasta={rango.fechaHasta}
            almacenId={almacenId}
            pagina={paginaKardex}
            habilitado={pestana === 'kardex' && rangoHabilitado}
            alCambiarPagina={setPaginaKardex}
            productoInicial={productoInicialKardex}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
