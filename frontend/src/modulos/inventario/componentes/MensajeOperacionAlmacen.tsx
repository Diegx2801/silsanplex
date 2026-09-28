export function MensajeOperacionAlmacen({ texto }: { texto: string }) {
  return texto ? (
    <p role="status" className="text-sm text-muted-foreground">
      {texto}
    </p>
  ) : null
}
