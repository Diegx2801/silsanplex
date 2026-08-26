import { etiquetasEstadoEntrega, type ProgramacionEntrega } from '@/modulos/distribucion/modelo/programacionEntrega'

const formatoFecha = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })

export async function exportarConstanciaEntrega(entrega: ProgramacionEntrega) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const margen = 18
  const ancho = 174
  const verde = [22, 112, 90] as const
  const tinta = [29, 39, 36] as const
  const gris = [102, 115, 110] as const
  let y = 18

  const encabezado = () => {
    pdf.setFillColor(...verde)
    pdf.rect(0, 0, 210, 34, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(17)
    pdf.text('SILSANPLEX', margen, 19)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text('CONSTANCIA OPERATIVA DE ENTREGA', margen, 27)
    pdf.setFontSize(8)
    pdf.text(`Pedido ${entrega.pedidoNumero} · Despacho ${entrega.secuencia}`, 192, 22, { align: 'right' })
    y = 45
  }

  const nuevaPaginaSiCorresponde = (alto: number) => {
    if (y + alto <= 272) return
    pdf.addPage()
    encabezado()
  }

  const dato = (etiqueta: string, valor: string, x: number, anchoDato: number) => {
    pdf.setTextColor(...gris)
    pdf.setFontSize(7)
    pdf.setFont('helvetica', 'bold')
    pdf.text(etiqueta.toUpperCase(), x, y)
    pdf.setTextColor(...tinta)
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    pdf.text(pdf.splitTextToSize(valor || '-', anchoDato), x, y + 5)
  }

  encabezado()
  pdf.setTextColor(...tinta)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  pdf.text(entrega.clienteNombre, margen, y)
  pdf.setFontSize(9)
  pdf.setTextColor(...verde)
  pdf.text(`Guía ${entrega.numeroGuiaRemision}`, 192, y, { align: 'right' })
  y += 11
  dato('Dirección de entrega', entrega.direccionEntrega, margen, 105)
  dato('Contacto', [entrega.contactoNombre, entrega.contactoTelefono].filter(Boolean).join(' · '), 132, 60)
  y += 20
  dato('Fecha programada', formatoFecha.format(new Date(`${entrega.fechaEntrega}T12:00:00`)), margen, 48)
  dato('Estado', etiquetasEstadoEntrega[entrega.seguimiento], 72, 45)
  dato('Vehículo', entrega.vehiculoPlaca, 125, 30)
  dato('Conductor', entrega.conductorNombre, 158, 34)
  y += 20
  dato('Transportista', entrega.tipoTransporte === 'interno' ? 'Movilidad SILSAN' : entrega.transportistaNombre, margen, 78)
  dato('Documento', entrega.transportistaDocumento, 103, 38)
  dato('Licencia', entrega.conductorLicencia, 150, 42)
  y += 17

  pdf.setFillColor(...verde)
  pdf.rect(margen, y, ancho, 9, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.text('PRODUCTO', margen + 3, y + 6)
  pdf.text('LOTE', 127, y + 6)
  pdf.text('ENVIADO', 165, y + 6, { align: 'right' })
  pdf.text('ENTREGADO', 191, y + 6, { align: 'right' })
  y += 9

  for (const [indice, linea] of entrega.lineas.entries()) {
    const descripcion = pdf.splitTextToSize(`${linea.productoCodigo} · ${linea.productoDescripcion}`, 102)
    const alto = Math.max(10, descripcion.length * 4 + 5)
    nuevaPaginaSiCorresponde(alto + 15)
    if (indice % 2 === 0) {
      pdf.setFillColor(247, 250, 249)
      pdf.rect(margen, y, ancho, alto, 'F')
    }
    pdf.setTextColor(...tinta)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.text(descripcion, margen + 3, y + 6)
    pdf.text(linea.lote || '-', 127, y + 6)
    pdf.text(`${linea.cantidadEnviada} ${linea.unidadMedida}`, 165, y + 6, { align: 'right' })
    pdf.text(`${linea.cantidadEntregada} ${linea.unidadMedida}`, 191, y + 6, { align: 'right' })
    y += alto
  }

  nuevaPaginaSiCorresponde(55)
  y += 8
  pdf.setTextColor(...tinta)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.text('Observaciones', margen, y)
  pdf.setFont('helvetica', 'normal')
  pdf.text(pdf.splitTextToSize(entrega.observaciones || 'Sin observaciones registradas.', ancho), margen, y + 5)
  y += 28
  pdf.setDrawColor(180, 195, 187)
  pdf.line(margen, y, 82, y)
  pdf.line(128, y, 192, y)
  pdf.setTextColor(...gris)
  pdf.setFontSize(8)
  pdf.text('Responsable de despacho', margen, y + 5)
  pdf.text('Conformidad del receptor', 128, y + 5)

  const paginas = pdf.getNumberOfPages()
  for (let pagina = 1; pagina <= paginas; pagina += 1) {
    pdf.setPage(pagina)
    pdf.setTextColor(...gris)
    pdf.setFontSize(7)
    pdf.text(`Página ${pagina} de ${paginas}`, 192, 288, { align: 'right' })
  }

  const nombre = `${entrega.pedidoNumero}_Despacho_${entrega.secuencia}`.replace(/[^a-zA-Z0-9_-]+/g, '-')
  pdf.save(`${nombre}.pdf`)
}
