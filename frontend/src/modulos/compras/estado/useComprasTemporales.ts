import { useRef, useState } from 'react'

import {
  crearCompra,
  validarCompra,
  type Compra,
  type DatosCompra,
  type DatosProveedor,
  type Proveedor,
} from '@/modulos/compras/modelo/compras'
import {
  crearRepositorioComprasSesion,
  type DatosComprasSesion,
} from '@/modulos/compras/servicios/repositorioComprasSesion'
import {
  crearMovimientoInventario,
  type MovimientoInventario,
} from '@/modulos/inventario/modelo/inventario'
import { crearRepositorioInventarioSesion } from '@/modulos/inventario/servicios/repositorioInventarioSesion'
import type { Producto } from '@/modulos/productos/modelo/producto'

function normalizar(valor: string) {
  return valor.trim().toLocaleLowerCase('es-PE')
}

export function useComprasTemporales(productos: readonly Producto[]) {
  const repositorio = useRef(
    crearRepositorioComprasSesion(window.sessionStorage),
  )
  const repositorioInventario = useRef(
    crearRepositorioInventarioSesion(window.sessionStorage),
  )
  const [datos, setDatos] = useState<DatosComprasSesion>(() =>
    repositorio.current.leer(),
  )

  const persistir = (siguientes: DatosComprasSesion) => {
    repositorio.current.guardar(siguientes)
    setDatos(siguientes)
  }

  const guardarProveedor = (entrada: DatosProveedor, proveedorId?: string) => {
    const repetido = datos.proveedores.some(
      (proveedor) =>
        proveedor.id !== proveedorId &&
        normalizar(proveedor.numeroDocumento) ===
          normalizar(entrada.numeroDocumento),
    )
    if (repetido) return 'Ya existe un proveedor con este documento'

    const existente = datos.proveedores.find(
      (proveedor) => proveedor.id === proveedorId,
    )
    const proveedor: Proveedor = existente
      ? { ...entrada, id: existente.id, fechaRegistro: existente.fechaRegistro }
      : {
          ...entrada,
          id: crypto.randomUUID(),
          fechaRegistro: new Date().toISOString(),
        }

    persistir({
      ...datos,
      proveedores: existente
        ? datos.proveedores.map((item) =>
            item.id === existente.id ? proveedor : item,
          )
        : [...datos.proveedores, proveedor],
    })
    return undefined
  }

  const guardarCompra = (entrada: DatosCompra, compraId?: string) => {
    const proveedor = datos.proveedores.find(
      (item) => item.id === entrada.proveedorId && item.activo,
    )
    if (!proveedor) return 'El proveedor seleccionado ya no está disponible'

    const documentoRepetido = datos.compras.some(
      (compra) =>
        compra.id !== compraId &&
        compra.tipoDocumento === entrada.tipoDocumento &&
        normalizar(compra.serie) === normalizar(entrada.serie) &&
        normalizar(compra.numero) === normalizar(entrada.numero),
    )
    if (documentoRepetido) return 'Ya existe una compra con este documento'

    const error = validarCompra(entrada, productos)
    if (error) return error

    const existente = datos.compras.find((compra) => compra.id === compraId)
    if (existente && existente.estado !== 'borrador') {
      return 'Solo se pueden editar compras en borrador'
    }

    const compraCreada = crearCompra(
      entrada,
      proveedor,
      productos,
      existente ? new Date(existente.fechaRegistro) : new Date(),
      existente?.id,
    )
    const compra: Compra = existente
      ? { ...compraCreada, fechaRegistro: existente.fechaRegistro }
      : compraCreada

    persistir({
      ...datos,
      compras: existente
        ? datos.compras.map((item) =>
            item.id === existente.id ? compra : item,
          )
        : [...datos.compras, compra],
    })
    return undefined
  }

  const recibirCompra = (compraId: string) => {
    const compra = datos.compras.find((item) => item.id === compraId)
    if (!compra || compra.estado !== 'borrador') {
      return 'La compra ya no está disponible para recepción'
    }

    const productosPorId = new Map(
      productos.map((producto) => [producto.id, producto]),
    )
    const fechaRecepcion = new Date()
    const movimientos: MovimientoInventario[] = []

    for (const linea of compra.lineas) {
      const producto = productosPorId.get(linea.productoId)
      if (!producto?.activo) {
        return `El producto ${linea.productoDescripcion} ya no está activo`
      }
      if (producto.controlLote && !linea.lote) {
        return `Falta el lote de ${linea.productoDescripcion}`
      }

      movimientos.push(
        crearMovimientoInventario(
          {
            productoId: producto.id,
            tipo: 'entrada',
            cantidad: String(linea.cantidad),
            almacen: compra.almacen,
            lote: linea.lote,
            fechaVencimiento: linea.fechaVencimiento,
            fechaOperacion: fechaRecepcion.toISOString().slice(0, 10),
            motivo: `Recepción de ${compra.tipoDocumento} ${compra.serie}-${compra.numero}`,
          },
          producto,
          fechaRecepcion,
        ),
      )
    }

    const inventarioAnterior = repositorioInventario.current.listar()
    const siguientesCompras = datos.compras.map((item) =>
      item.id === compra.id
        ? {
            ...item,
            estado: 'recibida' as const,
            fechaRecepcion: fechaRecepcion.toISOString(),
          }
        : item,
    )

    try {
      repositorioInventario.current.guardar([
        ...inventarioAnterior,
        ...movimientos,
      ])
      persistir({ ...datos, compras: siguientesCompras })
    } catch {
      try {
        repositorioInventario.current.guardar(inventarioAnterior)
      } catch {
        // El almacenamiento del navegador no ofrece transacciones reales.
      }
      return 'No se pudo completar la recepción en esta sesión'
    }

    return undefined
  }

  return {
    proveedores: datos.proveedores,
    compras: datos.compras,
    guardarProveedor,
    guardarCompra,
    recibirCompra,
  }
}
