import { expect, type APIRequestContext, type Page } from '@playwright/test'

const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:18080/api/v1'
const mailpitUrl = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:18025'

export interface TestAccount {
  name: string
  email: string
  password: string
}

export const accounts = {
  alice: { name: 'Alice E2E', email: 'alice.e2e@example.com', password: 'E2ePassword123!' },
  bob: { name: 'Bob E2E User', email: 'bob.e2e@example.com', password: 'E2ePassword123!' },
  carol: { name: 'Carol E2E', email: 'carol.e2e@example.com', password: 'E2ePassword123!' },
} satisfies Record<string, TestAccount>

export async function registerAccount(request: APIRequestContext, account: TestAccount) {
  const registration = await request.post(`${backendUrl}/auth/register`, {
    data: {
      name: account.name,
      email: account.email,
      password: account.password,
      confirmPassword: account.password,
    },
  })
  expect(registration.ok(), await registration.text()).toBeTruthy()

  const messageId = await waitForVerificationMessage(request, account.email)
  const message = await request.get(`${mailpitUrl}/api/v1/message/${messageId}`)
  expect(message.ok()).toBeTruthy()
  const body = await message.json() as { Text?: string; HTML?: string }
  const code = `${body.Text ?? ''} ${body.HTML ?? ''}`.match(/\b(\d{6})\b/)?.[1]
  expect(code, `Verification code was missing for ${account.email}`).toBeTruthy()

  const verification = await request.post(`${backendUrl}/auth/register/verify`, {
    data: { email: account.email, code },
  })
  expect(verification.ok(), await verification.text()).toBeTruthy()
}

async function waitForVerificationMessage(request: APIRequestContext, email: string) {
  let messageId: string | undefined
  await expect.poll(async () => {
    const response = await request.get(`${mailpitUrl}/api/v1/messages`)
    if (!response.ok()) return false
    const body = await response.json() as {
      messages?: Array<{ ID: string; To?: Array<{ Address?: string }> }>
    }
    messageId = body.messages?.find((message) =>
      message.To?.some((recipient) => recipient.Address?.toLowerCase() === email.toLowerCase()))?.ID
    return Boolean(messageId)
  }, { timeout: 20_000, intervals: [250, 500, 1_000] }).toBe(true)
  return messageId!
}

export async function login(page: Page, account: TestAccount) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible()
}
