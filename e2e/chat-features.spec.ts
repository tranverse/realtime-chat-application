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

  test('rejects invalid login and validates required credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Enter a valid email address')).toBeVisible()
    await expect(page.getByText('Enter your password')).toBeVisible()

    await page.getByLabel('Email').fill(accounts.alice.email)
    await page.getByLabel('Password').fill('WrongPassword123!')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Invalid email or password')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('supports private realtime messaging, reply, edit, delete, and read receipts', async ({ browser }) => {
    // This multi-browser journey includes two logins and a final history reload.
    test.setTimeout(120_000)
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
      await expect(alice.locator('header').getByText('Offline', { exact: true })).toBeVisible()
      const original = `hello-${Date.now()}`
      await alice.getByRole('textbox', { name: 'Message' }).fill(original)
      await alice.getByRole('button', { name: 'Send', exact: true }).click()

      await login(bob, accounts.bob)
      await bob.reload()
      await bob.getByRole('button', { name: 'Unread' }).click()
      await expect(bob.getByRole('link', { name: /Alice E2E/ })).toBeVisible()
      await bob.getByRole('button', { name: 'Notifications' }).click()
      const notifications = bob.getByRole('region', { name: 'Notifications' })
      await expect(notifications.getByText('1 unread message', { exact: true })).toBeVisible()
      await notifications.getByRole('button', { name: /Alice E2E sent you a message/ }).click()
      await bob.bringToFront()
      await expect(bob.locator('header').getByText('Online', { exact: true })).toBeVisible()
      await expect(bob.locator('article[data-sequence]', { hasText: original })).toBeVisible()
      await expect(alice.getByText('Seen')).toBeVisible()

      const bobReply = `reply-${Date.now()}`
      await bob.getByRole('textbox', { name: 'Message' }).fill(bobReply)
      await bob.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(alice.locator('article[data-sequence]', { hasText: bobReply })).toBeVisible()

      const originalBubble = alice.locator('article[data-sequence]', { hasText: original })
      await originalBubble.getByRole('button', { name: 'More actions' }).click()
      await originalBubble.getByRole('button', { name: 'Edit' }).click()
      const edited = `${original}-edited`
      const messageEditor = alice.locator('article[data-sequence]').getByRole('textbox')
      await messageEditor.fill(edited)
      await alice.locator('article[data-sequence]').getByRole('button', { name: 'Save' }).click()
      await expect(bob.locator('article[data-sequence]', { hasText: edited })).toBeVisible()

      const bobBubble = alice.locator('article[data-sequence]', { hasText: bobReply })
      await bobBubble.getByRole('button', { name: 'Reply' }).click()
      await expect(alice.getByText('Replying to Bob E2E User')).toBeVisible()
      const quotedReply = `quoted-${Date.now()}`
      await alice.getByRole('textbox', { name: 'Message' }).fill(quotedReply)
      await alice.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(bob.locator('article[data-sequence]', { hasText: quotedReply })).toBeVisible()

      const editedBubble = alice.locator('article[data-sequence]', { hasText: edited })
      await editedBubble.getByRole('button', { name: 'More actions' }).click()
      await editedBubble.getByRole('button', { name: 'Delete' }).click()
      await alice.getByRole('dialog', { name: 'Delete message?' })
        .getByRole('button', { name: 'Delete message' }).click()
      await expect(bob.locator('article[data-sequence]', { hasText: 'Message deleted' })).toBeVisible()

      await bob.reload()
      await expect(bob.locator('article[data-sequence]', { hasText: quotedReply })).toBeVisible()
      await expect(bob.locator('article[data-sequence]', { hasText: 'Message deleted' })).toBeVisible()
    } finally {
      await aliceContext.close()
      await bobContext.close()
    }
  })

  test('supports group messaging, membership details, and confirmed leave', async ({ browser }) => {
    test.setTimeout(120_000)
    const aliceContext = await browser.newContext()
    const bobContext = await browser.newContext()
    const alice = await aliceContext.newPage()
    const bob = await bobContext.newPage()

    try {
    await login(alice, accounts.alice)
    await alice.getByRole('button', { name: 'New conversation' }).click()
    const dialog = alice.getByRole('dialog', { name: 'New conversation' })
    await dialog.getByRole('button', { name: 'New group' }).click()
    const groupName = `E2E Group ${Date.now()}`
    await dialog.getByLabel('Group name').fill(groupName)

    await dialog.getByLabel('Search people').fill(accounts.bob.email)
    await dialog.getByRole('button', { name: /Bob E2E User/ }).click()
    await dialog.getByLabel('Search people').fill(accounts.carol.email)
    await dialog.getByRole('button', { name: /Carol E2E/ }).click()
    await dialog.getByRole('button', { name: 'Start conversation' }).click()

    await expect(alice.getByRole('heading', { name: groupName })).toBeVisible()
    await expect(alice.locator('header').getByText('3 members', { exact: true })).toBeVisible()
    await expect(alice.locator('header').getByText('Online', { exact: true })).toHaveCount(0)
    const groupMessage = `group-${Date.now()}`
    await alice.getByRole('textbox', { name: 'Message' }).fill(groupMessage)
    await alice.getByRole('button', { name: 'Send', exact: true }).click()

    await alice.getByRole('button', { name: 'Conversation info' }).click()
    const details = alice.getByRole('dialog', { name: 'Conversation details' })
    await expect(details.getByText('Bob E2E User')).toBeVisible()
    await expect(details.getByText('Carol E2E')).toBeVisible()
    await details.getByRole('button', { name: 'Close dialog' }).click()

    await login(bob, accounts.bob)
    await bob.reload()
    await bob.getByRole('button', { name: 'Groups' }).click()
    await bob.getByRole('link', { name: new RegExp(groupName) }).click()
    await expect(bob.locator('article[data-sequence]', { hasText: groupMessage })).toBeVisible()

    await bob.getByRole('button', { name: 'Conversation info' }).click()
    const bobDetails = bob.getByRole('dialog', { name: 'Conversation details' })
    await bobDetails.getByRole('button', { name: 'Leave group' }).click()
    const leaveConfirmation = bob.getByRole('dialog', { name: 'Leave this group?' })
    await expect(leaveConfirmation).toBeVisible()
    await leaveConfirmation.getByRole('button', { name: 'Cancel' }).click()
    await expect(bob.getByRole('dialog', { name: 'Conversation details' })).toBeVisible()

    await bob.getByRole('dialog', { name: 'Conversation details' })
      .getByRole('button', { name: 'Leave group' }).click()
    await bob.getByRole('dialog', { name: 'Leave this group?' })
      .getByRole('button', { name: 'Leave group' }).click()
    await expect(bob.getByRole('heading', { name: 'Messages' })).toBeVisible()
    await bob.reload()
    await bob.getByRole('button', { name: 'Groups' }).click()
    await expect(bob.getByRole('link', { name: new RegExp(groupName) })).toHaveCount(0)
    } finally {
      await aliceContext.close()
      await bobContext.close()
    }
  })
  test('tracks real multi-tab presence and remains connected across navigation', async ({ browser }) => {
    test.setTimeout(120_000)
    const a = await browser.newContext(), b = await browser.newContext()
    try {
      const alice = await a.newPage(), bob = await b.newPage()
      let aliceSocketCount = 0
      alice.on('websocket', () => { aliceSocketCount++ })
      await login(alice, accounts.alice)
      await alice.getByRole('link', { name: /Bob E2E User/ }).click()
      await expect(alice.locator('header').getByText('Offline', { exact: true })).toBeVisible()
      await login(bob, accounts.bob)
      await expect(alice.locator('header').getByText('Online', { exact: true })).toBeVisible()
      const secondTab = await b.newPage()
      const secondConnected = secondTab.waitForResponse((response) => response.url().includes('/presence/config') && response.ok())
      await secondTab.goto('/'); await secondConnected
      await expect(secondTab.getByRole('heading', { name: 'Messages' })).toBeVisible()
      // The configuration request follows STOMP CONNECTED, so both sessions are active here.
      await secondTab.getByRole('button', { name: 'Settings', exact: true }).click()
      await expect(alice.locator('header').getByText('Online', { exact: true })).toBeVisible()
      await bob.close()
      await expect(alice.locator('header').getByText('Online', { exact: true })).toBeVisible()
      await secondTab.close()
      await expect(alice.locator('header').getByText('Offline', { exact: true })).toBeVisible({ timeout: 85_000 })
      const reconnected = await b.newPage(); await reconnected.goto('/')
      await expect(alice.locator('header').getByText('Online', { exact: true })).toBeVisible()
      await alice.getByRole('button', { name: 'Settings', exact: true }).click()
      await alice.getByRole('button', { name: 'Messages', exact: true }).click()
      await expect(alice.locator('header').getByText('Online', { exact: true })).toBeVisible()
      await expect(alice.getByText('Reconnecting…', { exact: true })).toHaveCount(0)
      expect(aliceSocketCount).toBe(1)
      await reconnected.getByRole('button', { name: 'Settings', exact: true }).click()
      await reconnected.getByRole('button', { name: 'Sign out', exact: true }).click()
      await expect(alice.locator('header').getByText('Offline', { exact: true })).toBeVisible({ timeout: 85_000 })
    } finally { await a.close(); await b.close() }
  })

  test('persists theme and notification preferences and keeps settings separate from profile', async ({ page }) => {
    await login(page, accounts.alice)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('region', { name: 'Settings' })).toHaveCSS('background-color', 'rgb(11, 18, 32)')
    await page.screenshot({ path: 'test-results/settings-dark.png' })
    await page.getByLabel('Show in-app notifications').uncheck()
    await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Edit profile' }).click()
    const profile = page.getByRole('dialog', { name: 'Your profile' })
    await expect(profile.getByLabel('Full name')).toBeVisible()
    await expect(profile.getByRole('button', { name: 'Choose image' })).toBeVisible()
    await expect(profile.getByLabel('Profile photo (URL)')).toHaveCount(0)
    await profile.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Light', exact: true }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await page.screenshot({ path: 'test-results/settings-light.png' })
    await page.getByLabel('Show in-app notifications').check()
    await page.getByLabel('Enter to send').uncheck()
    await page.getByRole('button', { name: 'Messages', exact: true }).click()
    await page.getByRole('link', { name: /Bob E2E User/ }).click()
    const composer = page.getByRole('textbox', { name: 'Message' })
    await composer.fill('first line'); await composer.press('Enter'); await composer.press('b')
    await expect(composer).toHaveValue('first line\nb')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(composer).toHaveValue('')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByLabel('Enter to send').check()
    await page.getByRole('button', { name: 'Messages', exact: true }).click()
    await composer.fill('enter sends'); await composer.press('Shift+Enter'); await composer.press('b')
    await expect(composer).toHaveValue('enter sends\nb')
    await composer.press('Enter'); await expect(composer).toHaveValue('')
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
    const composerBottom = await composer.evaluate((element) => element.closest('form')!.parentElement!.getBoundingClientRect().bottom)
    expect(Math.abs(composerBottom - (844 - 64))).toBeLessThanOrEqual(2)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/chat-mobile.png' })
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible()
    await page.getByRole('button', { name: 'Notifications', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('requires authentication and a shared direct conversation for presence snapshots', async () => {
    const api = await playwrightRequest.newContext()
    try {
      const bobLogin = await api.post('http://127.0.0.1:18080/api/v1/auth/login', { data: { email: accounts.bob.email, password: accounts.bob.password } })
      const bobToken = (await bobLogin.json()).data.accessToken
      const profile = await api.get('http://127.0.0.1:18080/api/v1/users/me', { headers: { Authorization: `Bearer ${bobToken}` } })
      const id = (await profile.json()).data.id
      const anonymous = await api.get(`http://127.0.0.1:18080/api/v1/users/${id}/presence`)
      expect(anonymous.status()).toBe(401)
      const carolLogin = await api.post('http://127.0.0.1:18080/api/v1/auth/login', { data: { email: accounts.carol.email, password: accounts.carol.password } })
      const carolToken = (await carolLogin.json()).data.accessToken
      const forbidden = await api.get(`http://127.0.0.1:18080/api/v1/users/${id}/presence`, { headers: { Authorization: `Bearer ${carolToken}` } })
      expect(forbidden.status()).toBe(403)
    } finally { await api.dispose() }
  })
})
