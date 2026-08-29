import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Search,
} from 'lucide-react'
import {
  type MouseEvent as ReactMouseEvent,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Button } from '@/components/ui/button'
import { PERMISSIONS } from '@/features/auth/permissions'
import { useAuth } from '@/features/auth/useAuth'
import { DialogoProveedor } from '@/modulos/proveedores/componentes/DialogoProveedor'
import { consultarRuc } from '@/modulos/clientes/servicios/rucLookupService'
import { DetalleProveedor } from '@/modulos/proveedores/componentes/DetalleProveedor'
import {
  tiposDocumentoProveedor,
  type DatosProveedor,
  type Proveedor,
} from '@/modulos/proveedores/modelo/proveedor'
import {
  guardarProveedor,
  listarProveedores,
} from '@/modulos/proveedores/servicios/proveedorService'

type FiltroEstado = 'todos' | 'activos' | 'inactivos'
const proveedoresVacios: Proveedor[] = []
const proveedoresPorPagina = 10

const etiquetasDocumento = new Map(
  tiposDocumentoProveedor.map((tipo) => [tipo.valor, tipo.etiqueta]),
)

function normalizar(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE')
}

function etiquetaCondicion(proveedor: Proveedor) {
  return proveedor.condicionCredito === 'contado'
    ? 'Contado'
    : `${proveedor.diasCredito} días`
}

export function ProveedoresPage() {
  const { access, user, hasPermission } = useAuth()
  const queryClient = useQueryClient()
  const organizationId = access?.organizationId ?? ''
  const puedeAdministrar = hasPermission(PERMISSIONS.SUPPLIERS_MANAGE)
  const queryKey = ['suppliers', organizationId] as const
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('activos')
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const [proveedorDetalle, setProveedorDetalle] = useState<Proveedor | null>(null)
  const [pagina, setPagina] = useState(1)
  const [proveedorSeleccionado, setProveedorSeleccionado] =
    useState<Proveedor | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const disparador = useRef<HTMLButtonElement | null>(null)
  const disparadorDetalle = useRef<HTMLButtonElement | null>(null)
  const busquedaDiferida = useDeferredValue(busqueda)

  const proveedoresQuery = useQuery({
    queryKey,
    queryFn: () => listarProveedores(organizationId),
    enabled: Boolean(organizationId),
  })

  const guardarMutation = useMutation({
    mutationFn: ({
      datos,
      proveedorId,
    }: {
      datos: DatosProveedor
      proveedorId?: string
    }) => {
      if (!user) throw new Error('La sesión ya no está disponible.')
      return guardarProveedor(organizationId, user.id, datos, proveedorId)
    },
    onSuccess: async (_proveedor, variables) => {
      await queryClient.invalidateQueries({ queryKey })
      setMensaje(
        variables.proveedorId
          ? 'Proveedor actualizado correctamente.'
          : 'Proveedor registrado correctamente.',
      )
    },
  })

  const proveedores = proveedoresQuery.data ?? proveedoresVacios
  const proveedoresFiltrados = useMemo(() => {
    const termino = normalizar(busquedaDiferida.trim())

    return proveedores.filter((proveedor) => {
      const coincideEstado =
        filtroEstado === 'todos' ||
        (filtroEstado === 'activos' ? proveedor.activo : !proveedor.activo)
      const texto = normalizar(
        [
          proveedor.codigo,
          proveedor.numeroDocumento,
          proveedor.razonSocial,
          proveedor.nombreComercial,
          proveedor.contacto,
        ].join(' '),
      )

      return (
        coincideEstado &&
        (!termino || texto.includes(termino))
      )
    })
  }, [busquedaDiferida, filtroEstado, proveedores])
  const totalPaginas = Math.max(1, Math.ceil(proveedoresFiltrados.length / proveedoresPorPagina))
  const paginaActual = Math.min(pagina, totalPaginas)
  const proveedoresPagina = proveedoresFiltrados.slice(
    (paginaActual - 1) * proveedoresPorPagina,
    paginaActual * proveedoresPorPagina,
  )


  function abrirFormulario(
    evento: ReactMouseEvent<HTMLButtonElement>,
    proveedor: Proveedor | null = null,
  ) {
    disparador.current = evento.currentTarget
    setProveedorSeleccionado(proveedor)
    setMensaje(null)
    guardarMutation.reset()
    setDialogoAbierto(true)
  }

  function abrirDetalle(evento: ReactMouseEvent<HTMLButtonElement>, proveedor: Proveedor) {
    disparadorDetalle.current = evento.currentTarget
    setProveedorDetalle(proveedor)
    setDetalleAbierto(true)
  }

  async function guardar(datos: DatosProveedor, proveedorId?: string) {
    await guardarMutation.mutateAsync({ datos, proveedorId })
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 border-b pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="font-mono text-xs tracking-[0.08em] text-primary uppercase">
            Abastecimiento · Maestro comercial
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            Proveedores
          </h1>
          <p className="mt-3 max-w-[70ch] text-base leading-7 text-muted-foreground">
            Maestro fiscal y comercial para órdenes y compras.
          </p>
        </div>
        {puedeAdministrar ? (
          <Button type="button" size="lg" onClick={(evento) => abrirFormulario(evento)}>
            <Plus aria-hidden="true" /> Registrar proveedor
          </Button>
        ) : null}
      </header>

      {mensaje ? (
        <p role="status" className="border border-primary/30 bg-accent px-4 py-3 text-sm">
          {mensaje}
        </p>
      ) : null}

      <section aria-labelledby="proveedores-title" className="ledger-sheet">
        <div className="grid gap-4 border-b px-5 py-5 sm:px-6 lg:grid-cols-[minmax(12rem,1fr)_minmax(16rem,32rem)_12rem] lg:items-end">
          <div>
            <h2 id="proveedores-title" className="text-lg font-semibold">
              Directorio de proveedores
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {proveedoresFiltrados.length} de {proveedores.length} registros
            </p>
          </div>
          <div>
            <label htmlFor="buscar-proveedor" className="field-label">
              Buscar
            </label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="buscar-proveedor"
                type="search"
                value={busqueda}
                onChange={(evento) => { setBusqueda(evento.target.value); setPagina(1) }}
                className="field-control ps-9"
                placeholder="RUC, DNI, razón social o contacto"
              />
            </div>
          </div>
          <div>
            <label htmlFor="estado-proveedor-filtro" className="field-label">
              Estado
            </label>
            <select
              id="estado-proveedor-filtro"
              value={filtroEstado}
              onChange={(evento) => { setFiltroEstado(evento.target.value as FiltroEstado); setPagina(1) }}
              className="field-control"
            >
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="todos">Todos</option>
            </select>
          </div>
        </div>

        {proveedoresQuery.isLoading ? (
          <p role="status" className="border-t px-6 py-14 text-center text-sm text-muted-foreground">
            Cargando proveedores…
          </p>
        ) : proveedoresQuery.isError ? (
          <div className="border-t px-6 py-14 text-center">
            <p role="alert" className="text-sm text-destructive">
              {proveedoresQuery.error.message}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => void proveedoresQuery.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : !proveedoresFiltrados.length ? (
          <div className="px-5 py-14 text-center sm:px-6">
            <Building2 aria-hidden="true" className="mx-auto size-8 text-primary" />
            <h3 className="mt-4 font-semibold">
              {proveedores.length ? 'No hay coincidencias' : 'Aún no hay proveedores'}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {proveedores.length
                ? 'Prueba con otro término, categoría o estado.'
                : 'Registra el primer proveedor para habilitar el abastecimiento.'}
            </p>
            {!proveedores.length && puedeAdministrar ? (
              <Button type="button" className="mt-5" onClick={(evento) => abrirFormulario(evento)}>
                <Plus aria-hidden="true" /> Registrar proveedor
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="divide-y md:hidden">
              {proveedoresPagina.map((proveedor) => (
                <article key={proveedor.id} className="px-5 py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-primary">
                        {etiquetasDocumento.get(proveedor.tipoDocumento)} {proveedor.numeroDocumento}
                      </p>
                      <h3 className="mt-1 font-semibold">{proveedor.razonSocial}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{proveedor.nombreComercial || 'Sin nombre comercial'}</p>
                    </div>
                    <span className="status-label" data-tone={proveedor.activo ? 'listo' : 'revision'}>
                      {proveedor.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Condición</p>
                      <p className="mt-1">{etiquetaCondicion(proveedor)}</p>
                    </div>
                    <div><p className="text-xs text-muted-foreground">Contacto</p><p className="mt-1">{proveedor.contacto || proveedor.telefono || 'Sin contacto'}</p></div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={(evento) => abrirDetalle(evento, proveedor)}><Eye aria-hidden="true" /> Ver expediente</Button>
                    {puedeAdministrar ? <Button type="button" variant="ghost" onClick={(evento) => abrirFormulario(evento, proveedor)}><Pencil aria-hidden="true" /> Editar</Button> : null}
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[72rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/45 font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
                    <th className="px-6 py-3 font-medium">Documento</th>
                    <th className="px-4 py-3 font-medium">Proveedor</th>
                    <th className="px-4 py-3 font-medium">Dirección fiscal</th>
                    <th className="px-4 py-3 font-medium">Contacto</th>
                    <th className="px-4 py-3 font-medium">Condición</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3 text-end font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {proveedoresPagina.map((proveedor) => (
                    <tr key={proveedor.id} className="hover:bg-muted/35">
                      <td className="px-6 py-4 font-mono text-xs">
                        <p>{etiquetasDocumento.get(proveedor.tipoDocumento)} {proveedor.numeroDocumento}</p>
                        <p className="mt-1 text-muted-foreground">{proveedor.codigo || 'Sin código'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium">{proveedor.razonSocial}</p>
                        <p className="mt-1 max-w-64 truncate text-xs text-muted-foreground">
                          {proveedor.tiposProducto || proveedor.nombreComercial || 'Sin productos clasificados'}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="max-w-56 truncate">{proveedor.direccion || 'Sin registrar'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{proveedor.ubigeo || 'Sin ubigeo'}</p>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        <p>{proveedor.contacto || 'Sin contacto'}</p>
                        <p className="mt-1 text-xs">{proveedor.email || proveedor.telefono || 'Sin datos adicionales'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p>{etiquetaCondicion(proveedor)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{proveedor.estadoContribuyente || 'SUNAT sin verificar'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="status-label" data-tone={proveedor.activo ? 'listo' : 'revision'}>
                          {proveedor.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Ver expediente"
                          aria-label={`Ver expediente de ${proveedor.razonSocial}`}
                          onClick={(evento) => abrirDetalle(evento, proveedor)}
                        >
                          <Eye aria-hidden="true" />
                        </Button>
                        {puedeAdministrar ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Editar proveedor"
                            aria-label={`Editar ${proveedor.razonSocial}`}
                            onClick={(evento) => abrirFormulario(evento, proveedor)}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="flex flex-col gap-3 border-t px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span className="text-muted-foreground">
                {proveedoresFiltrados.length
                  ? `${(paginaActual - 1) * proveedoresPorPagina + 1}–${Math.min(paginaActual * proveedoresPorPagina, proveedoresFiltrados.length)} de ${proveedoresFiltrados.length}`
                  : '0 registros'}
              </span>
              <nav aria-label="Paginación de proveedores" className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" disabled={paginaActual <= 1} onClick={() => setPagina((valor) => Math.max(1, valor - 1))}><ChevronLeft aria-hidden="true" />Anterior</Button>
                <span className="px-2 font-mono text-xs">Página {paginaActual} / {totalPaginas}</span>
                <Button type="button" size="sm" variant="outline" disabled={paginaActual >= totalPaginas} onClick={() => setPagina((valor) => Math.min(totalPaginas, valor + 1))}>Siguiente<ChevronRight aria-hidden="true" /></Button>
              </nav>
            </footer>
          </>
        )}
      </section>

      {dialogoAbierto ? (
        <DialogoProveedor
          key={proveedorSeleccionado?.id ?? 'nuevo'}
          abierto={dialogoAbierto}
          proveedor={proveedorSeleccionado}
          alCambiarApertura={setDialogoAbierto}
          alGuardar={guardar}
          alConsultarRuc={consultarRuc}
          alRestaurarFoco={() => disparador.current?.focus()}
        />
      ) : null}
      {detalleAbierto && proveedorDetalle ? (
        <DetalleProveedor
          key={proveedorDetalle.id}
          abierto={detalleAbierto}
          proveedor={proveedorDetalle}
          puedeGestionar={puedeAdministrar}
          puedeCompletarDevolucion={hasPermission(PERMISSIONS.INVENTORY_MANAGE)}
          alCambiarApertura={setDetalleAbierto}
          alRestaurarFoco={() => disparadorDetalle.current?.focus()}
        />
      ) : null}
    </div>
  )
}
