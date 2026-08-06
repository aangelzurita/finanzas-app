import fs from 'node:fs'
import path from 'node:path'

const envName = process.argv[2]
const allowed = new Set(['production', 'staging'])

if (!allowed.has(envName)) {
  console.error('Uso: node scripts/use-env.mjs <production|staging>')
  process.exit(1)
}

const root = process.cwd()
const source = path.join(root, `.env.${envName}.local`)
const target = path.join(root, '.env.local')

if (!fs.existsSync(source)) {
  console.error(`No existe ${path.basename(source)}.`)
  console.error(`Crea ese archivo a partir de .env.${envName}.example y vuelve a intentar.`)
  process.exit(1)
}

fs.copyFileSync(source, target)
console.log(`Entorno activo: ${envName}`)
console.log(`Copiado ${path.basename(source)} -> .env.local`)
