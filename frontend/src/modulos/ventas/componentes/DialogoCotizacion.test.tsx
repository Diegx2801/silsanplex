import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Cliente } from '@/modulos/clientes/modelo/cliente'
import type { Producto } from '@/modulos/productos/modelo/producto'

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
  it('usa búsquedas accesibles para cliente y producto y conserva un producto mínimo', () => {
    renderDialog()

    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveValue(cliente.nombreRazonSocial)
    expect(screen.getByRole('combobox', { name: 'Producto 1' })).toHaveValue(
      'MED-001 · Paracetamol 500 mg',
    )
    expect(screen.getByRole('button', { name: 'Quitar producto 1' })).toBeDisabled()

    fireEvent.focus(screen.getByRole('combobox', { name: 'Cliente' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Cliente' }), {
      target: { value: cliente.numeroDocumento },
    })
    expect(screen.getByRole('option', { name: /Boticas El Sol SAC/ })).toBeVisible()
    fireEvent.click(screen.getByRole('option', { name: /Boticas El Sol SAC/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Agregar producto' }))
    fireEvent.focus(screen.getByRole('combobox', { name: 'Producto 2' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Producto 2' }), {
      target: { value: 'ibuprofeno' },
    })
    fireEvent.click(screen.getByRole('option', { name: /MED-002/ }))
    expect(screen.getByLabelText('Precio unitario del producto 2')).toHaveValue('18.50')
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
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(await screen.findByText('No se pudo guardar la cotización')).toBeVisible()
    expect(alCambiarApertura).not.toHaveBeenCalledWith(false)
  })
})
