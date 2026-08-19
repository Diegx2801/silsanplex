interface EstadoInicioAplicacionProps {
  titulo: string
  descripcion: string
  pasos?: string[]
  mostrarRecarga?: boolean
}

export function EstadoInicioAplicacion({
  titulo,
  descripcion,
  pasos = [],
  mostrarRecarga = false,
}: EstadoInicioAplicacionProps) {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-12 text-foreground">
      <section
        aria-labelledby="estado-inicio-titulo"
        className="w-full max-w-xl rounded-xl border bg-card p-6 shadow-sm sm:p-8"
      >
        <p className="mb-3 text-sm font-semibold tracking-wide text-primary uppercase">
          SILSANPLEX
        </p>
        <h1
          id="estado-inicio-titulo"
          className="text-2xl font-semibold tracking-tight"
        >
          {titulo}
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">{descripcion}</p>

        {pasos.length > 0 && (
          <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm leading-6">
            {pasos.map((paso) => (
              <li key={paso}>{paso}</li>
            ))}
          </ol>
        )}

        {mostrarRecarga && (
          <button
            type="button"
            className="mt-6 min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={() => window.location.reload()}
          >
            Volver a intentar
          </button>
        )}
      </section>
    </main>
  )
}
