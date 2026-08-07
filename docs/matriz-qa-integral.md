# Matriz integral de QA

Esta matriz convierte el plan integral de pruebas en una guia ejecutable para staging.

## Objetivo

Validar que Finanzas App:

- registre operaciones financieras sin duplicar saldos
- distinga gasto generado, salida real de efectivo y compromiso futuro
- mantenga consistencia entre cuentas, tarjetas, deudas y movimientos
- proyecte flujo de efectivo con fechas correctas
- recomiende tarjetas y decisiones con datos coherentes
- no mezcle datos entre usuarios
- responda bien ante fechas limite, datos incompletos y operaciones atipicas

## Orden de ejecucion

1. Integridad de saldos y movimientos.
2. Tarjetas, pagos, cortes y MSI.
3. Proyeccion de flujo.
4. Ingresos programados, recurrentes y recordatorios.
5. Deudas.
6. Simulador y asesor de tarjetas.
7. Dashboard.
8. Formularios y UX.
9. Seguridad, rendimiento y recuperacion.

## Invariantes financieros

Estas reglas deben mantenerse siempre:

- Una cuenta externa nunca aumenta ni disminuye dinero personal disponible.
- Una transferencia entre cuentas propias no genera ingreso ni gasto.
- Una compra con tarjeta genera gasto, pero no salida inmediata de efectivo.
- Un pago de tarjeta genera salida de efectivo, pero no nuevo gasto.
- Un reembolso reduce saldo usado y gasto asociado cuando corresponda.
- Una mensualidad informativa de MSI no duplica saldo usado ni flujo.
- El disponible de una tarjeta no debe exceder su linea salvo saldo a favor claramente mostrado.
- Un evento informativo no modifica flujo de efectivo.
- Editar o eliminar un movimiento recalcula los modulos relacionados.
- El mismo movimiento no se cuenta dos veces en dashboard, presupuesto o flujo.

## Dataset base recomendado

Fecha simulada inicial:

```txt
10 de agosto de 2026
```

Usuario base:

```txt
tester.finanzas
```

Cuentas:

| Cuenta | Tipo | Saldo inicial | Propia | Esperado |
| --- | --- | ---: | --- | --- |
| Efectivo | cash | 1000 | Si | Cuenta dinero disponible |
| Nomina | debit | 10000 | Si | Cuenta dinero disponible |
| Ahorro | savings | 20000 | Si | Cuenta dinero disponible |
| Inversion | investment | 30000 | Si | Cuenta dinero disponible si `include_in_balance=true` |
| Cuenta familiar | debit/external | 15000 | No | No afecta dinero disponible |

Dinero personal disponible inicial esperado:

```txt
61000
```

Tarjetas:

| Tarjeta | Linea | Saldo usado | Corte | Pago |
| --- | ---: | ---: | ---: | ---: |
| Tarjeta Azul | 50000 | 10000 | 15 | 5 |
| Tarjeta Oro | 30000 | 3000 | 28 | 18 |

Deuda:

| Concepto | Saldo | Pago | Proximo pago |
| --- | ---: | ---: | --- |
| Prestamo personal | 24000 | 2000 | 2026-08-20 |

Ingresos:

| Concepto | Monto | Fecha | Confianza |
| --- | ---: | --- | --- |
| Quincena | 12000 | 2026-08-15 | confirmed/expected |
| Bono | 3000 | 2026-08-30 | tentative |

Recurrentes:

| Concepto | Monto | Fecha |
| --- | ---: | --- |
| Internet | 600 | 2026-08-12 |
| Streaming | 250 | 2026-08-18 |
| Renta | 6000 | 2026-09-01 |

## Registro de bugs

Usar este formato:

```txt
ID:
Modulo:
Ambiente:
Fecha simulada:
Usuario:
Datos usados:
Pasos:
Resultado esperado:
Resultado obtenido:
Severidad:
Captura/video:
Notas:
```

## Severidades

| Severidad | Criterio |
| --- | --- |
| Critica | Afecta saldos, mezcla usuarios, rompe login o impide operar. |
| Alta | Duplica movimientos, calcula mal tarjeta/MSI/flujo o corrompe datos. |
| Media | Confunde, requiere workaround o afecta una vista importante. |
| Baja | Texto, layout, microcopy, orden visual o detalle menor. |

## Matriz de casos

| ID | Area | Caso | Prioridad | Tipo |
| --- | --- | --- | --- | --- |
| CTA-001 | Cuentas | Crear cuenta propia y validar dinero disponible | Alta | Manual + automatizable |
| CTA-002 | Cuentas | Crear cuenta externa y excluirla de balance | Alta | Manual + automatizable |
| CTA-003 | Cuentas | Editar saldo inicial sin duplicar movimientos | Alta | Manual |
| CTA-004 | Cuentas | Intentar eliminar cuenta con movimientos | Alta | Manual |
| CTA-005 | Cuentas | Cuenta de debito con saldo negativo | Media | Manual |
| MOV-001 | Movimientos | Registrar ingreso | Critica | Manual + automatizable |
| MOV-002 | Movimientos | Registrar gasto con debito | Critica | Manual + automatizable |
| MOV-003 | Movimientos | Registrar gasto en efectivo | Alta | Manual + automatizable |
| MOV-004 | Movimientos | Transferencia entre cuentas propias | Alta | Manual |
| MOV-005 | Movimientos | Transferencia hacia cuenta externa | Alta | Manual |
| MOV-006 | Movimientos | Transferencia desde cuenta externa | Alta | Manual |
| MOV-007 | Movimientos | Editar monto de gasto | Critica | Manual |
| MOV-008 | Movimientos | Cambiar cuenta de origen | Critica | Manual |
| MOV-009 | Movimientos | Eliminar movimiento | Critica | Manual |
| MOV-010 | Movimientos | Doble envio de formulario | Alta | Manual + automatizable UI |
| TDC-001 | Tarjetas | Compra normal con tarjeta | Critica | Manual + automatizable |
| TDC-002 | Tarjetas | Pago de tarjeta desde cuenta propia | Critica | Manual + automatizable |
| TDC-003 | Tarjetas | Pago de tarjeta desde cuenta externa | Critica | Manual |
| TDC-004 | Tarjetas | Pago superior al saldo usado | Alta | Manual |
| TDC-005 | Tarjetas | Reembolso parcial | Alta | Manual |
| TDC-006 | Tarjetas | Reembolso total | Alta | Manual |
| TDC-007 | Tarjetas | Reembolso mayor a compra | Alta | Manual |
| TDC-008 | Tarjetas | Compra superior al disponible | Alta | Manual |
| TDC-009 | Tarjetas | Conciliacion correcta | Critica | Manual + SQL |
| TDC-010 | Tarjetas | Diferencia de conciliacion | Alta | Manual + SQL |
| TDC-011 | Tarjetas | Cierre de corte | Critica | Manual |
| TDC-012 | Tarjetas | Compra en fecha de corte | Alta | Manual |
| TDC-013 | Tarjetas | Pago en fecha limite | Alta | Manual |
| MSI-001 | MSI | Crear compra MSI | Critica | Manual |
| MSI-002 | MSI | Division no exacta y redondeo | Alta | Manual + unit |
| MSI-003 | MSI | Avance de mensualidad | Alta | Manual |
| MSI-004 | MSI | Finalizacion del plan | Alta | Manual |
| MSI-005 | MSI | Editar plan activo con historial | Media | Manual |
| MSI-006 | MSI | Cancelar MSI por reembolso | Alta | Manual |
| MSI-007 | MSI | Pago parcial tarjeta con MSI | Alta | Manual |
| DEU-001 | Deudas | Crear deuda | Alta | Manual |
| DEU-002 | Deudas | Pago desde cuenta propia | Alta | Manual |
| DEU-003 | Deudas | Pago desde cuenta externa | Alta | Manual |
| DEU-004 | Deudas | Pago superior al saldo | Alta | Manual |
| DEU-005 | Deudas | Pago extra | Media | Manual |
| DEU-006 | Deudas | Deuda liquidada | Alta | Manual |
| ING-001 | Ingresos | Crear ingreso esperado | Alta | Manual |
| ING-002 | Ingresos | Marcar ingreso recibido | Critica | Manual |
| ING-003 | Ingresos | Marcar recibido dos veces | Critica | Manual + idempotencia |
| ING-004 | Ingresos | Recibido por monto distinto | Media | Manual |
| ING-005 | Ingresos | Ingreso tentativo | Media | Manual |
| ING-006 | Ingresos | Ingreso vencido no recibido | Alta | Manual |
| REC-001 | Recurrentes | Cargo recurrente proyectado | Alta | Manual |
| REC-002 | Recurrentes | Convertir recurrente en movimiento | Alta | Manual |
| REC-003 | Recurrentes | Editar recurrencia | Media | Manual |
| REC-004 | Recurrentes | Pausar recurrente | Media | Manual |
| REM-001 | Recordatorios | Recordatorio sin monto | Media | Manual |
| REM-002 | Recordatorios | Recordatorio con monto | Alta | Manual |
| REM-003 | Recordatorios | Recordatorio convertido en movimiento | Alta | Manual |
| FLU-001 | Flujo | Saldo inicial proyectado | Critica | Manual + unit |
| FLU-002 | Flujo | Secuencia cronologica | Critica | Manual + unit |
| FLU-003 | Flujo | Eventos del mismo dia | Alta | Unit |
| FLU-004 | Flujo | Evento informativo | Alta | Unit |
| FLU-005 | Flujo | MSI ya incluido en saldo de tarjeta | Alta | Manual |
| FLU-006 | Flujo | Saldo proyectado negativo antes de ingreso | Critica | Manual + unit |
| FLU-007 | Flujo | Horizonte 7/15/30/60/90 dias | Media | Manual + unit |
| FLU-008 | Flujo | Fin de mes, fin de ano, febrero | Alta | Unit |
| SIM-001 | Simulador | Gasto en efectivo | Alta | Manual + unit |
| SIM-002 | Simulador | Compra con tarjeta | Alta | Manual + unit |
| SIM-003 | Simulador | Compra MSI | Alta | Manual + unit |
| SIM-004 | Simulador | Pago extra a deuda | Media | Manual |
| SIM-005 | Simulador | Convertir simulacion en operacion real | Baja | No aplica hasta implementar conversion |
| ASE-001 | Asesor | Recomendacion por corte/pago | Alta | Unit + manual |
| ASE-002 | Asesor | Penalizar utilizacion alta | Alta | Unit |
| ASE-003 | Asesor | Compra mayor al disponible | Alta | Unit |
| ASE-004 | Asesor | Empate de opciones | Media | Unit |
| ASE-005 | Asesor | Datos incompletos | Media | Unit |
| DAS-001 | Dashboard | Consistencia dinero disponible | Critica | Manual |
| DAS-002 | Dashboard | Proximos compromisos sin duplicar | Alta | Manual |
| DAS-003 | Dashboard | Proxima accion financiera ante deficit | Media | Manual |
| DAS-004 | Dashboard | Categoria de atencion | Media | Manual |
| DAS-005 | Dashboard | Estado sin datos | Media | Manual |
| CON-001 | Transversal | Movimiento visible en todos los modulos | Critica | Manual |
| CON-002 | Transversal | Edicion transversal | Critica | Manual |
| CON-003 | Transversal | Eliminacion transversal | Critica | Manual |
| CON-004 | Transversal | Recarga no repite operacion | Alta | Manual |
| CON-005 | Transversal | Cierre/reapertura de sesion | Alta | Manual |
| SEG-001 | Seguridad | Acceso sin sesion | Critica | Manual |
| SEG-002 | Seguridad | Usuario no accede a datos ajenos | Critica | Manual + SQL/RLS |
| SEG-003 | Seguridad | Cambiar ID en URL | Critica | Manual |
| SEG-004 | Seguridad | Variables sensibles no llegan al navegador | Critica | Manual + revision |

## Pruebas temporales obligatorias

Probar con fecha simulada:

- ultimo dia de mes
- meses de 28, 29, 30 y 31 dias
- cambio de ano
- ano bisiesto
- 23:59 y 00:00
- compra en dia de corte
- pago en fecha limite
- recurrencias en dia 31
- ingresos quincenales en meses cortos
- eventos vencidos
- edicion retroactiva

Resultado esperado:

- la fecha se interpreta igual en base de datos, interfaz, dashboard, flujo y asesor
- no se duplican eventos
- no se pierden recurrencias

## Pruebas de redondeo

Montos a probar:

- 0.01
- 0.10
- 1.005
- 999.99
- 10000.01
- divisiones MSI no exactas
- multiples operaciones de centavos
- porcentajes de utilizacion con decimales

Resultado esperado:

- saldos monetarios con dos decimales coherentes
- no hay diferencias acumuladas por punto flotante
- la suma de componentes coincide con el total

## Concurrencia e idempotencia

Casos:

- dos pestanas abiertas
- editar el mismo movimiento desde ambas
- registrar pago mientras otra pestana actualiza tarjeta
- ejecutar cierre de corte dos veces
- marcar ingreso recibido dos veces
- procesar recurrente dos veces
- doble clic en guardar

Resultado esperado:

- no hay duplicados
- acciones criticas bloquean doble envio
- la app usa informacion reciente
- errores se muestran sin dejar registros parciales

## Pruebas automatizables primero

Prioridad para automatizacion:

1. `lib/credit-card-advisor.ts`
2. `lib/cashflow-projection.ts`
3. `lib/financial-calendar.ts`
4. `lib/credit-card-installments.ts`
5. reglas de presupuesto
6. conciliacion de tarjeta

Estas pruebas no requieren navegador ni Supabase si se arman con datos mock.

## Pruebas manuales obligatorias

Estas requieren UI y sesion staging:

- marcar ingreso recibido
- registrar compra/pago/reembolso de tarjeta
- cerrar corte
- editar/eliminar movimientos
- verificar historial transversal
- probar RLS con dos usuarios
- reset de staging

## Comandos previos y posteriores

Antes de pruebas:

```bash
npm run env:staging
npm run dev
```

Crear snapshot si staging esta limpio:

```bash
npm run staging:snapshot
```

Despues de pruebas destructivas:

```bash
npm run staging:reset -- --confirm-reset-staging
```

Antes de subir a produccion:

```bash
npm run build
npm run lint -- --quiet
```
