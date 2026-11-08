import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Reparacion } from '@/modulos/reparaciones/modelo/reparacion'
import { datosReparacionInicial } from '@/modulos/reparaciones/modelo/reparacion'

import { DialogoReparacion } from './DialogoReparacion'

const clienteId = '00000000-0000-4000-8000-000000000001'
const productoId = '00000000-0000-4000-8000-000000000002'

const clientes = [{
  id: clienteId,
  nombre: 'Cliente prueba',
  nombreComercial: '',
  documento: 'DNI 00000001',
}]

const productos = [{
  id: productoId,
  codigo: 'PROD-1',
  descripcion: 'Equipo prueba',
  unidadMedida: 'unidad',
  serialControl: false,
  controlLote: false,
  controlVencimiento: false,
}]

const reparacion: Reparacion = {
  id: 'repair-1',
  organizationId: 'org-1',
  lockVersion: 4,
  codigo: 'REP-0001',
  clienteId,
  productoId,
  numeroSerie: 'SER-ORIGINAL',
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
  serialControlSnapshot: false,
  creadoPor: null,
  actualizadoPor: null,
  creadoEn: '2026-08-30T12:00:00Z',
  actualizadoEn: '2026-08-30T12:00:00Z',
}

function renderizarDialogo(
  reparacionActual: Reparacion | null,
  identidadEditable: boolean,
  clientesDisponibles = clientes,
  productosDisponibles = productos,
) {
  const alGuardar = vi.fn().mockResolvedValue(undefined)
  render(
    <DialogoReparacion
      abierto
      reparacion={reparacionActual}
      identidadEditable={identidadEditable}
      clientes={clientesDisponibles}
      productos={productosDisponibles}
      alCambiarApertura={vi.fn()}
      alGuardar={alGuardar}
      alRestaurarFoco={vi.fn()}
    />,
  )
  return alGuardar
}

async function seleccionarOpcion(etiqueta: string, opcion: RegExp | string) {
  const campo = screen.getByLabelText(etiqueta)
  fireEvent.focus(campo)
  fireEvent.click(await screen.findByRole('option', { name: opcion }))
}

describe('DialogoReparacion', () => {
  it('presenta el formulario centrado y limita su altura con scroll interno', () => {
    renderizarDialogo(null, true)

    const dialogo = screen.getByRole('dialog', { name: 'Registrar reparación' })
    expect(dialogo).toHaveClass('start-1/2', 'top-1/2', '-translate-x-1/2', '-translate-y-1/2', 'max-h-[92svh]', 'overflow-hidden')
    expect(dialogo).not.toHaveClass('inset-y-0', 'end-0')
  })

  it('recupera una creación antigua sin añadir una colección vacía al fingerprint', async () => {
    const datos = { ...datosReparacionInicial(), clienteId, productoId, problema: 'No enciende', notas: 'Incluye cable histórico' }
    const alGuardar = vi.fn().mockResolvedValue(undefined)
    render(<DialogoReparacion abierto reparacion={null} identidadEditable clientes={clientes} productos={productos}
      datosCreacionPendiente={datos} alCambiarApertura={vi.fn()} alGuardar={alGuardar} alRestaurarFoco={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reparación' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalled())
    expect(alGuardar.mock.calls[0][0]).toEqual(datos)
    expect(alGuardar.mock.calls[0][0]).not.toHaveProperty('accesorios')
  })
  it('registra un equipo externo de un área interna sin crear referencias ficticias', async () => {
    const alGuardar = renderizarDialogo(null, true, [], [])
    fireEvent.change(screen.getByLabelText('Solicitante *'), { target: { value: 'internal' } })
    fireEvent.change(screen.getByLabelText('Área solicitante *'), { target: { value: 'Almacén' } })
    fireEvent.change(screen.getByLabelText('Identificación del equipo *'), { target: { value: 'external' } })
    fireEvent.change(screen.getByLabelText('Equipo recibido *'), { target: { value: 'Impresora Zebra ZD220' } })
    fireEvent.change(screen.getByLabelText('Número de serie (si existe)'), { target: { value: 'SER-EXTERNA' } })
    fireEvent.change(screen.getByLabelText('Problema reportado *'), { target: { value: 'No imprime' } })
    expect(screen.queryByLabelText('Cliente *')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Producto o equipo *')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reparación' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({
      tipoSolicitante: 'internal', areaSolicitante: 'Almacén', clienteId: '',
      tipoEquipo: 'external', descripcionEquipoExterno: 'Impresora Zebra ZD220', productoId: '', numeroSerie: 'SER-EXTERNA',
    }), undefined, true, expect.any(String)))
  })

  it('mantiene la identidad externa bloqueada al editar una orden con historial', async () => {
    const alGuardar = renderizarDialogo({ ...reparacion, tipoSolicitante: 'internal', areaSolicitante: 'Almacén',
      clienteId: '', clienteNombreSnapshot: 'Almacén', clienteDocumentoSnapshot: 'INTERNO', tipoEquipo: 'external',
      productoId: '', descripcionEquipoExterno: 'Impresora Zebra', productoDescripcionSnapshot: 'Impresora Zebra', productoCodigoSnapshot: 'EXTERNO' }, false)
    expect(screen.queryByLabelText('Solicitante *')).not.toBeInTheDocument()
    expect(screen.getByText('Impresora Zebra')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({
      tipoEquipo: 'external', descripcionEquipoExterno: 'Impresora Zebra', tipoSolicitante: 'internal', areaSolicitante: 'Almacén',
    }), reparacion.id, false, undefined))
  })

  it('prioriza los datos esenciales, separa accesorios y deja referencias opcionales plegadas', () => {
    renderizarDialogo(null, true)

    expect(screen.getByLabelText('Problema reportado *')).toBeVisible()
    expect(screen.getByLabelText('Estado físico y observaciones al recibir')).toBeVisible()
    expect(screen.getByText('Referencias y garantía').closest('details')).not.toHaveAttribute('open')
    expect(screen.getByRole('region', { name: 'Accesorios recibidos' })).toBeInTheDocument()
    expect(screen.getByText('No se registraron accesorios o pertenencias en esta recepción.')).toBeVisible()
    expect(screen.queryByLabelText('ID de documento de venta')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Prioridad *')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Fecha estimada de entrega')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Referencias y garantía'))
    fireEvent.click(screen.getByLabelText(/^Atención en garantía/))
    expect(screen.getByLabelText('Referencia de garantía')).toBeInTheDocument()
  })

  it('mantiene visible el error del accesorio sin abrir referencias y garantía', async () => {
    renderizarDialogo(null, true)
    fireEvent.click(screen.getByRole('button', { name: 'Agregar accesorio' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reparación' }))

    expect(await screen.findByText('Indica el nombre del accesorio')).toBeVisible()
    expect(screen.getByText('Referencias y garantía').closest('details')).not.toHaveAttribute('open')
  })

  it('conserva documentos y referencias históricas aunque no estén en la recepción esencial', async () => {
    const documentoVentaId = '00000000-0000-4000-8000-000000000055'
    const alGuardar = renderizarDialogo({
      ...reparacion,
      documentoVentaId,
      referenciaGarantia: 'GAR-2026-01',
      notas: 'Incluye cargador y estuche',
    }, false)

    expect(screen.queryByLabelText('ID de documento de venta')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Referencia de garantía')).toHaveValue('GAR-2026-01')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({ documentoVentaId, referenciaGarantia: 'GAR-2026-01', notas: 'Incluye cargador y estuche' }),
      'repair-1', false, undefined,
    ))
  })

  it('permite editar la identidad durante la creación', () => {
    renderizarDialogo(null, true)

    expect(screen.getByLabelText('Cliente *')).toBeEnabled()
    expect(screen.getByLabelText('Producto o equipo *')).toBeEnabled()
  })

  it('presenta la identidad bloqueada como información de solo lectura', () => {
    renderizarDialogo(reparacion, false)

    expect(screen.queryByLabelText('Cliente *')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Producto o equipo *')).not.toBeInTheDocument()
    expect(screen.getByText('Cliente prueba')).toBeVisible()
    expect(screen.getByText('Equipo prueba')).toBeVisible()
    expect(screen.getByText('SER-ORIGINAL')).toBeVisible()
  })

  it('conserva la serie y envía cambios generales cuando la identidad está bloqueada', async () => {
    const alGuardar = renderizarDialogo({
      ...reparacion,
      prioridad: 'high',
      fechaEntregaEstimada: '2026-09-15',
    }, false)

    fireEvent.change(screen.getByLabelText('Problema reportado *'), {
      target: { value: 'No enciende con su cargador' },
    })
    fireEvent.change(screen.getByLabelText('Estado físico y observaciones al recibir'), {
      target: { value: 'Editar desde VENTAS' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId,
        productoId,
        numeroSerie: 'SER-ORIGINAL',
        prioridad: 'high',
        fechaEstimadaEntrega: '2026-09-15',
        problema: 'No enciende con su cargador',
        notas: 'Editar desde VENTAS',
      }),
      'repair-1',
      false,
      undefined,
    ))
  })

  it('permite conservar referencias ausentes de las listas activas', async () => {
    const alGuardar = renderizarDialogo(reparacion, true, [], [])

    expect(screen.getByLabelText('Cliente *'))
      .toHaveValue('Cliente prueba (referencia histórica)')
    expect(screen.getByLabelText('Producto o equipo *'))
      .toHaveValue('PROD-1 · Equipo prueba (referencia histórica)')
    expect(screen.getByLabelText('Número de serie (si existe)')).toHaveValue('SER-ORIGINAL')

    fireEvent.change(screen.getByLabelText('Estado físico y observaciones al recibir'), {
      target: { value: 'Actualización administrativa' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId,
        productoId,
        numeroSerie: 'SER-ORIGINAL',
        notas: 'Actualización administrativa',
      }),
      'repair-1',
      true,
      undefined,
    ))
  })

  it('usa la regla de serie conservada aunque el maestro actual difiera', async () => {
    const alGuardar = renderizarDialogo({
      ...reparacion,
      serialControlSnapshot: true,
    }, true)

    expect(screen.getByLabelText('Número de serie *')).toHaveValue('SER-ORIGINAL')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({ numeroSerie: 'SER-ORIGINAL' }),
      'repair-1',
      true,
      undefined,
    ))
  })

  it('limpia la serie al seleccionar otro producto conocido sin series', async () => {
    const otroProductoId = '00000000-0000-4000-8000-000000000003'
    const alGuardar = renderizarDialogo({
      ...reparacion,
      serialControlSnapshot: true,
    }, true, clientes, [
      productos[0],
      {
        ...productos[0],
        id: otroProductoId,
        codigo: 'PROD-2',
        descripcion: 'Equipo sin serie',
      },
    ])

    await seleccionarOpcion('Producto o equipo *', /PROD-2 · Equipo sin serie/)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({
        productoId: otroProductoId,
        numeroSerie: '',
      }),
      'repair-1',
      true,
      undefined,
    ))
  })

  it('acepta un producto encontrado por búsqueda remota aunque no esté en la página inicial', async () => {
    const productoRemoto = {
      ...productos[0],
      id: '00000000-0000-4000-8000-000000001001',
      codigo: 'PROD-1001',
      descripcion: 'Equipo fuera de la primera página',
      activo: true,
    }
    const alGuardar = vi.fn().mockResolvedValue(undefined)
    render(
      <DialogoReparacion
        abierto
        reparacion={null}
        identidadEditable
        clientes={clientes}
        productos={[]}
        buscarProductos={vi.fn().mockResolvedValue({ elementos: [productoRemoto] })}
        alCambiarApertura={vi.fn()}
        alGuardar={alGuardar}
        alRestaurarFoco={vi.fn()}
      />,
    )

    await seleccionarOpcion('Cliente *', /Cliente prueba/)
    fireEvent.change(screen.getByLabelText('Producto o equipo *'), {
      target: { value: 'PROD-1001' },
    })
    await screen.findByRole('option', { name: /PROD-1001/ }, { timeout: 3_000 })
    fireEvent.click(screen.getByRole('option', { name: /PROD-1001/ }))
    fireEvent.change(screen.getByLabelText('Problema reportado *'), {
      target: { value: 'No enciende' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reparación' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({ productoId: productoRemoto.id }),
      undefined,
      true,
      expect.any(String),
    ))
  })

  it('reutiliza la clave de creación al reintentar los mismos datos', async () => {
    const alGuardar = vi.fn()
      .mockResolvedValueOnce('Tiempo de espera agotado')
      .mockResolvedValueOnce(undefined)
    render(
      <DialogoReparacion
        abierto
        reparacion={null}
        identidadEditable
        clientes={clientes}
        productos={productos}
        alCambiarApertura={vi.fn()}
        alGuardar={alGuardar}
        alRestaurarFoco={vi.fn()}
      />,
    )
    await seleccionarOpcion('Cliente *', /Cliente prueba/)
    await seleccionarOpcion('Producto o equipo *', /PROD-1 · Equipo prueba/)
    fireEvent.change(screen.getByLabelText('Problema reportado *'), {
      target: { value: 'No enciende después del transporte' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Registrar reparación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tiempo de espera agotado')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reparación' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledTimes(2))
    const primeraClave = alGuardar.mock.calls[0][3]
    expect(primeraClave).toEqual(expect.any(String))
    expect(alGuardar.mock.calls[1][3]).toBe(primeraClave)
  })
})
