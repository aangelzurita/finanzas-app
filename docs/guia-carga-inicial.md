# Guia de carga inicial

Esta guia sirve para capturar tus datos reales sin duplicar saldos ni distorsionar el dashboard.

## Regla principal

Antes de guardar cualquier movimiento, hazte esta pregunta:

**Ese monto ya esta reflejado en el saldo actual que capture en la cuenta o tarjeta?**

- Si **si**, guardalo con **Impactar saldos** apagado.
- Si **no**, guardalo con **Impactar saldos** encendido.

Esa es la regla mas importante para evitar doble conteo.

---

## Orden exacto de carga

Este es el orden que te recomiendo seguir tal cual:

1. Categorias
2. Cuentas
3. Tarjetas de credito
4. Deudas
5. Recurrentes
6. Presupuestos
7. Movimientos historicos del mes actual
8. Compras TDC y pagos TDC del mes actual
9. MSI
10. Validacion final

Si sigues este orden, es mucho mas dificil que dupliques saldos o mezcles gasto con flujo real.

---

## Paso a paso

### Paso 1. Categorias

Carga primero tus categorias reales.

Ejemplos:

- comida
- gasolina
- super
- salud
- entretenimiento
- servicios
- hogar
- escuela
- transporte
- suscripciones

Objetivo:

- no dejar movimientos sin categoria
- poder usar presupuesto y top categorias desde el inicio

### Paso 2. Cuentas

Da de alta tus cuentas con su saldo actual real de hoy.

Ejemplos:

- efectivo
- debito
- ahorro

Objetivo:

- que el total de dinero disponible coincida con lo que realmente tienes hoy

### Paso 3. Tarjetas de credito

Da de alta cada TDC con:

- linea de credito
- saldo usado actual
- pago minimo actual
- pago para no generar intereses actual

Objetivo:

- fijar la foto real actual de cada tarjeta

### Paso 4. Deudas

Da de alta cada deuda con:

- saldo actual real
- pago mensual
- tasa si quieres llevarla
- fechas importantes

Objetivo:

- que deuda total quede bien desde el inicio

### Paso 5. Recurrentes

Carga:

- servicios
- suscripciones
- internet
- telefono
- colegiaturas
- plataformas

Objetivo:

- que el dashboard ya reconozca compromisos futuros y pendientes

### Paso 6. Presupuestos

Define presupuesto por categoria.

Objetivo:

- que el dashboard y el modulo de presupuesto ya puedan medir gasto del mes

### Paso 7. Movimientos historicos del mes actual

Ahora captura gastos y movimientos del mes actual que quieras conservar en historial.

Regla:

- si ya estan reflejados en tus saldos iniciales, usa **Impactar saldos: apagado**
- si no estan reflejados, usa **Impactar saldos: encendido**

Objetivo:

- empezar a alimentar analisis sin romper la foto inicial

### Paso 8. Compras TDC y pagos TDC del mes actual

Captura:

- compras de tarjeta
- pagos a tarjeta
- reembolsos si existieron

Regla:

- compra TDC vieja ya incluida en saldo usado actual -> **Impactar saldos apagado**
- pago TDC viejo ya reflejado en cuenta y tarjeta -> **Impactar saldos apagado**
- compra o pago nuevo -> **Impactar saldos encendido**

Objetivo:

- que gasto generado y salida real de efectivo queden bien separados

### Paso 9. MSI

Carga MSI despues de que ya estan bien tus tarjetas y compras TDC.

Regla:

- si el MSI ya esta reflejado en el saldo actual de la tarjeta, no vuelvas a inflarlo
- si es compra nueva, si debe impactar

Ideal:

- usar compra TDC con opcion **Es compra a MSI**

### Paso 10. Validacion final

Revisa:

- efectivo disponible
- deuda total
- saldo usado por tarjeta
- pago minimo y no intereses
- gasto generado del mes
- salida real de efectivo
- pagos a tarjetas
- MSI comprometido del mes

Objetivo:

- confirmar que lo capturado refleja tu realidad

---

## Orden recomendado de captura

### 1. Categorias

Primero revisa o crea tus categorias reales:

- comida
- gasolina
- super
- salud
- entretenimiento
- servicios
- etc.

Haz esto antes de meter movimientos para no dejar compras sin categoria.

### 2. Cuentas

Captura tus cuentas con su saldo actual real:

- efectivo
- debito
- ahorro

Todavia no metas historial viejo. Primero fija bien el punto de partida.

**Objetivo:** que el total de cuentas coincida con lo que realmente tienes hoy.

### 3. Tarjetas de credito

Da de alta cada TDC con:

- linea de credito
- saldo usado actual
- pago minimo actual
- pago para no generar intereses actual

Aqui estas fijando una foto real de hoy.

Muy importante:

Si luego capturas compras viejas que ya forman parte de ese saldo usado, deben ir con **Impactar saldos** apagado.

### 4. Deudas

Carga cada deuda con:

- saldo actual real
- pago mensual
- tasa si la quieres llevar
- fechas importantes

Otra vez: primero la foto real, luego el historial si hace falta.

### 5. Recurrentes

Da de alta:

- suscripciones
- internet
- telefono
- colegiaturas
- servicios

Lo importante aqui es:

- categoria correcta
- medio de pago correcto
- siguiente fecha correcta

### 6. Presupuestos

Define tus presupuestos por categoria.

Hazlo despues de tener categorias y antes de cargar demasiado historial, para que el dashboard ya lea bien el mes actual.

---

## Como capturar historial sin romper saldos

### Caso A: gasto viejo de cuenta

Ejemplo:

- una compra de hace dias
- ya esta incluida en el saldo actual de tu cuenta

Capturalo como:

- `expense`
- categoria correcta
- fecha real
- **Impactar saldos: apagado**

Asi:

- entra al analisis
- entra al presupuesto
- entra a categorias
- pero no vuelve a bajar tu saldo

### Caso B: compra vieja de TDC

Ejemplo:

- una compra que ya esta incluida en el saldo usado actual de la tarjeta

Capturala como:

- `credit_card_purchase`
- categoria correcta
- fecha real
- **Impactar saldos: apagado**

Asi:

- cuenta como gasto generado
- cuenta en categoria y presupuesto
- pero no vuelve a inflar la tarjeta

### Caso C: pago viejo de TDC

Ejemplo:

- ya pagaste hace dias
- ese pago ya esta reflejado en tu cuenta y en la tarjeta

Capturalo como:

- `credit_card_payment`
- fecha real
- **Impactar saldos: apagado**

Asi:

- queda en historial
- no vuelve a mover ni cuenta ni tarjeta

### Caso D: compra nueva de TDC

Ejemplo:

- hoy hiciste una compra

Capturala como:

- `credit_card_purchase`
- categoria correcta
- **Impactar saldos: encendido**

Asi si sube el saldo usado.

### Caso E: compra nueva a MSI

Hazla desde compra TDC y marca:

- **Es compra a MSI**

Si ya esta incluida en saldo actual:

- **Impactar saldos: apagado**

Si es nueva:

- **Impactar saldos: encendido**

---

## Estrategia recomendada

### Fase 1: foto real de hoy

Primero mete solo:

1. categorias
2. cuentas
3. tarjetas
4. deudas
5. recurrentes
6. presupuestos

Sin historial todavia.

Luego valida:

- efectivo disponible
- deuda total
- pagos TDC

### Fase 2: historial del mes actual

Despues mete el historial del mes actual:

- gastos de cuenta
- compras TDC
- pagos TDC
- reembolsos
- MSI

Usando siempre la regla de **Impactar saldos**.

---

## Validacion rapida despues de cargar

### Cuentas

- El efectivo disponible coincide con tu realidad?

### Tarjetas

- El saldo usado coincide con tu app bancaria?
- El minimo coincide?
- El monto para no generar intereses coincide?

### Dashboard

- Gasto generado del mes tiene sentido?
- Salida real de efectivo tiene sentido?
- Pagos a tarjetas no se meten como gasto por categoria?

---

## Recomendacion final

No intentes reconstruir toda tu vida financiera de golpe.

Empieza con:

1. foto real de hoy
2. historial del mes actual
3. luego, si quieres, meses anteriores

Eso deja la app util desde ya y evita que la carga inicial se vuelva pesada.
