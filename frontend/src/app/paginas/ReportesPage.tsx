import { useAuth } from '@/features/auth/useAuth'
import { EstadoListadoInventario } from '@/modulos/inventario/componentes/EstadoListadoInventario'
import { useAlmacenes } from '@/modulos/inventario/estado/useAlmacenes'
import { ReporteResumenMovimientos } from '@/modulos/reportes/componentes/ReporteResumenMovimientos'

export function ReportesPage() {
  const { access } = useAuth()
  const gestion = useAlmacenes()

  return (
    <div className="space-y-8">
      <header className="border-b pb-7">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Reportes</h1>
        <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">
          Consulta información operativa verificable. Este primer reporte resume movimientos registrados en el Kardex.
        </p>
      </header>
      <EstadoListadoInventario
        cargando={gestion.cargando}
        error={gestion.error}
        vacio={false}
        mensajeVacio=""
        alReintentar={() => void gestion.reintentar()}
      >
        <ReporteResumenMovimientos
          organizationId={access?.organizationId ?? ''}
          almacenes={gestion.almacenes}
        />
      </EstadoListadoInventario>
    </div>
  )
}
