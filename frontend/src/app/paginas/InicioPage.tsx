const preparacion = [
  {
    area: 'Frontend',
    detalle: 'React, rutas y sistema visual',
    estado: 'Preparado',
    tono: 'listo',
  },
  {
    area: 'Supabase',
    detalle: 'Acceso empresarial y configuración',
    estado: 'Pendiente',
    tono: 'pendiente',
  },
  {
    area: 'Identidad',
    detalle: 'Logotipo y colores corporativos',
    estado: 'Por confirmar',
    tono: 'revision',
  },
] as const

const rutaImplementacion = [
  ['Base técnica', 'Completada'],
  ['Layout administrativo', 'En construcción'],
  ['Supabase y autenticación', 'Pendiente de acceso'],
  ['Módulos operativos', 'Planificados'],
] as const

export function InicioPage() {
  return (
    <div className="space-y-10">
      <header className="max-w-3xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
          Centro de operaciones
        </h1>
        <p className="max-w-[68ch] text-base leading-7 text-muted-foreground">
          Esta portada muestra únicamente el estado real de preparación de
          SILSANPLEX. Los indicadores operativos aparecerán cuando existan datos
          confiables para respaldarlos.
        </p>
      </header>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="preparacion-title" className="ledger-sheet">
          <div className="flex items-end justify-between gap-4 border-b px-5 py-4 sm:px-6">
            <div>
              <h2 id="preparacion-title" className="text-lg font-semibold">
                Registro de preparación
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Estado técnico y dependencias externas
              </p>
            </div>
            <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:block">
              ACTUAL
            </span>
          </div>

          <div className="divide-y">
            {preparacion.map((registro) => (
              <div
                key={registro.area}
                className="grid gap-3 px-5 py-5 sm:grid-cols-[9rem_minmax(0,1fr)_8rem] sm:items-center sm:px-6"
              >
                <p className="font-medium">{registro.area}</p>
                <p className="text-sm text-muted-foreground">
                  {registro.detalle}
                </p>
                <span
                  className="status-label justify-self-start sm:justify-self-end"
                  data-tone={registro.tono}
                >
                  {registro.estado}
                </span>
              </div>
            ))}
          </div>
        </section>

        <aside aria-labelledby="ruta-title" className="border-t-2 border-primary pt-5">
          <h2 id="ruta-title" className="text-lg font-semibold">
            Ruta de implementación
          </h2>
          <ol className="mt-5 space-y-0">
            {rutaImplementacion.map(([paso, estado], indice) => (
              <li
                key={paso}
                className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-t py-4 first:border-t-0 first:pt-0"
              >
                <span className="font-mono text-xs tabular-nums text-primary">
                  {String(indice + 1).padStart(2, '0')}
                </span>
                <div>
                  <p className="text-sm font-medium">{paso}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{estado}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <section aria-labelledby="accesos-title" className="border-y py-6">
        <div className="grid gap-3 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-8">
          <h2 id="accesos-title" className="font-semibold">
            Accesos frecuentes
          </h2>
          <p className="max-w-[68ch] text-sm leading-6 text-muted-foreground">
            Se configurarán cuando administración confirme sus tareas más
            frecuentes. La navegación ya está preparada para cambiar el orden
            sin modificar la arquitectura.
          </p>
        </div>
      </section>
    </div>
  )
}
