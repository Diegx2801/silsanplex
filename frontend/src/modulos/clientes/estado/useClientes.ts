import { useQuery } from '@tanstack/react-query'
import { listarClientesActivos } from '@/modulos/clientes/servicios/customerService'

export function useClientes() {
  const consulta = useQuery({ queryKey: ['customers', 'active-options'], queryFn: listarClientesActivos, staleTime: 60_000 })
  return { clientes: consulta.data ?? [], cargando: consulta.isLoading, error: consulta.error }
}
