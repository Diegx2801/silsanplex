import { fechaLocalActual } from '@/modulos/ventas/modelo/operacionVenta'

export type ComandoIdempotentePendiente = { operationKey: string; id: string }

export type PerfilFormulario = {
  ruc: string
  nombre: string
  direccion: string
  distrito: string
  provincia: string
  departamento: string
  ubigeo: string
  establecimiento: string
}

export interface BorradorEmisionSandbox {
  selectedProfileId: string
  profileForm: PerfilFormulario
  profileFormDirty: boolean
  documentType: '01' | '03'
  editorSeriesId: string
  preparationSeriesId: string
  seriesCode: string
  nextNumber: string
  seriesEnabled: boolean
  seriesFormDirty: boolean
  saleId: string
  issueDate: string
  paymentKind: 'contado' | 'credito'
  outstanding: string
  outstandingDirty: boolean
  dueDate: string
  profileCommand: ComandoIdempotentePendiente | null
  seriesCommand: ComandoIdempotentePendiente | null
  prepareOperationKey: string | null
}

export function crearPerfilVacio(): PerfilFormulario {
  return {
    ruc: '', nombre: '', direccion: '', distrito: '', provincia: '', departamento: '', ubigeo: '', establecimiento: '0000',
  }
}

function fechaMasDias(fecha: string, dias: number) {
  const date = new Date(`${fecha}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + dias)
  return date.toISOString().slice(0, 10)
}

export function crearBorradorEmisionSandbox(): BorradorEmisionSandbox {
  const hoy = fechaLocalActual()
  return {
    selectedProfileId: '',
    profileForm: crearPerfilVacio(),
    profileFormDirty: false,
    documentType: '03',
    editorSeriesId: '',
    preparationSeriesId: '',
    seriesCode: 'B001',
    nextNumber: '1',
    seriesEnabled: true,
    seriesFormDirty: false,
    saleId: '',
    issueDate: hoy,
    paymentKind: 'contado',
    outstanding: '',
    outstandingDirty: false,
    dueDate: fechaMasDias(hoy, 30),
    profileCommand: null,
    seriesCommand: null,
    prepareOperationKey: null,
  }
}
