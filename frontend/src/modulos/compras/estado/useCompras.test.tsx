import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Almacen } from '@/modulos/inventario/modelo/almacen'
import type { DatosCompra, EntidadesSeleccionadasCompra } from '@/modulos/compras/modelo/compras'
import type { Producto } from '@/modulos/productos/modelo/producto'
import type { Proveedor } from '@/modulos/proveedores/modelo/proveedor'

const servicios = vi.hoisted(() => ({
  listarCompras: vi.fn().mockResolvedValue([]),
  guardarCompraPersistente: vi.fn(),
  emitirCompraPersistente: vi.fn(),
  recibirCompraPersistente: vi.fn().mockResolvedValue(undefined),
  anularCompraPersistente: vi.fn(),
}))
vi.mock('@/modulos/compras/servicios/compraService', () => servicios)
vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ access: { organizationId: 'org-1' } }),
}))

import { useCompras } from './useCompras'

function Probe() {
  const { recibirCompra } = useCompras([], [])
  return <button type="button" onClick={() => void recibirCompra('compra-1', {
    operationKey: 'op-1', observacion: '', lineas: [],
  })}>Recibir</button>
}

function QueryProbe() {
  const { error, reintentar } = useCompras([], [])
  return <>
    <span>{error ? 'error' : 'ok'}</span>
    <button type="button" onClick={() => void reintentar()}>Reintentar</button>
  </>
}

const datosCompraRemota = {
  proveedorId: 'proveedor-remoto',
  tipoDocumento: 'factura',
  serie: 'F001',
  numero: '000001',
  fechaEmision: '2026-09-22',
  fechaVencimientoPago: '',
  fechaEntregaEsperada: '',
  almacenId: '11111111-1111-4111-8111-111111111111',
  almacen: 'Almacén remoto',
  preciosIncluyenIgv: true,
  observacion: '',
  lineas: [{
    productoId: 'producto-remoto',
    cantidad: '1',
    costoUnitario: '10',
    lote: '',
    fechaVencimiento: '',
  }],
} satisfies DatosCompra

const entidadesRemotas: EntidadesSeleccionadasCompra = {
  proveedor: { id: 'proveedor-remoto', activo: true } as Proveedor,
  productos: [{
    id: 'producto-remoto',
    descripcion: 'Producto remoto',
    activo: true,
    controlLote: false,
    controlVencimiento: false,
  } as Producto],
  almacen: {
    id: datosCompraRemota.almacenId,
    codigo: 'REMOTO',
    nombre: 'Almacén remoto',
    direccion: '',
    activo: true,
  } satisfies Almacen,
}

function SaveRemoteCatalogProbe() {
  const { guardarCompra } = useCompras([], [])
  return (
    <button
      type="button"
      onClick={() => void guardarCompra(datosCompraRemota, undefined, entidadesRemotas)}
    >
      Guardar
    </button>
  )
}

describe('useCompras', () => {
  it('refresca todas las consultas de inventario después de recibir', async () => {
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidar = vi.spyOn(cliente, 'invalidateQueries')
    render(<QueryClientProvider client={cliente}><Probe /></QueryClientProvider>)

    fireEvent.click(document.querySelector('button')!)

    await waitFor(() => expect(servicios.recibirCompraPersistente).toHaveBeenCalled())
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['inventory', 'org-1'] })
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['warehouse-management', 'org-1'] })
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['inventory-fefo', 'org-1'] })
  })

  it('expone reintento cuando la consulta de compras falla', async () => {
    servicios.listarCompras.mockReset()
      .mockRejectedValueOnce(new Error('Fallo temporal'))
      .mockResolvedValueOnce([])
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={cliente}><QueryProbe /></QueryClientProvider>)

    await waitFor(() => expect(screen.getByText('error')).toBeVisible())
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByText('ok')).toBeVisible())
    expect(servicios.listarCompras).toHaveBeenCalledTimes(2)
  })

  it('valida y guarda una selección remota aunque el catálogo inicial esté vacío', async () => {
    servicios.guardarCompraPersistente.mockReset().mockResolvedValue(undefined)
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={cliente}><SaveRemoteCatalogProbe /></QueryClientProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(servicios.guardarCompraPersistente).toHaveBeenCalledWith(
      'org-1',
      datosCompraRemota,
      undefined,
    ))
  })
})
