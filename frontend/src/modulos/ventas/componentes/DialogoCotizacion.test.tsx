import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Cliente } from '@/modulos/clientes/modelo/cliente'
import type { Producto } from '@/modulos/productos/modelo/producto'
import type { Cotizacion } from '@/modulos/ventas/modelo/cotizacion'

import { DialogoCotizacion } from './DialogoCotizacion'

const cliente = {
  id: 'cliente-1',
  organizacionId: 'organizacion-1',
  tipoDocumento: 'ruc',
  numeroDocumento: '20548796321',
  nombreRazonSocial: 'Boticas El Sol SAC',
  nombreComercial: 'El Sol',
  contacto: 'Compras',
  email: 'compras@example.com',
  telefono: '+51 999 999 999',
  direccion: '',
  ubigeo: '',
  estadoSunat: 'ACTIVO',
  condicionDomicilio: 'HABIDO',
  direccionesEntrega: [],
  activo: true,
  fechaRegistro: '2026-09-16T00:00:00.000Z',
  fechaActualizacion: '2026-09-16T00:00:00.000Z',
  fechaConsultaSunat: null,
} satisfies Cliente

function crearProducto(id: string, codigo: string, descripcion: string, precioVenta: string) {
  return {
    id,
    codigo,
    descripcion,
    descripcionAmpliada: '',
    codigoBarras: `${codigo}-BARRA`,
    categoria: '',
    sublinea: '',
    laboratorio: '',
    presentacion: 'Caja',
    tipo: 'good',
    unidadBaseId: '11111111-1111-4111-8111-111111111111',
    unidadMedida: 'Unidad',
    afectacionIgv: 'gravado',
    precioVenta,
    precioMinimo: '',
    stockMaximo: '',
    anchoCm: '',
    altoCm: '',
    largoCm: '',
    pesoKg: '',
    registroSanitario: '',
    controlLote: false,
    controlVencimiento: false,
    serialControl: false,
    ventaReceta: false,
    activo: true,
    unidadesAlternativas: [],
  } satisfies Producto
}

const productos = [
  crearProducto('producto-1', 'MED-001', 'Paracetamol 500 mg', '23.60'),
  crearProducto('producto-2', 'MED-002', 'Ibuprofeno 400 mg', '18.50'),
]

const productoSinAfectacion = {
  ...productos[0],
  id: 'producto-pendiente',
  codigo: 'PEND-001',
  descripcion: 'Producto pendiente de clasificación',
  afectacionIgv: '',
} satisfies Producto

function renderDialog(alGuardar = vi.fn().mockResolvedValue(undefined)) {
  const alCambiarApertura = vi.fn()
  render(
    <DialogoCotizacion
      abierto
      cotizacion={null}
      clientes={[cliente]}
      productos={productos}
      alCambiarApertura={alCambiarApertura}
      alGuardar={alGuardar}
      alRestaurarFoco={vi.fn()}
    />,
  )
  return alCambiarApertura
}

describe('DialogoCotizacion', () => {
  it('inicia sin selecciones arbitrarias, busca cliente y producto y conserva una línea mínima', () => {
    renderDialog()

    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Producto 1' })).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Quitar producto 1' })).toBeDisabled()

    fireEvent.focus(screen.getByRole('combobox', { name: 'Cliente' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Cliente' }), {
      target: { value: cliente.numeroDocumento },
    })
    expect(screen.getByRole('option', { name: /Boticas El Sol SAC/ })).toBeVisible()
    fireEvent.click(screen.getByRole('option', { name: /Boticas El Sol SAC/ }))

    fireEvent.focus(screen.getByRole('combobox', { name: 'Producto 1' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Producto 1' }), {
      target: { value: 'paracetamol' },
    })
    fireEvent.click(screen.getByRole('option', { name: /MED-001/ }))
    expect(screen.getByLabelText('Precio unitario del producto 1')).toHaveValue('23.60')

    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    fireEvent.focus(screen.getByRole('combobox', { name: 'Producto 2' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Producto 2' }), {
      target: { value: 'ibuprofeno' },
    })
    fireEvent.click(screen.getByRole('option', { name: /MED-002/ }))
    expect(screen.getByLabelText('Precio unitario del producto 2')).toHaveValue('18.50')
  })

  it('entrega al guardado las entidades obtenidas por búsqueda remota', async () => {
    const clienteRemoto = { ...cliente, id: 'cliente-remoto', nombreRazonSocial: 'Cliente remoto' }
    const productoRemoto = crearProducto('producto-remoto', 'MED-REMOTE', 'Producto remoto', '19.90')
    const alGuardar = vi.fn().mockResolvedValue(undefined)

    render(
      <DialogoCotizacion
        abierto
        cotizacion={null}
        clientes={[]}
        productos={[]}
        buscarClientes={vi.fn().mockResolvedValue([clienteRemoto])}
        buscarProductos={vi.fn().mockResolvedValue([productoRemoto])}
        alCambiarApertura={vi.fn()}
        alGuardar={alGuardar}
        alRestaurarFoco={vi.fn()}
      />,
    )

    const clienteSelector = screen.getByRole('combobox', { name: 'Cliente' })
    fireEvent.focus(clienteSelector)
    fireEvent.change(clienteSelector, { target: { value: 'remoto' } })
    fireEvent.click(await screen.findByRole('option', { name: /Cliente remoto/ }))

    const productoSelector = screen.getByRole('combobox', { name: 'Producto 1' })
    fireEvent.focus(productoSelector)
    fireEvent.change(productoSelector, { target: { value: 'remote' } })
    fireEvent.click(await screen.findByRole('option', { name: /MED-REMOTE/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledOnce())
    const entidades = alGuardar.mock.calls[0]?.[2]
    expect(entidades.cliente).toMatchObject({ id: clienteRemoto.id })
    expect(entidades.productos).toEqual([expect.objectContaining({ id: productoRemoto.id })])
  })

  it('muestra los errores de selección cuando faltan cliente y producto', async () => {
    render(
      <DialogoCotizacion
        abierto
        cotizacion={null}
        clientes={[]}
        productos={[]}
        alCambiarApertura={vi.fn()}
        alGuardar={vi.fn()}
        alRestaurarFoco={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(await screen.findByText('Selecciona un cliente')).toBeVisible()
    expect(await screen.findByText('Selecciona un producto')).toBeVisible()
  })

  it('conserva abierto el diálogo ante un error de guardado', async () => {
    const alGuardar = vi.fn().mockResolvedValue('No se pudo guardar la cotización')
    const alCambiarApertura = renderDialog(alGuardar)

    fireEvent.focus(screen.getByRole('combobox', { name: 'Cliente' }))
    fireEvent.click(screen.getByRole('option', { name: /Boticas El Sol SAC/ }))
    fireEvent.focus(screen.getByRole('combobox', { name: 'Producto 1' }))
    fireEvent.click(screen.getByRole('option', { name: /MED-001/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(await screen.findByText('No se pudo guardar la cotización')).toBeVisible()
    expect(alCambiarApertura).not.toHaveBeenCalledWith(false)
  })

  it('advierte la afectación de IGV pendiente antes de emitir', () => {
    render(
      <DialogoCotizacion
        abierto
        cotizacion={null}
        clientes={[cliente]}
        productos={[productoSinAfectacion]}
        alCambiarApertura={vi.fn()}
        alGuardar={vi.fn().mockResolvedValue(undefined)}
        alRestaurarFoco={vi.fn()}
      />,
    )

    fireEvent.focus(screen.getByRole('combobox', { name: 'Cliente' }))
    fireEvent.click(screen.getByRole('option', { name: /Boticas El Sol SAC/ }))
    fireEvent.focus(screen.getByRole('combobox', { name: 'Producto 1' }))
    fireEvent.click(screen.getByRole('option', { name: /PEND-001/ }))

    expect(screen.getByRole('status')).toHaveTextContent('Producto pendiente de clasificación')
    expect(screen.getByText(/no podrá emitirse/i)).toBeVisible()
  })

  it('respeta la afectación tributaria guardada en el snapshot del borrador', () => {
    const cotizacion: Cotizacion = {
      id: 'cotizacion-pendiente',
      numero: 'COT-000009',
      clienteId: cliente.id,
      clienteDocumento: cliente.numeroDocumento,
      clienteNombre: cliente.nombreRazonSocial,
      fechaEmision: '2026-09-16',
      fechaValidez: '2026-09-23',
      preciosIncluyenIgv: true,
      observacion: '',
      lineas: [{
        id: 'linea-pendiente',
        productoId: productos[0].id,
        productoCodigo: productos[0].codigo,
        productoDescripcion: productos[0].descripcion,
        unidadMedida: productos[0].unidadMedida,
        cantidad: 1,
        precioUnitario: 23.6,
        afectacionIgv: 'por-definir',
      }],
      estado: 'borrador',
      fechaRegistro: '2026-09-16T12:00:00.000Z',
      fechaCambioEstado: null,
    }

    render(
      <DialogoCotizacion
        abierto
        cotizacion={cotizacion}
        clientes={[]}
        productos={[]}
        alCambiarApertura={vi.fn()}
        alGuardar={vi.fn().mockResolvedValue(undefined)}
        alRestaurarFoco={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Paracetamol 500 mg')
  })
})
