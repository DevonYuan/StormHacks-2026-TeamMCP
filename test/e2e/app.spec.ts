import { test, expect } from '@playwright/test'

test.describe('Team MCP Gateway App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('should load the network page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText("Who's connected")
  })

  test('should toggle gateway status', async ({ page }) => {
    await expect(page.getByText('Gateway running')).toBeVisible()
    await page.getByLabel('Pause gateway').click()
    await expect(page.getByText('Gateway paused')).toBeVisible()
  })

  test('should navigate to Machines and Settings', async ({ page }) => {
    await page.getByRole('button', { name: /Machines/ }).click()
    await expect(page.getByText('Machines is coming next.')).toBeVisible()
    await page.getByRole('button', { name: /Settings/ }).click()
    await expect(page.getByText('Settings is coming next.')).toBeVisible()
  })
})
