import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/modulos/reparaciones/estado/useReparacionOpciones', () => ({
  useTecnicosReparacion: () => ({ tecnicos: [], cargando: false, error: null }),
}))
vi.mock('@/modulos/inventario/estado/useCandidatosFefo', () => ({
  useCandidatosFefo: () => ({ candidatos: [], cargando: false, error: '' }),
}))

import type {
  CotizacionReparacion,
  DetalleReparacion as DatosDetalleReparacion,
  EstadoReparacion,
  ParteReparacion,
  Reparacion,
} from '@/modulos/reparaciones/modelo/reparacion'

import { DetalleReparacion } from './DetalleReparacion'

const reparacionBase: Reparacion = {
  id: 'repair-1',
  organizationId: 'org-1',
  lockVersion: 4,
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
  diagnosticoRegistrado: true,
  solucionAplicada: '',
  solucionAplicadaRegistrada: false,
  notas: '',
  referenciaCliente: '',
  documentoVentaId: '',
  referenciaGarantia: '',
  tecnicoAsignadoId: null,
  clienteNombreSnapshot: 'Cliente prueba',
  clienteDocumentoSnapshot: 'DNI 00000001',
  productoCodigoSnapshot: 'PROD-1',
  productoDescripcionSnapshot: 'Equipo prueba',
  serialControlSnapshot: true,
  creadoPor: null,
  actualizadoPor: null,
  creadoEn: '2026-08-30T12:00:00Z',
  actualizadoEn: '2026-08-30T12:00:00Z',
}

const parteReservada: ParteReparacion = {
  id: 'part-1',
  organizationId: 'org-1',
  reparacionId: 'repair-1',
  productoId: 'product-1',
  productoCodigoSnapshot: 'PROD-1',
  productoDescripcionSnapshot: 'Repuesto de prueba',
  almacenId: 'warehouse-1',
  ubicacionId: 'location-1',
  estadoStock: 'available',
  lote: '',
  fechaVencimiento: '',
  cantidadSolicitada: 1,
  cantidadConsumida: 0,
  estado: 'reserved',
  notas: '',
  creadoPor: null,
  actualizadoPor: null,
  creadoEn: '2026-08-30T12:00:00Z',
  actualizadoEn: '2026-08-30T12:00:00Z',
  consumos: [],
}

const cotizacionRechazada: CotizacionReparacion = {
  id: 'quote-1',
  organizationId: 'org-1',
  reparacionId: 'repair-1',
  version: 1,
  esActual: true,
  estado: 'rejected',
  moneda: 'PEN',
  preciosIncluyenImpuesto: false,
  tasaImpuesto: 18,
  subtotal: 100,
  impuesto: 18,
  total: 118,
  aprobadoPor: null,
  aprobadoEn: null,
  observacionAprobacion: '',
  rechazadoPor: 'user-1',
  rechazadoEn: '2026-09-01T12:00:00Z',
  observacionRechazo: 'Ajustar mano de obra',
  creadoPor: 'user-1',
  actualizadoPor: 'user-1',
  creadoEn: '2026-09-01T11:00:00Z',
  actualizadoEn: '2026-09-01T12:00:00Z',
  lineas: [{
    id: 'line-1',
    organizationId: 'org-1',
    cotizacionId: 'quote-1',
    tipo: 'labor',
    productoId: null,
    descripcion: 'Mano de obra',
    cantidad: 1,
    precioUnitario: 100,
    gravable: true,
    subtotalLinea: 100,
    creadoEn: '2026-09-01T11:00:00Z',
  }],
}

function crearDetalle(
  estado: EstadoReparacion = 'diagnosis',
  solucionAplicada = '',
  conParte = false,
  conCotizacionRechazada = false,
): DatosDetalleReparacion {
  const cotizaciones = conCotizacionRechazada ? [cotizacionRechazada] : []
  return {
    cicloPruebasActual: 0,
    reparacion: { ...reparacionBase, estado, solucionAplicada },
    diagnosticos: [],
    cotizaciones,
    cotizacionActiva: cotizaciones[0] ?? null,
    partes: conParte ? [parteReservada] : [],
    pruebas: [],
    eventos: [],
  }
}

function renderizarDetalle({
  estado = 'diagnosis',
  puedeEditar = false,
  puedeCambiarEstado = true,
  puedeUsarPartes = false,
  solucionAplicada = '',
  conParte = false,
  resultadoSolucion,
  resultadoOperacion,
  conCotizacionRechazada = false,
}: {
  estado?: EstadoReparacion
  puedeEditar?: boolean
  puedeCambiarEstado?: boolean
  puedeUsarPartes?: boolean
  solucionAplicada?: string
  conParte?: boolean
  resultadoSolucion?: string
  resultadoOperacion?: string
  conCotizacionRechazada?: boolean
} = {}) {
  const operacion = vi.fn().mockResolvedValue(resultadoOperacion)
  const editar = vi.fn()
  const registrarSolucion = vi.fn().mockResolvedValue(resultadoSolucion)
  const revisarCotizacion = vi.fn().mockResolvedValue(undefined)
  const construirDetalle = (lockVersion = reparacionBase.lockVersion) => ({
    ...crearDetalle(estado, solucionAplicada, conParte, conCotizacionRechazada),
    reparacion: {
      ...crearDetalle(estado, solucionAplicada, conParte, conCotizacionRechazada).reparacion,
      lockVersion,
    },
  })
  const construirElemento = (lockVersion = reparacionBase.lockVersion) => (
    <DetalleReparacion
      abierto
      detalle={construirDetalle(lockVersion)}
      cargando={false}
      error={null}
      productos={[]}
      almacenes={[]}
      ubicaciones={[]}
      puedeEditar={puedeEditar}
      puedeAsignar={false}
      puedeCambiarEstado={puedeCambiarEstado}
      puedeAprobarCotizacion={false}
      puedeUsarPartes={puedeUsarPartes}
      puedeEntregar={false}
      alCambiarApertura={vi.fn()}
      alRestaurarFoco={vi.fn()}
      alEditar={editar}
      alAsignar={operacion}
      alCambiarEstado={operacion}
      alRegistrarDiagnostico={operacion}
      alRegistrarSolucion={registrarSolucion}
      alGuardarCotizacion={operacion}
      alRevisarCotizacion={revisarCotizacion}
      alAprobarCotizacion={operacion}
      alRechazarCotizacion={operacion}
      alReservarParte={operacion}
      alConsumirParte={operacion}
      alCancelarParte={operacion}
      alRegistrarPrueba={operacion}
      alEntregar={operacion}
      alCancelar={operacion}
    />
  )
  const resultado = render(construirElemento())
  return {
    editar,
    operacion,
    registrarSolucion,
    revisarCotizacion,
    rerenderDetalle: (lockVersion: number) => resultado.rerender(construirElemento(lockVersion)),
  }
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
      expect(registrarSolucion).toHaveBeenCalledWith(
        'repair-1',
        { solucionAplicada: 'Fuente reemplazada' },
        4,
      )
    })
  })

  it('permite modificar la solución aplicada existente', () => {
    renderizarDetalle({ estado: 'in_repair', solucionAplicada: 'Fuente reemplazada' })

    fireEvent.click(screen.getByRole('button', { name: 'Modificar solución' }))

    expect(screen.getByRole('heading', { name: 'Modificar solución aplicada' })).toBeInTheDocument()
    expect(screen.getByLabelText('Solución aplicada *')).toHaveValue('Fuente reemplazada')
  })

  it('oculta diagnóstico y solución sin el permiso técnico que VENTAS no posee', () => {
    renderizarDetalle({ puedeCambiarEstado: false })

    expect(screen.queryByRole('button', { name: 'Registrar diagnóstico' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar solución' })).not.toBeInTheDocument()
  })

  it('permite a VENTAS abrir la edición general sin permisos técnicos', () => {
    const { editar } = renderizarDetalle({ puedeEditar: true, puedeCambiarEstado: false })

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))

    expect(editar).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Registrar diagnóstico' })).not.toBeInTheDocument()
  })

  it('no permite modificar la solución en estados terminales', () => {
    renderizarDetalle({ estado: 'delivered' })

    expect(screen.queryByRole('button', { name: 'Registrar solución' })).not.toBeInTheDocument()
  })

  it.each(['testing', 'ready_for_delivery'] as const)(
    'exige retrabajo antes de modificar la solución desde %s',
    (estado) => {
      renderizarDetalle({ estado, solucionAplicada: 'Fuente reemplazada' })

      expect(screen.queryByRole('button', { name: 'Modificar solución' })).not.toBeInTheDocument()
    },
  )

  it('oculta el consumo de repuestos durante testing', () => {
    renderizarDetalle({ estado: 'testing', puedeUsarPartes: true, conParte: true })

    expect(screen.queryByRole('button', { name: 'Consumir saldo' })).not.toBeInTheDocument()
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

  it('crea una revisión por la acción especializada desde una cotización rechazada', async () => {
    const { revisarCotizacion } = renderizarDetalle({
      estado: 'rejected',
      puedeEditar: true,
      conCotizacionRechazada: true,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Crear revisión' }))

    expect(screen.getByRole('heading', { name: 'Crear revisión desde v1' })).toBeInTheDocument()
    expect(screen.getByLabelText('Descripción *')).toHaveValue('Mano de obra')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a aprobación' }))

    await waitFor(() => {
      expect(revisarCotizacion).toHaveBeenCalledWith(
        'repair-1',
        'quote-1',
        expect.objectContaining({ id: undefined, moneda: 'PEN' }),
        true,
        expect.any(String),
        4,
      )
    })
  })

  it('conserva la versión abierta aunque el detalle se actualice en segundo plano', async () => {
    const { operacion, rerenderDetalle } = renderizarDetalle({
      resultadoOperacion: 'La reparación cambió mientras realizabas esta acción.',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar estado' }))
    rerenderDetalle(99)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar estado' }))

    await waitFor(() => {
      expect(operacion).toHaveBeenCalledWith('repair-1', 'quote_pending', '', 4)
    })
    expect(screen.getByRole('heading', { name: 'Cambiar estado' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('La reparación cambió mientras realizabas esta acción.')
    expect(screen.queryByText('Estado actualizado.')).not.toBeInTheDocument()
  })

  it('muestra errores remotos de diagnóstico a nivel de formulario y conserva la entrada', async () => {
    renderizarDetalle({ resultadoOperacion: 'Conflicto de versión' })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar diagnóstico' }))
    const sintomas = screen.getByLabelText('Síntomas observados *')
    fireEvent.change(sintomas, { target: { value: 'Falla intermitente al encender' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar diagnóstico' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Conflicto de versión')
    expect(sintomas).toHaveValue('Falla intermitente al encender')
    expect(sintomas).toHaveAttribute('aria-invalid', 'false')
  })

  it('muestra errores remotos de prueba a nivel de formulario y conserva la entrada', async () => {
    renderizarDetalle({ estado: 'testing', resultadoOperacion: 'Conflicto de versión' })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar prueba' }))
    const resultado = screen.getByLabelText('Resultado *')
    fireEvent.change(screen.getByLabelText('Tipo de prueba *'), {
      target: { value: 'Encendido' },
    })
    fireEvent.change(resultado, { target: { value: 'Opera correctamente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar prueba' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Conflicto de versión')
    expect(resultado).toHaveValue('Opera correctamente')
    expect(resultado).toHaveAttribute('aria-invalid', 'false')
  })
})
