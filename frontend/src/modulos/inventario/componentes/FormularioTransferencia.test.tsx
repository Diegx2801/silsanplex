import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComboboxProps } from '@/components/ui/combobox'
import { FormularioTransferencia } from './FormularioTransferencia'

const mocks = vi.hoisted(() => ({ buckets: vi.fn(), listar: vi.fn() }))
const producto = {
  id: 'a1000000-0000-4000-8000-000000000001',
  codigo: 'P-1',
  descripcion: 'Paracetamol',
  codigoBarras: '',
  unidadMedida: 'Unidad',
  unidadBaseId: 'a2000000-0000-4000-8000-000000000001',
  unidadesEntrada: [
    {
      id: 'a2000000-0000-4000-8000-000000000001',
      nombre: 'Unidad',
      factorConversion: 1,
    },
    {
      id: 'a2000000-0000-4000-8000-000000000002',
      nombre: 'Caja',
      factorConversion: 20,
    },
  ],
  controlLote: true,
  controlVencimiento: true,
}
const almacen = {
  id: 'a3000000-0000-4000-8000-000000000001',
  codigo: 'CENTRAL',
  nombre: 'Almacén central',
  activo: true,
  direccion: '',
}
const ubicaciones = [1, 2].map((id) => ({
  id: `a4000000-0000-4000-8000-00000000000${id}`,
  almacenId: almacen.id,
  codigo: `A-${id}`,
  nombre: `Anaquel ${id}`,
  activa: true,
  descripcion: '',
}))
const bucket = {
  productoId: producto.id,
  almacenId: almacen.id,
  ubicacionId: ubicaciones[0].id,
  ubicacionCodigo: 'A-1',
  ubicacionNombre: 'Anaquel 1',
  almacenCodigo: 'CENTRAL',
  almacenNombre: 'Almacén central',
  productoCodigo: 'P-1',
  productoDescripcion: 'Paracetamol',
  unidadMedida: 'Unidad',
  estadoStock: 'quarantine',
  lote: 'L-25',
  fechaVencimiento: '2027-01-01',
  cantidadFisica: 100,
  cantidadReservada: 20,
  costoPromedio: 0.5,
}

vi.mock('../estado/useBucketsAjusteStock', () => ({
  useBucketsAjusteStock: (...args: unknown[]) => mocks.buckets(...args),
}))
vi.mock('../servicios/inventarioService', () => ({
  listarAlmacenesAjusteStock: (...args: unknown[]) => mocks.listar(...args),
}))
vi.mock('./SelectorProductoInventario', () => ({
  SelectorProductoInventario: ({
    onValueChange,
  }: {
    onValueChange: (id: string, opcion: typeof producto) => void
  }) => (
    <button type="button" onClick={() => onValueChange(producto.id, producto)}>
      Elegir producto
    </button>
  ),
}))
// The shared Combobox is independently tested. This adapter exposes choices
// without duplicating its asynchronous keyboard/search interaction tests here.
vi.mock('@/components/ui/combobox', () => ({
  Combobox: (props: ComboboxProps) => (
    <label>
      {props.label}
      <select
        aria-label={props.label}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) =>
          props.onChange(
            e.target.value,
            (props.id === 'transferencia-origen'
              ? [{ value: almacen.id, label: 'CENTRAL · Almacén central' }]
              : props.options
            ).find((o) => o.value === e.target.value),
          )
        }
      >
        <option value="">Seleccionar</option>
        {(props.id === 'transferencia-origen'
          ? [{ value: almacen.id, label: 'CENTRAL · Almacén central' }]
          : props.options
        ).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  ),
}))

function montar(transferir = vi.fn().mockResolvedValue(undefined)) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FormularioTransferencia
        organizationId="org"
        almacenes={[almacen]}
        ubicaciones={ubicaciones}
        transferir={transferir}
      />
    </QueryClientProvider>,
  )
  return transferir
}
function completar(cantidad = '2') {
  fireEvent.click(screen.getByRole('button', { name: 'Elegir producto' }))
  fireEvent.change(screen.getByLabelText('Almacén de origen'), {
    target: { value: almacen.id },
  })
  const posicion = screen.getByLabelText(
    'Ubicación y lote de origen',
  ) as HTMLSelectElement
  fireEvent.change(posicion, { target: { value: posicion.options[1].value } })
  fireEvent.change(screen.getByLabelText('Almacén de destino'), {
    target: { value: almacen.id },
  })
  fireEvent.change(screen.getByLabelText('Ubicación de destino'), {
    target: { value: ubicaciones[1].id },
  })
  fireEvent.change(screen.getByLabelText('Cantidad a transferir *'), {
    target: { value: cantidad },
  })
  fireEvent.change(screen.getByLabelText('Unidad de medida *'), {
    target: { value: producto.unidadesEntrada[1].id },
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.buckets.mockReturnValue({
    buckets: [bucket],
    consultando: false,
    error: '',
  })
})

describe('FormularioTransferencia', () => {
  it('no pide referencia, lote, vencimiento ni condición manuales', () => {
    montar()
    expect(
      screen.queryByLabelText(/Referencia|Vencimiento|Condición/),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Almacén de origen')).toHaveValue('')
    expect(
      screen.getByRole('button', { name: 'Revisar transferencia' }),
    ).toBeEnabled()
  })
  it('explica el dato faltante al revisar sin completar', () => {
    montar()
    fireEvent.click(
      screen.getByRole('button', { name: 'Revisar transferencia' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Selecciona')
  })
  it('permite reubicar en un único almacén y excluye el anaquel de origen', async () => {
    const guardar = montar()
    completar()
    expect(screen.getByLabelText('Ubicación de destino')).not.toHaveTextContent(
      'Anaquel 1',
    )
    expect(screen.getByText('Se moverán 40 Unidad (2 Caja).')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Revisar transferencia' }),
    )
    expect(guardar).not.toHaveBeenCalled()
    expect(
      screen.getByText('Reubicación dentro del mismo almacén'),
    ).toBeVisible()
    expect(screen.getByText('Equivale a 40 Unidad')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar transferencia' }),
    )
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1))
    expect(guardar.mock.calls[0][0]).toMatchObject({
      almacenOrigenId: almacen.id,
      almacenDestinoId: almacen.id,
      ubicacionOrigenId: ubicaciones[0].id,
      ubicacionDestinoId: ubicaciones[1].id,
      cantidad: '2',
      unidadEntradaId: producto.unidadesEntrada[1].id,
      factorConversionEsperado: 20,
      lote: 'L-25',
      fechaVencimiento: '2027-01-01',
      estado: 'quarantine',
    })
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Transferencia registrada',
      ),
    )
    expect(screen.getByLabelText('Cantidad a transferir *')).toHaveValue('')
  })
  it('descuenta las reservas al validar disponibilidad', () => {
    const guardar = montar()
    completar('5')
    fireEvent.click(
      screen.getByRole('button', { name: 'Revisar transferencia' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('hasta 80 Unidad')
    expect(guardar).not.toHaveBeenCalled()
  })
  it('no mezcla saldos antiguos con otra unidad base en la misma posición', () => {
    mocks.buckets.mockReturnValue({
      buckets: [
        bucket,
        { ...bucket, unidadMedida: 'Caja', cantidadFisica: 50 },
      ],
      consultando: false,
      error: '',
    })
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Elegir producto' }))
    fireEvent.change(screen.getByLabelText('Almacén de origen'), {
      target: { value: almacen.id },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('unidad base anterior')
    expect(
      (screen.getByLabelText('Ubicación y lote de origen') as HTMLSelectElement)
        .options,
    ).toHaveLength(1)
  })
  it('reconoce alias de la misma unidad sin duplicar una posición ni sus reservas', () => {
    mocks.buckets.mockReturnValue({
      buckets: [bucket, { ...bucket, unidadMedida: 'UND', cantidadFisica: 50 }],
      consultando: false,
      error: '',
    })
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Elegir producto' }))
    fireEvent.change(screen.getByLabelText('Almacén de origen'), {
      target: { value: almacen.id },
    })
    const posiciones = screen.getByLabelText(
      'Ubicación y lote de origen',
    ) as HTMLSelectElement
    expect(posiciones.options).toHaveLength(2)
    fireEvent.change(posiciones, {
      target: { value: posiciones.options[1].value },
    })
    expect(screen.getByText('130 Unidad')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('mantiene la operación para reintentar y bloquea el doble clic', async () => {
    let resolver!: (value: string | undefined) => void
    const guardar = montar(
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolver = resolve
          }),
      ),
    )
    completar()
    fireEvent.click(
      screen.getByRole('button', { name: 'Revisar transferencia' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar transferencia' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Transfiriendo…' }))
    expect(guardar).toHaveBeenCalledTimes(1)
    await act(async () => resolver('Stock cambiado. Reintenta.'))
    expect(screen.getByRole('alert')).toHaveTextContent('Stock cambiado')
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar transferencia' }),
    )
    expect(guardar).toHaveBeenCalledTimes(2)
    expect(guardar.mock.calls[0][1]).toBe(guardar.mock.calls[1][1])
    await act(async () => resolver(undefined))
  })
  it('no conserva una posición al cambiar el producto', () => {
    montar()
    completar()
    fireEvent.click(screen.getByRole('button', { name: 'Elegir producto' }))
    expect(screen.getByLabelText('Almacén de origen')).toHaveValue('')
    expect(screen.getByLabelText('Ubicación y lote de origen')).toHaveValue('')
    expect(screen.getByLabelText('Almacén de destino')).toHaveValue('')
  })
  it('muestra un error recuperable ante fallo inesperado sin abandonar la revisión', async () => {
    montar(vi.fn().mockRejectedValue(new Error('network')))
    completar()
    fireEvent.click(
      screen.getByRole('button', { name: 'Revisar transferencia' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar transferencia' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('sin duplicarla'),
    )
    expect(
      screen.getByRole('button', { name: 'Confirmar transferencia' }),
    ).toBeEnabled()
  })
})
