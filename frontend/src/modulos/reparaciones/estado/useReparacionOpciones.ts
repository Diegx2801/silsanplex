import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'

import { useAuth } from '@/features/auth/useAuth'
import {
  listarOpcionesAlmacenesReparacion,
  listarOpcionesUbicacionesReparacion,
  listarOpcionesClientesReparacion,
  listarOpcionesProductosReparacion,
  listarTecnicosReparacion,
  obtenerOpcionClienteReparacion,
  obtenerOpcionAlmacenReparacion,
  obtenerOpcionProductoReparacion,
  obtenerOpcionUbicacionReparacion,
} from '@/modulos/reparaciones/servicios/reparacionesService'
import type { ConsultaCatalogoReparacion } from '../modelo/reparacion'

interface ConfiguracionOpcionesReparacion {
  cargarClientes?: boolean
  cargarProductos?: boolean
  cargarAlmacenes?: boolean
  clienteIdActual?: string
  productoIdActual?: string
}

const consultaInicial = { busqueda: '', pagina: 1, tamanioPagina: 25 }
const ubicacionesIniciales: never[] = []

export function useReparacionOpciones(
  configuracion: ConfiguracionOpcionesReparacion = {},
) {
  const { access } = useAuth()
  const organizationId = access?.organizationId ?? ''
  const clientesQuery = useQuery({
    queryKey: ['repair-options', organizationId, 'customers'],
    queryFn: () => listarOpcionesClientesReparacion(organizationId, consultaInicial),
    enabled: Boolean(organizationId && configuracion.cargarClientes),
    staleTime: 60_000,
  })
  const productosQuery = useQuery({
    queryKey: ['repair-options', organizationId, 'products'],
    queryFn: () => listarOpcionesProductosReparacion(organizationId, consultaInicial),
    enabled: Boolean(organizationId && configuracion.cargarProductos),
    staleTime: 60_000,
  })
  const almacenesQuery = useQuery({
    queryKey: ['repair-options', organizationId, 'warehouses'],
    queryFn: () => listarOpcionesAlmacenesReparacion(organizationId, consultaInicial),
    enabled: Boolean(organizationId && configuracion.cargarAlmacenes),
    staleTime: 60_000,
  })
  const clienteActualQuery = useQuery({
    queryKey: ['repair-options', organizationId, 'customer', configuracion.clienteIdActual],
    queryFn: () => obtenerOpcionClienteReparacion(organizationId, configuracion.clienteIdActual!),
    enabled: Boolean(organizationId && configuracion.clienteIdActual),
    staleTime: 60_000,
  })
  const productoActualQuery = useQuery({
    queryKey: ['repair-options', organizationId, 'product', configuracion.productoIdActual],
    queryFn: () => obtenerOpcionProductoReparacion(organizationId, configuracion.productoIdActual!),
    enabled: Boolean(organizationId && configuracion.productoIdActual),
    staleTime: 60_000,
  })
  const buscarClientes = useCallback((consulta: ConsultaCatalogoReparacion) =>
    listarOpcionesClientesReparacion(organizationId, consulta), [organizationId])
  const buscarProductos = useCallback((consulta: ConsultaCatalogoReparacion) =>
    listarOpcionesProductosReparacion(organizationId, consulta), [organizationId])
  const resolverCliente = useCallback((id: string) =>
    obtenerOpcionClienteReparacion(organizationId, id), [organizationId])
  const resolverProducto = useCallback((id: string) =>
    obtenerOpcionProductoReparacion(organizationId, id), [organizationId])
  const buscarAlmacenes = useCallback((consulta: ConsultaCatalogoReparacion) =>
    listarOpcionesAlmacenesReparacion(organizationId, consulta), [organizationId])
  const buscarUbicaciones = useCallback((almacenId: string, consulta: ConsultaCatalogoReparacion) =>
    listarOpcionesUbicacionesReparacion(organizationId, almacenId, consulta), [organizationId])
  const resolverAlmacen = useCallback((id: string) =>
    obtenerOpcionAlmacenReparacion(organizationId, id), [organizationId])
  const resolverUbicacion = useCallback((id: string) =>
    obtenerOpcionUbicacionReparacion(organizationId, id), [organizationId])

  return {
    clientes: clientesQuery.data?.elementos ?? [],
    totalClientes: clientesQuery.data?.total ?? 0,
    clienteActual: clienteActualQuery.data ?? null,
    buscarClientes,
    resolverCliente,
    productos: productosQuery.data?.elementos ?? [],
    totalProductos: productosQuery.data?.total ?? 0,
    productoActual: productoActualQuery.data ?? null,
    buscarProductos,
    resolverProducto,
    almacenes: almacenesQuery.data?.elementos ?? [],
    totalAlmacenes: almacenesQuery.data?.total ?? 0,
    ubicaciones: ubicacionesIniciales,
    buscarAlmacenes,
    buscarUbicaciones,
    resolverAlmacen,
    resolverUbicacion,
    cargando:
      clientesQuery.isLoading || productosQuery.isLoading || almacenesQuery.isLoading
      || clienteActualQuery.isLoading || productoActualQuery.isLoading,
    error: clientesQuery.error ?? productosQuery.error ?? almacenesQuery.error
      ?? clienteActualQuery.error ?? productoActualQuery.error,
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
