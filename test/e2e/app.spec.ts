import { test, expect } from '@playwright/test'

test.describe('Team MCP Gateway App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Email').fill('demo@tether.local')
    await page.getByLabel('Password').fill('demo1234')
    await page.locator('form').getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('heading', { name: "Who's connected" })).toBeVisible()
  })

  test('should load the network page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText("Who's connected")
  })

  test('should show the gateway start control when stopped', async ({ page }) => {
    await expect(page.getByLabel('Start gateway')).toBeVisible()
  })

  test('should navigate to Machines and Settings', async ({ page }) => {
    await page.getByRole('button', { name: /Machines/ }).click()
    await expect(page.getByRole('heading', { name: 'Machines' })).toBeVisible()
    await page.getByRole('button', { name: /Settings/ }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })

  test('should log out from the account section in Settings', async ({ page }) => {
    await page.getByRole('button', { name: /Settings/ }).click()
    await page.getByRole('button', { name: 'Log out' }).last().click()
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  })

  test('should switch between client and server modes', async ({ page }) => {
    await page.getByRole('button', { name: 'client', exact: true }).click()
    await expect(page.getByText('Client mode')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Connect to a host' })).toBeVisible()
    await page.getByRole('button', { name: 'server', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Connect to a peer' })).toBeVisible()
  })

  test('should create a demo account and return to the login screen on logout', async ({ page }) => {
    await page.getByRole('button', { name: 'Log out' }).click()
    await page.getByRole('tab', { name: 'Sign up' }).click()
    await page.getByLabel('Name').fill('Example Tester')
    await page.getByLabel('Email').fill('example@test.local')
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill('example123')
    await page.getByLabel('Confirm password').fill('example123')
    await page.locator('form').getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByText('Example Tester')).toBeVisible()
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  })

  test('should skip authentication for development', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Skip for development' })).toBeVisible()
    await page.getByRole('button', { name: 'Skip for development' }).click()
    await expect(page.getByRole('heading', { name: "Who's connected" })).toBeVisible()
    await expect(page.getByText('Development User')).toBeVisible()
  })
})
