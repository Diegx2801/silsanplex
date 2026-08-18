import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <section aria-labelledby="page-title" className="max-w-3xl">
      <p className="font-mono text-sm tabular-nums text-primary">ERROR 404</p>
      <h1
        id="page-title"
        className="mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl"
      >
        Página no encontrada
      </h1>
      <p className="mt-4 text-muted-foreground">
        La dirección solicitada no existe en SILSANPLEX.
      </p>
      <Button asChild className="mt-8">
        <Link to="/">
          <ArrowLeft aria-hidden="true" />
          Volver al inicio
        </Link>
      </Button>
    </section>
  )
}
