import { test, expect } from '@playwright/test'

test.describe('Team MCP Gateway App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for app to load
    await page.waitForLoadState('networkidle')
  })

  test('should load the dashboard', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('MCP Servers')
  })

  test('should show gateway status', async ({ page }) => {
    await expect(page.locator('text=Running, text=Stopped')).toBeVisible()
  })

  test('should navigate to Policy page', async ({ page }) => {
    await page.click('text=Policy')
    await expect(page.locator('h1')).toContainText('Authorization Policy')
  })

  test('should navigate to Activity page', async ({ page }) => {
    await page.click('text=Activity')
    await expect(page.locator('h1')).toContainText('Activity Log')
  })

  test('should navigate to Health page', async ({ page }) => {
    await page.click('text=Health')
    await expect(page.locator('h1')).toContainText('Server Health')
  })

  test('should navigate to Settings page', async ({ page }) => {
    await page.click('text=Settings')
    await expect(page.locator('h1')).toContainText('Settings')
  })

  test('should open Add Server dialog', async ({ page }) => {
    await page.click('text=Add Server')
    await expect(page.locator('text=Add Server')).toBeVisible()
    await expect(page.locator('input#name')).toBeVisible()
  })
})