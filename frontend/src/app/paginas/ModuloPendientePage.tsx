import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

interface ModuloPendientePageProps {
  titulo: string
  descripcion: string
}

export function ModuloPendientePage({
  titulo,
  descripcion,
}: ModuloPendientePageProps) {
  return (
    <section aria-labelledby="page-title" className="max-w-3xl">
      <span className="status-label" data-tone="pendiente">
        Módulo planificado
      </span>
      <h1
        id="page-title"
        className="mt-5 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl"
      >
        {titulo}
      </h1>
      <p className="mt-4 max-w-[68ch] text-base leading-7 text-muted-foreground">
        {descripcion}. Esta ruta ya forma parte de la navegación, pero todavía
        no contiene lógica, formularios ni datos simulados.
      </p>
      <Button asChild variant="outline" className="mt-8">
        <Link to="/">
          <ArrowLeft aria-hidden="true" />
          Volver al inicio
        </Link>
      </Button>
    </section>
  )
}
