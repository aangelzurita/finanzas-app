# Finanzas App: descripcion funcional

Finanzas App es una aplicacion de finanzas personales enfocada en anticipar problemas de flujo de efectivo, entender compromisos futuros y tomar mejores decisiones antes de gastar.

## Propuesta de valor

La app no solo registra movimientos. Busca responder:

- cuanto dinero hay realmente disponible
- que pagos presionan los proximos dias
- si se llega bien a la siguiente quincena
- como podria cerrar el mes
- que tarjeta conviene usar antes de comprar
- que categorias o compromisos estan fuera de control

## Modulos principales

### Dashboard

Pantalla principal con lectura ejecutiva:

- salud financiera
- proyeccion de flujo
- proxima accion financiera
- mejor tarjeta recomendada
- categorias de atencion
- resumen de dinero real disponible
- compromisos proximos

### Cuentas

Permite administrar cuentas propias y externas:

- efectivo
- debito
- ahorro
- inversion
- cuentas espejo de tarjetas
- cuentas externas/no propias

Las cuentas externas sirven como referencia para pagos que no salen del dinero propio.

### Movimientos

Registro y consulta de movimientos:

- ingresos
- gastos
- transferencias
- pagos de tarjeta
- pagos de deuda
- compras con tarjeta
- reembolsos

Los movimientos pueden afectar saldo o quedar como mapeo historico segun el caso.

### Tarjetas

Modulo para administrar tarjetas de credito:

- linea de credito
- saldo usado
- disponible
- uso de linea
- historial de movimientos
- pagos
- reembolsos
- conciliacion de tarjeta
- cierre de corte
- pago para no generar intereses

Tambien incluye un asesor para recomendar que tarjeta usar segun fecha, corte, pago, disponible y uso de linea.

### MSI

Control de compras a meses sin intereses:

- monto total
- mensualidad
- meses totales
- mensualidad actual
- dia de cargo
- avance
- mensualidades informativas en historial

La app distingue entre saldo usado total de la tarjeta y mensualidades que ayudan a entender presupuesto/compromisos.

### Deudas

Control de prestamos, deudas y financiamientos:

- saldo inicial
- saldo actual
- pago minimo o mensual
- frecuencia de pago
- proxima fecha de pago
- cuenta de pago
- cuenta externa si alguien mas cubre el pago

### Ingresos programados

Registro de ingresos esperados:

- sueldo
- quincena
- bonos
- ingresos variables
- ingresos tentativos

Estos registros sirven para proyectar flujo futuro. Cuando se marcan como recibidos, pueden crear o vincular un movimiento de ingreso real.

### Recurrentes

Control de cargos recurrentes:

- suscripciones
- cargos automaticos
- servicios
- pagos periodicos

Pueden usarse para proyectar compromisos futuros.

### Recordatorios

Alertas financieras y no financieras:

- pagos pendientes
- cortes
- fechas importantes
- recordatorios sin monto
- recordatorios con monto que afectan flujo

### Flujo

Vista de proyeccion:

- saldo actual
- saldo proyectado
- saldo mas bajo
- eventos futuros
- eventos que afectan caja
- eventos informativos
- simulador de decisiones

### Simulador y asesor de compra

Permite evaluar decisiones antes de registrarlas:

- gasto en efectivo
- compra con tarjeta
- compra a MSI
- pago extra a deuda
- ingreso extra

Para tarjetas, compara opciones y estima:

- dias al corte
- dias al pago
- utilizacion antes/despues
- disponible restante
- impacto futuro

## Conceptos financieros clave

### Dinero disponible

Es el saldo de cuentas propias que si forman parte del balance personal. Excluye cuentas externas.

### Gasto generado

Representa consumo o gasto registrado, aunque no siempre haya salido efectivo el mismo dia. Por ejemplo, compras con tarjeta.

### Salida real de efectivo

Dinero que realmente baja de cuentas propias, como gastos de debito, pagos de tarjeta o pagos de deuda.

### Compromiso futuro

Pago esperado que puede presionar flujo, como MSI, tarjeta, deuda, recurrente o recordatorio con monto.

### Evento informativo

Registro visible que ayuda a entender el calendario financiero, pero no baja caja. Por ejemplo, corte de tarjeta o MSI ya reflejado en saldo.

## Limitaciones conocidas

- La app depende de que los movimientos se registren correctamente.
- El simulador de fecha no crea un sandbox automatico de datos.
- "Volver a hoy" no borra movimientos creados en staging.
- Los cortes de tarjeta requieren confirmacion manual contra la app bancaria.
- La conciliacion puede variar si hay saldos iniciales, ajustes historicos o movimientos fuera de la app.
