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

  test('supports private realtime messaging, reply navigation, delete, and read receipts without editing', async ({ browser }) => {
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

      // Send before the recipient opens the conversation to verify unread state.
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
      const singleBadge = notifications.getByLabel('1 unread messages')
      expect(await singleBadge.evaluate(element => element.getBoundingClientRect().width)).toBe(28)
      expect(await singleBadge.evaluate(element => element.getBoundingClientRect().height)).toBe(28)
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
      await expect(originalBubble.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
      await originalBubble.getByRole('button', { name: 'More actions' }).click()

      const bobBubble = alice.locator('article[data-sequence]', { hasText: bobReply })
      const bobMessageId = await bobBubble.getAttribute('data-message-id')
      await bobBubble.getByRole('button', { name: 'Reply' }).click()
      await expect(alice.getByText('Replying to Bob E2E User')).toBeVisible()
      const quotedReply = `quoted-${Date.now()}`
      await alice.getByRole('textbox', { name: 'Message' }).fill(quotedReply)
      await alice.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(bob.locator('article[data-sequence]', { hasText: quotedReply })).toBeVisible()

      const quotedBubble = alice.locator('article[data-sequence]', { hasText: quotedReply })
      await quotedBubble.getByRole('button', { name: 'Go to original message from Bob E2E User' }).focus()
      await quotedBubble.getByRole('button', { name: 'Go to original message from Bob E2E User' }).press('Enter')
      await expect(alice.locator(`[data-message-id="${bobMessageId}"]`)).toHaveAttribute('data-highlighted', 'true')
      await expect(alice.locator(`[data-message-id="${bobMessageId}"]`)).not.toHaveAttribute('data-highlighted', 'true')
      await originalBubble.getByRole('button', { name: 'More actions' }).click()
      await originalBubble.getByRole('button', { name: 'Delete' }).click()
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
  test('synchronizes group additions, roles, ownership, removal and unread across two live users', async ({ browser }) => {
    test.setTimeout(120_000)
    const a = await browser.newContext(), b = await browser.newContext()
    try {
      const alice = await a.newPage(), bob = await b.newPage()
      const connected = bob.waitForResponse(response => response.url().includes('/presence/config') && response.ok())
      await login(bob, accounts.bob); await connected
      await login(alice, accounts.alice)
      await alice.getByRole('button', { name: 'New conversation' }).click()
      const create = alice.getByRole('dialog', { name: 'New conversation' })
      await create.getByRole('button', { name: 'New group' }).click()
      const group = `Live management ${Date.now()}`
      await create.getByLabel('Group name').fill(group)
      await create.getByLabel('Search people').fill(accounts.carol.email)
      await create.getByRole('button', { name: /Carol E2E/ }).click()
      await create.getByRole('button', { name: 'Start conversation' }).click()
      await alice.getByRole('button', { name: 'Conversation info' }).click()
      let details = alice.getByRole('dialog', { name: 'Conversation details' })
      const input = details.getByRole('textbox', { name: 'Search people to add' })
      await input.fill(accounts.bob.email)
      await details.getByRole('button', { name: /Bob E2E User @/ }).click()
      await expect(bob.getByRole('link', { name: new RegExp(group) })).toHaveCount(0)
      await details.getByRole('button', { name: 'Add members' }).click()
      await expect(alice.getByText('Group updated successfully.', { exact: true })).toBeVisible()
      await expect(details.getByText('3 active in this conversation.')).toBeVisible()
      // Timeout is below fallback polling interval: this must use the personal realtime event.
      await expect(bob.getByRole('link', { name: new RegExp(group) })).toBeVisible({ timeout: 10_000 })
      await expect(bob.getByText(`You were added to ${group}.`, { exact: true })).toBeVisible()
      // A success toast can temporarily cover the top-right close button.
      await details.getByRole('button', { name: 'Close dialog' }).press('Enter')
      const text = `read-without-notifications-${Date.now()}`
      await alice.getByRole('textbox', { name: 'Message' }).fill(text)
      await alice.getByRole('button', { name: 'Send', exact: true }).click()
      const bobLink = bob.getByRole('link', { name: new RegExp(group) })
      await expect(bobLink.getByText('1', { exact: true })).toBeVisible()
      await bob.bringToFront(); await bobLink.click()
      await expect(bob.locator('article', { hasText: text })).toBeVisible()
      await expect(bobLink.getByText('1', { exact: true })).toHaveCount(0)
      await bob.getByRole('button', { name: 'Conversation info' }).click()
      const bobDetails = bob.getByRole('dialog', { name: 'Conversation details' })
      await expect(bobDetails.getByText('Invite people', { exact: true })).toHaveCount(0)
      await alice.getByRole('button', { name: 'Conversation info' }).click()
      details = alice.getByRole('dialog', { name: 'Conversation details' })
      await details.getByRole('combobox', { name: 'Role for Bob E2E User' }).selectOption('ADMIN')
      await alice.getByRole('dialog', { name: 'Change member role?' }).getByRole('button', { name: 'Confirm' }).click()
      await expect(bobDetails.getByText('Invite people', { exact: true })).toBeVisible()
      await expect(bobDetails.getByText('ADMIN', { exact: true })).toBeVisible()
      await details.getByRole('combobox', { name: 'Role for Bob E2E User' }).selectOption('MEMBER')
      await alice.getByRole('dialog', { name: 'Change member role?' }).getByRole('button', { name: 'Confirm' }).click()
      await expect(bobDetails.getByText('Invite people', { exact: true })).toHaveCount(0)
      await details.locator('.member-row', { hasText: 'Bob E2E User' }).getByRole('button', { name: 'Transfer ownership' }).click()
      const transfer = alice.getByRole('dialog', { name: 'Transfer ownership?' })
      await expect(transfer.getByText(/You will become an admin/)).toBeVisible()
      await transfer.getByRole('button', { name: 'Confirm' }).click()
      await expect(details.getByRole('combobox')).toHaveCount(0)
      await expect(bobDetails.getByRole('combobox', { name: 'Role for Alice E2E' })).toBeVisible()
      await bobDetails.locator('.member-row', { hasText: 'Alice E2E' }).getByRole('button', { name: 'Remove member' }).click()
      await bob.getByRole('dialog', { name: 'Remove this member?' }).getByRole('button', { name: 'Confirm' }).click()
      await expect(alice.getByText('You no longer have access to this group.', { exact: true })).toBeVisible()
      await expect(alice.getByRole('link', { name: new RegExp(group) })).toHaveCount(0)
      await bobDetails.getByRole('button', { name: 'Close dialog' }).click()
      await bob.getByRole('button', { name: 'Notifications', exact: true }).click()
      await expect(bob.getByRole('region', { name: 'Notifications' }).getByText(text, { exact: true })).toHaveCount(0)
    } finally { await a.close(); await b.close() }
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

  test('jumps to deep and deleted reply targets with bounded history and rejects editing over REST and STOMP', async ({ page, request }) => {
    test.setTimeout(120_000)
    const base = 'http://127.0.0.1:18080/api/v1'
    const auth = await request.post(`${base}/auth/login`, { data: accounts.alice })
    expect(auth.ok()).toBeTruthy()
    const token: string = (await auth.json()).data.accessToken
    const headers = { Authorization: `Bearer ${token}` }
    const bobLogin = await request.post(`${base}/auth/login`, { data: accounts.bob })
    const bobToken: string = (await bobLogin.json()).data.accessToken
    const bobProfile = await request.get(`${base}/users/me`, { headers: { Authorization: `Bearer ${bobToken}` } })
    const bobId: string = (await bobProfile.json()).data.id
    const groupName = `Reply history ${Date.now()}`
    const groupResponse = await request.post(`${base}/conversations`, { headers,
      data: { type: 'GROUP', name: groupName, memberIds: [bobId], maxMembers: 10, avatar: null } })
    expect(groupResponse.ok()).toBeTruthy()
    const group: string = (await groupResponse.json()).data.id
    const ids: string[] = []
    for (let index = 1; index <= 130; index++) {
      const response = await request.post(`${base}/conversations/${group}/messages`, { headers,
        data: { content: `history-${index}`, type: 'TEXT', replyToMessageId: null, attachments: [] } })
      expect(response.ok()).toBeTruthy()
      ids.push((await response.json()).data.id)
    }
    async function reply(content: string, original: string) {
      const response = await request.post(`${base}/conversations/${group}/messages`, { headers,
        data: { content, type: 'TEXT', replyToMessageId: original, attachments: [] } })
      expect(response.ok()).toBeTruthy()
      return (await response.json()).data.id as string
    }
    const deepReply = await reply('deep-history-reply', ids[39])
    const deletedReply = await reply('deleted-original-reply', ids[0])
    await reply('nested-reply', deepReply)
    const removed = await request.delete(`${base}/messages/${ids[0]}`, { headers })
    expect(removed.status()).toBe(204)
    const oldEdit = await request.patch(`${base}/messages/${ids[39]}`, { headers, data: { content: 'tampered' } })
    expect(oldEdit.status()).toBe(405)

    await login(page, accounts.alice)
    await page.getByRole('link', { name: new RegExp(groupName) }).click()
    const target = page.locator(`[data-message-id="${ids[39]}"]`)
    await expect(target).toHaveCount(0)
    let contextRequests = 0
    page.on('request', event => { if (event.url().endsWith('/context')) contextRequests++ })
    const contextResponse = page.waitForResponse(response => response.url().includes(`${ids[39]}/context`))
    await page.locator(`[data-message-id="${deepReply}"]`).getByRole('button', { name: 'Go to original message from Alice E2E' }).click()
    expect((await (await contextResponse).json()).data.items.length).toBeLessThanOrEqual(41)
    await expect(target).toHaveAttribute('data-highlighted', 'true')
    await expect(target.getByText('history-40', { exact: true })).toBeVisible()
    await expect.poll(() => target.evaluate(element => {
      const rectangle = element.getBoundingClientRect()
      const viewport = element.parentElement!.parentElement!.getBoundingClientRect()
      return Math.abs((rectangle.top + rectangle.bottom) / 2 - (viewport.top + viewport.bottom) / 2)
    })).toBeLessThan(5)
    expect(contextRequests).toBe(1)
    await expect(target).not.toHaveAttribute('data-highlighted', 'true')
    await page.getByRole('button', { name: 'Load older messages' }).click()
    await expect(page.locator(`[data-message-id="${ids[0]}"]`)).toBeVisible()
    await page.getByRole('button', { name: 'Load newer messages' }).click()
    await expect(page.locator(`[data-message-id="${ids[79]}"]`)).toHaveCount(1)
    const sequences = await page.locator('article[data-sequence]').evaluateAll(elements => elements.map(element => Number(element.getAttribute('data-sequence'))))
    expect(sequences).toEqual([...new Set(sequences)].sort((a, b) => a - b))
    await page.getByRole('button', { name: 'Return to latest' }).click()
    const nested = page.locator('article', { hasText: 'nested-reply' })
    await nested.getByRole('button', { name: 'Go to original message from Alice E2E' }).press('Enter')
    await expect(page.locator(`[data-message-id="${deepReply}"]`)).toHaveAttribute('data-highlighted', 'true')
    expect(contextRequests).toBe(3)
    await page.locator(`[data-message-id="${deletedReply}"]`).getByRole('button', { name: 'Go to original message from Alice E2E' }).click()
    await expect(page.locator(`[data-message-id="${ids[0]}"]`)).toHaveAttribute('data-highlighted', 'true')
    await expect(page.locator(`[data-message-id="${ids[0]}"]`).getByText('Message deleted')).toBeVisible()

    // Authenticated legacy-looking edit SENDs cannot change a row. A typing echo proves the socket processed traffic.
    await page.evaluate(({ token, group, messageId }) => new Promise<void>((resolve, reject) => {
      const socket = new WebSocket('ws://127.0.0.1:18080/ws')
      const timer = window.setTimeout(() => { socket.close(); reject(new Error('STOMP proof timed out')) }, 10_000)
      socket.onopen = () => socket.send(`CONNECT\naccept-version:1.2\nAuthorization:Bearer ${token}\nheart-beat:0,0\n\n\0`)
      socket.onerror = () => { clearTimeout(timer); reject(new Error('STOMP connection failed')) }
      socket.onmessage = event => {
        const frame = String(event.data)
        if (frame.startsWith('CONNECTED')) {
          socket.send(`SUBSCRIBE\nid:proof\ndestination:/topic/conversations/${group}\n\n\0`)
          for (const destination of [`/app/messages/${messageId}/edit`, `/app/conversations/${group}/messages/${messageId}/edit`]) {
            socket.send(`SEND\ndestination:${destination}\ncontent-type:application/json\n\n${JSON.stringify({ content: 'stomp-tampered' })}\0`)
          }
          socket.send(`SEND\ndestination:/app/conversations/${group}/typing\ncontent-type:application/json\n\n{"typing":true}\0`)
        } else if (frame.startsWith('MESSAGE') && frame.includes('"type":"TYPING"')) {
          clearTimeout(timer); socket.close(); resolve()
        } else if (frame.startsWith('ERROR')) {
          clearTimeout(timer); socket.close(); reject(new Error('Unexpected STOMP error'))
        }
      }
    }), { token, group, messageId: ids[39] })
    const unchanged = await request.get(`${base}/conversations/${group}/messages/${ids[39]}/context`, { headers })
    const persisted = (await unchanged.json()).data.items.find((item: { id: string }) => item.id === ids[39])
    expect(persisted.content).toBe('history-40')
    expect(persisted.editedAt).toBeNull()
  })

  test('keeps notification and sidebar unread badges circular on desktop/mobile and clears them after reading', async ({ page, request }) => {
    test.setTimeout(120_000)
    const base = 'http://127.0.0.1:18080/api/v1'
    const aliceLogin = await request.post(`${base}/auth/login`, { data: accounts.alice })
    const token: string = (await aliceLogin.json()).data.accessToken
    const headers = { Authorization: `Bearer ${token}` }
    const bobLogin = await request.post(`${base}/auth/login`, { data: accounts.bob })
    const bobToken: string = (await bobLogin.json()).data.accessToken
    const bobProfile = await request.get(`${base}/users/me`, { headers: { Authorization: `Bearer ${bobToken}` } })
    const groupName = `Badge regression ${Date.now()}`
    const created = await request.post(`${base}/conversations`, { headers,
      data: { type: 'GROUP', name: groupName, memberIds: [(await bobProfile.json()).data.id], maxMembers: 10, avatar: null } })
    const group: string = (await created.json()).data.id
    for (let index = 0; index < 101; index++) {
      const sent = await request.post(`${base}/conversations/${group}/messages`, { headers,
        data: { content: `unread-${index}`, type: 'TEXT', replyToMessageId: null, attachments: [] } })
      expect(sent.ok()).toBeTruthy()
    }
    await login(page, accounts.bob)
    const sidebarBadge = page.getByRole('link', { name: new RegExp(groupName) }).getByLabel('101 unread messages')
    expect(await sidebarBadge.evaluate(element => element.getBoundingClientRect().width)).toBe(28)
    expect(await sidebarBadge.evaluate(element => element.getBoundingClientRect().height)).toBe(28)
    await page.getByRole('button', { name: 'Notifications', exact: true }).click()
    const region = page.getByRole('region', { name: 'Notifications' })
    const card = region.getByRole('button', { name: new RegExp(groupName) })
    const badge = card.getByLabel('101 unread messages')
    await expect(badge).toHaveText('99+')
    async function checkCircle() {
      const geometry = await badge.evaluate(element => {
        const rectangle = element.getBoundingClientRect()
        const card = element.closest('button')!.getBoundingClientRect()
        const style = getComputedStyle(element)
        return { width: rectangle.width, height: rectangle.height,
          center: Math.abs((rectangle.top + rectangle.bottom) / 2 - (card.top + card.bottom) / 2),
          right: card.right - rectangle.right, shrink: style.flexShrink, radius: style.borderRadius }
      })
      expect(geometry.width).toBe(28); expect(geometry.height).toBe(28)
      expect(geometry.center).toBeLessThan(1); expect(geometry.right).toBeGreaterThanOrEqual(16)
      expect(geometry.shrink).toBe('0'); expect(parseFloat(geometry.radius)).toBeGreaterThanOrEqual(14)
    }
    await checkCircle()
    await page.screenshot({ path: 'test-results/notification-badge-desktop.png' })
    await page.setViewportSize({ width: 390, height: 844 })
    await checkCircle()
    await page.screenshot({ path: 'test-results/notification-badge-mobile.png' })
    await card.click()
    await page.bringToFront()
    await expect(page.locator('article', { hasText: 'unread-100' })).toBeVisible()
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByRole('link', { name: new RegExp(groupName) }).getByLabel('101 unread messages')).toHaveCount(0)
    await page.getByRole('button', { name: 'Notifications', exact: true }).click()
    await expect(region.getByRole('button', { name: new RegExp(groupName) })).toHaveCount(0)
  })

  test('keeps the history viewport adjacent to the composer for short and paginated conversations', async ({ page, request }) => {
    test.setTimeout(180_000)
    const base = 'http://127.0.0.1:18080/api/v1'
    const auth = await request.post(`${base}/auth/login`, { data: accounts.alice })
    const headers = { Authorization: `Bearer ${(await auth.json()).data.accessToken}` }
    const bobAuth = await request.post(`${base}/auth/login`, { data: accounts.bob })
    const bobHeaders = { Authorization: `Bearer ${(await bobAuth.json()).data.accessToken}` }
    const profile = await request.get(`${base}/users/me`, { headers: bobHeaders })
    const bobId = (await profile.json()).data.id
    await login(page, accounts.alice)
    for (const count of [1, 10, 100, 250]) {
      const name = `Layout ${count} ${Date.now()}`
      const created = await request.post(`${base}/conversations`, { headers,
        data: { type: 'GROUP', name, memberIds: [bobId], maxMembers: 10, avatar: null } })
      expect(created.ok()).toBeTruthy()
      const id = (await created.json()).data.id
      for (let index = 1; index <= count; index++) {
        const sent = await request.post(`${base}/conversations/${id}/messages`, { headers,
          data: { content: `layout-${count}-${index}`, type: 'TEXT', attachments: [] } })
        expect(sent.ok()).toBeTruthy()
      }
      await page.reload()
      await page.getByRole('link', { name: new RegExp(name) }).click()
      const newest = page.locator(`article[data-sequence="${count}"]`)
      await expect(newest).toBeVisible()
      for (const size of [{ width: 1280, height: 900 }, { width: 1280, height: 600 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(size)
        const composer = page.getByRole('textbox', { name: 'Message', exact: true })
        await composer.evaluate(el => { const viewport = el.closest('form')!.parentElement!.previousElementSibling!; viewport.scrollTop = viewport.scrollHeight })
        await expect.poll(() => composer.evaluate(el => {
          const outer = el.closest('form')!.parentElement!
          const viewport = outer.previousElementSibling!
          const latest = viewport.querySelector('article[data-sequence]:last-of-type')!
          const rect = latest.getBoundingClientRect()
          return { gap: outer.getBoundingClientRect().top - viewport.getBoundingClientRect().bottom,
            padding: getComputedStyle(viewport).paddingBottom,
            clipped: rect.bottom > viewport.getBoundingClientRect().bottom,
            nestedScroll: viewport.querySelectorAll('[class*="overflow-y-auto"]').length }
        })).toEqual({ gap: 0, padding: '12px', clipped: false, nestedScroll: 0 })
        expect(await composer.evaluate(el => {
          const css = getComputedStyle(el.closest('form')!.parentElement!)
          return [css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft]
        })).toEqual(['0px', '0px', '0px', '0px'])
        expect(await composer.evaluate(el => {
          const form = el.closest('form')!
          return form.getBoundingClientRect().width - form.parentElement!.getBoundingClientRect().width
        })).toBe(0)
        expect(await composer.evaluate(el => {
          const css = getComputedStyle(el.closest('form')!)
          return [css.borderTopWidth, css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth, css.boxShadow]
        })).toEqual(['0px', '0px', '0px', '0px', 'none'])
        await newest.getByRole('button', { name: 'Reply', exact: true }).click()
        await expect(page.getByText('Replying to Alice E2E', { exact: true })).toBeVisible()
        expect(await composer.evaluate(el => {
          const outer = el.closest('form')!.parentElement!
          return outer.getBoundingClientRect().top - outer.previousElementSibling!.getBoundingClientRect().bottom
        })).toBe(0)
        await composer.evaluate(el => { const viewport = el.closest('form')!.parentElement!.previousElementSibling!; viewport.scrollTop = viewport.scrollHeight })
        expect(await newest.evaluate(el => el.getBoundingClientRect().bottom <= el.parentElement!.parentElement!.getBoundingClientRect().bottom)).toBe(true)
        await page.getByRole('button', { name: 'Cancel reply', exact: true }).click()
        await page.screenshot({ path: `test-results/chat-layout-${count}-${size.width}-${size.height}.png` })
      }
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.getByRole('textbox', { name: 'Message', exact: true }).fill(`sent-layout-${count}`)
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(page.locator('article[data-sequence]').filter({ hasText: `sent-layout-${count}` })).toBeVisible()
      const received = await request.post(`${base}/conversations/${id}/messages`, { headers: bobHeaders,
        data: { content: `received-layout-${count}`, type: 'TEXT', attachments: [] } })
      expect(received.ok()).toBeTruthy()
      await expect(page.locator('article[data-sequence]').filter({ hasText: `received-layout-${count}` })).toBeVisible()
      if (count > 50) {
        await page.getByRole('textbox', { name: 'Message', exact: true }).evaluate(el => { el.closest('form')!.parentElement!.previousElementSibling!.scrollTop = 0 })
        await page.getByRole('button', { name: 'Load older messages' }).click()
        await expect(page.locator('article[data-sequence]').first()).toHaveAttribute('data-sequence', count === 100 ? '1' : '151')
      }
    }
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
