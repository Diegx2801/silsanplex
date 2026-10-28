import { useId, type ReactNode } from 'react'

import type { ComprobanteSandbox } from '@/modulos/facturacion/modelo/comprobanteSandbox'

function DatoFiscal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return <div className="min-w-0">
    <dt className="text-sm text-muted-foreground">{titulo}</dt>
    <dd className="mt-1 break-words text-sm font-medium [overflow-wrap:anywhere]">{children}</dd>
  </div>
}

export function DetalleComprobanteSandbox({ comprobante }: { comprobante: ComprobanteSandbox }) {
  const id = useId()
  const { snapshot, fiscalIdentity } = comprobante
  const congelado = comprobante.state === 'frozen'
  const pago = snapshot.payment

  return <article aria-labelledby={`${id}-titulo`} className="min-w-0 space-y-7">
    <header className="border-b pb-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={`${id}-titulo`} className="text-2xl font-semibold tracking-[-0.02em]">Detalle fiscal sandbox</h2>
        <span className="status-label" data-tone={congelado ? 'revision' : 'pendiente'}>
          {congelado ? 'Congelado · confirmación interna' : 'Preparado · sin número'}
        </span>
      </div>
      <p className="mt-3 max-w-[68ch] text-sm leading-6 text-muted-foreground">
        {congelado ? 'La numeración es interna de prueba. No acredita emisión ni aceptación por SUNAT.'
          : 'Borrador de prueba. Todavía no tiene correlativo y no se ha enviado a SUNAT.'}
      </p>
      <p className="mt-3 break-all text-xs text-muted-foreground">UUID consultado: <span className="font-mono">{comprobante.documentId}</span></p>
      <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        <DatoFiscal titulo="Tipo">{snapshot.documentType === '01' ? 'Factura (01)' : 'Boleta (03)'}</DatoFiscal>
        <DatoFiscal titulo="Serie">{snapshot.series}</DatoFiscal>
        <DatoFiscal titulo="Número">{fiscalIdentity?.number ?? 'Sin asignar'}</DatoFiscal>
        <DatoFiscal titulo="Fecha declarada"><time dateTime={snapshot.issueDate}>{snapshot.issueDate}</time></DatoFiscal>
        <DatoFiscal titulo="Moneda">{snapshot.currency}</DatoFiscal>
      </dl>
    </header>

    <div className="grid gap-6 md:grid-cols-2">
      <section aria-labelledby={`${id}-emisor`} className="min-w-0">
        <h3 id={`${id}-emisor`} className="border-b pb-2 text-lg font-semibold">Emisor del snapshot</h3>
        <dl className="mt-4 grid gap-4">
          <DatoFiscal titulo="Razón social">{snapshot.issuer.legalName}</DatoFiscal>
          <DatoFiscal titulo="RUC emisor">{snapshot.issuer.ruc}</DatoFiscal>
          <DatoFiscal titulo="Domicilio fiscal">{snapshot.issuer.address.line}</DatoFiscal>
          <DatoFiscal titulo="Distrito, provincia y departamento">
            {snapshot.issuer.address.district} · {snapshot.issuer.address.province} · {snapshot.issuer.address.department}
          </DatoFiscal>
          <DatoFiscal titulo="Ubigeo y establecimiento">{snapshot.issuer.address.ubigeo} · {snapshot.issuer.establishmentCode}</DatoFiscal>
        </dl>
      </section>
      <section aria-labelledby={`${id}-comprador`} className="min-w-0">
        <h3 id={`${id}-comprador`} className="border-b pb-2 text-lg font-semibold">Comprador del snapshot</h3>
        <dl className="mt-4 grid gap-4">
          <DatoFiscal titulo="Nombre o razón social">{snapshot.buyer.name}</DatoFiscal>
          <DatoFiscal titulo="Documento del comprador">
            {({ '6': 'RUC', '1': 'DNI', '4': 'CE' } as const)[snapshot.buyer.type]} · {snapshot.buyer.number}
          </DatoFiscal>
          <DatoFiscal titulo="Dirección fiscal del comprador">{snapshot.buyer.address?.line ?? 'No consignada en este snapshot'}</DatoFiscal>
          {snapshot.buyer.address ? <DatoFiscal titulo="Ubigeo del comprador">{snapshot.buyer.address.ubigeo}</DatoFiscal> : null}
        </dl>
      </section>
    </div>

    <section aria-labelledby={`${id}-productos`}>
      <h3 id={`${id}-productos`} className="text-lg font-semibold">Productos e importes</h3>
      <p id={`${id}-tabla-ayuda`} className="mt-1 text-sm text-muted-foreground">Importes en PEN, conservados como están en el snapshot. Si es necesario, desplaza la tabla horizontalmente.</p>
      <div role="region" aria-label="Productos del comprobante" aria-describedby={`${id}-tabla-ayuda`} tabIndex={0}
        className="mt-4 overflow-x-auto border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <table className="w-full min-w-[48rem] text-sm">
          <caption className="sr-only">Líneas del comprobante fiscal sandbox en PEN</caption>
          <thead className="border-b bg-muted text-left">
            <tr>{['Producto', 'Cantidad', 'Unidad', 'Precio comercial', 'Base', 'IGV', 'Total'].map((columna, indice) =>
              <th key={columna} scope="col" className={`px-4 py-3 font-medium ${indice > 2 ? 'text-right' : ''}`}>{columna}</th>)}</tr>
          </thead>
          <tbody>{snapshot.items.map((linea) => <tr key={linea.saleItemId} className="border-b align-top last:border-b-0">
            <th scope="row" className="min-w-56 max-w-80 px-4 py-4 text-left font-normal">
              <span className="font-medium [overflow-wrap:anywhere]">{linea.description}</span>
              <span className="mt-1 block text-xs text-muted-foreground [overflow-wrap:anywhere]">{linea.code}</span>
              <span className="mt-2 block break-words text-xs leading-5 text-muted-foreground">
                Neto unitario: <span className="tabular-nums">{linea.unitNet}</span><br />
                Bruto unitario: <span className="tabular-nums">{linea.unitGross}</span>
              </span>
            </th>
            <td className="px-4 py-4 tabular-nums">{linea.quantity}</td>
            <td className="px-4 py-4">{linea.unit}</td>
            {[linea.commercialPrice, linea.base, linea.tax, linea.total].map((valor, indice) =>
              <td key={indice} className="px-4 py-4 text-right tabular-nums">{valor}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <div className="grid gap-7 lg:grid-cols-2">
      <section aria-labelledby={`${id}-pago`} className="min-w-0">
        <h3 id={`${id}-pago`} className="border-b pb-2 text-lg font-semibold">Información de pago</h3>
        <dl className="mt-4 grid gap-4">
          <DatoFiscal titulo="Forma de pago">{pago.kind === 'contado' ? 'Contado' : 'Crédito'}</DatoFiscal>
          {pago.kind === 'credito' ? <>
            <DatoFiscal titulo="Pendiente declarado (PEN)"><span className="tabular-nums">{pago.outstanding}</span></DatoFiscal>
            <DatoFiscal titulo="Pagado al emitir, declarado (PEN)"><span className="tabular-nums">{pago.paidAtIssue}</span></DatoFiscal>
          </> : null}
        </dl>
        {pago.kind === 'credito' ? <div role="region" aria-label="Cuotas del pago a crédito" tabIndex={0}
          className="mt-4 max-h-80 overflow-auto border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Cuotas declaradas en PEN</caption>
            <thead className="border-b bg-muted"><tr><th scope="col" className="p-3">Cuota</th><th scope="col" className="p-3">Vencimiento</th><th scope="col" className="p-3 text-right">Importe</th></tr></thead>
            <tbody>{pago.installments.map((cuota) => <tr key={cuota.id} className="border-b last:border-b-0">
              <th scope="row" className="p-3 font-normal">{cuota.id}</th>
              <td className="p-3"><time dateTime={cuota.dueDate}>{cuota.dueDate}</time></td>
              <td className="p-3 text-right tabular-nums">{cuota.amount}</td>
            </tr>)}</tbody>
          </table>
        </div> : null}
      </section>
      <section aria-labelledby={`${id}-totales`}>
        <h3 id={`${id}-totales`} className="border-b pb-2 text-lg font-semibold">Totales en PEN</h3>
        <dl className="mt-2 divide-y">
          {([
            ['Base gravada', snapshot.totals.taxableBase], ['Exonerado', snapshot.totals.exemptAmount],
            ['Inafecto', snapshot.totals.unaffectedAmount], ['Subtotal', snapshot.totals.subtotal],
            ['IGV', snapshot.totals.tax], ['Total', snapshot.totals.total],
          ] as const).map(([titulo, valor]) => <div key={titulo} className={`flex items-baseline justify-between gap-4 py-3 ${titulo === 'Total' ? 'text-lg font-semibold' : 'text-sm'}`}>
            <dt>{titulo}</dt><dd className="tabular-nums">{valor}</dd>
          </div>)}
        </dl>
      </section>
    </div>

    <details className="border-t pt-4 text-sm">
      <summary className="w-fit cursor-pointer rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Referencias del snapshot</summary>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <DatoFiscal titulo="Venta de origen">{snapshot.saleId}</DatoFiscal>
        <DatoFiscal titulo="Versión del documento">{comprobante.version}</DatoFiscal>
        <DatoFiscal titulo="Hash del snapshot"><span className="font-mono text-xs">{comprobante.snapshotHash}</span></DatoFiscal>
        <DatoFiscal titulo="Contrato fiscal">{snapshot.schemaVersion}</DatoFiscal>
        {snapshot.confirmedAt ? <DatoFiscal titulo="Confirmación interna registrada"><time dateTime={snapshot.confirmedAt}>{snapshot.confirmedAt}</time></DatoFiscal> : null}
      </dl>
    </details>
  </article>
}
