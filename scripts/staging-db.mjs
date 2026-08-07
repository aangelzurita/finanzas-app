import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const action = process.argv[2]
const confirmation = process.argv[3]
const envPath = path.join(process.cwd(), '.env.staging.local')
const backupDir = path.join(process.cwd(), '.local-backups')
const backupPath = path.join(backupDir, 'finanzas-staging-base.sql')
const publicOnlyRestorePath = path.join(backupDir, 'finanzas-staging-public-only.sql')
const pgBinDir = '/opt/homebrew/opt/postgresql@17/bin'

const excludedAuthTables = [
  'auth.audit_log_entries',
  'auth.flow_state',
  'auth.mfa_amr_claims',
  'auth.mfa_challenges',
  'auth.mfa_factors',
  'auth.one_time_tokens',
  'auth.refresh_tokens',
  'auth.saml_providers',
  'auth.saml_relay_states',
  'auth.sessions',
]

function readStagingDatabaseUrl() {
  if (!existsSync(envPath)) {
    throw new Error('No existe .env.staging.local. Crea el archivo y agrega STAGING_DB_URL.')
  }

  const content = readFileSync(envPath, 'utf8')
  const match = content.match(/^STAGING_DB_URL=(.*)$/m)
  const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, '')

  if (!value) {
    throw new Error('Falta STAGING_DB_URL en .env.staging.local.')
  }

  return value
}

function commandPath(command) {
  const candidate = path.join(pgBinDir, command)
  return existsSync(candidate) ? candidate : command
}

function run(command, args) {
  const result = spawnSync(commandPath(command), args, {
    stdio: 'inherit',
    env: process.env,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function buildPublicOnlyRestoreFile() {
  const content = readFileSync(backupPath, 'utf8')
  const firstObjectIndex = content.indexOf('--\n-- Name:')
  const header = firstObjectIndex >= 0 ? content.slice(0, firstObjectIndex) : ''
  const body = firstObjectIndex >= 0 ? content.slice(firstObjectIndex) : content
  const blocks = body.split(/\n(?=--\n-- (?:Name|Data for Name): )/)
  const publicBlocks = blocks.filter((block) => {
    return (
      block.includes('Schema: public') ||
      block.includes('Name: public; Type: SCHEMA') ||
      block.includes('Name: SCHEMA public')
    )
  })

  writeFileSync(
    publicOnlyRestorePath,
    `${header}${publicBlocks.join('\n')}\n`,
    'utf8'
  )

  return publicOnlyRestorePath
}

function snapshot() {
  const stagingDbUrl = readStagingDatabaseUrl()
  mkdirSync(backupDir, { recursive: true })

  run('pg_dump', [
    stagingDbUrl,
    '--no-owner',
    '--no-privileges',
    '--schema=public',
    '--schema=auth',
    ...excludedAuthTables.flatMap((table) => [`--exclude-table-data=${table}`]),
    '--file',
    backupPath,
  ])

  console.log(`\nSnapshot creado en ${backupPath}`)
}

function reset() {
  if (confirmation !== '--confirm-reset-staging') {
    console.error('Este comando borra y restaura staging desde el snapshot local.')
    console.error('Ejecuta: npm run staging:reset -- --confirm-reset-staging')
    process.exit(1)
  }

  if (!existsSync(backupPath)) {
    throw new Error(`No existe snapshot en ${backupPath}. Primero ejecuta npm run staging:snapshot.`)
  }

  const stagingDbUrl = readStagingDatabaseUrl()
  const restorePath = buildPublicOnlyRestoreFile()

  run('psql', [
    stagingDbUrl,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'drop schema if exists public cascade;',
  ])

  run('psql', [
    stagingDbUrl,
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    restorePath,
  ])

  run('psql', [
    stagingDbUrl,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'grant usage on schema public to anon, authenticated, service_role; grant all on all tables in schema public to anon, authenticated, service_role; grant all on all sequences in schema public to anon, authenticated, service_role; grant execute on all functions in schema public to anon, authenticated, service_role;',
  ])

  console.log('\nStaging restaurado desde el snapshot local.')
}

try {
  if (action === 'snapshot') {
    snapshot()
  } else if (action === 'reset') {
    reset()
  } else {
    console.error('Uso: node scripts/staging-db.mjs snapshot|reset')
    process.exit(1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
