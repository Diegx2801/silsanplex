import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import { EstadoListadoInventario } from '@/modulos/inventario/componentes/EstadoListadoInventario'
import { PanelControlStock } from '@/modulos/inventario/componentes/PanelControlStock'
import { useAlmacenes } from '@/modulos/inventario/estado/useAlmacenes'

export function ControlStockPage() {
  const { access, hasPermission } = useAuth()
  const gestion = useAlmacenes()
  return (
    <div className="space-y-8">
      <header className="border-b pb-7">
        <span className="font-mono text-xs tracking-[0.08em] text-primary uppercase">Inventario</span>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Control de stock</h1>
        <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">Revisa alertas, vencimientos y condiciones de almacenamiento.</p>
      </header>
      <EstadoListadoInventario cargando={gestion.cargando} error={gestion.error} vacio={false} mensajeVacio="" alReintentar={() => void gestion.reintentar()}>
        <PanelControlStock organizationId={access?.organizationId ?? ''} almacenes={gestion.almacenes} ubicaciones={gestion.ubicaciones}
          puedeGestionar={hasPermission(PERMISSIONS.INVENTORY_MANAGE)} reclasificar={gestion.reclasificar} configurar={gestion.configurar} />
      </EstadoListadoInventario>
    </div>
  )
}
