import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Pencil, Plus, Search } from 'lucide-react'
import { type MouseEvent, useDeferredValue, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'
import { PERMISSIONS } from '@/features/auth/permissions'
import { DialogoCliente } from '@/modulos/clientes/componentes/DialogoCliente'
import type { Cliente, DatosCliente } from '@/modulos/clientes/modelo/cliente'
import { cambiarEstadoCliente, guardarCliente, listarClientes, listarTodosLosClientes, type EstadoFiltroCliente } from '@/modulos/clientes/servicios/customerService'
import { exportarClientes } from '@/modulos/clientes/servicios/exportarClientes'
import { consultarRuc } from '@/modulos/clientes/servicios/rucLookupService'

const POR_PAGINA = 25
export function ClientesPage() {
  const { hasPermission } = useAuth(); const queryClient = useQueryClient()
  const puedeGestionar = hasPermission(PERMISSIONS.CUSTOMERS_MANAGE); const puedeExportar = hasPermission(PERMISSIONS.CUSTOMERS_EXPORT)
  const [busqueda, setBusqueda] = useState(''); const busquedaDiferida = useDeferredValue(busqueda)
  const [estado, setEstado] = useState<EstadoFiltroCliente>('activos'); const [pagina, setPagina] = useState(1)
  const [seleccionado, setSeleccionado] = useState<Cliente | null>(null); const [abierto, setAbierto] = useState(false)
  const [mensaje, setMensaje] = useState(''); const disparador = useRef<HTMLButtonElement | null>(null)
  const filtros = { busqueda: busquedaDiferida, estado, pagina, porPagina: POR_PAGINA }
  const consulta = useQuery({ queryKey: ['customers', 'list', filtros], queryFn: () => listarClientes(filtros) })
  const actualizar = () => queryClient.invalidateQueries({ queryKey: ['customers'] })
  const guardarMutacion = useMutation({ mutationFn: ({ datos, id }: { datos: DatosCliente; id?: string }) => guardarCliente(datos, id), onSuccess: actualizar })
  const estadoMutacion = useMutation({ mutationFn: ({ id, activo }: { id: string; activo: boolean }) => cambiarEstadoCliente(id, activo), onSuccess: actualizar })
  const abrir = (evento: MouseEvent<HTMLButtonElement>, cliente: Cliente | null = null) => { disparador.current = evento.currentTarget; setSeleccionado(cliente); setAbierto(true) }
  const guardar = async (datos: DatosCliente, id?: string) => { await guardarMutacion.mutateAsync({ datos, id }); setMensaje(id ? 'Cliente actualizado.' : 'Cliente registrado.') }
  const clientes = consulta.data?.clientes ?? []; const total = consulta.data?.total ?? 0; const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const descargar = async () => { try { const todos = await listarTodosLosClientes({ busqueda: busquedaDiferida, estado }); await exportarClientes(todos); setMensaje('Archivo de clientes generado.') } catch { setMensaje('No se pudo exportar el directorio.') } }

  return <div className="space-y-8">
    <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between"><div><span className="font-mono text-xs tracking-[.08em] text-primary uppercase">Base comercial</span><h1 className="mt-2 text-3xl font-semibold">Clientes</h1><p className="mt-3 text-muted-foreground">Maestro fiscal y de contacto para cotizaciones, pedidos y ventas.</p></div><div className="flex gap-2">{puedeExportar ? <Button variant="outline" onClick={() => void descargar()} disabled={!total}><Download /> Exportar</Button> : null}{puedeGestionar ? <Button onClick={(e) => abrir(e)}><Plus /> Registrar cliente</Button> : null}</div></header>
    <p role="status" aria-live="polite" className={mensaje ? 'border border-primary/30 bg-primary/5 px-4 py-3 text-sm' : 'sr-only'}>{mensaje}</p>
    <section className="ledger-sheet" aria-labelledby="clientes-title"><div className="grid gap-4 border-b px-5 py-5 lg:grid-cols-[1fr_18rem_12rem] lg:items-end"><div><h2 id="clientes-title" className="text-lg font-semibold">Directorio</h2><p className="text-sm text-muted-foreground">{total} registros</p></div><label><span className="field-label">Buscar</span><span className="relative block"><Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2" /><input type="search" className="field-control ps-9" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(1) }} placeholder="Documento o razón social" /></span></label><label><span className="field-label">Estado</span><select className="field-control" value={estado} onChange={(e) => { setEstado(e.target.value as EstadoFiltroCliente); setPagina(1) }}><option value="activos">Activos</option><option value="inactivos">Inactivos</option><option value="todos">Todos</option></select></label></div>
      {consulta.isLoading ? <p className="py-14 text-center text-sm text-muted-foreground">Cargando clientes…</p> : consulta.isError ? <div className="py-14 text-center"><p className="text-sm text-destructive">No se pudo cargar el directorio.</p><Button className="mt-3" variant="outline" onClick={() => void consulta.refetch()}>Reintentar</Button></div> : clientes.length === 0 ? <p className="py-14 text-center text-sm text-muted-foreground">No hay clientes para los filtros seleccionados.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[68rem] text-left text-sm"><thead className="border-b bg-muted/45"><tr><th className="px-5 py-3">Documento</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Contacto</th><th className="px-4 py-3">Dirección fiscal</th><th className="px-4 py-3">SUNAT</th><th className="px-4 py-3">Estado</th><th className="px-5 py-3 text-end">Acciones</th></tr></thead><tbody className="divide-y">{clientes.map((cliente) => <tr key={cliente.id}><td className="px-5 py-4 font-mono text-xs">{cliente.tipoDocumento.toUpperCase()} {cliente.numeroDocumento}</td><td className="px-4 py-4"><strong>{cliente.nombreRazonSocial}</strong><p className="text-xs text-muted-foreground">{cliente.nombreComercial || 'Sin nombre comercial'}</p></td><td className="px-4 py-4">{cliente.contacto || cliente.email || cliente.telefono || 'Sin registrar'}</td><td className="max-w-64 px-4 py-4"><p className="truncate">{cliente.direccion || 'Sin registrar'}</p></td><td className="px-4 py-4">{cliente.estadoSunat || 'Sin verificar'}</td><td className="px-4 py-4"><span className="status-label" data-tone={cliente.activo ? 'listo' : 'revision'}>{cliente.activo ? 'Activo' : 'Inactivo'}</span></td><td className="px-5 py-4 text-end">{puedeGestionar ? <><Button variant="ghost" size="icon" aria-label={`Editar ${cliente.nombreRazonSocial}`} onClick={(e) => abrir(e, cliente)}><Pencil /></Button><Button variant="ghost" disabled={estadoMutacion.isPending} onClick={() => void estadoMutacion.mutateAsync({ id: cliente.id, activo: !cliente.activo })}>{cliente.activo ? 'Desactivar' : 'Activar'}</Button></> : null}</td></tr>)}</tbody></table></div>}
      <footer className="flex items-center justify-between border-t px-5 py-4 text-sm"><span>Página {pagina} de {paginas}</span><div className="flex gap-2"><Button variant="outline" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Button><Button variant="outline" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</Button></div></footer>
    </section>
    {abierto ? <DialogoCliente key={seleccionado?.id ?? 'nuevo'} abierto={abierto} cliente={seleccionado} alCambiarApertura={setAbierto} alGuardar={guardar} alConsultarRuc={consultarRuc} alRestaurarFoco={() => disparador.current?.focus()} /> : null}
  </div>
}
