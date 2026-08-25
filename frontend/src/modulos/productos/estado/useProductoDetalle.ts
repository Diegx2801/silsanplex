import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/useAuth'
import type {
  ArchivoProducto,
  TipoArchivoProducto,
} from '@/modulos/productos/modelo/producto'
import {
  actualizarDescripcionArchivoProducto,
  listarArchivosProducto,
  listarVersionesProducto,
  organizarImagenesProducto,
  restaurarVersionProducto,
  retirarArchivoProducto,
  subirArchivoProducto,
} from '@/modulos/productos/servicios/productosService'

interface DatosCargaArchivo {
  archivo: File
  tipo: TipoArchivoProducto
  descripcion?: string
}

export function useProductoDetalle(productoId: string, habilitado: boolean) {
  const { access, user } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const detalleKey = ['product-detail', organizationId, productoId] as const
  const archivosKey = [...detalleKey, 'files'] as const
  const versionesKey = [...detalleKey, 'versions'] as const

  const archivosQuery = useQuery({
    queryKey: archivosKey,
    queryFn: () => listarArchivosProducto(organizationId, productoId),
    enabled: habilitado && Boolean(organizationId && productoId),
    staleTime: 60_000,
  })
  const versionesQuery = useQuery({
    queryKey: versionesKey,
    queryFn: () => listarVersionesProducto(organizationId, productoId),
    enabled: habilitado && Boolean(organizationId && productoId),
    staleTime: 30_000,
  })
  const cargaMutation = useMutation({
    mutationFn: (datos: DatosCargaArchivo) => {
      if (!user) throw new Error('La sesión ya no está disponible')
      return subirArchivoProducto(organizationId, productoId, user.id, datos)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: archivosKey }),
        queryClient.invalidateQueries({ queryKey: versionesKey }),
      ])
    },
  })
  const retiroMutation = useMutation({
    mutationFn: (archivo: ArchivoProducto) =>
      retirarArchivoProducto(organizationId, productoId, archivo),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: archivosKey }),
        queryClient.invalidateQueries({ queryKey: versionesKey }),
      ])
    },
  })
  const descripcionMutation = useMutation({
    mutationFn: ({ archivoId, descripcion }: { archivoId: string; descripcion: string }) =>
      actualizarDescripcionArchivoProducto(
        organizationId,
        productoId,
        archivoId,
        descripcion,
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: archivosKey }),
        queryClient.invalidateQueries({ queryKey: versionesKey }),
      ])
    },
  })
  const organizacionMutation = useMutation({
    mutationFn: ({ imagenes, principalId }: { imagenes: ArchivoProducto[]; principalId: string }) =>
      organizarImagenesProducto(
        organizationId,
        productoId,
        imagenes,
        principalId,
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: archivosKey }),
        queryClient.invalidateQueries({ queryKey: versionesKey }),
        queryClient.invalidateQueries({ queryKey: ['products', organizationId] }),
      ])
    },
  })
  const restauracionMutation = useMutation({
    mutationFn: (versionNumero: number) =>
      restaurarVersionProducto(organizationId, productoId, versionNumero),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: versionesKey }),
        queryClient.invalidateQueries({ queryKey: ['products', organizationId] }),
      ])
    },
  })

  return {
    archivos: archivosQuery.data ?? [],
    versiones: versionesQuery.data ?? [],
    cargandoDetalle: archivosQuery.isLoading || versionesQuery.isLoading,
    errorDetalle: archivosQuery.error ?? versionesQuery.error,
    subiendoArchivo: cargaMutation.isPending,
    retirandoArchivo: retiroMutation.isPending,
    guardandoArchivo:
      descripcionMutation.isPending || organizacionMutation.isPending,
    restaurandoVersion: restauracionMutation.isPending,
    subirArchivo: (datos: DatosCargaArchivo) => cargaMutation.mutateAsync(datos),
    retirarArchivo: (archivo: ArchivoProducto) => retiroMutation.mutateAsync(archivo),
    actualizarDescripcion: (archivoId: string, descripcion: string) =>
      descripcionMutation.mutateAsync({ archivoId, descripcion }),
    organizarImagenes: (imagenes: ArchivoProducto[], principalId: string) =>
      organizacionMutation.mutateAsync({ imagenes, principalId }),
    restaurarVersion: (versionNumero: number) =>
      restauracionMutation.mutateAsync(versionNumero),
  }
}
