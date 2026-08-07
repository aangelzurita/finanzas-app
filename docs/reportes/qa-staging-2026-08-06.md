# Reporte QA staging - 2026-08-06

## Alcance ejecutado

Primera ronda no destructiva sobre Supabase staging:

- conteos por modulo
- integridad de `user_id`
- cuentas externas
- saldos de cuentas
- saldos de tarjetas y cuentas espejo
- pagos TDC incompletos
- duplicados probables
- ingresos programados
- MSI vencidos
- recordatorios vencidos
- recurrentes vencidos
- build/lint local
- pruebas E2E de navegador con Playwright

No se ejecutaron acciones destructivas ni se crearon movimientos.

## Estado de datos

| Modulo | Registros |
| --- | ---: |
| auth.users | 3 |
| accounts | 31 |
| transactions | 246 |
| credit_cards | 16 |
| credit_card_installments | 17 |
| debts | 4 |
| income_schedules | 2 |
| recurring_charges | 26 |
| reminders | 28 |
| budgets | 33 |

## Checks que pasaron

- No hay `user_id` huerfanos en cuentas, movimientos, tarjetas, MSI, deudas ni ingresos programados.
- No hay cuentas externas activas marcadas para incluirse en balance.
- No hay cuentas propias activas excluidas de balance por error.
- No hay tarjetas con saldo usado negativo, linea invalida o saldo usado mayor a linea.
- No hay diferencia entre `credit_cards.current_balance` y la cuenta espejo.
- No hay diferencia entre saldo calculado y saldo guardado en cuentas propias.
- No hay diferencia entre saldo calculado y saldo guardado en deudas.
- No hay pagos TDC completados sin cuenta origen o sin tarjeta relacionada.
- No hay duplicados exactos de movimientos completados.
- No hay duplicados exactos de recurrentes activos.

## Hallazgos

### QA-001 - Recordatorios vencidos pendientes acumulados

Severidad: Media

Descripcion:
Existen recordatorios `pending` con fechas vencidas desde abril, mayo, junio, julio y agosto de 2026. Varios no tienen monto, pero siguen apareciendo como pendientes.

Impacto:
Puede saturar "pagos proximos", dashboard o alertas. El usuario puede interpretar compromisos viejos como pagos actuales, aunque algunos sean solo informativos.

Propuesta:
Separar visualmente:

- vencidos financieros con monto
- vencidos informativos sin monto
- vencidos recurrentes que deben avanzar fecha
- recordatorios de tarjeta ya cubiertos por pago real

Tambien conviene agregar una accion masiva o flujo claro de "marcar como revisado/omitido".

Complejidad: Media

### QA-002 - Duplicado probable de recordatorio "Pagar internet"

Severidad: Media

Descripcion:
Hay 2 recordatorios pendientes con mismo titulo, fecha y monto:

```txt
Pagar internet - 2026-04-21 - $599
```

Impacto:
Puede duplicar alertas y, si ambos afectaran flujo, duplicar compromisos.

Propuesta:
Agregar validacion o diagnostico de duplicados en recordatorios por:

- usuario
- titulo
- fecha
- monto
- entidad relacionada

Complejidad: Baja/Media

### QA-003 - Recurrentes activos con fecha vencida acumulada

Severidad: Alta

Descripcion:
Hay 19 recurrentes activos con `next_charge_date` anterior a la fecha de prueba. Algunos tienen `last_processed_charge_date`, otros no.

Impacto:
Puede provocar que el flujo muestre compromisos atrasados o que el usuario no sepa si debe generarlos, omitirlos o solo actualizarlos. Tambien aumenta riesgo de duplicidad si se procesan varias veces sin una pantalla clara.

Propuesta:
Crear vista operativa de recurrentes vencidos:

- pendiente de registrar
- ya procesado
- omitido
- saltar a siguiente fecha

No procesar automaticamente sin confirmacion.

Complejidad: Media

### QA-004 - MSI vencidos sin compra ligada que requieren procesamiento

Severidad: Alta

Descripcion:
Se detectaron 4 planes MSI activos sin `purchase_transaction_id` con mensualidades vencidas pendientes:

| Tarjeta | MSI | Mensualidad | Vencidas pendientes |
| --- | --- | ---: | ---: |
| TDC Prueba | Qa phone | $88.89 | 3 |
| TDC Prueba | Qa tele | $500.00 | 3 |
| Joy Banamex | qa iPhone | $1,000.00 | 2 |
| Joy Banamex | Accesorios mg5 | $223.16 | 1 |

Impacto:
Si estos MSI historicos deben generar cargos reales, el saldo de tarjeta puede estar incompleto hasta ejecutar "Generar MSI vencidos". Si no deben generar cargos, falta una marca visual de que son solo informativos.

Propuesta:
En detalle de tarjeta, mostrar un bloque claro:

- "MSI historicos con cargos vencidos por generar"
- cantidad de mensualidades
- total a generar
- boton de accion por tarjeta

Complejidad: Media

### QA-005 - Compras/pagos TDC `affects_balance=false` pero `affects_statement=true`

Severidad: Media

Descripcion:
Hay movimientos TDC que no afectan saldo pero si cuentan para corte:

| Tipo | affects_balance | affects_statement | Registros | Total |
| --- | --- | --- | ---: | ---: |
| credit_card_payment | false | true | 8 | $28,846.69 |
| credit_card_purchase | false | true | 39 | $27,130.94 |

Impacto:
Puede ser correcto para movimientos historicos ya reflejados en saldos, pero es facil que el usuario lo interprete como inconsistencia: "no afecta saldo" pero aparece en corte/pago.

Propuesta:
En UI mostrar etiqueta diferenciada:

- "Mapeo historico"
- "Cuenta para corte"
- "No mueve saldo actual"

Complejidad: Baja

## Observaciones funcionales

### Ingresos programados

Hay 2 ingresos activos futuros sin movimiento ligado:

- Quincena: 2026-08-10
- Bono: 2026-08-28

Esto es correcto mientras no se marquen como recibidos.

### Tarjetas

Las tarjetas pasan los checks basicos:

- saldo usado dentro de linea
- disponible no negativo
- tarjeta y cuenta espejo sincronizadas
- saldo calculado por movimientos coincide

## Verificacion tecnica

```txt
npm run build: OK
npm run lint -- --quiet: OK
FINANZAS_E2E_EMAIL=... FINANZAS_E2E_PASSWORD=... npm run test:e2e: OK
```

## Pruebas E2E ejecutadas

Suite: `tests/e2e/finanzas-staging.spec.ts`

Resultado smoke: 3/3 pruebas pasaron.

- Login con usuario staging y carga de dashboard.
- Navegacion basica a modulos principales: cuentas, movimientos, tarjetas, flujo, ingresos, recordatorios y presupuesto.
- Simulador de fecha sin error de hidratacion.
- Asesor de mejor tarjeta recalculando contra fecha simulada.

Suite operativa acumulada con rollback: 10/10 pruebas pasaron.

- ING-002: marcar ingreso programado como recibido crea/activa movimiento real y el ingreso queda visible en Movimientos.
- TDC-001: compra normal con tarjeta queda visible en Movimientos y en historial de la TDC.
- TDC-002: pago de tarjeta desde cuenta propia queda visible en Movimientos y en historial de la TDC.
- TDC-003: pago de tarjeta desde cuenta externa queda como referencia visible.
- TDC-005: reembolso parcial queda visible en Movimientos y en historial de la TDC.
- TDC-009: conciliacion de tarjeta queda visible con saldo tarjeta, saldo esperado y diferencia.
- MSI-001: compra a MSI crea plan y queda visible en detalle de tarjeta.
- MSI-003: generar MSI vencidos muestra resultado operativo y hace una validacion basica contra duplicidad inmediata.
- TDC-011: cierre de corte guarda historial y actualiza pago para no generar intereses.
- FLU-002: flujo sigue operativo al cambiar fecha simulada.
- Se ejecuto con `FINANZAS_E2E_MUTATE=1`.
- Al finalizar se restauro staging desde snapshot con `FINANZAS_E2E_RESET_AFTER=1`.
- Conteos post-rollback confirmados:
  - accounts: 31
  - credit_cards: 16
  - credit_card_installments: 17
  - credit_card_statements: 0
  - income_schedules: 2
  - transactions: 246

Notas:

- La prueba de `/flujo` se actualizo porque la pantalla ya no usa el encabezado anterior "Proyeccion de flujo"; ahora el h1 funcional es "Decidir antes de gastar".
- La prueba de mejor tarjeta se ajusto para usar dos fechas donde el ranking realmente debe cambiar con los datos actuales de staging. No siempre cambiar de dia cambia la mejor tarjeta; depende del corte, pago, linea y saldo de cada tarjeta.
- Los reportes generados por Playwright se excluyeron de ESLint y Git para no contaminar build/lint.
- El primer intento de rollback detecto una falla en `staging:reset`: el snapshot completo intentaba recrear `auth`, pero en Supabase hosted ese schema ya existe. Se corrigio el script para restaurar solo `public` desde el snapshot y conservar `auth.users` existente como referencia.

## Limitaciones de esta ronda

- Las pruebas de navegador todavia no cubren todos los flujos criticos.
- Se ejecutaron pruebas operativas acumuladas con mutacion real para ingreso recibido, compra TDC, pago TDC propio, pago TDC externo, reembolso, MSI, MSI vencidos y cierre de corte. Se restauro staging al snapshot al terminar.
- No se valido RLS cambiando IDs en rutas.

## Siguiente ronda recomendada

Ejecutar pruebas funcionales en staging con snapshot activo:

1. Marcar ingreso como recibido y verificar que no duplique.
2. Registrar pago TDC desde cuenta propia.
3. Registrar pago TDC desde cuenta externa.
4. Registrar compra normal con tarjeta.
5. Registrar compra MSI.
6. Generar MSI vencidos en una tarjeta de prueba.
7. Cerrar corte y confirmar recordatorio.
8. Simular fechas y validar mejor tarjeta.
9. Resetear staging y confirmar que vuelve al snapshot.

Para automatizar estas pruebas con navegador, se recomienda instalar Playwright y crear pruebas e2e contra staging.
