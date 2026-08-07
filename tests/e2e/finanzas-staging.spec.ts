import { expect, test, type Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'

const email = process.env.FINANZAS_E2E_EMAIL
const password = process.env.FINANZAS_E2E_PASSWORD
const canMutateStaging = process.env.FINANZAS_E2E_MUTATE === '1'
const resetAfterMutatingTests = process.env.FINANZAS_E2E_RESET_AFTER === '1'
const tdcCardName = 'QA - TDC Control'
const tdcPaymentAccountName = 'QA - Cuenta Nomina'
const externalAccountName = 'QA - Cuenta Externa'
const expenseCategoryName = 'QA - Cafe'
const tdcCardWithProcessableMsi = 'QA - TDC Control'
const qaIncomeName = 'QA - Quincena'
const qaDebtName = 'QA - Deuda Activa'
const qaCanceledDebtName = 'QA - Deuda Cancelada'
const qaRecurringName = 'QA - Recurrente Manual'
const qaFinancialReminderName = 'QA - Alerta Financiera Recurrente'
const qaNonFinancialReminderName = 'QA - Recordatorio No Financiero'

test.skip(!email || !password, 'Define FINANZAS_E2E_EMAIL y FINANZAS_E2E_PASSWORD para correr E2E.')

async function login(page: Page) {
  await page.goto('/')

  const emailInput = page.locator('input[type="email"]')
  const passwordInput = page.locator('input[type="password"]').first()

  await expect(emailInput).toBeVisible()
  await emailInput.fill(email!)
  await passwordInput.fill(password!)
  await page.getByRole('button', { name: /iniciar sesi[oó]n/i }).click()
  await expect(page.getByText(/qu[eé] necesitas hacer hoy/i)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: /salir/i })).toBeVisible()
}

async function setSimulatedDate(page: Page, date: string) {
  const dateInput = page.locator('input[type="date"]').first()
  await expect(dateInput).toBeVisible()
  await dateInput.fill(date)
  await page.getByRole('button', { name: /aplicar fecha/i }).click()
  await page.waitForLoadState('networkidle')
  const [, month, day] = date.split('-').map(Number)
  await expect(page.getByText(/fecha activa de la app/i)).toContainText(new RegExp(`${day}/0?${month}`))
}

function formFieldControl(page: Page, label: string, control: 'input' | 'select' = 'input') {
  return page.locator(`xpath=.//form//label[contains(normalize-space(.), "${label}")]/following::${control}[1]`)
}

async function openMovementsNew(page: Page, type: string, returnTo = '/movimientos') {
  await page.goto(`/movimientos/nuevo?type=${type}&returnTo=${encodeURIComponent(returnTo)}`)
  await expect(page.getByRole('heading', { name: /^registrar/i })).toBeVisible({ timeout: 15_000 })
}

async function fillMovementBasics(page: Page, args: {
  type: string
  amount: string
  description: string
  date?: string
}) {
  await openMovementsNew(page, args.type)

  await page.locator('input[type="number"]').first().fill(args.amount)
  await page.locator('input[type="datetime-local"]').first().fill(args.date ?? '2026-08-10T10:30')
  await formFieldControl(page, 'Descripción / Notas').fill(args.description)
}

async function submitMovement(page: Page) {
  await page.getByRole('button', { name: /guardar movimiento/i }).click()
  await expect(page.getByText(/movimiento guardado correctamente/i)).toBeVisible({ timeout: 20_000 })
  await page.waitForURL('**/movimientos', { timeout: 20_000 })
}

async function expectMovementVisible(page: Page, description: string) {
  await page.goto('/movimientos')
  await expect(page.getByText(description).first()).toBeVisible({ timeout: 15_000 })
}

async function openCardDetail(page: Page, cardName: string) {
  await page.goto('/tarjetas')
  await expect(page.getByRole('heading', { name: /mis tarjetas/i })).toBeVisible({ timeout: 15_000 })
  const cardLink = page.getByRole('link', { name: new RegExp(cardName, 'i') }).first()
  await expect(cardLink).toBeVisible({ timeout: 15_000 })
  await cardLink.click()
  await expect(page.getByRole('heading', { name: new RegExp(cardName, 'i') }).first()).toBeVisible({ timeout: 15_000 })
}

async function movementRow(page: Page, description: string) {
  await page.goto('/movimientos')
  const row = page.getByText(description).first().locator('xpath=ancestor::tr')
  await expect(row).toBeVisible({ timeout: 15_000 })
  return row
}

async function seedQaFixtures() {
  const result = spawnSync('npm', ['run', 'staging:seed-qa'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      FINANZAS_QA_EMAIL: email ?? '',
    },
  })

  if (result.status !== 0) {
    throw new Error('No se pudieron crear los fixtures QA en staging.')
  }
}

test.describe('Finanzas App staging smoke', () => {
  test('inicia sesion y carga modulos principales', async ({ page }) => {
    await login(page)

    await expect(page.getByText(/modo simulaci[oó]n de fecha/i)).toBeVisible()
    await expect(page.getByText(/mejor tarjeta/i)).toBeVisible()

    const routes = [
      { href: '/cuentas', heading: /mis cuentas/i },
      { href: '/movimientos', heading: /^movimientos$/i },
      { href: '/tarjetas', heading: /mis tarjetas/i },
      { href: '/flujo', heading: /decidir antes de gastar/i },
      { href: '/ingresos', heading: /ingresos programados/i },
      { href: '/recordatorios', heading: /recordatorios|alertas/i },
      { href: '/presupuesto', heading: /budget control|presupuesto/i },
    ]

    for (const route of routes) {
      await page.goto(route.href)
      await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible({ timeout: 15_000 })
    }
  })

  test('simulador de fecha actualiza la fecha activa sin errores de hidratacion', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await login(page)
    await setSimulatedDate(page, '2026-08-20')

    await expect(page.getByText(/fecha activa de la app/i)).toContainText(/20\/8\/2026|20\/08\/2026/)
    expect(consoleErrors.join('\n')).not.toMatch(/hydration failed/i)
  })

  test('mejor tarjeta recalcula dias cuando cambia la fecha simulada', async ({ page }) => {
    await login(page)

    await setSimulatedDate(page, '2026-08-10')
    await expect(page.getByText(/d[ií]as estimados de financiamiento/i).first()).toBeVisible({ timeout: 15_000 })
    const firstAdvisorText = await page.getByText(/d[ií]as estimados de financiamiento/i).first().textContent()

    await setSimulatedDate(page, '2026-08-13')
    await expect(page.getByText(/d[ií]as estimados de financiamiento/i).first()).toBeVisible({ timeout: 15_000 })
    const secondAdvisorText = await page.getByText(/d[ií]as estimados de financiamiento/i).first().textContent()

    expect(firstAdvisorText?.trim()).toBeTruthy()
    expect(secondAdvisorText?.trim()).toBeTruthy()
    expect(secondAdvisorText?.trim()).not.toBe(firstAdvisorText?.trim())
  })
})

test.describe.serial('Finanzas App staging operativo con rollback', () => {
  test.skip(!canMutateStaging, 'Define FINANZAS_E2E_MUTATE=1 para correr pruebas que modifican staging.')

  test.beforeAll(() => {
    if (!canMutateStaging) return
    seedQaFixtures()
  })

  test.afterAll(() => {
    if (!canMutateStaging || !resetAfterMutatingTests) return

    const result = spawnSync('npm', ['run', 'staging:reset', '--', '--confirm-reset-staging'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    })

    if (result.status !== 0) {
      throw new Error('No se pudo restaurar staging desde el snapshot.')
    }
  })

  test('ING-002 marca ingreso programado como recibido y crea movimiento visible', async ({ page }) => {
    await login(page)
    await page.goto('/ingresos')

    await expect(page.getByRole('heading', { name: /ingresos programados/i })).toBeVisible({ timeout: 15_000 })

    const row = page.getByText(qaIncomeName).first().locator('xpath=ancestor::tr')
    await expect(row).toBeVisible({ timeout: 15_000 })

    await row.getByRole('button', { name: /^recibido$/i }).click()
    await expect(page.getByText(/registrado como movimiento real|activado como movimiento real|ya ten[ií]a movimiento real/i)).toBeVisible({ timeout: 20_000 })

    await page.goto('/movimientos')
    await expect(page.getByText(qaIncomeName).first()).toBeVisible({ timeout: 15_000 })
  })

  test('TDC-001 compra normal con tarjeta queda en movimientos e historial TDC', async ({ page }) => {
    const description = `QA compra TDC ${Date.now()}`

    await login(page)
    await fillMovementBasics(page, {
      type: 'credit_card_purchase',
      amount: '123.45',
      description,
    })
    await formFieldControl(page, 'Tarjeta utilizada', 'select').selectOption({ label: tdcCardName })
    await formFieldControl(page, 'Categoría', 'select').selectOption({ label: expenseCategoryName })
    await submitMovement(page)

    await expectMovementVisible(page, description)
    await openCardDetail(page, tdcCardName)
    await expect(page.getByText(description).first()).toBeVisible({ timeout: 15_000 })
  })

  test('TDC-002 pago de tarjeta desde cuenta propia queda en movimientos e historial TDC', async ({ page }) => {
    const description = `QA pago TDC ${Date.now()}`

    await login(page)
    await fillMovementBasics(page, {
      type: 'credit_card_payment',
      amount: '111.11',
      description,
    })
    await formFieldControl(page, 'Desde cuenta', 'select').selectOption({ label: tdcPaymentAccountName })
    await formFieldControl(page, 'Tarjeta a pagar', 'select').selectOption({ label: tdcCardName })
    await submitMovement(page)

    await expectMovementVisible(page, description)
    await openCardDetail(page, tdcCardName)
    await expect(page.getByText(description).first()).toBeVisible({ timeout: 15_000 })
  })

  test('TDC-003 pago de tarjeta desde cuenta externa queda como referencia visible', async ({ page }) => {
    const description = `QA pago externo TDC ${Date.now()}`

    await login(page)
    await fillMovementBasics(page, {
      type: 'credit_card_payment',
      amount: '101.01',
      description,
    })
    await formFieldControl(page, 'Desde cuenta', 'select').selectOption({ label: externalAccountName })
    await formFieldControl(page, 'Tarjeta a pagar', 'select').selectOption({ label: tdcCardName })
    await submitMovement(page)

    await expectMovementVisible(page, description)
    await openCardDetail(page, tdcCardName)
    await expect(page.getByText(description).first()).toBeVisible({ timeout: 15_000 })
  })

  test('TDC-005 reembolso parcial baja tarjeta y queda visible', async ({ page }) => {
    const description = `QA reembolso TDC ${Date.now()}`

    await login(page)
    await fillMovementBasics(page, {
      type: 'credit_card_refund',
      amount: '45.67',
      description,
    })
    await formFieldControl(page, 'Tarjeta del reembolso', 'select').selectOption({ label: tdcCardName })
    await submitMovement(page)

    await expectMovementVisible(page, description)
    await openCardDetail(page, tdcCardName)
    await expect(page.getByText(description).first()).toBeVisible({ timeout: 15_000 })
  })

  test('MOV-007 edita y elimina un gasto sin dejar fila fantasma', async ({ page }) => {
    const uniqueId = Date.now()
    const description = `QA gasto editable ${uniqueId}`
    const editedDescription = `QA gasto modificado ${uniqueId}`

    await login(page)
    await fillMovementBasics(page, {
      type: 'expense',
      amount: '88.88',
      description,
    })
    await formFieldControl(page, 'Cuenta origen', 'select').selectOption({ label: tdcPaymentAccountName })
    await formFieldControl(page, 'Categoría', 'select').selectOption({ label: expenseCategoryName })
    await submitMovement(page)

    const row = await movementRow(page, description)
    await row.getByRole('link', { name: /editar/i }).click()
    await expect(page.getByRole('heading', { name: /editar movimiento/i })).toBeVisible({ timeout: 15_000 })
    await page.locator('input[type="number"]').first().fill('99.99')
    await formFieldControl(page, 'Descripción / Notas').fill(editedDescription)
    await page.getByRole('button', { name: /guardar cambios/i }).click()
    await expect(page.getByText(/movimiento actualizado correctamente/i)).toBeVisible({ timeout: 20_000 })

    await page.goto('/movimientos')
    await expect(page.getByText(editedDescription).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(description).first()).toHaveCount(0)

    page.once('dialog', (dialog) => dialog.accept())
    const editedRow = await movementRow(page, editedDescription)
    await editedRow.getByRole('button', { name: /eliminar/i }).click()
    await expect(page.getByText(/movimiento eliminado/i)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(editedDescription).first()).toHaveCount(0)
  })

  test('DEU-003 pago de deuda desde cuenta propia queda visible en movimientos', async ({ page }) => {
    const description = `QA pago deuda propio ${Date.now()}`

    await login(page)
    await fillMovementBasics(page, {
      type: 'debt_payment',
      amount: '77.77',
      description,
    })
    await formFieldControl(page, 'Desde cuenta', 'select').selectOption({ label: tdcPaymentAccountName })
    await formFieldControl(page, 'Deuda a amortizar', 'select').selectOption({ label: qaDebtName })
    await expect(formFieldControl(page, 'Deuda a amortizar', 'select')).not.toContainText(qaCanceledDebtName)
    await submitMovement(page)

    await expectMovementVisible(page, description)
    await page.goto('/deudas')
    await expect(page.getByText(qaDebtName).first()).toBeVisible({ timeout: 15_000 })
  })

  test('DEU-004 pago de deuda desde cuenta externa queda visible sin bloquear captura', async ({ page }) => {
    const description = `QA pago deuda externo ${Date.now()}`

    await login(page)
    await fillMovementBasics(page, {
      type: 'debt_payment',
      amount: '66.66',
      description,
    })
    await formFieldControl(page, 'Desde cuenta', 'select').selectOption({ label: externalAccountName })
    await formFieldControl(page, 'Deuda a amortizar', 'select').selectOption({ label: qaDebtName })
    await submitMovement(page)

    await expectMovementVisible(page, description)
  })

  test('REC-002 recurrente manual vencido se liquida y genera movimiento visible', async ({ page }) => {
    await login(page)
    await page.goto('/recurrentes')

    const row = page.getByText(qaRecurringName).first().locator('xpath=ancestor::tr')
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.getByRole('link', { name: /pagar ahora/i }).click()

    await expect(page.getByRole('heading', { name: /liquidar recurrente/i })).toBeVisible({ timeout: 15_000 })
    await formFieldControl(page, 'Pagar con', 'select').selectOption({ label: 'Cuenta / efectivo' })
    await formFieldControl(page, 'Selecciona la cuenta', 'select').selectOption({ label: tdcPaymentAccountName })
    await page.getByRole('button', { name: /registrar pago/i }).click()

    await expect(page.getByText(/recurrente liquidado correctamente/i)).toBeVisible({ timeout: 20_000 })
    await expectMovementVisible(page, qaRecurringName)
  })

  test('REM-001 recordatorio recurrente avanza fecha y no crea movimiento real', async ({ page }) => {
    await login(page)
    await page.goto('/recordatorios')

    const reminderCard = page.getByText(qaFinancialReminderName).first().locator('xpath=ancestor::div[contains(@class, "px-8") and contains(@class, "py-6")]')
    await expect(reminderCard).toBeVisible({ timeout: 15_000 })
    await reminderCard.getByRole('button', { name: /atendida/i }).click()
    await expect(page.getByText(/alerta atendida/i)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/se avanz[oó] a la siguiente fecha programada/i)).toBeVisible()

    await page.goto('/movimientos')
    await expect(page.getByText(qaFinancialReminderName).first()).toHaveCount(0)
  })

  test('REM-002 recordatorio no financiero se muestra como solo recordatorio', async ({ page }) => {
    await login(page)
    await page.goto('/recordatorios')

    const reminderCard = page.getByText(qaNonFinancialReminderName).first().locator('xpath=ancestor::div[contains(@class, "px-8") and contains(@class, "py-6")]')
    await expect(reminderCard).toBeVisible({ timeout: 15_000 })
    await expect(reminderCard.getByText(/solo recordatorio/i).first()).toBeVisible()
  })

  test('TDC-009 conciliacion visible despues de registrar movimientos TDC', async ({ page }) => {
    await login(page)
    await openCardDetail(page, tdcCardName)
    await expect(page.getByText(/conciliaci[oó]n de tarjeta/i).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/saldo tarjeta/i).first()).toBeVisible()
    await expect(page.getByText(/saldo esperado/i).first()).toBeVisible()
    await expect(page.getByText(/diferencia/i).first()).toBeVisible()
  })

  test('MSI-001 compra a MSI crea plan y queda visible en tarjeta', async ({ page }) => {
    const description = `QA MSI ${Date.now()}`

    await login(page)
    await openMovementsNew(page, 'credit_card_purchase', '/tarjetas')

    await page.locator('input[type="number"]').first().fill('600')
    await page.locator('input[type="datetime-local"]').first().fill('2026-08-10T10:30')
    await formFieldControl(page, 'Tarjeta utilizada', 'select').selectOption({ label: tdcCardName })
    await formFieldControl(page, 'Categoría', 'select').selectOption({ label: expenseCategoryName })
    await page.getByLabel(/es compra a msi/i).check()
    await page.locator('input[type="number"]').nth(1).fill('3')
    await formFieldControl(page, 'Descripción / Notas').fill(description)
    await page.getByRole('button', { name: /guardar movimiento/i }).click()
    await expect(page.getByText(/movimiento guardado correctamente/i)).toBeVisible({ timeout: 20_000 })
    await page.waitForURL('**/tarjetas', { timeout: 20_000 })

    await openCardDetail(page, tdcCardName)
    await expect(page.getByText(description).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/meses sin intereses/i).first()).toBeVisible()
    await expect(page.getByText(/200\.00/).first()).toBeVisible()
  })

  test('MSI-003 generar MSI vencidos muestra resultado', async ({ page }) => {
    await login(page)
    await openCardDetail(page, tdcCardWithProcessableMsi)

    const processButton = page.getByRole('button', { name: /generar msi vencidos/i })
    await expect(processButton).toBeVisible({ timeout: 15_000 })

    if (await processButton.isDisabled()) {
      test.skip(true, `La tarjeta ${tdcCardWithProcessableMsi} no tiene MSI vencidos procesables en este snapshot.`)
    }

    await processButton.click()
    await expect(page.getByText(/cargos msi vencidos generados/i)).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(/conciliaci[oó]n de tarjeta/i).first()).toBeVisible({ timeout: 15_000 })

    const secondProcessButton = page.getByRole('button', { name: /generar msi vencidos/i })
    if (!(await secondProcessButton.isDisabled())) {
      await secondProcessButton.click()
      await expect(page.getByText(/cargos msi vencidos generados/i)).toHaveCount(1)
    }
  })

  test('TDC-011 cierre de corte guarda historial y actualiza pago para no generar intereses', async ({ page }) => {
    await login(page)
    await openCardDetail(page, tdcCardName)

    await page.getByRole('button', { name: /cerrar corte/i }).click()
    await expect(page.getByRole('heading', { name: /cierre de corte/i })).toBeVisible({ timeout: 15_000 })
    await page.locator('input[type="date"]').nth(0).fill('2026-08-26')
    await page.locator('input[type="date"]').nth(1).fill('2026-09-15')
    await page.locator('input[type="number"]').nth(0).fill('4321.00')
    await page.locator('input[type="number"]').nth(1).fill('321.00')
    await page.getByLabel(/ya revis[eé] mi app bancaria/i).check()
    await page.getByRole('button', { name: /confirmar corte/i }).click()

    await expect(page.getByText(/corte confirmado/i)).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText(/cortes confirmados/i).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/\$4,321\.00/).first()).toBeVisible({ timeout: 15_000 })
  })

  test('FLU-002 fecha simulada mantiene flujo operativo en diferentes fechas', async ({ page }) => {
    await login(page)
    await setSimulatedDate(page, '2026-08-10')
    await page.goto('/flujo')
    await expect(page.getByRole('heading', { name: /decidir antes de gastar/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/eventos y saldo proyectado/i).first()).toBeVisible({ timeout: 15_000 })

    await setSimulatedDate(page, '2026-08-27')
    await page.goto('/flujo')
    await expect(page.getByRole('heading', { name: /decidir antes de gastar/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/eventos y saldo proyectado/i).first()).toBeVisible({ timeout: 15_000 })
  })
})
