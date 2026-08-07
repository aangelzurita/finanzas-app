# Ambientes: produccion, local y staging

Esta guia explica como correr la app contra produccion o contra una base de pruebas en Supabase.

## Objetivo

Mantener produccion estable y usar staging para probar:

- fechas simuladas
- ingresos programados
- movimientos
- pagos de tarjeta
- cortes de tarjeta
- MSI
- recurrentes
- recordatorios
- flujo proyectado

## Archivos de entorno

Los archivos con llaves reales no se suben a Git.

| Archivo | Uso |
| --- | --- |
| `.env.local` | Archivo que Next.js lee al correr localmente. Se reemplaza con scripts. |
| `.env.production.local` | Llaves reales de Supabase produccion para uso local. Privado. |
| `.env.staging.local` | Llaves reales de Supabase staging para uso local. Privado. |
| `.env.production.example` | Plantilla sin secretos para produccion. |
| `.env.staging.example` | Plantilla sin secretos para staging. |

Ejemplo de `.env.staging.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO-STAGING.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY_STAGING
NEXT_PUBLIC_APP_ENV=staging
STAGING_DB_URL='postgresql://postgres.xxxxx:PASSWORD@aws-...pooler.supabase.com:5432/postgres'
```

`STAGING_DB_URL` se usa solo para snapshots/resets desde terminal. No debe ir a Vercel ni a Git.

## Cambiar ambiente local

Para apuntar local a staging:

```bash
npm run env:staging
npm run dev
```

O directo:

```bash
npm run dev:staging
```

Para apuntar local a produccion:

```bash
npm run env:production
npm run dev
```

O directo:

```bash
npm run dev:production
```

## Como confirmar que estas en staging

En staging debe aparecer la barra amarilla de simulacion de fecha.

Tambien puedes revisar `.env.local` y confirmar:

```env
NEXT_PUBLIC_APP_ENV=staging
```

Si `NEXT_PUBLIC_APP_ENV=production`, no estas en modo pruebas.

## Simulador de fecha

La barra de fecha solo cambia el "hoy" que usa la app para calcular vistas.

Afecta:

- flujo proyectado
- salud financiera
- mejor tarjeta
- compromisos proximos
- vencimientos
- MSI vencidos/informativos
- ingresos esperados

No hace rollback de datos.

Si registras movimientos, pagos o ingresos en staging, esos datos quedan guardados en staging. El boton "Volver a hoy" solo borra la fecha simulada del navegador.

## Clonar produccion hacia staging

Esto lee produccion y reemplaza staging.

Requisitos:

- tener `postgresql@17`
- tener `PROD_DB_URL`
- tener `STAGING_DB_URL`

Prueba conexiones:

```bash
/opt/homebrew/opt/postgresql@17/bin/psql "$PROD_DB_URL" -c "select now();"
/opt/homebrew/opt/postgresql@17/bin/psql "$STAGING_DB_URL" -c "select now();"
```

Dump de Auth base:

```bash
/opt/homebrew/opt/postgresql@17/bin/pg_dump "$PROD_DB_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --table=auth.users \
  --table=auth.identities \
  > /tmp/finanzas-auth-core.sql
```

Dump de public:

```bash
/opt/homebrew/opt/postgresql@17/bin/pg_dump "$PROD_DB_URL" \
  --no-owner \
  --no-privileges \
  --schema=public \
  > /tmp/finanzas-public-fresh.sql
```

Limpiar staging:

```bash
/opt/homebrew/opt/postgresql@17/bin/psql "$STAGING_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -c "drop schema if exists public cascade; truncate table auth.identities, auth.users cascade;"
```

Restaurar Auth:

```bash
/opt/homebrew/opt/postgresql@17/bin/psql "$STAGING_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -f /tmp/finanzas-auth-core.sql
```

Restaurar public:

```bash
/opt/homebrew/opt/postgresql@17/bin/psql "$STAGING_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -f /tmp/finanzas-public-fresh.sql
```

Restaurar permisos:

```bash
/opt/homebrew/opt/postgresql@17/bin/psql "$STAGING_DB_URL" \
  -v ON_ERROR_STOP=1 \
  -c "grant usage on schema public to anon, authenticated, service_role; grant all on all tables in schema public to anon, authenticated, service_role; grant all on all sequences in schema public to anon, authenticated, service_role; grant execute on all functions in schema public to anon, authenticated, service_role;"
```

## Crear snapshot base de staging

Cuando staging este limpio y validado:

```bash
npm run staging:snapshot
```

Esto crea:

```txt
.local-backups/finanzas-staging-base.sql
```

La carpeta `.local-backups/` esta ignorada por Git.

## Resetear staging al snapshot

Esto borra staging y lo restaura al snapshot local.

```bash
npm run staging:reset -- --confirm-reset-staging
```

Usalo despues de hacer pruebas destructivas.

## Fixtures QA operativos

Para pruebas automatizadas, puedes crear un set controlado de datos con prefijo `QA -`.
El seed borra y recrea solo esos registros QA para el usuario indicado; no toca otros datos.

```bash
FINANZAS_QA_EMAIL='correo-del-usuario-staging' npm run staging:seed-qa
```

Incluye:

- cuenta propia
- cuenta externa que no afecta balance
- categoria de gasto
- categoria de ingreso
- tarjeta de credito con cuenta espejo
- MSI vencido
- deuda activa
- deuda cancelada
- recurrente manual vencido
- recurrente informativo
- recordatorio financiero recurrente
- recordatorio sin monto
- ingreso programado quincenal
- presupuesto de prueba

## Auditoria de staging

La auditoria no modifica datos. Revisa saldos espejo, saldos calculados, duplicados y relaciones faltantes.

```bash
npm run staging:audit
```

Debe devolver cero filas en las secciones de diferencias o duplicados para considerar staging sano.

## Pruebas E2E

La suite E2E crea fixtures QA al iniciar las pruebas operativas. Si `FINANZAS_E2E_RESET_AFTER=1`, restaura staging al snapshot al terminar.

```bash
FINANZAS_E2E_EMAIL='correo-del-usuario-staging' \
FINANZAS_E2E_PASSWORD='password-staging' \
FINANZAS_E2E_MUTATE=1 \
FINANZAS_E2E_RESET_AFTER=1 \
npm run test:e2e
```

Para revisar el estado acumulado antes de restaurar, corre con `FINANZAS_E2E_RESET_AFTER=0`, ejecuta `npm run staging:audit` y luego restaura manualmente con `staging:reset`.

## Produccion en Vercel

En Vercel Production deben existir variables de produccion:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO-PRODUCCION.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY_PRODUCCION
NEXT_PUBLIC_APP_ENV=production
```

En produccion no debe existir `STAGING_DB_URL`.

## Reglas de seguridad

- Nunca pegues URLs con password en issues, chats o commits.
- No subas `.env.local`, `.env.production.local`, `.env.staging.local` ni `.local-backups/`.
- Antes de probar movimientos, confirma que estas en staging.
- El simulador de fecha no borra movimientos.
- Para regresar staging al inicio, usa `staging:reset`.
