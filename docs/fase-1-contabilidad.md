# Fase 1: Base Contable y Fuente de Verdad

Este documento deja explicito el contrato actual de la app para balances y pagos.

## Fuente de verdad

Los saldos `current_balance` de:

- `accounts`
- `credit_cards`
- `debts`

se consideran derivados del historial de `transactions` y/o de funciones SQL de Supabase.

La app **no debe recalcular esos balances por su cuenta**. La responsabilidad principal vive en la base mediante:

- `trg_transactions_balance_updates`
- `handle_transaction_balance_updates()`
- `recalculate_account_balance(...)`
- `recalculate_credit_card_balance(...)`
- `recalculate_debt_balance(...)`

## Regla operativa

### 1. Movimientos

Al crear, editar o eliminar movimientos:

- la app inserta/actualiza/elimina la fila en `transactions`
- Supabase recalcula balances por trigger

La app no debe sumar ni restar directamente en `accounts.current_balance`, `credit_cards.current_balance` o `debts.current_balance` como parte del flujo normal de movimientos.

### 2. Pagos de TDC

Los pagos de tarjeta tienen dos capas:

1. **Balance real**
   - Lo recalcula Supabase con el trigger de `transactions`.

2. **Metadatos del pago**
   - `applied_to_minimum_payment`
   - `applied_to_no_interest_payment`

Estos dos campos si los ajusta la app porque hoy la base no los reconstruye automaticamente desde historial.

## Implicacion importante

Si se insertan, editan o borran pagos de TDC manualmente por SQL, los balances principales pueden quedar bien por trigger, pero:

- `minimum_payment`
- `no_interest_payment`

pueden desalinearse si no se compensan tambien esos metadatos.

## Cuentas manuales

Para cuentas que recalculan saldo desde historial, el campo importante no es solo `current_balance`, sino tambien `initial_balance`.

Si se quiere "corregir" una cuenta manualmente desde UI o SQL:

- actualizar `initial_balance`
- actualizar `current_balance`

Si solo se cambia `current_balance`, la siguiente recalculacion lo puede sobreescribir.

## Que ya quedo endurecido en Fase 1

- Crear y editar cuentas actualiza `initial_balance` y `current_balance`.
- Los flujos de movimientos y pagos TDC dejaron de mutar balances directamente desde la app.
- La app solo aplica/revierte metadatos de pagos TDC.
- El cambio de cuenta origen en un pago TDC (`X -> Y`) ya puede deshacer y reaplicar correctamente.

## Que seguimos vigilando

- `minimum_payment` y `no_interest_payment` todavia dependen de logica de aplicacion, no de reconciliacion total en SQL.
- MSI y recurrentes siguen siendo proyeccion; aun no generan cargos contables reales automaticos.
- La logica SQL critica vive en Supabase, asi que conviene versionarla formalmente en el repo.

## Runbook

Cuando algo se vea raro:

1. revisar transacciones reales asociadas al saldo
2. confirmar si hay duplicados
3. validar `initial_balance`
4. ejecutar las consultas de [sql/2026-04-16-accounting-reconciliation.sql](/Users/angelzurita/finanzas-app/sql/2026-04-16-accounting-reconciliation.sql)

