# SUNAT Fase 1 — Contrato fiscal y especificación implementable

Fecha de consulta: **23/10/2026 (America/Lima)**.
Base: docs/SUNAT_FASE0_AUDITORIA_Y_DISENO.md, preservado.
HEAD: 64a9868fc739c8e8bd4be1791b7d7230e626d6e6; main; 148 migraciones.

## 1. Estado de las decisiones

**Listo para revisar/aprobar un primer incremento local de persistencia fiscal sin transporte. No habilitado para emisión real.** Este documento es una especificación, no una migración ni una implementación. Todos los nombres CPE que aparecen más adelante son propuestos.

Confirmado por inspección: sales/sale_items son la fuente comercial; una venta por pedido; cantidades numeric(14,3), precios numeric(16,4), afectaciones gravado/exonerado/inafecto y cálculo general del 18%; sin moneda ni forma de pago en sales; serie/número manuales. No modificar Inventario ni Distribución. La venta registrada/despachada y su cumplimiento permanecen independientes del estado fiscal.

Decisiones técnicas propuestas para aprobación: perfil doméstico PEN, UBL 2.1, tipos 01/03, operación 0101, montos onerosos positivos, snapshots inmutables, numeración transaccional, claves de comando estables, outbox y conciliación de resultados desconocidos. “Propuesto” no significa que SILSAN haya confirmado que todas sus operaciones caben en ese perfil.

Decisiones **no confirmadas**: RUC/razón social reales, modalidad/obligación OSE, proveedor, establecimientos, series/corte, contado/crédito, operaciones especiales, momento operativo de emisión, ventas ya facturadas fuera del sistema. No se accedió a SOL ni a credenciales.

## 2. Matriz para el responsable contable/administrativo

P = necesario para cerrar alcance/contrato antes de programar funcionalidad dependiente.
E = necesario antes de emitir realmente. Se puede programar infraestructura con datos ficticios y producción bloqueada sin conocer valores secretos o fiscales reales.

| ID | Confirmación solicitada / evidencia no secreta | Responsable | P / E | Estado y consecuencia |
|---|---|---|---|---|
| F01 | RUC, razón social exacta, nombre comercial si aplica | Administración/Contabilidad | E | Pendiente; nunca deducir del nombre de organización |
| F02 | Domicilio fiscal, ubigeo, país y condición vigente | Contabilidad | E | Pendiente; dirección de entrega no lo sustituye |
| F03 | Establecimientos y códigos declarados, vínculo con punto de emisión | Administración | P estructura / E valores | Pendiente; no asignar 0000 a ciegas |
| F04 | Modalidad actual: SOL, SEE propio, SFS, PSE/OSE o software externo | Contabilidad | P y E | Pendiente; determina boleta/resumen y transporte |
| F05 | Calidad de emisor, estado/condición RUC y restricciones de modalidad | Contabilidad | E | Pendiente; comprobar por canal autorizado sin entregar claves al equipo |
| F06 | PSE/OSE actual, autorización/vigencia y contrato API/exportación | Administración | P adaptador / E habilitación | Pendiente; no contratar ni inscribir automáticamente |
| F07 | Todas las series usadas, último número, pendientes, documentos externos y quién numera | Contabilidad | P política / E conciliación | Pendiente; indispensable evitar colisión fiscal |
| F08 | Contado, crédito, pagos parciales al emitir, cuotas y vencimientos | Ventas/Contabilidad | P | Pendiente; crédito no se descartará si es habitual |
| F09 | PEN únicamente o USD/otras monedas; tipo de cambio requerido | Contabilidad | P | PEN es propuesta inicial, no hecho fiscal confirmado |
| F10 | Operaciones onerosas, gratuitas/bonificaciones, anticipos, descuentos explícitos | Ventas/Contabilidad | P | Pendiente; precio cero interno no acredita gratuidad fiscal |
| F11 | Exoneraciones/inafectaciones por producto/operación y respaldo aplicable | Contabilidad | P reglas / E validación | No deducirlas por tratarse de medicamentos |
| F12 | Detracción, percepción, retención, ISC, ICBPER o tasa distinta de 18% | Contabilidad | P | Si aplica al piloto, ampliar contrato antes de habilitarlo |
| F13 | Facturas a RUC; boletas con DNI/CE/RUC o consumidor no identificado; canales de entrega | Ventas/Contabilidad | P | Pendiente; no inventar documento del cliente |
| F14 | Momento de emisión frente a pagos, entrega de bienes y servicios | Contabilidad/Operaciones | P y E | Pendiente; no atarlo a delivered automáticamente |
| F15 | Venta histórica ya emitida/serie reservada fuera de SILSANPLEX; fecha de corte | Contabilidad | E | Excluir histórico por defecto; conciliación obligatoria |
| F16 | Volumen, disponibilidad, SLA, presupuesto, conservación y recuperación | Administración/TI | P proveedor / E operación | Pendiente; no hay cotización aprobada |
| F17 | Certificado o autorización de firma PSE, titular, caducidad y custodio | Contabilidad/TI | E | Solo metadatos en definición; no pedir P12, contraseña o SOL |
| F18 | Responsables autorizados para preparar, confirmar emisión y corregir | Administración | P roles / E asignación | No conceder permisos fiscales por inferencia |

Para comenzar **solo persistencia local aislada** bastan aprobar el modelo, política de comandos, permisos y perfil de prueba. No se necesita SOL, certificado ni datos empresariales para ese incremento. Antes de crear el primer transporte deben resolverse F04/F06; antes de un piloto real deben resolverse todos los puntos aplicables.

## 3. Evidencia oficial descargada

### 3.1 Excel principal

- Publicador: SUNAT, enlazado desde [Guías y manuales](https://cpe.sunat.gob.pe/guias-y-manuales).
- [URL exacta del XLSX publicado al 26/08/2026](https://cpe.sunat.gob.pe/sites/default/files/2026-08/Reglas%20de%20validaci%C3%B3n%20-%20actualizado%20al%2026.08.2026.xlsx).
- Descarga HTTP 200, 855.113 bytes, cabecera ZIP válida. No se confundió HTML de bloqueo con un libro.
- SHA-256: **cb5e871cfe3b81abea7faf25b156e5d35b21e8c4837979350919926612da73b6**.
- Copia original: DIRECTORIO_PRIVADO_DE_EVIDENCIAS\Reglas-validacion-26.08.2026.xlsx.
- Extracción completa: DIRECTORIO_PRIVADO_DE_EVIDENCIAS\workbook-all-cells.json.
- Matriz integral hoja/fila → campo/tag/condición/código/disposición → caso propuesto: DIRECTORIO_PRIVADO_DE_EVIDENCIAS\matriz-cobertura-todas-las-filas.csv.
- Manifiesto de fuentes: DIRECTORIO_PRIVADO_DE_EVIDENCIAS\fuentes-y-extraccion.json.

Se omite la ruta personal del directorio privado; se conservan nombres, fuentes, fechas y hashes. Estas copias son evidencia local fuera del repositorio; no son nuevas dependencias de la aplicación ni archivos de credenciales. Los hashes de anexos descargados se registran al final.

Se recorrieron **las 23 hojas y las 8.214 filas con contenido**, incluidas notas, catálogos, parámetros, cambios, fórmulas y celdas combinadas. Se conservaron valores originales y contexto de celdas combinadas; VLOOKUP de descripciones se contrastó con CódigosRetorno, sin ejecutar fórmulas ni macros. Hay **3.968 filas con código de retorno de cuatro dígitos**, 942 códigos distintos; no son 3.968 pruebas ejecutadas ni reglas todas aplicables al piloto.

La matriz CSV es un inventario integral y una clasificación por rama/perfil. No pretende convertir condiciones complejas en validadores ejecutables automáticamente. Una fila marcada base puede contener ramas ISC, exportación o PSE que deben evaluarse por su predicado, no por un simple booleano de pertenencia a la hoja. “SIN VALIDACIÓN” no elimina obligaciones normativas o XSD del campo.

### 3.2 Inventario íntegro de hojas

| Hoja exacta | Filas con contenido | Filas con código | Aplicabilidad |
|---|---:|---:|---|
| General  | 19 | 18 | Transversal |
| Firma | 27 | 25 | Transversal |
| Retenciones1_0 | 101 | 84 | Otro documento; no perfil inicial |
| Percepciones1_0 | 116 | 99 | Otro documento; no perfil inicial |
| Comunicación de Baja1_0 | 51 | 47 | Corrección legal |
| Resumen Diario1_1 | 169 | 145 | Boleta por resumen |
| Resumen de reversiones1_0 | 39 | 35 | Otro documento; no perfil inicial |
| Factura2_0 | 927 | 815 | 01/03 por rama |
| Boleta2_0 | 833 | 711 | 01/03 por rama |
| NotaCredito2_0 | 489 | 463 | Otro documento; no perfil inicial |
| NotaDebito2_0 | 469 | 442 | Otro documento; no perfil inicial |
| LiquidacionCompra2_0 | 408 | 392 | Otro documento; no perfil inicial |
| DAE-Adquirente2_0 | 157 | 132 | Otro documento; no perfil inicial |
| DAE-Operador2_0 | 231 | 216 | Otro documento; no perfil inicial |
| DAE-SEAE | 124 | 98 | Otro documento; no perfil inicial |
| DOAE-Atribución | 107 | 96 | Otro documento; no perfil inicial |
| CDR-OSE-Resumen | 70 | 69 | OSE, condicional |
| CDR-OSE-Comprobante | 82 | 81 | OSE, condicional |
| CódigosRetorno | 2079 | 0 | Referencia/vigencia |
| Catálogos | 1031 | 0 | Referencia/vigencia |
| Listados | 96 | 0 | Referencia/vigencia |
| Parámetros | 26 | 0 | Referencia/vigencia |
| Control de Cambios | 563 | 0 | Referencia/vigencia |

Todas las hojas son visibles. Firma declara max_row 594, pero solo 27 filas tienen contenido: no se contaron filas meramente formateadas como validaciones. Factura2_0 y Boleta2_0 son nombres históricos de pestaña; sus celdas G5 establecen **UBL 2.1**, y G7 personalización **2.0**.

Retenciones, percepciones, liquidación, DAE/DOAE y notas se examinaron para delimitar alcance y dependencias, no para incorporar sus contratos al primer incremento.

### 3.3 Anexos y vigencia

Se descargaron y extrajeron íntegramente los PDF oficiales de guía de factura 2.1 (102 páginas), boleta 2.1 (66), RS 000048-2026 (40), su anexo (34) y RS 000143-2026 (4). Se contrastaron las secciones aplicables; DAE no se convirtió en requisito de una factura doméstica.

Hallazgos de vigencia del propio libro y normas:
- Control de Cambios filas 510–513: ajustes sobre tasa reducida 10,5% desde 13/02/2026; eso no autoriza aplicar esa tasa a SILSAN. El perfil compatible actual permanece 18%.
- Fila 527 anuncia sustituciones de observaciones de producto por ERR-3496; fila 562 posterga el conjunto de ajustes listado, incluido 527, al 01/01/2027. **No clasificar todo ERR-3496 como activo/inactivo solo por código**: conservar documento, fila y condición.
- Filas 516, 541–545 y 562: cambios de gratuitas/resumen y datos del receptor tienen vigencia futura indicada; las ramas nuevas no se habilitan por la fecha de descarga.
- Filas 520 y 559: el cambio posterior vuelve al catálogo 25 v14 y retira 25.1–25.3, aunque el libro conserva bloques históricos. No importar todos los bloques como simultáneamente activos.
- Último cambio del libro: fila 564, 26/08/2026, precisión ERR-3312 en Percepciones; no modifica el contrato de factura 01 del perfil.
- La [RS 000143-2026](https://www.sunat.gob.pe/legislacion/superin/2026/000143-2026.pdf) posterga vigencia de la [RS 000048-2026](https://www.sunat.gob.pe/legislacion/superin/2026/000048-2026.pdf), con excepciones/fechas específicas. No extrapolar la fecha a todas las reglas preexistentes.

Motor propuesto: rule_set_version + fecha de emisión/recepción según la propia regla + modalidad + tipo + predicado de operación. Al actualizar, conservar la versión que validó el snapshot. Un mismo código puede corresponder a más de una regla.

**Pendiente técnico comprobado:** paquetes XSD 2.1 y XSL del índice oficial devolvieron HTTP 403 en dos intentos. No se guardaron páginas 403 como ZIP ni se usaron copias no oficiales:
- https://cpe.sunat.gob.pe/sites/default/files/inline-files/Archivos%20XSD%20%281%29.zip
- https://cpe.sunat.gob.pe/sites/default/files/inline-files/XSL%20Actualizado%20al%2006092022%20%281%29.zip

El primer incremento de persistencia puede especificarse sin ellos. Antes de validar/generar XML deben recuperarse los paquetes oficiales, registrar hash y probar XSD y XSL efectivos. No se declara completada esa validación.

## 4. Matriz implementable requisito → campo → validación → fuente → prueba

Referencias F = Factura2_0, B = Boleta2_0, G = General, S = Firma, RC = Resumen Diario1_1. Los números son filas físicas del XLSX original; la matriz CSV conserva la condición exacta. U = unidad, SQL = integración de base aislada, INT = adaptador/XML, E2E = React. Todos los casos siguientes son **propuestos**, salvo los ejemplos Decimal indicados después.

| ID | Campo y regla del perfil | Fuente/códigos | Prueba mínima |
|---|---|---|---|
| R01 | ublVersion 2.1 y customization 2.0; namespaces y orden XML válidos | F/B5–9: 2075/2074/2073/2072 | INT omitir/alterar versión; XSD pendiente |
| R02 | 01→F[A-Z0-9]{3}, 03→B[A-Z0-9]{3}; número 1..99999999 | F10–16; B10–17: 1001/1035/1036 | SQL tipo/serie incompatible, agotamiento; INT nombre ZIP/XML distinto |
| R03 | Una identidad no emitida previamente; duplicado remoto va a conciliación | F13–14, B13–15: 1033/1032/1084 | INT respuesta perdida y duplicado sin CDR; no éxito aparente |
| R04 | Fecha/hora reales Lima; fecha válida; política de plazo por modalidad | F17–19; B18–20: 2108/1079/2329 | U calendario; INT límite de plazo sin cambiar fecha al reintentar |
| R05 | currency=PEN, todos los currencyID coherentes | F25–30, B26–31: 2070/3088/2071 | U moneda distinta; INT atributo mezclado USD |
| R06 | Emisor real, RUC y modalidad autorizados; establecimiento declarado | F35–47/80–86, B35–45/78–82, G19 | INT autorización inexistente; SQL org ajena; no suplir listado SUNAT por regex |
| R07 | Nombre fiscal sin blancos de control, longitudes y dirección estructurada | F49–62, B47–60: 1037/4338 y atributos | U nombre corto/control chars; domicilio no tomado de entrega |
| R08 | Factura doméstica: receptor RUC 6 válido/11 dígitos; nombre fiscal | F88–106: 2014/2017/2015/2800/2021/2022 | U DNI en factura; RUC mal formado; SQL snapshot |
| R09 | Boleta identificada: RUC/DNI/CE con tipo correcto; no OTHER ambiguo | B84–98: 2017/4207/4208/2022 | U cada tipo, nombre 3..1500, caracteres prohibidos |
| R10 | Identificación cuando corresponda por importe/solicitud; variante anónima requiere contrato propio | B84–110 y [boleta SUNAT](https://cpe.sunat.gob.pe/tipos_de_comprobantes/boleta) | U S/700 y S/700,01, solicitud; no generar DNI ficticio |
| R11 | Unidades oficiales, secuencia única y cantidad positiva | F/B145–152: 2023/2752/2883/2936/2024/2025 | SQL líneas duplicadas; U código interno sin equivalencia |
| R12 | Código producto interno no equivale a UNSPSC/GTIN; evaluar predicado y vigencia | F154–168; B154–167: 4331/3496/4332/4337; Cambios527/559/562 | INT obligado/no obligado, código presente inválido; fechas 2026/2027 |
| R13 | Descripción y valores unitarios >0; decimales hasta 10 en XML, moneda coherente | F175–189; B168–182: 2026/2027/2068/2369/2367/3270 | U límites y serialización sin notación científica |
| R14 | 10/20/30 onerosos → 1000/9997/9998; excluir subtipos gratuitos/IVAP | F204–237; B197–230: 2371/3050/3110/2992/2993 | U combinaciones inválidas; cero IGV exonerado/inafecto no tratado como error genérico |
| R15 | Base e IGV de línea, agregados y misma tasa general del perfil | F199–237/345–366; B192–230/340–362: 3272/3103/3291/3462 | U mixto 18/exonerado/inafecto; no mezclar 10,5 sin extensión |
| R16 | Bases sumadas por tributo; impuestos por línea y cabecera coherentes | F297–326; B291–320: 3294/3274/3275 | SQL sumas exactas; INT tributo y base ajenos |
| R17 | Valor línea, subtotal fiscal, taxInclusive y payable positivos, hasta 12 enteros/2 decimales | F278–281/411–424; B272–275/407–420: 2370/2062/3278/3279/3280 | U fronteras, overflow, total redondeado cero |
| R18 | Contado exacto; sin bloque Credito ni cuotas simultáneos | F855–859: 3244–3248 | U contado con cuota; INT PaymentTerms/FormaPago |
| R19 | Crédito: pendiente positivo ≤ total; cuotas distintas, suma exacta y vencimientos posteriores | F861–883: 3249/3251/3265/3319/3252–3256/3267 | U cuotas faltantes/duplicadas/suma distinta/fecha igual emisión |
| R20 | Operación 0101, leyendas aplicables; sin inferir detracción/percepción | F426–439; B422–435; Catálogos51/52 | INT operación incompatible y leyenda errónea |
| R21 | Una firma válida, certificado/vínculo correcto; no solo tags presentes | S3–28; G17/18/20: 2325/2326/2335 | INT certificado ficticio, alteración XML y referencias; no certificado real |
| R22 | ZIP legible con un XML y nombre/identidad consistentes | G6–16: 0151/0155–0161/0306 | INT ZIP vacío/corrupto/varios archivos/XXE y tamaño límite |
| R23 | Resumen y ticket según modalidad; relación miembro→resultado | RC y CDR-OSE-Resumen | INT dos boletas, resumen incierto/rechazado, sin atribuir un CDR individual inexistente |
| R24 | CDR corresponde a identidad y origen; distinguir código técnico y fiscal | CDR-OSE-Comprobante3–84; CódigosRetorno | INT CDR de otro emisor/número; HTTP 200/ticket no aceptan |
| R25 | Campos especiales no se silencian: descuento/gratuita/ISC/ICBPER/anticipo/etc. | Ramas enumeradas en §5 | U rechazo explícito de operación fuera del perfil; ampliar si F10/F12 lo exige |

Los mensajes se mapearán por (fuente, versión, hoja, fila/código, modalidad), conservando mensaje original saneado. Una observación no se convierte globalmente en rechazo por empezar su código por un dígito concreto.

## 5. Aplicabilidad exhaustiva y ramas excluidas del perfil propuesto

Se examinó el conjunto de campos, no únicamente los códigos comunes:

| Rama | Factura: filas | Boleta: filas | Disposición inicial |
|---|---|---|---|
| Identidad/emisor/receptor ordinarios | 5–62,80–118 | 5–60,78–110 | Admitir por contrato, con condiciones |
| Itinerantes, país de uso de servicio, partícipes, sujeto por cuenta de adquirente | 63–79,119–130 | 61–77,111–130 | No emitir por perfil ordinario; no confundir dirección logística |
| Referencias a guía/otros documentos | 132–143 | 132–143 | Opcionales si existen; validarlas. No crear GRE |
| Ítems, unidades, clasificación, precios | 145–189 | 145–182 | Admitir parte ordinaria; placa solo si procede |
| Gratuitas y totales gratuitos | 190–198,327–344 | 183–191,321–339 | Requiere extensión si hay bonificaciones reales |
| IGV, totales y ecuaciones | 199–237,278–281,297–326,345–366,411–439 | 192–230,272–275,291–320,340–362,407–435 | Solo ramas IGV18/exonerado/inafecto; no IVAP/exportación |
| ISC, ICBPER y otros tributos | 238–277,367–389 | 231–271,363–385 | Ampliación fiscal, no convertir a IGV |
| Descuentos/cargos línea y global | 282–295,390–410 | 276–289,386–406 | No presentes en contrato comercial actual; nunca inventarlos |
| FISE, drawback, Incoterm, percepción y anticipos | 440–509 | 436–502 | Fuera de 0101 ordinario; revisar con responsable |
| Transporte/pasajeros, pesca, detracción y valores referenciales | 511–643 | 504–722 | Fuera salvo necesidad real; no descartar F12 |
| Hospedaje/no domiciliados, Estado/agente, viajes | 645–768 | Incluidos en ramas 545–617 | Requiere su perfil específico |
| Datos adicionales/DAM/vehículos | 769–808 | 723–762 | Condicionales; no copiar tags vacíos |
| Hipotecarios, seguros y servicios especializados | 810–853 | 764–819 | Fuera de venta doméstica ordinaria |
| Pago ordinario contado/crédito | 855–883 | No bloque equivalente de pago ordinario | Factura conforme a §6; boleta no hereda tags de transporte |
| Retenciones/colaboración empresarial | 885–928 | 820–834 | Fuera; requisito piloto si se confirma |

Las filas de títulos/espacios/notas, tablas de códigos y restantes hojas están en el inventario integral. Estas disposiciones no autorizan esconder operaciones reales: si una venta requiere una rama no soportada, la prevalidación devuelve CPE_PROFILE_UNSUPPORTED con sus causas y no asigna correlativo.

## 6. Contrato fiscal mínimo v1

### 6.1 Perfil y datos

Perfil CPE-PE-DOM-PEN-1 (propuesto):
- Tipos 01 y 03, emisor domiciliado, operación ordinaria 0101, moneda PEN explícita, cantidades y precios tomados de sales/sale_items.
- Afectaciones onerosas 10 gravado con tasa 18.00000 y tributo1000; 20 exonerado/9997; 30 inafecto/9998 con impuesto cero. Pendiente/legacy_unknown/por-definir bloquean; no decidir clasificación sanitaria desde el código.
- Se admiten líneas mixtas de esas tres clases; una única tasa general para las gravadas. El 10,5% encontrado en el libro no se aplica porque el cálculo comercial actual no lo soporta.
- Receptor: factura {type:"6",number:RUC}; boleta identificada {type:"1"|"4"|"6",number,name}. Mapear CE→4; OTHER no es una clasificación fiscal exacta. Cliente y dirección se seleccionan por organización.
- Consumidor no identificado queda como variante pendiente F13: no reutilizar un DNI falso ni obligar a capturarlo por encima de lo que la norma exige para fingir compatibilidad. Si SILSAN necesita esa variante, resolverla antes del piloto.
- Emisor: RUC, razón social, domicilio estructurado, ubigeo, país PE, establecimiento confirmado; datos de receptor congelados. Nombre legal debe cumplir la longitud fiscal (3..1500 donde la fila lo exige), aunque el maestro permita menos.
- Forma de pago elegida explícitamente, no default silencioso. Factura soportará discriminante contado o crédito en el snapshot; no requiere crear un módulo de cuentas por cobrar.
- Crédito: pendiente >0 y ≤ total; cuotas Cuota001..Cuota999 únicas, cantidades positivas con dos decimales, suma exacta pendiente y dueDate > issueDate. Registrar paidAtIssue=total−pendiente como dato comercial declarado, sin fabricar movimientos de cobro. Si hay retenciones/anticipos, no usar esta resta simplificada: requieren extensión.
- Boleta guarda término comercial si se necesita, pero el serializador no copia el bloque específico de factura ni los tags “forma de pago” de transporte.
- Referencias legales opcionales con tipo/número validados; no generar nuevos pedidos, guías o entregas.

Comando de preparación propuesto (valores decimales siempre strings):
~~~ts
type PrepareCpe = {
  schemaVersion: "CPE-PE-DOM-PEN-1";
  organizationId: UUID; environment: "sandbox" | "production";
  operationKey: UUID; saleId: UUID; issuerProfileId: UUID;
  expectedIssuerVersion: bigintString; seriesId: UUID;
  expectedSeriesVersion: bigintString;
  issueDate: ISODate; buyerFiscalAddressId?: UUID;
  payment:
    | { kind: "contado" }
    | { kind: "credito"; outstanding: Money;
        installments: { id: string; amount: Money; dueDate: ISODate }[] };
  optionalReferences?: { type: string; number: string }[];
};
~~~
Tipos del DTO: UUID válido PostgreSQL; bigintString decimal entero positivo sin exponente; ISODate YYYY-MM-DD de calendario real; Money cadena decimal canónica no negativa con exactamente dos decimales. Rechazar propiedades desconocidas y precisión excedida antes de normalizar; longitudes y límites por campo según este contrato. expectedVersion/expectedIssuerVersion/expectedSeriesVersion son controles de comandos nuevos, no sustitutos de autorización.

El usuario no envía totales autoritativos, número fiscal, XML ni organization del worker. Tipo viene de la serie y se valida contra el propósito confirmado; el backend lee la venta. En producción, fecha/hora y oportunidad de emisión requieren política aprobada; una fecha de venta antigua no se convierte automáticamente en issueDate actual.

La respuesta es {documentId, state, snapshotHash, version, fiscalIdentity?}; un reintento idéntico devuelve el mismo documentId y la misma identidad, sin nuevos efectos.

### 6.2 Cálculo decimal y mapeo UBL

Usar PostgreSQL numeric y cadenas decimales en JSON; evitar aritmética monetaria autoritativa con Number. Para positivos, redondeo half-up a dos decimales como round(numeric,2). No admitir signos, exponentes, NaN, Infinity o recortes silenciosos de precisión.

Para cada línea:
1. amount = round(quantity × commercialUnitPrice,2).
2. Gravado incluido: base=round(amount/1.18,2), tax=amount−base.
3. Gravado excluido: base=amount, tax=round(base×0.18,2).
4. Exonerado/inafecto: base=amount, tax=0.
5. Sumar bases por afectación y tax por línea; total=Σbase+Σtax. Todos deben coincidir exactamente con la venta calculada; discrepancia→CPE_SALE_TOTALS_MISMATCH, sin alterar la venta.
6. Valor unitario fiscal y precio con impuesto se representan hasta diez decimales a partir de base/quantity y (base+tax)/quantity, conservando también el precio comercial original y pricesIncludeTax. Comprobar que los unitarios serializados permiten reconstruir los importes redondeados sin discrepancia; si la precisión no basta, CPE_PRECISION_UNSUPPORTED. Nunca ajustar un céntimo arbitrariamente para conseguir aceptación.
7. Importes UBL hasta 12 enteros/2 decimales; unitarios hasta 12 enteros/10 decimales. Cantidad conserva como máximo los tres decimales de la venta. Montos de base/total deben ser positivos para el perfil oneroso; el cero permitido para impuesto exonerado/inafecto es una excepción semántica expresa.
8. Subtotal de SILSAN (bases) → LegalMonetaryTotal/LineExtensionAmount; total con impuestos → TaxInclusiveAmount/PayableAmount en ausencia de otras deducciones. No confundir TaxInclusiveAmount con el campo subtotal comercial.
9. Sin descuentos/cargos/anticipos/roundingAmount especiales en v1. Si existen, no exportar valores vacíos ni inferirlos de un precio menor.

El XLSX usa tolerancias ±1 en reglas concretas (3270/3271/3277/3278/3279/3280/3291, según rama). No son una autorización para descuadrar importes ni una tolerancia universal de 0,01. La aplicación exige consistencia interna exacta; el validador XML mantiene la tolerancia y predicado de cada fila, por separado.

Ejemplos calculados realmente con Python Decimal, como comprobación de la especificación, no suite de la aplicación:

| Caso | Base | Impuesto | Total |
|---|---:|---:|---:|
| 3 × 1,00 gravado incluido | 2,54 | 0,46 | 3,00 |
| 3 × 1,00 gravado excluido | 3,00 | 0,54 | 3,54 |
| 2 × 10,00 exonerado | 20,00 | 0,00 | 20,00 |
| 0,001 × 0,01, redondeado | 0,00 | 0,00 | 0,00: bloquear CPE del perfil |

No se cambió cálculo productivo. Tasas/excepciones de cada producto siguen sujetas a confirmación fiscal.

### 6.3 Snapshot inmutable

CanonicalFiscalSnapshot v1 incluye: versión, ruleSetHash/vigencia/modalidad, organizationId, environment, saleId, emisor y establecimiento completos, receptor/documento/nombre/dirección congelados, moneda, fecha/hora emisión, tipo/serie/número cuando se confirme, líneas ordenadas con saleItemId, producto/código/descripcion/unidad fiscal/cantidad/precios originales y fiscales/afectación/tributo/tasa/base/impuesto, bases agregadas y totales, pago/cuotas, referencias y autor/fecha de confirmación.

No incluye claves ni tokens. Normalización explícita: UUID minúscula, enum exacto, strings de texto trim sin cambiar razón social, direcciones opcionales null, listas vacías [], números decimales canónicos, líneas por saleItemId y cuotas por id. Ausencia y null solo equivalen en los opcionales definidos; no convertir datos requeridos ausentes a cadenas vacías. El backend normaliza precios antes del hash; no usar JSON.stringify de un objeto JS arbitrario como identidad.

La clave idempotente compara comando normalizado y referencias/versiones fijadas de su primera ejecución. En replay, autorizar nuevamente y recuperar el snapshot original; no recalcularlo contra cliente/producto que pudo cambiar. expectedVersion controla comandos nuevos, no invalida un replay idéntico ya confirmado.

## 7. Arquitectura, integración y adaptador

| Opción | Implementación necesaria | Condición de elección |
|---|---|---|
| A. PSE autorizado API | Autorización formal, comando idempotente, recuperación por identidad, originales XML/CDR, firma PSE y modalidad verificadas | Preferida si F04/F06/F16 y pruebas de contrato lo permiten; precio/SLA/volumen aún sin cotización |
| B. Directa SUNAT | Generador UBL, XSD, XMLDSig/P12, ZIP, SOAP/WS-Security, consulta/reconciliación, resúmenes y soporte operativo | Solo si la modalidad del RUC lo permite y el equipo demuestra esa capacidad; no asumir costo total cero |
| C. OSE | Sistema propio/PSE prepara y firma, OSE comprueba y devuelve CDR; contrato y autorización | Obligatoria si corresponde al emisor, no sustituto conceptual de PSE |

No se eligió proveedor concreto ni se fijaron precios no publicados. No registrar a SILSAN como PSE/OSE: contratar un actor habilitado es distinto de convertirse en él. [PSE oficial](https://cpe.sunat.gob.pe/aliados/pse), [SEE OSE](https://cpe.sunat.gob.pe/informacion_general/operador_servicios_electronicos).

Interfaz lógica propuesta, sin credenciales en DTO ni dependencia de SDK del proveedor:
~~~ts
interface FiscalAdapter {
  capabilities(): {
    invoice01: boolean; boleta03: boolean;
    boletaTransport: "individual" | "summary";
    returnsSignedXml: boolean; returnsCdr: boolean;
    reconcileByIdentity: boolean; stableIdempotencyKey: boolean;
  };
  submit(command: FrozenFiscalCommand, requestKey: string): Promise<
    | { kind: "pending"; providerRef?: string; ticket?: string }
    | { kind: "unknown"; diagnosticCode: string }
    | { kind: "final"; result: VerifiedFiscalResponse }
  >;
  reconcile(identity: FiscalIdentity, ref?: string): Promise<
    { kind: "pending" | "unknown" } |
    { kind: "final"; result: VerifiedFiscalResponse }
  >;
  fetchEvidence(identity: FiscalIdentity): Promise<EvidenceDescriptor[]>;
}
~~~
VerifiedFiscalResponse identifica emisor/tipo/serie/número, origen SUNAT/OSE, estado accepted/accepted_with_observations/rejected, códigos/observaciones y CDR original verificable. No acepta un simple success:true. El adaptador traduce HTTP/SOAP/JSON; el dominio no guarda enums exclusivos de una marca como estado fiscal.

La generación/firma puede hacerla el adaptador PSE o un componente privado para directa; jamás cambia el snapshot confirmado. Directa guarda el ZIP exacto antes de enviarlo; PSE requiere comando/clave estable y permite recuperar los originales realmente emitidos. Si no devuelve originales ni permite conciliar una respuesta perdida, no cumple esta interfaz.

Edge Functions: entrada autenticada/orquestación y API del proveedor. Worker durable para enviar/conciliar; trabajo persistido y leases, no solamente waitUntil. Firma nativa/XSD debe probarse antes de decidir runtime; no añadir Java/Node aparte hasta demostrar necesidad. Se preserva React+Supabase y no se configura cloud aquí. [Límites de Edge](https://supabase.com/docs/guides/functions/limits).

### Boletas: decisión explícita pendiente de modalidad

- Directa: la página SEE contribuyente describe resumen diario; diseñar RC/ticket/membresía si esa es la modalidad elegida.
- OSE: la documentación permite individual o resumen. Elegir una única política configurada; no alternar para “recuperar” un documento de estado incierto.
- En resumen, documentos de miembros guardan “informado mediante RC”; ticket/respuesta de lote no se presentan como CDR individual. Una boleta no se omite del RC por haber generado PDF.
- Plazos no se deducen solo del Excel, cuyo parámetro 004 describe número de días pero no constituye un listado completo de valores vigentes. Política versionada y verificada antes de transporte; envío inmediato recomendado. [SEE contribuyente](https://cpe.sunat.gob.pe/sistema_emision/see_contribuyente), [SEE OSE](https://cpe.sunat.gob.pe/informacion_general/operador_servicios_electronicos).

## 8. Esquema SQL propuesto y restricciones

Especificación de objetos, **no DDL aplicado ni archivo de migración**. organization_id obligatorio en cada entidad; referencias cruzadas usan FK compuesta (organization_id,id). UUID internos, timestamptz para eventos; date/time Lima para hechos fiscales. Estados y cantidades usan CHECK, claves UNIQUE y triggers/RPC; un CHECK aislado no puede validar agregados entre tablas.

| Tabla propuesta | Columnas principales | Restricciones y escritura |
|---|---|---|
| electronic_issuer_profiles | id, organization_id, ruc text, legal_name, fiscal_address jsonb, establishment_code, modality, rule_set_hash, profile_version bigint, production_enabled bool default false | UNIQUE(organization_id,id); RUC 11 dígitos; perfil validado; solo administración fiscal |
| electronic_document_series | id, organization_id, issuer_id, environment, document_type, series, next_number bigint, version, enabled bool | FK emisor; UNIQUE(organization_id,id); UNIQUE(issuer_id,environment,document_type,series); CHECK tipo01/Fxxx o03/Bxxx; next_number 1..100000000 (sentinela agotado) |
| electronic_documents | id, organization_id, issuer_id, sale_id, environment, series_id, document_type, series, number bigint nullable, draft_version, state, command_hash, snapshot_hash, snapshot jsonb, taxable/exempt/unaffected/tax/total numeric(14,2), currency, issue_date, issue_time, payment_terms jsonb, previous_rejected_id nullable, created_by/at | FK venta misma organización; UNIQUE(organization_id,id); identidad fiscal única; JSON validado; inmutabilidad por trigger |
| electronic_document_items | id, organization_id, document_id, sale_id, sale_item_id, ordinal, quantity numeric(14,3), commercial_price numeric(16,4), unit_net/unit_gross numeric(22,10), base/tax/total numeric(14,2), tax_code/affectation, rate numeric(8,5), snapshot jsonb | FK documento+venta; FK sale_item misma venta/org; UNIQUE(document_id,sale_item_id), UNIQUE(document_id,ordinal); sumas y tipos coherentes |
| electronic_document_commands | id, organization_id, environment, operation, operation_key, canonical_payload jsonb, payload_hash, result_document_id, created_by/at | UNIQUE(organization_id,environment,operation,operation_key); contenido/resultado inmutables; sin secretos |
| electronic_document_outbox | id, organization_id, document_id, action, state, available_at, lease_token UUID nullable, lease_until, attempts, version | UNIQUE(document_id,action); claim atómico; available/leased/complete/blocked; ninguna llamada HTTP dentro de transacción |
| electronic_document_attempts (transporte posterior) | id, organization_id, document_id, job_id, ordinal, started/finished, provider_ref/ticket, outcome, diagnostic_code, response_hash | UNIQUE(job_id,ordinal); finalizar una vez con lease/version válida; sin credenciales o cuerpos SOAP con password |
| electronic_document_artifacts (posterior) | id, organization_id, document_id, kind, object_path, sha256, byte_length, mime, created_at | UNIQUE(document_id,kind,sha256); contenido inmutable, bucket privado; no archivo completo en tabla |

Identidad global fiscal dentro de la misma instalación: UNIQUE(environment,issuer_ruc_snapshot,document_type,series,number) para documentos con número; issuer_ruc_snapshot es columna tipada validada contra el snapshot. Impedir configuración concurrente de dos organizaciones que numeren el mismo RUC/serie, o requerir un único propietario operativo autorizado; organization_id no sustituye esa identidad.

Un original vigente por venta/ambiente: índice único parcial sobre (organization_id,environment,sale_id) para state NOT IN ('abandoned','rejected'). Una emisión rechazada solo puede reemplazarse mediante flujo explícito que enlace previous_rejected_id, bajo lock de venta; no borrar el rechazado ni reciclar número. Nota/crédito futura necesitará tipo y relación propios, no esta regla de original.

Otras restricciones:
- Índices UNIQUE preceden a la lógica de aplicación y son defensa final de concurrencia.
- Totales = suma de líneas y pago válido en la RPC de sellado y constraint trigger diferible; no fingir que CHECK con subquery lo soluciona.
- Borrador se edita con expectedVersion; confirmado congela campos fiscales y referencia a venta. El primer incremento solo prueba confirmación en sandbox.
- No permitir DELETE de documentos confirmados, comandos, intentos o evidencias desde authenticated.
- Eventos de usuario en audit_events; eventos técnicos persistidos sin duplicar XML, passwords ni claves.
- No modificar columnas de sales para simular envío/aceptación; no reutilizar su operation_key como clave de todos los comandos fiscales.

### Inmutabilidad y permisos efectivos

Permisos propuestos: BILLING_VIEW, BILLING_PREPARE, BILLING_ISSUE, BILLING_CONFIGURE. No existen todavía y no se asignan automáticamente. RLS SELECT por organización+VIEW; sin escrituras directas de tablas a authenticated. RPC SECURITY DEFINER solo cuando justificado, owner controlado, search_path vacío, nombres cualificados, auth.uid()/sesión activa, permiso y organización antes de cualquier replay.

Operaciones administrativas de worker separadas del usuario: funciones no ejecutables por anon/authenticated; validan trabajo, lease y correspondencia organizacional. Los secretos de transporte no viven en perfiles públicos ni se devuelven al navegador.

## 9. RPC propuestas, numeración e idempotencia

| RPC propuesta | Entrada / salida | Autorización y efectos |
|---|---|---|
| save_electronic_issuer_profile(jsonb) | perfil+expectedVersion → id/version | CONFIGURE; ambiente productivo bloqueado hasta habilitación aprobada |
| configure_electronic_series(jsonb) | serie, próximo confirmado por conciliación, expectedVersion → id/version | CONFIGURE; no rebajar ni reutilizar números asignados |
| prepare_electronic_document(jsonb) | PrepareCpe → documentId | PREPARE; lectura comercial y snapshot preliminar sin número/cola |
| revise_electronic_document(jsonb) | id, expectedVersion, key, cambios permitidos → version | PREPARE; solo prepared; no edita venta |
| confirm_electronic_document(jsonb) | id, expectedVersion, operationKey → identidad/version | ISSUE; revalida, congela snapshot, asigna número y outbox atómicos |
| get_electronic_document(uuid,uuid) | org,id → lectura fiscal autorizada | VIEW; sin secretos ni payload técnico de auth |
| request_electronic_reconciliation(jsonb) | id,key → jobId | ISSUE; mismo documento, no nuevo número |
| claim_electronic_job / complete_electronic_attempt | lease/resultado verificado | Solo worker; CAS por lease_token/version; sin aceptar otro tenant |
| issue_evidence_access(...) | documento/kind → URL breve | VIEW/identidad de receptor; firmado y auditado server-side |

Primer incremento implementaría preparar/revisar/confirmar sandbox y consultas, perfiles/series de prueba. claim/send/CDR/evidence_access reales quedan posteriores. Los nombres finales requieren revisión, pero sus responsabilidades, salidas y prohibiciones quedan fijadas aquí.

### Orden de locks y transacción de confirmación

1. Validar sesión, permiso y organización. Advisory lock de (org,ambiente,operación,key).
2. Buscar comando previo: comparar canonical_payload/hash; igual devuelve resultado; distinto→CPE_OPERATION_KEY_REUSED. Revocación de permiso impide replay exitoso.
3. Bloquear venta con FOR UPDATE; bloquear documento por id/org; verificar versión, estado, fuente y original activo.
4. Bloquear fila de serie/emisor en orden fijo; verificar expectedSeriesVersion y configuración aprobada. Ningún worker adquiere luego lock de venta mientras retiene documento/job: documentar este contrato antes de transporte.
5. Asignar número con UPDATE de serie WHERE next_number<=99999999 RETURNING número anterior; incrementar versión. Nunca max()+1 ni secuencia no transaccional si se pretende rollback sin hueco de asignación.
6. Construir identidad y snapshot final, comprobar agregados, registrar documento/líneas, comando, auditoría y outbox. COMMIT único.
7. Fuera de transacción se podrá firmar/enviar, solo en fases autorizadas.

Rollback antes del commit no consume número ni deja documento/outbox parcial. Tras commit, número no se recicla porque falle HTTP, firma o cliente. No prometer ausencia total de saltos fiscales: cancelaciones y fallos posteriores conservan su identidad e historial.

Concurrencia: misma clave/igual comando → mismo documento/número; misma clave/distinto comando → conflicto; claves distintas/misma venta → un único original; dos ventas/misma serie → dos correlativos diferentes. Dos series no deben bloquearse por un contador global. Evitar capturar unique_violation genéricamente y devolver éxito: manejar solo restricción esperada y comando equivalente, o relanzar.

## 10. Máquina de estados y recuperación

Separar estado del documento y del trabajo:
- Documento: prepared → frozen → signed → submitted → accepted | accepted_with_observations | rejected.
- Si firma y envío se combinan en PSE, frozen→submitted solo con referencia verificable; no inventar un XML firmado aún no recuperado.
- Resultado perdido: frozen/signed/submitted → awaiting_reconciliation. No implica aceptación/rechazo.
- Error técnico anterior al envío: mantener documento congelado y job retryable/blocked; no convertirlo en rejected SUNAT.
- prepared→abandoned permitido y auditado, sin número. Un numerado no se “elimina” con esa transición.
- Estados terminales fiscales no se editan por nuevas cantidades ni nueva operationKey. Una corrección legal genera documento/relación legal nueva, según normativa y fase aprobada.

Outbox: at-least-once con lease; claim FOR UPDATE SKIP LOCKED y lease_token. Worker vencido no finaliza otro intento vigente. Misma identidad/bytes/claves en reintento; respuesta incierta prioriza consulta. No hay garantía distribuida exactly-once con HTTP.

React conserva la clave del comando y payload mientras reintenta. Cambio previo a confirmar → nueva clave + versión; tras respuesta perdida, recuperar por clave antes de volver a preparar. Cambiar evidencia, cantidad o cliente no autoriza mutar el mismo comprobante congelado.

Observación conserva aceptación y código; no editar XML para “quitarla”. Rechazo exige análisis fiscal y reemplazo permitido; no reintentar automáticamente un error fiscal determinista. Duplicado remoto se concilia con identidad y CDR, no se convierte en éxito por su código. NC/ND/bajas no se implementan como UPDATE/DELETE del aceptado.

## 11. Evidencias privadas y React

Bucket CPE privado con rutas de organización/ambiente/documento, originales XML/ZIP/CDR y PDF derivado. Guardar hash/tamaño/MIME; no overwrite de originales. Proteger ZIP/XML de XXE, bombas ZIP y path traversal. Acceso breve mediante backend que autoriza; no publicar certificados en Storage abierto ni URL predecible por serie.

PDF/QR se derivan de snapshot+original real; no acredita aceptación. Confirmación fiscal depende de resultado verificado. Hacer recuperables DB, originales y configuración necesaria; pg_dump solo no cubre todos los archivos/roles.

Componentes futuros:
- PanelComprobantesVenta, separado del estado logístico.
- DialogoPrepararComprobante: tipo/serie, receptor/dirección fiscal, pago y validaciones.
- VistaPreviaFiscal: snapshot y discrepancias sin editar la venta.
- DialogoConfirmarEmision: identidad y efectos claros, una clave estable.
- DetalleComprobante: línea temporal, observaciones, error técnico, conciliación y evidencias.
- ConfiguracionFiscal/Series: CONFIGURE, sin formulario de claves en React.

Primer incremento UI opcional solo sandbox con etiqueta visible “prueba local, sin envío”; sin botones que aparenten emitir realmente. Query keys incluyen organizationId/environment/documentId. Navegación por teclado y viewports 1280×720/1440×1080 conservados.

## 12. Primer incremento recomendado y aceptación

**Siguiente etapa propuesta: persistencia fiscal aislada v1, sin XML, firma ni envío.** Solo después de aprobar esta especificación.

Incluir: migración prospectiva futura para perfiles/series/documentos/items/comandos/outbox, RLS y permisos, prepare/revise/confirm sandbox, snapshot/hash decimal y numeración. Tests con maestros/ventas ficticios usando infraestructura aislada verificada. Producción y egress fiscal deshabilitados; no crear boletas/facturas reales.

Criterios:
1. Preparar desde sales/sale_items sin cambiar ninguna fila comercial, stock, reserva o entrega.
2. Documento preparado sin número; confirmar sandbox asigna número y congela snapshot/outbox en una transacción.
3. Nuevo login/perfil de cliente no cambia snapshot confirmado. Igual comando devuelve UUID/identidad y no añade auditorías/versiones.
4. Cambio material con misma clave rechaza; clave nueva no vence unicidad de venta ni inmutabilidad.
5. Autorización real por RPC/RLS para anónimo, sin permisos, otra organización, consulta, emisión y revocación.
6. Agregados de línea/tributo/pago exactos y rechazo de casos unsupported sin consumir correlativo.
7. Historial íntegro y ninguna salida de red a SUNAT/proveedor.
8. Escenarios concurrentes con sesiones PostgreSQL independientes; no simularlos con llamadas seriales.

| Test propuesto | Sesiones / intercalación | Aserción |
|---|---|---|
| C01 | Dos iguales, misma key/serie | Un documento, número, comando, auditoría y job |
| C02 | Misma key, payload diferente | Un ganador; otro CPE_OPERATION_KEY_REUSED, sin efectos parciales |
| C03 | Keys distintas, misma venta | Un original; conflicto explícito al perdedor |
| C04 | Dos ventas, misma serie | Correlativos distintos y contador final +2 |
| C05 | Dos series/organizaciones | Sin reutilización indebida; datos invisibles al otro tenant |
| C06 | Configurar serie vs confirmar | Versión decide; nunca retroceso o duplicación |
| C07 | Fallo tras incrementar contador, antes de commit | Rollback de contador/documento/job/auditoría |
| C08 | Replay después de revocar permiso | 42501 y cero cambios, no UUID como éxito |
| C09 | Cambiar cliente o fuente mientras preparar/confirmar | Snapshot coherente o conflicto de versión/fuente |
| C10 | Correlativo 99999999 y siguiente | Último permitido; siguiente CPE_SERIES_EXHAUSTED |
| C11 | Dos reemplazos del mismo rechazado (fase posterior) | Un nuevo original vigente, relación íntegra |
| C12 | Lease vencido vs finalización (transporte posterior) | Worker anterior rechazado, sin duplicados |

Unitarias: canonicalización, montos, fechas/cuotas, redondeos extremos y predicados por documento/vigencia. Integración futura: XSD/firma/sandbox/HTTP perdido/CDR. E2E futuro real desde React en entorno aislado. Estos tests no se ejecutaron aquí y no se heredan como PASS de los 27 E2E comerciales anteriores.

## 13. Vector, validaciones y Git

Vector permanece como incidencia separada de observabilidad de Fase 0. No se reparó, reinició ni configuró; no se condicionó el diseño fiscal a una reparación automática.

Ejecución efectiva: lectura íntegra de Fase 0; descarga y SHA-256 del libro/PDF; extracción de todas las hojas/celdas, celdas combinadas y valores de referencia; clasificación integral y contraste de vigencias; cuatro ejemplos Decimal; lecturas Git y SELECT de conteo de migraciones. No DDL/DML ni suite mutante. Extracción/análisis no equivalen a validación SUNAT ni a pruebas de implementación.

**Bloqueos antes del transporte/piloto:** confirmaciones fiscales pendientes, selección de modalidad/proveedor y obtención/verificación de XSD/XSL oficiales. No bloquean diseñar/pruebar persistencia sandbox; sí impiden declarar listo un emisor real.

Git inicial/final: main, HEAD 64a9868fc739c8e8bd4be1791b7d7230e626d6e6, 13 ahead / 0 behind frente a referencia local origin/main, índice vacío. Informes anteriores y untracked .codex/output preservados. Único archivo nuevo del repositorio en esta fase: docs/SUNAT_FASE1_CONTRATO_FISCAL.md. Sin commit, push, migraciones, cambios de usuarios/credenciales o infraestructura.

## Anexo A. Registro de descargas y hashes

Consulta 23/10/2026. Copias originales y texto extraído fuera del repositorio: DIRECTORIO_PRIVADO_DE_EVIDENCIAS.

| Archivo | Resultado | SHA-256 | Fuente |
|---|---|---|---|
| reglas.xlsx | Descargado 855113 bytes | cb5e871cfe3b81abea7faf25b156e5d35b21e8c4837979350919926612da73b6 | [SUNAT](https://cpe.sunat.gob.pe/sites/default/files/2026-08/Reglas%20de%20validaci%C3%B3n%20-%20actualizado%20al%2026.08.2026.xlsx) |
| XSD-2.1.zip | HTTP 403 (dos intentos) | No hay ZIP válido; no calcular hash de HTML | [SUNAT](https://cpe.sunat.gob.pe/sites/default/files/inline-files/Archivos%20XSD%20%281%29.zip) |
| XSL-20220906.zip | HTTP 403 (dos intentos) | No hay ZIP válido; no calcular hash de HTML | [SUNAT](https://cpe.sunat.gob.pe/sites/default/files/inline-files/XSL%20Actualizado%20al%2006092022%20%281%29.zip) |
| RS-000143-2026.pdf | Descargado 136885 bytes | a96a028fdc873cc5b8113854ae6dff1e70f3788331e06458f5548884b450a927 | [SUNAT](https://www.sunat.gob.pe/legislacion/superin/2026/000143-2026.pdf) |
| guia-boleta-2.1.pdf | Descargado 1535786 bytes | 9b6ad6ee3ca1608739b6565f0a5dba0037b5d6c400483bd8eafa0c49db34a2b6 | [SUNAT](https://cpe.sunat.gob.pe/sites/default/files/inline-files/guia%2Bxml%2Bboleta%2Bversion%202-1%2B1%2B0_0_0%20%282%29.pdf) |
| guia-factura-2.1.pdf | Descargado 2070772 bytes | 5cd43c9168e4f9700c162db2183e06875e143bce8998eb6af474448b07b2286d | [SUNAT](https://cpe.sunat.gob.pe/sites/default/files/inline-files/guia%2Bxml%2Bfactura%2Bversion%202-1%2B1%2B0%20%282%29_0%20%282%29.pdf) |
| RS-000048-2026.pdf | Descargado 401572 bytes | 098212468fdadce35d23ce1fc909e8494f9d5ea079adc13b87fc07805aa48948 | [SUNAT](https://www.sunat.gob.pe/legislacion/superin/2026/000048-2026.pdf) |
| anexo-000048-2026.pdf | Descargado 1116139 bytes | 2a509a4e890c115c6704a92172c24c2908accec3d234b3f655ad780041a546be | [SUNAT](https://www.sunat.gob.pe/legislacion/superin/2026/anexo-000048-2026.pdf) |

Conservar el XLSX original para verificar cambios de formato/estilo y no perder fechas tachadas o sustituidas; la interpretación de vigencia se apoya en Control de Cambios y norma posterior, no solo en una extracción plana de texto. El CSV es apoyo de revisión, no código de reglas ni sustituto del libro oficial.
