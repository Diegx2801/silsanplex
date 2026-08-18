import {
  ArrowRight,
  Boxes,
  Database,
  FileSpreadsheet,
  PackagePlus,
  PackageSearch,
  ReceiptText,
  ShoppingCart,
  Users,
} from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { useProductosTemporales } from '@/modulos/productos/estado/useProductosTemporales'
import { resumirProductos } from '@/modulos/productos/modelo/producto'

const formatoEntero = new Intl.NumberFormat('es-PE')

const modulos = [
  {
    nombre: 'Productos',
    detalle: 'Registro, edición y revisión previa de archivos',
    estado: 'Disponible',
    tono: 'listo',
    icono: PackageSearch,
    ruta: '/productos',
  },
  {
    nombre: 'Inventario',
    detalle: 'Almacenes, ubicaciones, lotes y movimientos',
    estado: 'Por definir',
    tono: 'revision',
    icono: Boxes,
  },
  {
    nombre: 'Compras',
    detalle: 'Proveedores, órdenes y recepciones',
    estado: 'Planificado',
    tono: 'pendiente',
    icono: ShoppingCart,
  },
  {
    nombre: 'Ventas',
    detalle: 'Clientes, cotizaciones, pedidos y despacho',
    estado: 'Planificado',
    tono: 'pendiente',
    icono: ReceiptText,
  },
] as const

const dependencias = [
  {
    nombre: 'Base de datos',
    detalle: 'Credenciales empresariales de Supabase',
    icono: Database,
  },
  {
    nombre: 'Usuarios y permisos',
    detalle: 'Roles y responsabilidades por confirmar',
    icono: Users,
  },
] as const

export function InicioPage() {
  const { productos } = useProductosTemporales()
  const resumen = resumirProductos(productos)
  const hayProductos = resumen.total > 0

  return (
    <div className="space-y-8 sm:space-y-10">
      <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            Centro de operaciones
          </h1>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted-foreground">
            Resumen administrativo basado únicamente en la información
            disponible durante esta sesión. Los indicadores operativos se
            incorporarán cuando exista una fuente empresarial confiable.
          </p>
        </div>
        <span
          className="status-label self-start sm:self-end"
          data-tone="revision"
        >
          Sesión local
        </span>
      </header>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="catalogo-title" className="ledger-sheet">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b px-5 py-4 sm:px-6">
            <div>
              <h2 id="catalogo-title" className="text-lg font-semibold">
                Catálogo en esta sesión
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Datos temporales del navegador actual
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              PRODUCTOS
            </span>
          </div>

          <div className="grid sm:grid-cols-3">
            {[
              ['Total registrado', resumen.total],
              ['Activos', resumen.activos],
              ['Inactivos', resumen.inactivos],
            ].map(([etiqueta, cantidad]) => (
              <div
                key={etiqueta}
                className="border-b px-5 py-5 last:border-b-0 sm:border-e sm:border-b-0 sm:last:border-e-0 sm:px-6"
              >
                <p className="font-mono text-[0.68rem] tracking-[0.08em] text-muted-foreground uppercase">
                  {etiqueta}
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                  {formatoEntero.format(Number(cantidad))}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t px-5 py-4 sm:px-6">
            <p className="text-sm leading-6 text-muted-foreground">
              {hayProductos
                ? 'El conteo refleja los productos guardados temporalmente en esta sesión.'
                : 'Aún no hay productos en esta sesión. Puedes registrar uno o revisar los archivos exportados.'}
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <Button asChild variant="outline">
              <Link to="/productos">
                <PackageSearch aria-hidden="true" />
                Abrir catálogo
              </Link>
            </Button>
            <Button asChild>
              <Link to="/productos?nuevo=1">
                <PackagePlus aria-hidden="true" />
                Registrar producto
              </Link>
            </Button>
          </div>
        </section>

        <aside aria-labelledby="siguiente-paso-title" className="border-t-2 border-primary pt-5">
          <h2 id="siguiente-paso-title" className="text-lg font-semibold">
            Siguiente paso recomendado
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {hayProductos
              ? 'Compara el catálogo exportado y sus precios antes de definir la migración definitiva.'
              : 'Revisa los archivos exportados para conocer conflictos y decisiones pendientes del catálogo.'}
          </p>
          <Button asChild variant="outline" className="mt-5 w-full">
            <Link to="/productos/importar">
              <FileSpreadsheet aria-hidden="true" />
              Revisar importación
            </Link>
          </Button>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            La revisión ocurre localmente y no guarda ni modifica información.
          </p>
        </aside>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="modulos-title" className="ledger-sheet">
          <div className="border-b px-5 py-4 sm:px-6">
            <h2 id="modulos-title" className="text-lg font-semibold">
              Estado de módulos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Disponibilidad real de la primera etapa
            </p>
          </div>

          <div className="divide-y">
            {modulos.map((modulo) => {
              const Icono = modulo.icono

              return (
                <article
                  key={modulo.nombre}
                  className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                      <Icono aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-medium">{modulo.nombre}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {modulo.detalle}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="status-label" data-tone={modulo.tono}>
                      {modulo.estado}
                    </span>
                    {'ruta' in modulo ? (
                      <Button asChild variant="ghost" size="icon">
                        <Link
                          to={modulo.ruta}
                          aria-label={`Abrir módulo ${modulo.nombre}`}
                          title={`Abrir ${modulo.nombre}`}
                        >
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <aside aria-labelledby="dependencias-title">
          <h2 id="dependencias-title" className="text-lg font-semibold">
            Dependencias pendientes
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Información que debe proporcionar o confirmar la empresa.
          </p>
          <div className="mt-5 divide-y border-y">
            {dependencias.map((dependencia) => {
              const Icono = dependencia.icono

              return (
                <div key={dependencia.nombre} className="flex gap-3 py-4">
                  <Icono
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <div>
                    <p className="text-sm font-medium">{dependencia.nombre}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {dependencia.detalle}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
      </div>
    </div>
  )
}
