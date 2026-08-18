import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Error 404</p>
        <h1 id="page-title" className="text-3xl font-semibold tracking-tight">
          Página no encontrada
        </h1>
        <p className="text-muted-foreground">
          La dirección solicitada no existe en SILSANPLEX.
        </p>
      </div>
      <Button asChild>
        <Link to="/">Volver al inicio</Link>
      </Button>
    </section>
  )
}
