# Ambiente staging con Supabase

Objetivo: probar movimientos, cortes, ingresos, recurrentes y fechas simuladas sin afectar producción.

## 1. Crear proyecto Supabase staging

Crea un proyecto nuevo en Supabase, por ejemplo:

`finanzas-app-staging`

No uses las credenciales del proyecto de producción para pruebas.

## 2. Archivos de entorno

Crea dos archivos locales. No se suben a Git.

Producción local:

```txt
.env.production.local
```

Staging local:

```txt
.env.staging.local
```

Puedes copiarlos desde:

```txt
.env.production.example
.env.staging.example
```

## 3. Variables para local apuntando a staging

Cuando el proyecto staging exista, edita `.env.local` para que apunte a staging:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO-STAGING.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU-ANON-KEY-STAGING
NEXT_PUBLIC_APP_ENV=staging
```

Con `NEXT_PUBLIC_APP_ENV=staging` aparece una barra amarilla de simulación de fecha.

También puedes cambiar el entorno activo sin copiar y pegar llaves:

```bash
npm run env:staging
```

o iniciar directo en staging:

```bash
npm run dev:staging
```

Para volver a producción local:

```bash
npm run env:production
```

o:

```bash
npm run dev:production
```

## 4. Fecha simulada

En staging/local puedes adelantar la fecha desde la barra superior de la app.

También puedes hacerlo desde consola:

```js
localStorage.setItem('finanzas_app_simulated_date', '2026-06-30')
location.reload()
```

Para regresar a hoy:

```js
localStorage.removeItem('finanzas_app_simulated_date')
location.reload()
```

## 5. Migraciones

Ejecuta en Supabase staging todos los SQL necesarios del folder `sql/`, incluyendo:

```txt
sql/2026-08-05-financial-reliability-foundation.sql
```

## 6. Producción

En Vercel Production deben quedarse las variables de producción:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO-PRODUCCION.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU-ANON-KEY-PRODUCCION
NEXT_PUBLIC_APP_ENV=production
```

En producción no aparece el simulador de fecha.
