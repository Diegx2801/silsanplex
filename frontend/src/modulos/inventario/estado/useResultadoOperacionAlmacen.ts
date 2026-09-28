import { useRef, useState } from 'react'

export const valorFormulario = (formulario: FormData, campo: string) =>
  String(formulario.get(campo) ?? '')

export function useResultadoOperacionAlmacen() {
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)
  const ejecutar = async (
    accion: () => Promise<string | undefined>,
    exito: string,
  ) => {
    if (enCurso.current) return
    enCurso.current = true
    setGuardando(true)
    try {
      const error = await accion()
      setMensaje(error ?? exito)
    } catch {
      setMensaje('No se pudo completar la operación. Revisa el historial antes de volver a intentarlo.')
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }
  const resolver = async <T,>(
    resultado:
      | { success: true; data: T }
      | { success: false; error: { issues: { message: string }[] } },
    accion: (datos: T) => Promise<string | undefined>,
    exito: string,
  ) => {
    if (!resultado.success) {
      setMensaje(
        resultado.error.issues[0]?.message ?? 'Revisa los datos ingresados.',
      )
      return
    }
    await ejecutar(() => accion(resultado.data), exito)
  }
  return { mensaje, guardando, resolver, ejecutar }
}
