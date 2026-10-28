# SUNAT — Fase 0: auditoría y diseño de facturación electrónica

Fecha de consulta y elaboración: **23 de octubre de 2026, America/Lima**.
Repositorio: Diegx2801/silsanplex. Rama main.
HEAD inspeccionado: 64a9868fc739c8e8bd4be1791b7d7230e626d6e6.

## 1. Dictamen y alcance

**Diagnóstico completado; emisión electrónica no implementada ni autorizada.** SILSANPLEX dispone de una base comercial reutilizable, pero los documentos llamados factura y boleta son registros internos. No se encontró en el frontend de Ventas, las Edge Functions, las migraciones ni el esquema público instalado un circuito de XML firmado, transporte CPE, recuperación de CDR o aceptación tributaria.

La integración ruc-lookup consulta datos de RUC mediante Decolecta y caché; no emite ni valida comprobantes ante SUNAT. Un estado consultado del contribuyente tampoco acredita que SILSAN sea emisor habilitado o esté obligado a una modalidad concreta.

El diseño recomienda conservar React/TypeScript, PostgreSQL, RLS y servicios existentes. Provisionalmente favorece una API de un **PSE registrado**, con validación OSE cuando corresponda, si cumple requisitos técnicos, económicos y de exportación de evidencias. No se ha seleccionado proveedor. La alternativa directa sigue siendo viable, sujeta a demostrar firma y transporte compatibles y capacidad operativa para mantenerlos.

No se consultó SOL, no se verificó la situación fiscal real de la droguería, no se accedió a certificados, archivos de credenciales ni claves privadas. La habilitación, régimen, establecimientos y eventual obligación de OSE son **pendientes de verificación**, no hechos deducidos del nombre de la empresa.

## 2. Funcionalidad actual de Ventas

### 2.1 Recorrido y persistencia

| Etapa actual | Pantalla, estado o servicio | Contrato instalado y persistencia | Lectura para CPE |
|---|---|---|---|
| Cotización | VentasPage, DialogoCotizacion, useCotizacionesPersistentes, cotizacionesService | save_sales_quote(jsonb); sales_quotes y sales_quote_items | Borrador comercial, no documento tributario |
| Emisión de cotización | emitirCotizacionPersistente | issue_sales_quote(uuid,uuid); borrador → emitida | “Emitida” significa cotización presentada, no CPE enviado |
| Pedido | DialogoSeleccionAlmacenPedido, useOperacionesVenta, ventasService | create_order_with_fulfillment(jsonb) delega en create_order; orders y order_items | Cotización emitida/vigente, cliente, almacén y destino; reserva logística |
| Venta | DialogoRegistroVenta | create_sale_from_order(uuid,uuid,jsonb), wrapper de create_sale_from_order_unchecked | Copia líneas del pedido en sales y sale_items; estado registrada |
| Despacho | DialogoDespachoPersistente | dispatch_order_from_reservations; reservas y movimientos físicos | Estado despachada no equivale a aceptación tributaria |
| Entrega | DistribucionPage y servicios de Distribución | entregas, allocations y outcomes relacionados al pedido y sus movimientos | No debe emitir otro CPE ni mover inventario por aceptar un CPE |

Las cotizaciones persistidas tienen estados borrador, emitida, aceptada y rechazada. La conversión a pedido usa su identidad y deja su aceptación vinculada al pedido. COT-, PED- y VEN- son numeraciones internas de seis dígitos. El repositorio conserva compatibilidad con cotizaciones antiguas de sesión; no se recomienda usar ese contrato histórico como fuente fiscal.

El frontend envía UUID de cotización como operation_key para crear pedido y UUID de pedido para registrar venta. La base aplica autorización SALES_MANAGE en wrappers, aislamiento organizacional, bloqueo del pedido y comparación de hash del comando comercial en la creación de venta. Son patrones reutilizables; no prueban idempotencia de un envío SUNAT que aún no existe.

La base impone una venta por pedido, unicidad del documento interno por organización/tipo/serie/número, y unicidad de operation_key por organización. No habilita hoy facturación parcial o consolidación de varios pedidos. Tales capacidades no se introducirían incidentalmente en la integración inicial.

### 2.2 Precios, descuentos e impuestos

- Cantidad: numeric(14,3); precio unitario: numeric(16,4); line_subtotal generado: numeric(18,4); totales monetarios de cabecera: numeric(16,2).
- Las líneas conservan producto, descripción, unidad y afectación tributaria como snapshots. Los triggers recalculate_order_totals y recalculate_sale_totals calculan por línea round(cantidad × precio, 2).
- Para gravado con IGV incluido: base = round(importe / 1.18, 2), impuesto = importe − base. Sin IGV incluido: impuesto = round(importe × 0.18, 2). Exonerado e inafecto se acumulan separadamente.
- La tasa general está fijada en el código comercial al 18%; no existe un motor fiscal configurable por vigencia o régimen. No se verificó su aplicación a cada producto de la droguería.
- tax_calculation_status distingue calculated, pending y legacy_unknown. Líneas por-definir o históricas sin afectación reconstruible no deben convertirse automáticamente en un CPE.
- El frontend replica los cálculos con Number, redondeo y Number.EPSILON. La fuente autoritativa para un CPE futuro debe ser decimal en backend. Deben probarse diferencias de redondeo, no exportar el valor de line_subtotal de cuatro decimales como si fuera directamente la base fiscal de dos.
- Se validan precios mínimos del producto, incluyendo conversión de mínimo final cuando el precio no incluye IGV.
- No se encontró un campo ni mecanismo explícito de descuento comercial por línea/global en el contrato de Ventas inspeccionado. Alterar el precio unitario no preserva por sí mismo motivo, base o porcentaje de un descuento fiscal.
- Se permite precio cero. Esto no basta para representar una transferencia gratuita: necesitaría clasificación y valor referencial fiscal. El primer emisor debe bloquear ese caso si no lo soporta, sin prohibirlo en la venta interna.
- Ventas no guarda currency; la UI presenta PEN. No debe inferirse moneda de registros históricos ni adoptar campos USD de Compras/Reparaciones como si pertenecieran a Ventas.

### 2.3 Tipos, serie y número actuales

El formulario acepta factura, boleta y nota-venta. Serie y número se ingresan manualmente: hasta 10 y 20 caracteres, respectivamente. La RPC convierte la serie a mayúsculas y la recorta; valida longitud, pero no el formato fiscal Fxxx/Bxxx ni correlativo numérico de ocho posiciones.

VEN-xxxxxx se asigna con advisory lock por organización y máximo interno + 1. **No es un correlativo fiscal**. La unicidad actual de series/documentos evita ciertas colisiones internas, pero no asigna números fiscales ni reconcilia lo emitido fuera de SILSANPLEX.

Nota de venta no debe mapearse automáticamente a factura, boleta ni nota de crédito/débito SUNAT. Sus datos comerciales podrían originar un CPE nuevo con decisión explícita y nueva identidad fiscal, sin renombrar el registro histórico. El registro histórico de factura/boleta no demuestra que esos correlativos estén libres: antes de usar una serie se debe conciliar con SOL, otros emisores o el proveedor, con autorización posterior.

### 2.4 Datos fiscales disponibles

| Fuente existente | Disponible | Brecha |
|---|---|---|
| organizations | id, name, slug, actividad | No contiene RUC del emisor, domicilio fiscal, ubigeo, establecimiento ni modalidad |
| customers | RUC/DNI/CE/OTHER, número, razón social, nombre comercial, estado/condición, fuente/fecha de consulta | No hay snapshot fiscal inmutable del receptor en sales |
| customer_addresses | Dirección, ubigeo, etiqueta, tipo, vigencia | La dirección de entrega del pedido no necesariamente es domicilio fiscal |
| customer_contacts | Contacto, email, teléfono | Elegir destinatario y registrar consentimiento/canal de entrega del CPE |
| products / measurement_units | Tipo bien/servicio, afectación, precios, unidad base; maestro de unidades con code/name | Verificar equivalencia de cada código con catálogo SUNAT, no asumirla |
| sale_items | Snapshot comercial, cantidad, precio, afectación | No conserva impuestos detallados, tasa, códigos fiscales, descuentos o valor referencial |
| sales | Cliente y pedido por FK, serie/número manuales, fecha, bases y totales | Sin emisor/receptor fiscal congelados, XML, firma, moneda, pago o CDR |

ventasService obtiene nombre/documento del cliente mediante join al maestro actual. Un cambio posterior del cliente puede cambiar lo mostrado para una venta histórica: esa consulta no debe usarse para reconstruir un CPE ya emitido.

## 3. Requisitos oficiales contrastados

Las fuentes son oficiales SUNAT, salvo la documentación técnica de Supabase citada para su runtime. Se distingue **obligación** de **opción técnica** y de **propuesta propia**. Consulta: 23/10/2026. Las páginas de orientación no reemplazan la comprobación de las resoluciones y del caso fiscal concreto antes del piloto.

### 3.1 Modalidad y habilitación

**Obligación condicionada a modalidad:** verificar RUC, condición de domicilio, estado, calidad de emisor, registro de certificado o autorización del PSE y, si corresponde, vinculación al OSE. No se asume que todos los emisores pueden elegir libremente envío directo. La factura común doméstica requiere receptor con RUC; boleta corresponde al consumidor final. Fuentes: [SEE del contribuyente](https://cpe.sunat.gob.pe/sistema_emision/see_contribuyente) y [boleta electrónica](https://cpe.sunat.gob.pe/tipos_de_comprobantes/boleta).

SUNAT describe al PSE como delegado de actividades de emisión y firma con certificado propio autorizado; la responsabilidad del contenido sigue en el emisor. OSE comprueba el documento y lo comunica con su constancia a SUNAT. Son roles distintos; un proveedor comercial puede ofrecer ambos servicios, pero su marca o API no acredita por sí sola ninguno. [PSE](https://cpe.sunat.gob.pe/aliados/pse), [OSE](https://cpe.sunat.gob.pe/aliados/ose).

SOL y SFS son alternativas oficiales. SOL sirve como opción operativa manual y SFS integra archivos; no se presupone que ofrezcan una API SaaS intercambiable con la diseñada. SFS se publica como gratuito, pero su operación e integración tienen costo interno. [SEE SOL](https://cpe.sunat.gob.pe/sistema_emision/see_sol), [SFS](https://cpe.sunat.gob.pe/sistema_emision/facturador_sunat).

### 3.2 Formato, identidad y catálogos

**Base técnica verificada:** XML UBL 2.1 para factura/boleta, con CustomizationID 2.0 según las guías. No confundir esa personalización con UBL 2.0. El índice oficial todavía publica manuales y ejemplos antiguos: no deben prevalecer sobre anexos y reglas posteriores. [Guías y manuales](https://cpe.sunat.gob.pe/guias-y-manuales), [guía factura 2.1](https://cpe.sunat.gob.pe/sites/default/files/inline-files/guia%2Bxml%2Bfactura%2Bversion%202-1%2B1%2B0%20%282%29_0%20%282%29.pdf), [actualización UBL](https://www.sunat.gob.pe/mensajes/junio/2019/aviso-ti-120619.html).

Series del sistema del contribuyente: cuatro caracteres, F más tres alfanuméricos para factura y B más tres para boleta; correlativo de 1 a 8 dígitos. XML/ZIP usan identidad RUC-tipo-serie-número. Fuente: [manual del programador, pp. 6–7](https://cpe.sunat.gob.pe/sites/default/files/inline-files/manual_programador%20%281%29.pdf).

| Catálogo / dato | Mapeo inicial propuesto, solo operación doméstica ordinaria |
|---|---|
| 01 / documento | 01 factura; 03 boleta |
| 02 / moneda | PEN explícito en el piloto |
| 03 / unidad | Código oficial validado a partir de measurement_units |
| 05 / tributo | IGV 1000; exonerado 9997; inafecto 9998 |
| 06 / identidad | RUC 6; DNI 1; CE 4; OTHER exige clasificación explícita |
| 07 / afectación | Gravado oneroso 10; exonerado oneroso 20; inafecto oneroso 30 |
| 16 / precio | Distinguir precio de venta y valor referencial cuando proceda |
| 51, 52, 53 | Operación, leyendas y cargos/descuentos; solo códigos aplicables |
| 25 / producto | Evaluar UNSPSC o GS1 sin confundirlos con código interno |

Este cuadro no es una copia exhaustiva del catálogo vigente. Fuente base: [anexo oficial de códigos](https://www.sunat.gob.pe/legislacion/superin/2017/anexoE-245-2017.pdf). El índice de guías consultado anuncia reglas actualizadas al **26/08/2026**; la descarga enlazada no fue legible con el visor de investigación y **no se auditó cada regla del XLSX**. Descargar, identificar versión/hash y contrastar vigencias y anexos es un gate anterior a implementar validadores. No se adoptaron como evidencia técnica sitios de terceros que anuncian otras fechas.

SUNAT aclara que el código de producto no es requisito mínimo para factura/boleta; no se propone bloquear todas las ventas por ausencia de UNSPSC sin analizar la operación. [Código de producto SUNAT, página modificada el 13/07/2026](https://cpe.sunat.gob.pe/informacion_general/codigoproducto).

Para boleta se debe verificar la identificación cuando el cliente la solicita o el importe supera S/700, con las excepciones aplicables. No extrapolar este caso a otros regímenes. [Boleta electrónica](https://cpe.sunat.gob.pe/tipos_de_comprobantes/boleta).

Falta en ventas la forma de pago contado/crédito y, en crédito, cuotas con vencimiento y saldo. Debe decidirse si el piloto será exclusivamente contado o si crédito es indispensable; no inventar “contado” para todos los documentos. [Comunicado SUNAT sobre forma de pago](https://www.sunat.gob.pe/mensajes/octubre/2021/aviso-ti-011021.html). Su referencia histórica a plazos no se adopta como plazo actual.

### 3.3 Firma, transporte y respuesta

En emisión propia se requiere certificado digital y firma del XML según especificaciones; un hash o imagen de firma no lo sustituye. El CDT gratuito está disponible sujeto a requisitos; SUNAT indica autorización para facilitarlo hasta el 31/12/2027. No se comprobó elegibilidad de SILSAN. Con PSE autorizado la firma puede recaer en el certificado del PSE. [Certificado digital](https://cpe.sunat.gob.pe/certificado-digital), [PSE](https://cpe.sunat.gob.pe/aliados/pse).

**Contrato técnico:** XML firmado dentro de ZIP, transporte SOAP/WS-Security en integración directa; sendBill retorna CDR, sendSummary retorna ticket y getStatus consulta su resultado. getStatusCdr permite recuperar CDR de factura/notas según su contrato; no asumirlo para boleta. El ambiente beta verifica estructuras y no demuestra aceptación fiscal productiva. [Manual, pp. 12–25](https://cpe.sunat.gob.pe/sites/default/files/inline-files/manual_programador%20%281%29.pdf).

Endpoints **documentales, no invocados**:
- Producción directa: https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?wsdl
- Beta: https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl

El directorio oficial de servicios alojado en 2026 mantiene estas rutas; el aviso de marzo de 2024 retiró receptores históricos de factura. No utilizar URLs antiguas de ejemplos SOAP como configuración. Consulta CDR/validez requiere su servicio específico; una API REST de GRE no sustituye billService. Fuentes: [directorio oficial de servicios](https://cpe.sunat.gob.pe/sites/default/files/2026-05/Descarga%20aqu%C3%AD%20los%20Servicios%20WEB%20Disponibles%20-%20Incluye%20DDJJ%20de%20Boletos%20a%C3%A9reos.pdf), [aviso del receptor único](https://www.sunat.gob.pe/mensajes/marzo/2024/aviso-ti-040324.html).

### 3.4 Estados, plazos, contingencia y consulta

- **CDR:** aceptada y aceptada con observación tienen validez; rechazo no. Un HTTP 200, ticket, PDF o estado “recibido” de proveedor no acredita aceptación. [SEE OSE](https://cpe.sunat.gob.pe/informacion_general/operador_servicios_electronicos).
- La página actual de SEE contribuyente indica factura/notas hasta tres días calendario siguientes a emisión. Esa página describe boletas por resumen; SEE OSE documenta individual o resumen y plazos diferenciados (cinco/siete días). **No generalizar esos plazos OSE al envío directo.** La política final debe corresponder a modalidad y norma verificadas, con envío inmediato recomendado. [SEE contribuyente](https://cpe.sunat.gob.pe/sistema_emision/see_contribuyente), [SEE OSE](https://cpe.sunat.gob.pe/informacion_general/operador_servicios_electronicos).
- La oportunidad de emitir no puede fijarse simplemente “al entregar en Distribución”: depende del hecho comercial y de las reglas sobre bienes, pagos y servicios. Definir el punto de emisión con el responsable fiscal antes de programar automatismos. [Reglamento, artículo 5](https://www.sunat.gob.pe/legislacion/comprob/regla/capituloI.pdf).
- Contingencia tiene requisitos y obligaciones de información; una nota de venta o una cola sin conexión no es contingencia tributaria válida automáticamente. [Procedimiento oficial](https://cpe.sunat.gob.pe/informacion_general/procedimiento_contingencia).
- Diseñar conservación de XML/CDR, consulta privada para el receptor y representación impresa con QR conforme a la modalidad. El portal de consulta pública no sustituye archivo ni entrega. La página SEE contribuyente establece disponibilidad web durante un año; esto no se toma como plazo total de conservación tributaria. [SEE contribuyente](https://cpe.sunat.gob.pe/sistema_emision/see_contribuyente), [QR: anexo técnico](https://www.sunat.gob.pe/legislacion/superin/2018/anexoC-113-2018.pdf).
- No imponer a SILSAN los procesos de homologación exigidos a un postulante PSE/OSE. Debe verificarse su alta como emisor y los requisitos aplicables; no tratar una antigua guía de homologación de contribuyentes como regla universal actual. [PSE](https://cpe.sunat.gob.pe/aliados/pse), [OSE](https://cpe.sunat.gob.pe/aliados/ose).

## 4. Comparación de alternativas

| Alternativa | Requisitos y complejidad | Costos comprobados / por cotizar | Control, dependencia y viabilidad |
|---|---|---|---|
| Directa SEE contribuyente | Habilitación aplicable; custodia del certificado, UBL, firma, SOAP, CDR, resúmenes, monitoreo y actualización propia | No se verificó tarifa de envío por documento; no significa costo total cero. Desarrollo, hosting, soporte y certificado salvo CDT elegible | Máximo control; alta carga de cumplimiento. Requiere prueba técnica del firmador y atención operativa |
| Sistema propio + OSE | Construir/firmar y enviar según contrato del operador, si no se contrata además generación/firma | Precio, mínimo, implementación, volumen, consultas y retención: no cotizados | OSE no resuelve automáticamente toda la generación del documento; dependencia de validación y SLA |
| PSE registrado + OSE cuando corresponda | API server-to-server; autorización formal; confirmar quién genera, firma, valida y entrega CDR | Tarifas reales no consultadas ni contratadas; solicitar precio por RUC/documento, impuestos, excedentes y salida de datos | Menor custodia local de certificados si firma el PSE; dependencia mitigable con exportación de XML/CDR y contrato versionado |
| SaaS/API comercial | Comprobar si es PSE, OSE o intermediario y a quién subcontrata | Cotización pendiente; no inventar montos | Viable con API documentada, idempotencia, sandbox, recuperación y acceso a originales; un PDF/API genérica no basta |
| SOL / SFS | Canal manual o puente de archivos oficial; confirmar encaje operativo | SFS publicado como gratuito; costo interno de operación | Referencia o alternativa operativa evaluable; no primera opción para trazabilidad automatizada del sistema |

**Decisión pendiente:** volumen mensual y picos, presupuesto, régimen/obligación OSE, crédito, establecimientos, emisor actual y series usadas. Sin ello no procede elegir proveedor ni prometer costos.

Solicitar, antes de aprobar una API: acreditación vigente, sandbox, CDR original descargable, recuperación por identidad, política de duplicados/timeout, firma utilizada, webhooks autenticados, exportación masiva, retención, límites, SLA y portabilidad al terminar. Estas son recomendaciones de arquitectura y contratación, no obligaciones SUNAT presentadas como tales.

## 5. Arquitectura recomendada

### 5.1 Componentes y límites

~~~mermaid
flowchart LR
  UI[React: preparar y consultar] --> RPC[RPC: autorizar, validar y numerar]
  RPC --> DB[(PostgreSQL: snapshot y outbox)]
  DB --> W[Worker con lease y reintentos]
  W --> AD[Adaptador fiscal servidor]
  AD --> P[PSE u OSE contratado]
  AD --> D[SUNAT directa, alternativa]
  P --> R[CDR y conciliación]
  D --> R
  R --> DB
  W --> ST[Storage privado: XML ZIP CDR PDF]
  DB --> UI
~~~

Diagrama de diseño, **ninguno de estos componentes CPE existe todavía**.

- React añade preparación y consulta del documento fiscal asociado a la venta, validaciones por campo, estado fiscal separado, errores traducidos con código original y acciones según permisos. No genera ni firma el XML autoritativo.
- PostgreSQL valida sesión, permiso fiscal y organización, congela el snapshot, toma el lock de serie, asigna correlativo y crea documento + trabajo en una transacción corta. El total se calcula/valida en backend.
- Un worker reclama trabajo con lease; una Edge Function puede servir como entrada/orquestador y adaptador HTTP del proveedor. El trabajo queda persistido; no depende de que el usuario mantenga el diálogo abierto.
- No mantener locks o transacciones abiertas mientras se llama al proveedor. Evitar asumir “exactly once” entre PostgreSQL y HTTP.
- Firmado directo: comprobar P12/PKCS#12, canonicalización XML, referencias XMLDSig, cadena/caducidad y validación XSD. No se ha demostrado compatibilidad de una librería de Deno con esos requisitos.
- Edge Functions es adecuado para autorización y API de un proveedor. Para firma/XSD intensivos o dependencias nativas, evaluar un worker privado Node/Java solo si el ensayo demuestra necesidad. No migrar la aplicación completa ni desplegarlo en esta fase.
- Límites cloud publicados: 256 MB, 2 s CPU y duración máxima según plan. Son restricciones futuras del hosting, no límites medidos del entorno local. Un waitUntil no equivale a cola durable. [Supabase Edge Functions](https://supabase.com/docs/guides/functions/limits).

Estructura futura mínima: frontend/src/modulos/facturacion (modelo/servicios/estado/componentes), backend/supabase/functions para entrada/adaptador y migraciones prospectivas para persistencia. Nombres y RPC CPE se definirán al aprobar contratos; no se presentan como endpoints existentes.

### 5.2 Autorización y seguridad

Proponer permisos específicos consultar, preparar, emitir y administrar configuración fiscal; mapearlos a roles con aprobación, sin concederlos automáticamente a SALES_MANAGE. RLS y comprobaciones de RPC para todo agregado; FK compuestas con organization_id. El worker administrativo recibe un documento identificado y vuelve a comprobar propiedad y estado; nunca confía en un organization_id arbitrario del navegador.

Certificados, passwords P12, SOL y tokens del proveedor quedan en backend/gestor de secretos, cifrados según alojamiento; jamás en variables VITE_*, localStorage, logs, auditoría de payload completo o respuestas públicas. Preferir credencial SOL secundaria con permisos mínimos cuando el contrato la permita. Preparar rotación y alertas de certificado sin acceder ahora a secretos reales.

Storage privado por organización/documento, URLs breves y autorización del receptor; impedir enumeración por serie/número. Separar beta/producción en configuración, secretos, cola, catálogo de series y destinos permitidos. Los webhooks se autentican y deduplican; no elevan a aceptado por un booleano no comprobado. Validar ZIP/XML con límites, sin DTD/entidades externas, ni rutas de extracción arbitrarias.

## 6. Diseño de datos propuesto — sin migraciones

Los siguientes nombres son **candidatos de diseño**, no tablas/RPC actuales.

| Entidad propuesta | Datos mínimos y vínculo | Reutilización / razón |
|---|---|---|
| electronic_issuer_profiles | organization_id único, RUC, razón social, dirección fiscal estructurada/ubigeo/país, establecimiento, modalidad, referencia de credenciales y vigencias | Extensión 1:1 de organizations; no recrear organizaciones ni guardar clave privada en tabla pública |
| electronic_document_series | organización/emisor, ambiente, tipo 01/03, serie, próximo correlativo, vigencia/estado | Fila bloqueada para asignación; límite fiscal y serie única por emisor/tipo/ambiente |
| electronic_documents | FK venta/organización, tipo/serie/correlativo, fecha/hora Lima, moneda, forma de pago/cuotas si aplica, snapshots emisor/receptor, totales, versión del contrato, operation_key y hash, estados separados | Mantener sales como hecho comercial; congelar identidad fiscal que no existe en la venta |
| electronic_document_items | FK documento y sale_item; secuencia, descripción/unidad fiscal, cantidad, precio/valor unitario, base, tasa, impuesto, afectación, descuento/valor referencial cuando aplique | Snapshot necesario, no duplicación de maestros vivos; decimal coherente con contrato |
| electronic_document_jobs | documento, comando, hash, estado, intentos, lease, próximo intento, ticket/referencia y error técnico saneado | Outbox durable; claves idempotentes separadas de las comerciales |
| electronic_document_events | documento, intento, evento, actor/origen, fecha, código/observaciones, identidad de respuesta y referencias de archivos | Historial append-only; reutilizar audit_events para acciones de usuario, sin duplicar XML o secretos |
| Archivos privados | Original XML firmado, ZIP enviado, ZIP/XML CDR, PDF derivado; path, hash, tamaño, tipo y versión en metadatos | Inmutables y recuperables; PDF no sustituye XML/CDR |

No añadir otra tabla de clientes fiscales: reutilizar customers, customer_addresses y customer_contacts, congelando la selección en el documento. Reutilizar measurement_units; añadir mapeo fiscal solo donde code no sea equivalente, sin cambiar factores de inventario. Los catálogos necesarios pueden versionarse como artefactos de validación; no crear un catálogo genérico de todos los tributos antes de conocer el alcance.

Reglas propuestas:
1. Identidad fiscal única por ambiente, RUC emisor, tipo, serie y correlativo. La organización es frontera de autorización; no sustituye el RUC como identidad tributaria. Evitar dos organizaciones configuradas accidentalmente para numerar el mismo emisor/serie.
2. operation_key única por organización y comando; igual clave/igual payload normalizado devuelve documento; igual clave/payload distinto rechaza explícitamente.
3. Por defecto un CPE original por venta y ambiente, con estados que impidan doble emisión y reintentos. Reemplazos de rechazados necesitan relación explícita; futuras notas se vinculan al CPE original. No convertir esta regla en “un único documento para siempre” que impida correcciones legales.
4. Correlativo asignado mediante UPDATE transaccional de fila de serie con RETURNING y restricción UNIQUE; no copiar max()+1 del número interno. Ante rollback íntegro previo a emisión, el contador transaccional vuelve con la transacción. Una identidad ya emitida o de estado remoto incierto no se recicla.
5. Una vez emitido/congelado el comando: inmutables identidad, emisor, receptor, fecha, moneda, líneas, unidades, precios, afectación, tasa, bases, descuentos, pagos y totales. Firma/archivos enviados se conservan, no se regeneran silenciosamente.
6. Estados e intentos avanzan con versión/lease y eventos. El maestro cliente puede cambiar sin reescribir el snapshot.
7. Aprobación fiscal no crea reservas, movimientos ni entregas. No se modifica Inventario o Distribución.
8. No marcar ventas históricas como emitidas ni enviar documentos de desarrollo previos. Conciliar series y elegir un corte explícito antes del piloto.

## 7. Flujo comercial y recuperación

1. Usuario autorizado selecciona una venta real. Preparar desde sales/sale_items; no desde cantidades de una entrega parcial ni desde el maestro vivo solamente.
2. Validar emisor/modalidad, receptor según tipo, dirección fiscal seleccionada, unidad oficial, moneda, forma de pago, afectación definida, importes y oportunidad de emisión. Mostrar todo en previsualización.
3. Confirmación con command key estable. RPC revalida y captura snapshot + correlativo + trabajo. Si la respuesta se pierde, recuperar el mismo documento; no asignar otro número.
4. Construcción/validación/firma según alternativa elegida. Preservar exactamente el XML/ZIP que se enviará. Un fallo anterior al envío no se presenta como rechazo SUNAT.
5. Envío del trabajo con identidad y clave estable del proveedor. Registrar intento. Un timeout después de enviar deja resultado **desconocido/pendiente de conciliación**, no aceptado ni rechazado.
6. Consultar ticket/CDR por el mecanismo aplicable antes de reenviar. Si se reintenta transporte, conservar identidad y contenido. No cambiar de proveedor a ciegas con resultado incierto.
7. Validar CDR/resultado verificable y correspondencia de emisor/tipo/serie/número; guardar originales, códigos y observaciones. Para resumen de boletas, relacionar sus miembros y respuesta, sin atribuir CDR individual inexistente a cada línea.
8. HTTP 200 sin CDR terminal no avanza a aceptación. Duplicado no equivale a éxito: conciliar documento remoto y evidencia. Diferencia material va a revisión, sin sobreescritura.
9. Aceptado/aceptado con observaciones: disponibilizar XML y representación al cliente con QR y acceso seguro; registrar entrega por canal. Las observaciones se conservan.
10. Rechazado: mostrar causa, detener reintento idéntico como si fuera error temporal y seguir procedimiento fiscal de corrección/nuevo documento. Las notas/bajas quedan como evolución posterior controlada, no edición del aceptado.

Estados de diseño: venta registrada/despachada (actuales) y, por separado, documento preparado → emitido/congelado → firmado → en cola → enviado/en proceso → aceptado/aceptado con observaciones/rechazado. Añadir error técnico y resultado desconocido para recuperación. Si un PSE combina generación y firma, registrar la evidencia que efectivamente retorna; no inventar etapas cumplidas.

Modificar cantidades/evidencia fiscal antes de emisión genera otra identidad de comando y exige revalidar. Después de emisión, ni una clave nueva autoriza alterar el mismo comprobante. Un estado logístico delivered tampoco acredita aceptación SUNAT.

## 8. Cobertura existente y brechas

| Cobertura localizada | Qué demuestra por lectura | Qué no demuestra |
|---|---|---|
| cotizacion.test.ts, cotizacionesService.test.ts, useOperacionesVenta.test.tsx, DialogoRegistroVenta.test.tsx | Validaciones/modelo, servicios y UI comercial | Firma, catálogos vigentes o aceptación CPE |
| sales_tax_calculation.test.sql | Bases gravadas/exoneradas/inafectas, IGV incluido/excluido y bloqueo de indefinidos | Validador SUNAT completo o equivalencia UBL |
| tax_affectation_line_snapshots.test.sql | Snapshot tributario y aislamiento | Inmutabilidad de un CPE firmado |
| sales_quotes_persistence.test.sql, sales_orders_persistence.test.sql | Persistencia, estados y replay comercial | Correlativos fiscales |
| sales_orders_concurrency.test.sql, order_dispatch_concurrency.test.sql | Sesiones/concurrencia comercial y despacho, según casos de cada suite | Concurrencia de series o envío externo |
| sales.spec.ts | Selección/validaciones de cotización | Emisión de factura/boleta |
| operational-flow.spec.ts (dos viewports), operational-fefo-multilot.spec.ts, operational-partial-deliveries.spec.ts | Recorrido comercial/logístico y trazabilidad | SUNAT; usar “factura” en el formulario no cambia esa limitación |

Se revisó código y etiquetas de pruebas; **no se ejecutaron estas suites en Fase 0**. Los resultados históricos 27 E2E/580 Vitest y SQL 2C del contexto no se presentan como validación tributaria ni como ejecuciones de este trabajo.

Bloqueantes para emisión real:
- Perfil/habilitación y modalidad del emisor no verificados; series existentes sin conciliación.
- Sin cadena CPE/firma/CDR ni recuperación de resultado remoto incierto.
- Numeración manual y receptor consultado en vivo; no hay snapshot fiscal inmutable.
- Sin moneda/forma de pago fiscal ni clasificación completa de gratuidades/descuentos.
- Reglas actuales y matriz de vigencias aún sin congelar y probar.
- Sin canal seguro de entrega/consulta y originales fiscales archivados.
- Sin operación continua, backups de archivos/secretos y alertas para plazos/certificado.

Riesgos a evaluar, no defectos reproducidos ahora: redondeo JS/decimal, dobles envíos bajo timeout, caducidad de certificados, filtración por URLs/logs, repetición de webhooks, dependencia de proveedor y datos fiscales desactualizados. No se deduce exoneración de un medicamento por su categoría comercial.

## 9. Plan incremental y criterios de salida

| Etapa propuesta | Trabajo futuro, sujeto a aprobación | Verificación antes de avanzar |
|---|---|---|
| 1. Decisiones fiscales | Modalidad, habilitación, establecimientos, series/corte, contado/crédito, alcance PEN y afectaciones; oferta API vs directa | Acta de alcance y contrato fiscal, sin envío real |
| 2. Especificación | Descargar XSD/catálogos/reglas vigentes, fechas/hash; payload y redondeos; contratos del adaptador | Casos ficticios completos y mapeo campo → requisito/fuente |
| 3. Persistencia aislada | Nueva migración prospectiva, snapshots, series, RLS, comandos/outbox | SQL en base desechable: numeración concurrente en sesiones independientes, replay/conflicto, permisos, aislamiento y revocación |
| 4. Generación/firma | Un adaptador aprobado; XML/ZIP o contrato PSE; validar originales | Unitarias de decimales/códigos, XSD y firma independiente con certificado ficticio; sin secretos en React |
| 5. Transporte y conciliación | Beta/sandbox explícito, tickets/CDR, timeout, duplicados, backoff y errores terminales | Integración con respuestas reales del entorno permitido; pruebas controladas de pérdida de respuesta; no equivaler beta a producción |
| 6. UI/consulta | Preparar, validar, emitir, consultar estados, imprimir y entregar | E2E real aislado factura y boleta; reintento no duplica; modificar cliente no altera snapshot; accesibilidad/1280×720 |
| 7. Preparación operativa | Backup DB + archivos, recuperación, monitoreo de cola/plazos, credenciales y certificado, SLA | Ensayo de recuperación y evidencias de seguridad; autorización separada para primera emisión real |

Pruebas complementarias: fallos entre reserva de número y commit, worker caído tras envío, ticket pendiente, CDR de otro documento, duplicado remoto incompatible, resumen parcialmente observado según contrato, dos workers, dos organizaciones, usuario sin permiso y permiso revocado antes de reintentar. No copiar suites con limpieza sobre backend; usar fixtures aislados y conservar datos previos.

Alcance prioritario: factura y boleta domésticas ordinarias. Crédito, moneda extranjera, gratuitas, anticipos, detracciones, percepciones, ISC/ICBPER, exportación y regímenes especiales deben habilitarse solo con contrato; si la operación real los exige, bloquean el piloto y dejan de ser “opcionales”. Notas de crédito/débito, bajas/resúmenes cuando la modalidad los exija, y GRE requieren fases explícitas. Si se elige boleta directa por resumen, su resumen es parte indispensable de esa boleta, no una mejora pospuesta. No se inicia ninguno aquí.

## 10. Diagnóstico no invasivo de Vector

Observaciones efectivas:
- supabase_vector_backend está running y Docker lo marca unhealthy; failingStreak observado: 0.
- Healthcheck configurado: wget al endpoint interno http://127.0.0.1:9001/health.
- Registro de healthcheck conservado de 2026-10-23T01:04:24Z (22/10/2026, 20:04:24 en Lima) indica exit 1 por conexión rechazada.
- docker logs --since 30m --tail 120 no devolvió líneas en la ventana consultada.
- Una comprobación GET/spider de ese endpoint dentro del mismo contenedor terminó exit 1 por conexión rechazada. No se invocaron operaciones comerciales.
- PostgreSQL continúa accesible y se confirmó el historial de 148 migraciones.

**Confirmado:** endpoint de salud de Vector no disponible en la consulta. **No confirmado:** causa del rechazo (proceso/configuración/arranque), ni pérdida concreta de eventos. No se leyeron archivos con secretos para intentar resolverlo, ni se reinició o reparó.

Vector recopila/transporta logs ([arquitectura oficial de Supabase](https://supabase.com/docs/guides/self-hosting/docker)); no se encontró una dependencia de negocio hacia él en servicios/RPC de Ventas. No hay evidencia de que bloquee los cálculos o consultas SQL realizadas. Eso no demuestra que todos los flujos HTTP/Edge estén sanos: no se ejecutaron E2E ni funciones comerciales. Implica riesgo de observabilidad local y deberá tratarse en una intervención separada antes de depender de alertas operativas fiscales. No bloquea redactar este diseño; no se declara resuelta la salud global de Supabase.

## 11. Archivos y contratos inspeccionados

Frontend:
- frontend/src/app/paginas/VentasPage.tsx.
- frontend/src/modulos/ventas/modelo/operacionVenta.ts y cotizacion.ts.
- frontend/src/modulos/ventas/servicios/ventasService.ts y cotizacionesService.ts.
- frontend/src/modulos/ventas/estado/useOperacionesVenta.ts y useCotizacionesPersistentes.ts.
- frontend/src/modulos/ventas/componentes/DialogoRegistroVenta.tsx y DialogoDetalleOperacionVenta.tsx; búsquedas en el resto del módulo.
- frontend/src/modulos/ventas/modelo/cotizacion.test.ts; inventario de tests de servicios/componentes y pruebas E2E citadas.
- frontend/package.json.

Backend:
- backend/supabase/migrations/20260901200000_create_persistent_sales_orders.sql.
- backend/supabase/migrations/20260904200616_strict_sales_order_idempotency.sql: contrastada con la definición efectiva de la RPC subyacente.
- backend/supabase/migrations/20260905055349_p1b1_tax_affectation_line_snapshots.sql y 20260905064439_p1b3_sales_tax_calculation.sql.
- backend/supabase/migrations/20260916120000_create_persistent_sales_quotes.sql.
- Contratos efectivos pg_get_functiondef: save_sales_quote, issue_sales_quote, create_order_with_fulfillment, create_sale_from_order y create_sale_from_order_unchecked.
- Esquema instalado, restricciones e índices de organizations, customers, customer_addresses, customer_contacts, measurement_units, product_unit_conversions, products, sales_quotes/items, orders/items, sales/items.
- backend/supabase/functions/_shared/ruc/service.ts, decolecta-provider.ts y _shared/authorization.ts; inventario de admin-users, ruc-lookup y dni-lookup.
- Suites SQL de ventas, snapshots, reservas y despacho citadas; backend/package.json.

Inspección mediante rg, lectura de archivos, consultas SELECT a catálogos, information_schema, pg_get_functiondef e historial en transacciones READ ONLY. No se consultó contenido de clientes, ventas ni documentos comerciales para elaborar el informe.

## 12. Ejecución, estado Git y decisiones pendientes

Comandos/acciones realmente realizados:
- git status, branch, rev-parse, rev-list; lecturas y búsquedas de código/pruebas.
- SELECT de esquema, funciones, constraints, índices y RLS; conteo de migraciones: **148**.
- docker inspect de Vector; logs de ventana limitada y comprobación de health GET/spider.
- Investigación de páginas y PDFs oficiales; la descarga del XLSX de reglas no pudo auditarse con el visor.
- git diff --check y comprobación del archivo de informe al finalizar.

No se ejecutaron Vitest, Playwright, build, suites SQL mutantes, preparadores, DDL, migraciones, firma ni envíos SUNAT. No corresponden a una modificación exclusivamente documental.

Estado inicial: main, HEAD 64a9868fc739c8e8bd4be1791b7d7230e626d6e6, 13 ahead / 0 behind respecto de origin/main local; índice vacío y sin cambios tracked. Untracked preexistentes: .codex/, output/ e informes operativos locales no incluidos en esta publicación.
Estado final esperado/verificado: mismo HEAD, índice y archivos anteriores preservados; único archivo nuevo de esta intervención: docs/SUNAT_FASE0_AUDITORIA_Y_DISENO.md. Sin fetch, commit ni push.

**Para revisar el diseño antes de implementar:** decidir modalidad y proveedor/directa, alcance fiscal inicial, contado/crédito, emisor/establecimientos, series y corte. Falta contrastar la matriz de reglas descargable y verificar habilitación real mediante un procedimiento autorizado. Ninguna decisión de este documento autoriza configurar producción, obtener credenciales o emitir un comprobante real.
