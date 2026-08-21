import { zodResolver } from '@hookform/resolvers/zod'
import { Landmark, PackageCheck, ShieldCheck, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  categoriasProveedor,
  esquemaDatosProveedor,
  estadosSunatProveedor,
  frecuenciasEntregaProveedor,
  proveedorAFormulario,
  proveedorInicial,
  tiposDocumentoProveedor,
  type DatosProveedor,
  type Proveedor,
} from '@/modulos/proveedores/modelo/proveedor'

interface DialogoProveedorProps {
  abierto: boolean
  proveedor: Proveedor | null
  alCambiarApertura: (abierto: boolean) => void
  alGuardar: (datos: DatosProveedor, proveedorId?: string) => Promise<void>
  alRestaurarFoco: () => void
}

export function DialogoProveedor({
  abierto,
  proveedor,
  alCambiarApertura,
  alGuardar,
  alRestaurarFoco,
}: DialogoProveedorProps) {
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DatosProveedor>({
    resolver: zodResolver(esquemaDatosProveedor),
    defaultValues: proveedor ? proveedorAFormulario(proveedor) : proveedorInicial,
  })

  const condicionCredito = watch('condicionCredito')
  const registroCondicionCredito = register('condicionCredito')

  async function guardar(datos: DatosProveedor) {
    try {
      await alGuardar(datos, proveedor?.id)
      alCambiarApertura(false)
    } catch (error) {
      setError('root.server', {
        message:
          error instanceof Error
            ? error.message
            : 'No se pudo guardar el proveedor.',
      })
    }
  }

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={alCambiarApertura}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
        <DialogPrimitive.Content
          className="fixed start-1/2 top-1/2 z-50 max-h-[94svh] w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto border bg-background shadow-xl outline-none"
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            alRestaurarFoco()
          }}
        >
          <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-background px-5 py-5 sm:px-7">
            <div>
              <p className="font-mono text-[0.68rem] tracking-[0.08em] text-primary uppercase">
                Maestro de abastecimiento
              </p>
              <DialogPrimitive.Title className="mt-1 text-xl font-semibold tracking-[-0.025em]">
                {proveedor ? 'Editar proveedor' : 'Registrar proveedor'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                Identidad fiscal, relación comercial y clasificación en una sola ficha.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar formulario de proveedor"
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </header>

          <form id="formulario-proveedor" onSubmit={handleSubmit(guardar)}>
            <section aria-labelledby="identidad-proveedor" className="px-5 py-6 sm:px-7">
              <div className="mb-5 flex items-center gap-3 border-b pb-3">
                <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
                <div>
                  <h2 id="identidad-proveedor" className="font-semibold">
                    Identidad fiscal
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Los campos marcados con * son obligatorios.
                  </p>
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor="codigo-proveedor" className="field-label">
                    Código interno
                  </label>
                  <input
                    id="codigo-proveedor"
                    autoFocus
                    autoComplete="off"
                    placeholder="PRV-001"
                    className="field-control uppercase"
                    aria-invalid={Boolean(errors.codigo)}
                    {...register('codigo')}
                  />
                  {errors.codigo ? <p className="field-error">{errors.codigo.message}</p> : null}
                </div>
                <div>
                  <label htmlFor="tipo-documento-proveedor" className="field-label">
                    Tipo de documento *
                  </label>
                  <select
                    id="tipo-documento-proveedor"
                    className="field-control"
                    {...register('tipoDocumento')}
                  >
                    {tiposDocumentoProveedor.map((tipo) => (
                      <option key={tipo.valor} value={tipo.valor}>
                        {tipo.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="documento-proveedor" className="field-label">
                    Número de documento *
                  </label>
                  <input
                    id="documento-proveedor"
                    autoComplete="off"
                    className="field-control uppercase"
                    aria-invalid={Boolean(errors.numeroDocumento)}
                    {...register('numeroDocumento')}
                  />
                  {errors.numeroDocumento ? (
                    <p className="field-error">{errors.numeroDocumento.message}</p>
                  ) : null}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="razon-social-proveedor" className="field-label">
                    Razón social o nombre *
                  </label>
                  <input
                    id="razon-social-proveedor"
                    autoComplete="organization"
                    className="field-control"
                    aria-invalid={Boolean(errors.razonSocial)}
                    {...register('razonSocial')}
                  />
                  {errors.razonSocial ? (
                    <p className="field-error">{errors.razonSocial.message}</p>
                  ) : null}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="nombre-comercial-proveedor" className="field-label">
                    Nombre comercial
                  </label>
                  <input
                    id="nombre-comercial-proveedor"
                    className="field-control"
                    {...register('nombreComercial')}
                  />
                </div>
                <div>
                  <label htmlFor="estado-sunat-proveedor" className="field-label">
                    Estado SUNAT
                  </label>
                  <select
                    id="estado-sunat-proveedor"
                    className="field-control"
                    {...register('estadoSunat')}
                  >
                    {estadosSunatProveedor.map((estado) => (
                      <option key={estado.valor} value={estado.valor}>
                        {estado.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label htmlFor="direccion-proveedor" className="field-label">
                    Dirección fiscal
                  </label>
                  <input
                    id="direccion-proveedor"
                    autoComplete="street-address"
                    className="field-control"
                    {...register('direccion')}
                  />
                </div>
              </div>
            </section>

            <section aria-labelledby="relacion-proveedor" className="border-t px-5 py-6 sm:px-7">
              <div className="mb-5 flex items-center gap-3 border-b pb-3">
                <PackageCheck aria-hidden="true" className="size-5 text-primary" />
                <div>
                  <h2 id="relacion-proveedor" className="font-semibold">
                    Relación y clasificación
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Describe qué suministra y cómo responde operativamente.
                  </p>
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor="categoria-proveedor" className="field-label">
                    Categoría
                  </label>
                  <select
                    id="categoria-proveedor"
                    className="field-control"
                    {...register('categoria')}
                  >
                    {categoriasProveedor.map((categoria) => (
                      <option key={categoria.valor} value={categoria.valor}>
                        {categoria.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="frecuencia-proveedor" className="field-label">
                    Frecuencia de entrega
                  </label>
                  <select
                    id="frecuencia-proveedor"
                    className="field-control"
                    {...register('frecuenciaEntrega')}
                  >
                    {frecuenciasEntregaProveedor.map((frecuencia) => (
                      <option key={frecuencia.valor} value={frecuencia.valor}>
                        {frecuencia.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="desempeno-proveedor" className="field-label">
                    Desempeño
                  </label>
                  <select
                    id="desempeno-proveedor"
                    className="field-control"
                    {...register('calificacionDesempeno')}
                  >
                    <option value="">Sin evaluar</option>
                    <option value="1">1 · Deficiente</option>
                    <option value="2">2 · Bajo</option>
                    <option value="3">3 · Regular</option>
                    <option value="4">4 · Bueno</option>
                    <option value="5">5 · Excelente</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="zona-proveedor" className="field-label">
                    Zona geográfica
                  </label>
                  <input
                    id="zona-proveedor"
                    className="field-control"
                    placeholder="La Libertad · Trujillo"
                    {...register('zonaGeografica')}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label htmlFor="productos-proveedor" className="field-label">
                    Productos que suministra
                  </label>
                  <input
                    id="productos-proveedor"
                    className="field-control"
                    placeholder="Medicamentos, material médico, mobiliario…"
                    {...register('tiposProducto')}
                  />
                </div>
                <div>
                  <label htmlFor="contacto-proveedor" className="field-label">
                    Persona de contacto
                  </label>
                  <input
                    id="contacto-proveedor"
                    autoComplete="name"
                    className="field-control"
                    {...register('contacto')}
                  />
                </div>
                <div>
                  <label htmlFor="cargo-contacto-proveedor" className="field-label">
                    Cargo
                  </label>
                  <input
                    id="cargo-contacto-proveedor"
                    className="field-control"
                    {...register('cargoContacto')}
                  />
                </div>
                <div>
                  <label htmlFor="telefono-proveedor" className="field-label">
                    Teléfono
                  </label>
                  <input
                    id="telefono-proveedor"
                    inputMode="tel"
                    autoComplete="tel"
                    className="field-control"
                    {...register('telefono')}
                  />
                </div>
                <div>
                  <label htmlFor="email-proveedor" className="field-label">
                    Correo
                  </label>
                  <input
                    id="email-proveedor"
                    type="email"
                    autoComplete="email"
                    className="field-control"
                    aria-invalid={Boolean(errors.email)}
                    {...register('email')}
                  />
                  {errors.email ? <p className="field-error">{errors.email.message}</p> : null}
                </div>
              </div>
            </section>

            <section aria-labelledby="credito-proveedor" className="border-t px-5 py-6 sm:px-7">
              <div className="mb-5 flex items-center gap-3 border-b pb-3">
                <Landmark aria-hidden="true" className="size-5 text-primary" />
                <div>
                  <h2 id="credito-proveedor" className="font-semibold">
                    Condiciones comerciales
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Información para compras y pagos; no se muestra en listados generales.
                  </p>
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor="condicion-proveedor" className="field-label">
                    Condición de pago
                  </label>
                  <select
                    id="condicion-proveedor"
                    className="field-control"
                    {...registroCondicionCredito}
                    onChange={(evento) => {
                      void registroCondicionCredito.onChange(evento)
                      if (evento.target.value === 'contado') {
                        setValue('diasCredito', '0', { shouldValidate: true })
                      }
                    }}
                  >
                    <option value="contado">Contado</option>
                    <option value="credito">Crédito</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="dias-credito-proveedor" className="field-label">
                    Días de crédito
                  </label>
                  <input
                    id="dias-credito-proveedor"
                    inputMode="numeric"
                    disabled={condicionCredito === 'contado'}
                    className="field-control disabled:bg-muted disabled:text-muted-foreground"
                    aria-invalid={Boolean(errors.diasCredito)}
                    {...register('diasCredito')}
                  />
                  {errors.diasCredito ? (
                    <p className="field-error">{errors.diasCredito.message}</p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor="moneda-proveedor" className="field-label">
                    Moneda habitual
                  </label>
                  <select
                    id="moneda-proveedor"
                    className="field-control"
                    {...register('moneda')}
                  >
                    <option value="PEN">Soles (PEN)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="banco-proveedor" className="field-label">
                    Banco
                  </label>
                  <input id="banco-proveedor" className="field-control" {...register('banco')} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="cuenta-proveedor" className="field-label">
                    Cuenta bancaria / CCI
                  </label>
                  <input
                    id="cuenta-proveedor"
                    autoComplete="off"
                    className="field-control"
                    placeholder={proveedor ? 'Escribe solo para reemplazar la cuenta' : undefined}
                    {...register('cuentaBancaria')}
                  />
                  {proveedor ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Por seguridad, la cuenta guardada no se vuelve a mostrar.
                    </p>
                  ) : null}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="detraccion-proveedor" className="field-label">
                    Cuenta de detracción
                  </label>
                  <input
                    id="detraccion-proveedor"
                    autoComplete="off"
                    className="field-control"
                    placeholder={proveedor ? 'Escribe solo para reemplazar la cuenta' : undefined}
                    {...register('cuentaDetraccion')}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label htmlFor="observaciones-proveedor" className="field-label">
                    Observaciones
                  </label>
                  <textarea
                    id="observaciones-proveedor"
                    rows={3}
                    className="field-control py-2"
                    {...register('observaciones')}
                  />
                </div>
              </div>
              <label className="mt-5 flex items-start gap-3 border-t pt-5">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  {...register('activo')}
                />
                <span>
                  <span className="block text-sm font-medium">Proveedor activo</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Los proveedores inactivos conservan historial, pero no pueden usarse en nuevas compras.
                  </span>
                </span>
              </label>
            </section>

            {errors.root?.server ? (
              <p role="alert" className="border-t bg-destructive/5 px-5 py-4 text-sm text-destructive sm:px-7">
                {errors.root.server.message}
              </p>
            ) : null}
          </form>

          <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t bg-background px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="outline" size="lg">
                Cancelar
              </Button>
            </DialogPrimitive.Close>
            <Button
              type="submit"
              form="formulario-proveedor"
              size="lg"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Guardando…'
                : proveedor
                  ? 'Guardar cambios'
                  : 'Registrar proveedor'}
            </Button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
