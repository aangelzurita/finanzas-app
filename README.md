## Finanzas App

Aplicacion de finanzas personales construida con Next.js App Router y Supabase.

Hoy cubre:

- cuentas
- movimientos
- tarjetas de credito
- pagos de TDC
- deudas
- cargos recurrentes
- recordatorios
- presupuestos
- MSI ligados a tarjetas

## Desarrollo

Para iniciar el proyecto:

```bash
npm run dev
```

Abre `http://localhost:3000`.

## Notas importantes

### Next.js local

Este repo tiene una regla local importante: antes de hacer cambios grandes en App Router, revisar la documentacion incluida en:

`node_modules/next/dist/docs/`

### Fuente de verdad contable

Los balances principales viven como derivacion del historial de `transactions` y de funciones SQL en Supabase.

Consulta:

- [docs/fase-1-contabilidad.md](/Users/angelzurita/finanzas-app/docs/fase-1-contabilidad.md)
- [sql/2026-04-16-accounting-reconciliation.sql](/Users/angelzurita/finanzas-app/sql/2026-04-16-accounting-reconciliation.sql)

Resumen rapido:

- la base recalcula `current_balance`
- la app no debe recalcular balances por su cuenta
- la app solo complementa metadatos de pagos TDC (`applied_to_*`)
- para corregir cuentas manualmente, actualizar `initial_balance` y `current_balance`

## SQL manual necesario

Hay cambios que requieren ejecutar SQL en Supabase, por ejemplo:

- tabla `credit_card_installments`
- policies / RLS asociadas
- funciones y triggers ya existentes para recalculo de balances

Los archivos del directorio `sql/` sirven como referencia de esas piezas.

## Estado actual

La app ya es util para gestion diaria, pero sigue en proceso de endurecimiento contable.

En especial, seguimos cuidando:

- pagos de TDC
- reconciliacion de balances
- automatizacion de MSI y recurrentes
- versionado de logica SQL critica
