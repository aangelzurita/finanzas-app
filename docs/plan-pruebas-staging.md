# Plan de pruebas en staging

Este documento es la guia operativa rapida para ejecutar pruebas en staging.

La matriz completa de casos, invariantes, dataset base, temporalidad, redondeo, concurrencia y seguridad esta en:

```txt
docs/matriz-qa-integral.md
```

Objetivo: validar la logica operativa antes de subir cambios a produccion.

## Preparacion

1. Apuntar local a staging:

```bash
npm run env:staging
npm run dev
```

2. Confirmar que aparece la barra amarilla de simulacion de fecha.

3. Crear snapshot base si staging esta limpio:

```bash
npm run staging:snapshot
```

4. Registrar bugs con:

```txt
Modulo:
Ambiente:
Fecha simulada:
Usuario:
Pasos:
Resultado esperado:
Resultado obtenido:
Captura:
Severidad:
Notas:
```

## Severidades

| Severidad | Criterio |
| --- | --- |
| Critica | Afecta saldos reales, bloquea login o impide usar modulos principales. |
| Alta | Calcula mal pagos, flujo, tarjetas, MSI o genera duplicados importantes. |
| Media | Confunde al usuario o requiere workaround, pero no corrompe datos. |
| Baja | Texto, layout, estados visuales o detalles menores. |

## Prueba 1: acceso y datos base

Pasos:

1. Iniciar sesion en staging.
2. Abrir dashboard.
3. Abrir cuentas.
4. Abrir tarjetas.
5. Abrir movimientos.

Esperado:

- carga sin errores
- datos visibles
- no aparece informacion vacia si existen registros
- la barra de staging esta visible

## Prueba 2: simulador de fecha

Pasos:

1. Cambiar fecha simulada a una fecha futura.
2. Abrir dashboard.
3. Abrir flujo.
4. Abrir tarjetas.
5. Presionar "Volver a hoy".

Esperado:

- dashboard recalcula salud financiera
- flujo cambia segun fecha activa
- mejor tarjeta cambia dias al corte/pago
- volver a hoy solo quita la fecha simulada
- no se borran movimientos ni ingresos

## Prueba 3: ingresos programados

Pasos:

1. Abrir ingresos.
2. Crear ingreso programado quincenal.
3. Marcarlo como recibido.
4. Revisar movimientos.
5. Revisar cuenta destino.
6. Volver a marcar recibido si el boton sigue visible.

Esperado:

- se crea o actualiza un ingreso real
- afecta saldo si corresponde
- no duplica ingresos
- avanza la proxima fecha del ingreso programado
- el movimiento queda visible en historial de cuenta

## Prueba 4: cuentas y movimientos

Pasos:

1. Abrir una cuenta de debito.
2. Registrar gasto desde esa cuenta.
3. Confirmar que regresa al detalle de la cuenta.
4. Revisar saldo.
5. Registrar ingreso.
6. Revisar historial.

Esperado:

- el saldo cambia correctamente
- el historial muestra movimientos
- no redirige al home si se inicio desde la cuenta

## Prueba 5: cuentas externas

Pasos:

1. Crear o editar una cuenta como externa.
2. Registrar pago de deuda o tarjeta usando esa cuenta.
3. Revisar dashboard.
4. Revisar flujo.

Esperado:

- la cuenta externa puede seleccionarse como referencia
- no suma a dinero disponible
- no reduce saldo personal
- el pago queda trazable

## Prueba 6: compra con tarjeta

Pasos:

1. Abrir una tarjeta.
2. Registrar compra normal.
3. Revisar saldo usado.
4. Revisar disponible.
5. Revisar historial.
6. Revisar conciliacion.

Esperado:

- saldo usado aumenta
- disponible baja
- movimiento aparece en tarjeta
- conciliacion sigue explicable

## Prueba 7: pago de tarjeta

Pasos:

1. Registrar pago de tarjeta desde cuenta propia.
2. Revisar saldo de cuenta origen.
3. Revisar saldo usado de tarjeta.
4. Revisar historial de cuenta.
5. Revisar historial de tarjeta.

Esperado:

- cuenta propia baja si el pago afecta saldo
- tarjeta baja si corresponde
- el pago aparece en cuenta y tarjeta
- no se duplica salida de efectivo

## Prueba 8: pago de tarjeta desde cuenta externa

Pasos:

1. Registrar pago de tarjeta usando cuenta externa.
2. Revisar dashboard.
3. Revisar tarjeta.
4. Revisar flujo.

Esperado:

- tarjeta baja si el pago liquida saldo
- dinero disponible propio no baja
- queda claro que salio de fuente externa

## Prueba 9: MSI

Pasos:

1. Registrar compra MSI.
2. Revisar modulo MSI de la tarjeta.
3. Simular fecha posterior al dia de cargo.
4. Revisar historial de tarjeta.
5. Revisar flujo.

Esperado:

- el plan MSI aparece activo
- el total queda reflejado segun modelo actual
- mensualidades aparecen como informativas si no son movimientos reales
- no se duplica saldo
- el flujo muestra compromisos segun corresponda

## Prueba 10: generar MSI vencidos

Pasos:

1. Usar un MSI historico sin compra total ligada.
2. Simular fecha posterior al dia de cargo.
3. Presionar "Generar MSI vencidos".
4. Revisar historial y saldo.

Esperado:

- se crean cargos reales pendientes solo cuando aplica
- no se duplican si ya existian
- saldo de tarjeta se recalcula
- el mensaje explica lo ocurrido

## Prueba 11: cierre de corte

Pasos:

1. Abrir tarjeta.
2. Cerrar corte.
3. Elegir fecha de corte.
4. Comparar estimado app vs monto banco.
5. Confirmar movimientos cargados.
6. Guardar corte.

Esperado:

- calcula pago para no generar intereses estimado
- permite capturar monto real del banco
- guarda historial de corte si existe migracion
- actualiza recordatorio de pago
- no modifica compras ni pagos anteriores

## Prueba 12: mejor tarjeta

Pasos:

1. Abrir dashboard.
2. Anotar mejor tarjeta y dias estimados.
3. Simular diferentes fechas antes/despues de corte.
4. Abrir tarjetas.
5. Revisar ranking.

Esperado:

- dias al corte/pago cambian con fecha simulada
- la recomendacion puede cambiar si otra tarjeta conviene mas
- si queda la misma tarjeta, la razon y fechas deben tener sentido

## Prueba 13: flujo proyectado

Pasos:

1. Abrir flujo.
2. Probar filtros 15 dias, este mes, 60 dias.
3. Simular fecha futura.
4. Revisar saldo mas bajo.
5. Revisar eventos que provocan minimo.

Esperado:

- eventos ordenados cronologicamente
- saldo mostrado indica saldo despues de eventos del dia
- ingresos suman
- pagos bajan solo si afectan caja
- informativos no bajan saldo

## Prueba 14: simulador de decisiones

Pasos:

1. Simular gasto en efectivo.
2. Simular ingreso extra.
3. Simular compra con tarjeta.
4. Simular MSI.
5. Revisar recomendacion.

Esperado:

- no crea movimientos reales
- efectivo baja solo en gasto/deuda
- tarjeta normal no baja efectivo hoy
- MSI muestra compromiso futuro
- recomendaciones safe/caution/avoid tienen sentido

## Prueba 15: deudas

Pasos:

1. Crear deuda con monto valido.
2. Intentar guardar deuda invalida.
3. Agregar proxima fecha y frecuencia.
4. Asociar cuenta propia.
5. Asociar cuenta externa.
6. Revisar flujo.

Esperado:

- validaciones bloquean datos invalidos
- deuda con cuenta propia afecta flujo
- deuda con cuenta externa aparece como informativa o no reduce caja propia
- no crea movimientos automaticamente

## Prueba 16: recordatorios

Pasos:

1. Crear recordatorio sin monto.
2. Crear recordatorio con monto.
3. Simular fecha vencida.
4. Marcar completado.
5. Omitir.

Esperado:

- sin monto aparece visible pero no afecta caja
- con monto afecta flujo si corresponde
- vencidos se separan
- completados/omitidos no presionan metricas activas

## Prueba 17: recurrentes

Pasos:

1. Crear cargo recurrente.
2. Simular fecha de cargo.
3. Revisar flujo.
4. Si existe accion de generar cargo, ejecutarla.

Esperado:

- aparece como compromiso futuro
- no se duplica cargo ya generado
- respeta si afecta caja o es informativo

## Prueba 18: presupuesto y categorias

Pasos:

1. Revisar presupuesto del mes.
2. Registrar gasto normal.
3. Registrar compra con tarjeta.
4. Registrar MSI.
5. Revisar dashboard.

Esperado:

- gasto normal cuenta a presupuesto
- compra normal con tarjeta cuenta
- pago de tarjeta no cuenta como gasto presupuestal
- MSI afecta presupuesto por mensualidad cuando aplique

## Prueba 19: reset de staging

Pasos:

1. Crear un movimiento de prueba.
2. Confirmar que aparece.
3. Ejecutar:

```bash
npm run staging:reset -- --confirm-reset-staging
```

4. Recargar app.

Esperado:

- staging vuelve al snapshot base
- el movimiento de prueba desaparece
- login sigue funcionando

## Prueba 20: regresion produccion

Antes de subir cambios a produccion:

```bash
npm run build
npm run lint -- --quiet
```

Esperado:

- build pasa
- lint pasa o solo muestra errores heredados documentados
- no se agregaron secretos a Git
- `NEXT_PUBLIC_APP_ENV=production` en Vercel
