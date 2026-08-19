import {
  Building2,
  ContactRound,
  Mail,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserRoundX,
} from 'lucide-react'
import {
  type MouseEvent as ReactMouseEvent,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Button } from '@/components/ui/button'
import { DialogoCliente } from '@/modulos/clientes/componentes/DialogoCliente'
import { useClientesTemporales } from '@/modulos/clientes/estado/useClientesTemporales'
import {
  clienteCoincideBusqueda,
  type Cliente,
  type DatosCliente,
} from '@/modulos/clientes/modelo/cliente'

type FiltroCliente = 'todos' | 'activos' | 'inactivos'

function etiquetaDocumento(cliente: Cliente) {
  return `${cliente.tipoDocumento.toUpperCase()} ${cliente.numeroDocumento}`
}

export function ClientesPage() {
  const { clientes, guardarCliente } = useClientesTemporales()
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<FiltroCliente>('todos')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(
    null,
  )
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const disparador = useRef<HTMLButtonElement | null>(null)
  const busquedaDiferida = useDeferredValue(busqueda)

  const clientesFiltrados = useMemo(
    () =>
      clientes
        .filter((cliente) => {
          const coincideEstado =
            filtro === 'todos' ||
            (filtro === 'activos' && cliente.activo) ||
            (filtro === 'inactivos' && !cliente.activo)
          return (
            coincideEstado && clienteCoincideBusqueda(cliente, busquedaDiferida)
          )
        })
        .toSorted((a, b) =>
          a.nombreRazonSocial.localeCompare(b.nombreRazonSocial, 'es-PE'),
        ),
    [busquedaDiferida, clientes, filtro],
  )
  const activos = clientes.filter((cliente) => cliente.activo).length
  const conContacto = clientes.filter(
    (cliente) => cliente.email || cliente.telefono,
  ).length

  const abrirFormulario = (
    evento: ReactMouseEvent<HTMLButtonElement>,
    cliente: Cliente | null = null,
  ) => {
    disparador.current = evento.currentTarget
    setClienteSeleccionado(cliente)
    setDialogoAbierto(true)
  }

  const guardar = (datos: DatosCliente, clienteId?: string) => {
    const error = guardarCliente(datos, clienteId)
    if (!error) {
      setMensaje(clienteId ? 'Cliente actualizado.' : 'Cliente registrado.')
    }
    return error
  }

  const metricas = [
    { etiqueta: 'Clientes registrados', valor: clientes.length, icono: ContactRound },
    { etiqueta: 'Disponibles para venta', valor: activos, icono: UserCheck },
    {
      etiqueta: 'Clientes inactivos',
      valor: clientes.length - activos,
      icono: UserRoundX,
    },
    { etiqueta: 'Con datos de contacto', valor: conContacto, icono: Mail },
  ]

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="font-mono text-xs tracking-[0.08em] text-primary uppercase">
            Base comercial
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            Clientes
          </h1>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">
            Mantén los datos fiscales y de contacto que usarán las próximas
            cotizaciones, pedidos y ventas.
          </p>
        </div>
        <Button type="button" size="lg" onClick={(evento) => abrirFormulario(evento)}>
          <Plus aria-hidden="true" />
          Registrar cliente
        </Button>
      </header>

      <section aria-label="Resumen de clientes" className="ledger-sheet">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          {metricas.map((metrica) => {
            const Icono = metrica.icono
            return (
              <article
                key={metrica.etiqueta}
                className="border-b px-5 py-5 last:border-b-0 sm:border-e sm:[&:nth-child(2)]:border-e-0 xl:border-b-0 xl:[&:nth-child(2)]:border-e xl:last:border-e-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
                    {metrica.etiqueta}
                  </p>
                  <Icono aria-hidden="true" className="size-4 text-primary" />
                </div>
                <p className="mt-3 font-mono text-2xl font-semibold tabular-nums">
                  {metrica.valor}
                </p>
              </article>
            )
          })}
        </div>
      </section>

      <p role="status" aria-live="polite" className="sr-only">
        {mensaje}
      </p>

      <section aria-labelledby="clientes-title" className="ledger-sheet">
        <div className="grid gap-4 border-b px-5 py-5 sm:px-6 lg:grid-cols-[minmax(14rem,1fr)_17rem_12rem] lg:items-end">
          <div>
            <h2 id="clientes-title" className="text-lg font-semibold">
              Directorio de clientes
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {clientesFiltrados.length} de {clientes.length} registros
            </p>
          </div>
          <div>
            <label htmlFor="buscar-cliente" className="field-label">
              Buscar
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                id="buscar-cliente"
                type="search"
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                className="field-control ps-9"
                placeholder="Documento, nombre o contacto"
              />
            </div>
          </div>
          <div>
            <label htmlFor="estado-cliente" className="field-label">
              Estado
            </label>
            <select
              id="estado-cliente"
              value={filtro}
              onChange={(evento) => setFiltro(evento.target.value as FiltroCliente)}
              className="field-control"
            >
              <option value="todos">Todos</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
          </div>
        </div>

        {!clientesFiltrados.length ? (
          <div className="px-5 py-14 text-center sm:px-6">
            <Building2 aria-hidden="true" className="mx-auto size-8 text-primary" />
            <h3 className="mt-4 font-semibold">
              {clientes.length ? 'No hay coincidencias' : 'Aún no hay clientes'}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {clientes.length
                ? 'Prueba con otro término o cambia el estado.'
                : 'Registra el primer cliente para preparar el flujo comercial.'}
            </p>
            {!clientes.length ? (
              <Button type="button" className="mt-5" onClick={(evento) => abrirFormulario(evento)}>
                <Plus aria-hidden="true" /> Registrar cliente
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="divide-y md:hidden">
              {clientesFiltrados.map((cliente) => (
                <article key={cliente.id} className="px-5 py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-primary">
                        {etiquetaDocumento(cliente)}
                      </p>
                      <h3 className="mt-1 font-semibold">{cliente.nombreRazonSocial}</h3>
                      {cliente.nombreComercial ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {cliente.nombreComercial}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className="status-label"
                      data-tone={cliente.activo ? 'listo' : 'revision'}
                    >
                      {cliente.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
                    {cliente.contacto || 'Sin persona de contacto'}
                    {cliente.telefono ? ` · ${cliente.telefono}` : ''}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4"
                    onClick={(evento) => abrirFormulario(evento, cliente)}
                  >
                    <Pencil aria-hidden="true" /> Editar cliente
                  </Button>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/45 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
                    <th className="px-6 py-3 font-medium">Documento</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Contacto</th>
                    <th className="px-4 py-3 font-medium">Dirección</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3 text-end font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {clientesFiltrados.map((cliente) => (
                    <tr key={cliente.id} className="hover:bg-muted/35">
                      <td className="px-6 py-4 font-mono text-xs">
                        {etiquetaDocumento(cliente)}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium">{cliente.nombreRazonSocial}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {cliente.nombreComercial || 'Sin nombre comercial'}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        <p>{cliente.contacto || 'Sin contacto'}</p>
                        <p className="mt-1 text-xs">
                          {cliente.email || cliente.telefono || 'Sin datos adicionales'}
                        </p>
                      </td>
                      <td className="max-w-64 px-4 py-4 text-muted-foreground">
                        <p className="truncate">{cliente.direccion || 'Sin registrar'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className="status-label"
                          data-tone={cliente.activo ? 'listo' : 'revision'}
                        >
                          {cliente.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Editar cliente"
                          aria-label={`Editar ${cliente.nombreRazonSocial}`}
                          onClick={(evento) => abrirFormulario(evento, cliente)}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {dialogoAbierto ? (
        <DialogoCliente
          key={clienteSeleccionado?.id ?? 'nuevo'}
          abierto={dialogoAbierto}
          cliente={clienteSeleccionado}
          alCambiarApertura={setDialogoAbierto}
          alGuardar={guardar}
          alRestaurarFoco={() => disparador.current?.focus()}
        />
      ) : null}
    </div>
  )
}
