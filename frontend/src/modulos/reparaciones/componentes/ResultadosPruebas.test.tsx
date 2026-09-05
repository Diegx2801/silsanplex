import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { PruebaReparacion } from '../modelo/reparacion'
import { ResultadosPruebas } from './ResultadosPruebas'

function prueba(id: string, ciclo: number | null, aprobada: boolean): PruebaReparacion {
  return { id, ciclo, aprobada, tipo: id, resultado: 'Resultado', notas: '', organizationId: 'org', reparacionId: 'repair', realizadaPor: 'user', completadaEn: '', creadoPor: 'user', creadoEn: '' }
}

it('separa aprobaciones y fallos anteriores de los resultados vigentes y conserva los históricos sin ciclo', () => {
  render(<ResultadosPruebas cicloActual={2} pruebas={[prueba('Aprobación anterior', 1, true), prueba('Fallo anterior', 1, false), prueba('Legado', null, true), prueba('Prueba actual', 2, true)]} />)
  const vigente = within(screen.getByRole('region', { name: 'Resultados del ciclo vigente' }))
  expect(vigente.getByText('Ciclo vigente: 2')).toBeInTheDocument()
  expect(vigente.getByText('Prueba actual')).toBeInTheDocument()
  expect(vigente.queryByText('Aprobación anterior')).not.toBeInTheDocument()
  const historial = within(screen.getByRole('region', { name: 'Historial de pruebas' }))
  expect(historial.getByText('Aprobación anterior')).toBeInTheDocument()
  expect(historial.getByText('Fallo anterior')).toBeInTheDocument()
  expect(historial.getByText('Sin ciclo identificado')).toBeInTheDocument()
})

it('no presenta una aprobación anterior como resultado de un nuevo ciclo vacío', () => {
  render(<ResultadosPruebas cicloActual={3} pruebas={[prueba('Anterior', 2, true)]} />)
  expect(within(screen.getByRole('region', { name: 'Resultados del ciclo vigente' })).getByText('No hay pruebas registradas en el ciclo vigente.')).toBeInTheDocument()
})

it('distingue una reparación que todavía no inició pruebas', () => {
  render(<ResultadosPruebas cicloActual={0} pruebas={[]} />)
  expect(screen.getByText('Sin ciclo de pruebas iniciado')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Historial de pruebas' })).not.toBeInTheDocument()
})
