import type { PruebaReparacion } from '../modelo/reparacion'

export function ResultadosPruebas({ pruebas, cicloActual }: {
  pruebas: PruebaReparacion[]
  cicloActual: number
}) {
  const actuales = pruebas.filter((prueba) => cicloActual > 0 && prueba.ciclo === cicloActual)
  const anteriores = pruebas.filter((prueba) => cicloActual === 0 || prueba.ciclo !== cicloActual)
  const resultado = (prueba: PruebaReparacion) => (
    <article key={prueba.id} className="border bg-muted/20 p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <p className="font-medium">{prueba.tipo}</p>
        <span className={prueba.aprobada ? 'text-primary' : 'text-destructive'}>{prueba.aprobada ? 'Aprobada' : 'Fallida'}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{prueba.ciclo === null ? 'Sin ciclo identificado' : `Ciclo ${prueba.ciclo}`}</p>
      <p className="mt-2 text-sm">{prueba.resultado}</p>
      {prueba.notas ? <p className="mt-2 text-xs text-muted-foreground">{prueba.notas}</p> : null}
    </article>
  )
  return <div className="mt-5 space-y-5">
    <section aria-label="Resultados del ciclo vigente" className="space-y-2">
      <h3 className="font-medium">{cicloActual > 0 ? `Ciclo vigente: ${cicloActual}` : 'Sin ciclo de pruebas iniciado'}</h3>
      {actuales.length ? actuales.map(resultado) : <p className="text-sm text-muted-foreground">No hay pruebas registradas en el ciclo vigente.</p>}
    </section>
    {anteriores.length ? <section aria-label="Historial de pruebas" className="space-y-2 border-t pt-4">
      <h3 className="font-medium">Historial de pruebas</h3>
      <p className="text-sm text-muted-foreground">Estos resultados no corresponden al ciclo vigente y no habilitan la entrega.</p>
      {anteriores.map(resultado)}
    </section> : null}
  </div>
}
