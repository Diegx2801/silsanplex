import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import { DirectorioAlmacenes } from '@/modulos/inventario/componentes/DirectorioAlmacenes'
import { useAlmacenes } from '@/modulos/inventario/estado/useAlmacenes'

export function AlmacenesPage() {
  const { hasPermission } = useAuth()
  const gestion = useAlmacenes()

  return (
    <DirectorioAlmacenes
      almacenes={gestion.almacenes}
      ubicaciones={gestion.ubicaciones}
      puedeGestionar={hasPermission(PERMISSIONS.INVENTORY_MANAGE)}
      cargando={gestion.cargando}
      error={gestion.error}
      alReintentar={gestion.reintentar}
      alGuardarAlmacen={gestion.guardarAlmacen}
      alGuardarUbicacion={gestion.guardarUbicacion}
      alCambiarEstadoAlmacen={gestion.cambiarEstadoAlmacen}
      alCambiarEstadoUbicacion={gestion.cambiarEstadoUbicacion}
    />
  )
}
