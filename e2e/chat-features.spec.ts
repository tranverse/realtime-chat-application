import { request as playwrightRequest, expect, test } from '@playwright/test'
import { accounts, login, registerAccount } from './support/accounts'

test.describe.serial('Luma core user journeys', () => {
  test.beforeAll(async () => {
    const api = await playwrightRequest.newContext()
    try {
      await registerAccount(api, accounts.alice)
      await registerAccount(api, accounts.bob)
      await registerAccount(api, accounts.carol)
    } finally {
      await api.dispose()
    }
  })

  test('authenticates and restores the session after reload', async ({ page }) => {
    await login(page, accounts.alice)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible()
  })

  test('supports private realtime messaging, reply, edit, delete, and read receipts', async ({ browser }) => {
    const aliceContext = await browser.newContext()
    const bobContext = await browser.newContext()
    const alice = await aliceContext.newPage()
    const bob = await bobContext.newPage()

    try {
      await login(alice, accounts.alice)
      await alice.getByRole('button', { name: 'New conversation' }).click()
      const createDialog = alice.getByRole('dialog', { name: 'New conversation' })
      await createDialog.getByLabel('Search people').fill(accounts.bob.email)
      await createDialog.getByRole('button', { name: /Bob E2E User/ }).click()
      await createDialog.getByRole('button', { name: 'Start conversation' }).click()
      await expect(alice.getByRole('heading', { name: 'Bob E2E User' })).toBeVisible()

      // Empty conversations are intentionally hidden from the recipient until
      // the first message exists, so send before Bob refreshes his inbox.
      await expect(alice.getByText('Connected')).toBeVisible()
      const original = `hello-${Date.now()}`
      await alice.getByRole('textbox', { name: 'Message' }).fill(original)
      await alice.getByRole('button', { name: 'Send', exact: true }).click()

      await login(bob, accounts.bob)
      await bob.reload()
      await bob.getByRole('link', { name: /Alice E2E/ }).click()
      await expect(bob.getByText('Connected')).toBeVisible()
      await expect(bob.locator('article.message-row', { hasText: original })).toBeVisible()
      await expect(alice.getByText('Seen')).toBeVisible()

      const bobReply = `reply-${Date.now()}`
      await bob.getByRole('textbox', { name: 'Message' }).fill(bobReply)
      await bob.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(alice.locator('article.message-row', { hasText: bobReply })).toBeVisible()

      const originalBubble = alice.locator('article.message-row', { hasText: original })
      await originalBubble.getByRole('button', { name: 'More actions' }).click()
      await originalBubble.getByRole('button', { name: 'Edit' }).click()
      const edited = `${original}-edited`
      const messageEditor = alice.locator('article.message-row').getByRole('textbox')
      await messageEditor.fill(edited)
      await alice.locator('article.message-row').getByRole('button', { name: 'Save' }).click()
      await expect(bob.locator('article.message-row', { hasText: edited })).toBeVisible()

      const bobBubble = alice.locator('article.message-row', { hasText: bobReply })
      await bobBubble.getByRole('button', { name: 'Reply' }).click()
      await expect(alice.getByText('Replying to Bob E2E User')).toBeVisible()
      const quotedReply = `quoted-${Date.now()}`
      await alice.getByRole('textbox', { name: 'Message' }).fill(quotedReply)
      await alice.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(bob.locator('article.message-row', { hasText: quotedReply })).toBeVisible()

      const editedBubble = alice.locator('article.message-row', { hasText: edited })
      await editedBubble.getByRole('button', { name: 'More actions' }).click()
      await editedBubble.getByRole('button', { name: 'Delete' }).click()
      await alice.getByRole('dialog', { name: 'Delete message?' })
        .getByRole('button', { name: 'Delete message' }).click()
      await expect(bob.locator('article.message-row', { hasText: 'Message deleted' })).toBeVisible()
    } finally {
      await aliceContext.close()
      await bobContext.close()
    }
  })

  test('creates a group conversation with multiple members', async ({ page }) => {
    await login(page, accounts.alice)
    await page.getByRole('button', { name: 'New conversation' }).click()
    const dialog = page.getByRole('dialog', { name: 'New conversation' })
    await dialog.getByRole('button', { name: 'New group' }).click()
    const groupName = `E2E Group ${Date.now()}`
    await dialog.getByLabel('Group name').fill(groupName)

    await dialog.getByLabel('Search people').fill(accounts.bob.email)
    await dialog.getByRole('button', { name: /Bob E2E User/ }).click()
    await dialog.getByLabel('Search people').fill(accounts.carol.email)
    await dialog.getByRole('button', { name: /Carol E2E/ }).click()
    await dialog.getByRole('button', { name: 'Start conversation' }).click()

    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
    await page.getByRole('button', { name: 'Conversation info' }).click()
    const details = page.getByRole('dialog', { name: 'Conversation details' })
    await expect(details.getByText('Bob E2E User')).toBeVisible()
    await expect(details.getByText('Carol E2E')).toBeVisible()
  })
})
