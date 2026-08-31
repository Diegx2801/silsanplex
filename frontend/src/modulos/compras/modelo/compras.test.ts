import { describe, expect, it } from 'vitest'

import { productoInicial, type Producto } from '@/modulos/productos/modelo/producto'

import {
  calcularTotalesCompra,
  crearCompra,
  esquemaDatosProveedor,
  validarCompra,
  type DatosCompra,
  type Proveedor,
} from './compras'

const producto = {
  ...productoInicial,
  id: 'producto-1',
  codigo: 'MED-001',
  descripcion: 'Paracetamol 500 mg',
  codigoBarras: '',
  categoria: 'Medicamentos',
  laboratorio: 'Laboratorio demo',
  presentacion: 'Caja',
  unidadMedida: 'Caja',
  afectacionIgv: 'gravado',
  precioVenta: '20',
  registroSanitario: '',
  controlLote: true,
  ventaReceta: false,
  activo: true,
} satisfies Producto

const proveedor = {
  id: 'proveedor-1',
  organizationId: 'organizacion-1',
  codigo: 'PRV-001',
  tipoDocumento: 'ruc',
  numeroDocumento: '20123456789',
  razonSocial: 'Distribuidora Demo SAC',
  nombreComercial: '',
  contacto: '',
  cargoContacto: '',
  email: '',
  telefono: '',
  direccion: '',
  ubigeo: '',
  estadoContribuyente: '',
  condicionDomicilio: '',
  fuenteDatosFiscales: '',
  fechaConsultaSunat: null,
  condicionCredito: 'credito',
  diasCredito: 30,
  observaciones: '',
  activo: true,
  fechaRegistro: '2026-08-19T16:00:00.000Z',
  fechaActualizacion: '2026-08-19T16:00:00.000Z',
} satisfies Proveedor

const compraBase = {
  proveedorId: proveedor.id,
  tipoDocumento: 'factura',
  serie: 'f001',
  numero: '000001',
  fechaEmision: '2026-08-19',
  fechaVencimientoPago: '',
  fechaEntregaEsperada: '2026-08-25',
  almacen: 'Almacén principal',
  preciosIncluyenIgv: true,
  observacion: '',
  lineas: [
    {
      productoId: producto.id,
      cantidad: '5',
      costoUnitario: '11.80',
      lote: 'L-001',
      fechaVencimiento: '2027-08-19',
    },
  ],
} satisfies DatosCompra

describe('proveedores', () => {
  it('valida la longitud fiscal de RUC y DNI', () => {
    const base = {
      codigo: '',
      razonSocial: 'Proveedor Demo',
      nombreComercial: '',
      contacto: '',
      cargoContacto: '',
      email: '',
      telefono: '',
      direccion: '',
      ubigeo: '',
      estadoContribuyente: '',
      condicionDomicilio: '',
      fuenteDatosFiscales: '',
      fechaConsultaSunat: null,
      condicionCredito: 'contado',
      diasCredito: '0',
      observaciones: '',
      activo: true,
    }

    expect(
      esquemaDatosProveedor.safeParse({
        ...base,
        tipoDocumento: 'ruc',
        numeroDocumento: '20123456789',
      }).success,
    ).toBe(true)
    expect(
      esquemaDatosProveedor.safeParse({
        ...base,
        tipoDocumento: 'dni',
        numeroDocumento: '123',
      }).success,
    ).toBe(false)
  })
})

describe('compras', () => {
  it('calcula IGV cuando el costo lo incluye y cuando debe agregarse', () => {
    const lineas = [{ cantidad: 10, costoUnitario: 11.8 }]

    expect(calcularTotalesCompra(lineas, true)).toEqual({
      subtotal: 100,
      igv: 18,
      total: 118,
    })
    expect(calcularTotalesCompra(lineas, false)).toEqual({
      subtotal: 118,
      igv: 21.24,
      total: 139.24,
    })
  })

  it('rechaza productos duplicados y lotes faltantes', () => {
    expect(
      validarCompra(
        { ...compraBase, lineas: [...compraBase.lineas, compraBase.lineas[0]] },
        [producto],
      ),
    ).toContain('una sola vez')
    expect(
      validarCompra(
        {
          ...compraBase,
          lineas: [{ ...compraBase.lineas[0], lote: '' }],
        },
        [producto],
      ),
    ).toContain('lote')
  })

  it('crea un borrador con instantáneas del proveedor y producto', () => {
    const compra = crearCompra(
      compraBase,
      proveedor,
      [producto],
      new Date('2026-08-19T17:00:00.000Z'),
      'compra-1',
    )

    expect(compra).toMatchObject({
      id: 'compra-1',
      estado: 'borrador',
      serie: 'F001',
      proveedorNombre: proveedor.razonSocial,
      fechaRecepcion: null,
    })
    expect(compra.lineas[0]).toMatchObject({
      productoCodigo: producto.codigo,
      cantidad: 5,
      costoUnitario: 11.8,
    })
  })
})
