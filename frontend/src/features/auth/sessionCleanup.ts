const CLAVE_APLICACION = 'silsanplex.'

export function limpiarDatosTemporalesDeSesion(
  almacenamiento: Pick<Storage, 'length' | 'key' | 'removeItem'>,
) {
  const claves: string[] = []

  for (let indice = 0; indice < almacenamiento.length; indice += 1) {
    const clave = almacenamiento.key(indice)
    if (clave?.startsWith(CLAVE_APLICACION)) claves.push(clave)
  }

  for (const clave of claves) almacenamiento.removeItem(clave)
}
