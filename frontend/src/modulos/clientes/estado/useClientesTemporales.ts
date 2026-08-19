import { useRef, useState } from 'react'

import type {
  Cliente,
  DatosCliente,
} from '@/modulos/clientes/modelo/cliente'
import { normalizarBusquedaCliente } from '@/modulos/clientes/modelo/cliente'
import { crearRepositorioClientesSesion } from '@/modulos/clientes/servicios/repositorioClientesSesion'

export function useClientesTemporales() {
  const repositorio = useRef(
    crearRepositorioClientesSesion(window.sessionStorage),
  )
  const [clientes, setClientes] = useState<Cliente[]>(() =>
    repositorio.current.listar(),
  )

  const guardarCliente = (datos: DatosCliente, clienteId?: string) => {
    const documento = normalizarBusquedaCliente(datos.numeroDocumento)
    const repetido = clientes.some(
      (cliente) =>
        cliente.id !== clienteId &&
        normalizarBusquedaCliente(cliente.numeroDocumento) === documento,
    )
    if (repetido) return 'Ya existe un cliente con este documento'

    const existente = clientes.find((cliente) => cliente.id === clienteId)
    const cliente: Cliente = existente
      ? { ...datos, id: existente.id, fechaRegistro: existente.fechaRegistro }
      : {
          ...datos,
          id: crypto.randomUUID(),
          fechaRegistro: new Date().toISOString(),
        }
    const siguientes = existente
      ? clientes.map((item) => (item.id === existente.id ? cliente : item))
      : [...clientes, cliente]

    repositorio.current.guardar(siguientes)
    setClientes(siguientes)
    return undefined
  }

  return { clientes, guardarCliente }
}
