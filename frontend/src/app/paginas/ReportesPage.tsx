import { useAuth } from '@/features/auth/useAuth'
import { useAlmacenes } from '@/modulos/inventario/estado/useAlmacenes'
import { ReporteKardex } from '@/modulos/reportes/componentes/ReporteKardex'
import { ReporteResumenMovimientos } from '@/modulos/reportes/componentes/ReporteResumenMovimientos'

export function ReportesPage() {
  const { access } = useAuth()
  const gestion = useAlmacenes()

  return (
    <div className="space-y-8">
      <header className="border-b pb-7">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Reportes</h1>
        <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">
          Consulta el resumen del periodo o el historial detallado de movimientos con saldos acumulados.
        </p>
      </header>
      {gestion.error ? (
        <p role="status" className="text-sm text-muted-foreground">
          No se pudo cargar el catálogo de almacenes; los reportes siguen disponibles sin ese filtro.
        </p>
      ) : null}
      <ReporteResumenMovimientos
        organizationId={access?.organizationId ?? ''}
        almacenes={gestion.almacenes}
      />
      <ReporteKardex
        organizationId={access?.organizationId ?? ''}
        almacenes={gestion.almacenes}
      />
    </div>
  )
}
