import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/modulos/reparaciones/estado/useReparacionOpciones', () => ({
  useTecnicosReparacion: () => ({ tecnicos: [], cargando: false, error: null }),
}))
vi.mock('@/modulos/inventario/estado/useCandidatosFefo', () => ({
  useCandidatosFefo: () => ({ candidatos: [], cargando: false, error: '' }),
}))

import type {
  DetalleReparacion as DatosDetalleReparacion,
  EstadoReparacion,
  Reparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

import { DetalleReparacion } from './DetalleReparacion'

const reparacionBase: Reparacion = {
  id: 'repair-1',
  organizationId: 'org-1',
  codigo: 'REP-0001',
  clienteId: 'customer-1',
  productoId: 'product-1',
  numeroSerie: 'SER-1',
  recibidaEn: '2026-08-30T12:00:00Z',
  fechaEntregaEstimada: '',
  entregadaEn: '',
  estado: 'diagnosis',
  prioridad: 'normal',
  problema: 'No enciende',
  diagnostico: 'Fuente dañada',
  solucionAplicada: '',
  notas: '',
  referenciaCliente: '',
  documentoVentaId: '',
  referenciaGarantia: '',
  tecnicoAsignadoId: null,
  clienteNombreSnapshot: 'Cliente prueba',
  clienteDocumentoSnapshot: 'DNI 00000001',
  productoCodigoSnapshot: 'PROD-1',
  productoDescripcionSnapshot: 'Equipo prueba',
  creadoPor: null,
  actualizadoPor: null,
  creadoEn: '2026-08-30T12:00:00Z',
  actualizadoEn: '2026-08-30T12:00:00Z',
}

function crearDetalle(
  estado: EstadoReparacion = 'diagnosis',
  solucionAplicada = '',
): DatosDetalleReparacion {
  return {
    reparacion: { ...reparacionBase, estado, solucionAplicada },
    diagnosticos: [],
    cotizaciones: [],
    cotizacionActiva: null,
    partes: [],
    pruebas: [],
    eventos: [],
  }
}

function renderizarDetalle({
  estado = 'diagnosis',
  puedeCambiarEstado = true,
  solucionAplicada = '',
  resultadoSolucion,
}: {
  estado?: EstadoReparacion
  puedeCambiarEstado?: boolean
  solucionAplicada?: string
  resultadoSolucion?: string
} = {}) {
  const operacion = vi.fn().mockResolvedValue(undefined)
  const registrarSolucion = vi.fn().mockResolvedValue(resultadoSolucion)
  render(
    <DetalleReparacion
      abierto
      detalle={crearDetalle(estado, solucionAplicada)}
      cargando={false}
      error={null}
      productos={[]}
      almacenes={[]}
      ubicaciones={[]}
      puedeEditar={false}
      puedeAsignar={false}
      puedeCambiarEstado={puedeCambiarEstado}
      puedeAprobarCotizacion={false}
      puedeUsarPartes={false}
      puedeEntregar={false}
      alCambiarApertura={vi.fn()}
      alRestaurarFoco={vi.fn()}
      alEditar={vi.fn()}
      alAsignar={operacion}
      alCambiarEstado={operacion}
      alRegistrarDiagnostico={operacion}
      alRegistrarSolucion={registrarSolucion}
      alGuardarCotizacion={operacion}
      alAprobarCotizacion={operacion}
      alRechazarCotizacion={operacion}
      alReservarParte={operacion}
      alConsumirParte={operacion}
      alCancelarParte={operacion}
      alRegistrarPrueba={operacion}
      alEntregar={operacion}
      alCancelar={operacion}
    />,
  )
  return { registrarSolucion }
}

describe('DetalleReparacion acciones técnicas', () => {
  it('conserva la acción especializada de diagnóstico', () => {
    renderizarDetalle()

    fireEvent.click(screen.getByRole('button', { name: 'Registrar diagnóstico' }))

    expect(screen.getByRole('heading', { name: 'Registrar diagnóstico' })).toBeInTheDocument()
  })

  it('envía la solución por la acción especializada en un estado no terminal', async () => {
    const { registrarSolucion } = renderizarDetalle({ estado: 'received' })

    expect(screen.queryByRole('button', { name: 'Registrar diagnóstico' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar solución' }))

    expect(screen.getByRole('heading', { name: 'Registrar solución aplicada' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Solución aplicada *'), {
      target: { value: 'Fuente reemplazada' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar solución' }))

    await waitFor(() => {
      expect(registrarSolucion).toHaveBeenCalledWith({ solucionAplicada: 'Fuente reemplazada' })
    })
  })

  it('permite modificar la solución aplicada existente', () => {
    renderizarDetalle({ estado: 'testing', solucionAplicada: 'Fuente reemplazada' })

    fireEvent.click(screen.getByRole('button', { name: 'Modificar solución' }))

    expect(screen.getByRole('heading', { name: 'Modificar solución aplicada' })).toBeInTheDocument()
    expect(screen.getByLabelText('Solución aplicada *')).toHaveValue('Fuente reemplazada')
  })

  it('oculta diagnóstico y solución sin el permiso técnico que VENTAS no posee', () => {
    renderizarDetalle({ puedeCambiarEstado: false })

    expect(screen.queryByRole('button', { name: 'Registrar diagnóstico' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar solución' })).not.toBeInTheDocument()
  })

  it('no permite modificar la solución en estados terminales', () => {
    renderizarDetalle({ estado: 'delivered' })

    expect(screen.queryByRole('button', { name: 'Registrar solución' })).not.toBeInTheDocument()
  })

  it('limpia un error de solución al cerrar y volver a abrir el diálogo', async () => {
    renderizarDetalle({ estado: 'received', resultadoSolucion: 'Error remoto' })

    fireEvent.click(screen.getByRole('button', { name: 'Registrar solución' }))
    fireEvent.change(screen.getByLabelText('Solución aplicada *'), {
      target: { value: 'Fuente reemplazada' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar solución' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Error remoto')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar solución aplicada' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar solución' }))

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
