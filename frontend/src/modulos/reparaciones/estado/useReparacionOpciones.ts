import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import {
  listarAlmacenesReparacion,
  listarOpcionesClientesReparacion,
  listarOpcionesProductosReparacion,
  listarTecnicosReparacion,
} from '@/modulos/reparaciones/servicios/reparacionesService'

interface ConfiguracionOpcionesReparacion {
  cargarClientes?: boolean
  cargarProductos?: boolean
  cargarAlmacenes?: boolean
}

export function useReparacionOpciones(
  configuracion: ConfiguracionOpcionesReparacion = {},
) {
  const { access } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const clientesQuery = useQuery({
    queryKey: ['repair-options', organizationId, 'customers'],
    queryFn: () => listarOpcionesClientesReparacion(organizationId),
    enabled: Boolean(organizationId && configuracion.cargarClientes),
    staleTime: 60_000,
  })
  const productosQuery = useQuery({
    queryKey: ['repair-options', organizationId, 'products'],
    queryFn: () => listarOpcionesProductosReparacion(organizationId),
    enabled: Boolean(organizationId && configuracion.cargarProductos),
    staleTime: 60_000,
  })
  const almacenesQuery = useQuery({
    queryKey: ['repair-options', organizationId, 'warehouses'],
    queryFn: () => listarAlmacenesReparacion(organizationId),
    enabled: Boolean(organizationId && configuracion.cargarAlmacenes),
    staleTime: 60_000,
  })

  return {
    clientes: clientesQuery.data ?? [],
    productos: productosQuery.data ?? [],
    almacenes: almacenesQuery.data?.almacenes ?? [],
    ubicaciones: almacenesQuery.data?.ubicaciones ?? [],
    cargando:
      clientesQuery.isLoading || productosQuery.isLoading || almacenesQuery.isLoading,
    error: clientesQuery.error ?? productosQuery.error ?? almacenesQuery.error,
  }
}

export function useTecnicosReparacion(
  habilitado: boolean,
  busqueda: string,
) {
  const { access } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const query = useQuery({
    queryKey: ['repair-technicians', organizationId, busqueda],
    queryFn: () => listarTecnicosReparacion(organizationId, busqueda, 100),
    enabled: Boolean(organizationId && habilitado),
    staleTime: 30_000,
  })

  return {
    tecnicos: query.data ?? [],
    cargando: query.isLoading,
    error: query.error,
  }
}
