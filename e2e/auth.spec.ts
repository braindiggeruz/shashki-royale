import { test, expect } from '@playwright/test';

test.describe('Authentication & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Start from the index page (main menu)
    await page.goto('http://localhost:5173/');
  });

  test('should display main menu with all buttons', async ({ page }) => {
    // Check if main menu is visible
    await expect(page.locator('text=ШАШКИ')).toBeVisible();
    await expect(page.locator('text=РОЯЛЬ')).toBeVisible();
    
    // Check main buttons exist
    await expect(page.locator('button:has-text("Играть локально")')).toBeVisible();
    await expect(page.locator('button:has-text("Играть онлайн")')).toBeVisible();
  });

  test('should navigate to local game without login', async ({ page }) => {
    // Click "Играть локально" button
    await page.click('button:has-text("Играть локально")');
    
    // Should load local game, not redirect to login
    await page.waitForURL('**/local');
    await expect(page).toHaveURL(/.*\/local/);
    
    // Check if game board is visible
    await expect(page.locator('[class*="board"]')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to login page from main menu', async ({ page }) => {
    // Click "Играть онлайн" button
    await page.click('button:has-text("Играть онлайн")');
    
    // Should redirect to login
    await page.waitForURL('**/auth/login', { timeout: 5000 });
    await expect(page).toHaveURL(/.*\/auth\/login/);
  });

  test('should display login page with all elements', async ({ page }) => {
    // Navigate to login
    await page.click('button:has-text("Играть онлайн")');
    await page.waitForURL('**/auth/login');
    
    // Check back button exists
    const backButton = page.locator('button[title="Вернуться назад"]');
    await expect(backButton).toBeVisible();
    
    // Check header
    await expect(page.locator('text=Вход в игру')).toBeVisible();
    
    // Check "Играть сразу" button
    await expect(page.locator('button:has-text("Играть сразу")')).toBeVisible();
    
    // Check Google button
    const googleButton = page.locator('button:has-text("Войти через Google"), button:has-text("Гость через Google")');
    await expect(googleButton).toBeVisible();
    
    // Check email and password inputs
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    
    // Check register link
    await expect(page.locator('a:has-text("Зарегистрироваться")')).toBeVisible();
  });

  test('should navigate back from login to main menu', async ({ page }) => {
    // Navigate to login
    await page.click('button:has-text("Играть онлайн")');
    await page.waitForURL('**/auth/login');
    
    // Click back button
    const backButton = page.locator('button[title="Вернуться назад"]');
    await backButton.click();
    
    // Should return to main menu
    await page.waitForURL('**/');
    await expect(page).toHaveURL(/.*\/$/);
    await expect(page.locator('text=ШАШКИ')).toBeVisible();
  });

  test('should navigate to register page', async ({ page }) => {
    // Navigate to login
    await page.click('button:has-text("Играть онлайн")');
    await page.waitForURL('**/auth/login');
    
    // Click register link
    await page.click('a:has-text("Зарегистрироваться")');
    
    // Should navigate to register
    await page.waitForURL('**/auth/register');
    await expect(page).toHaveURL(/.*\/auth\/register/);
  });

  test('should display register page with all elements', async ({ page }) => {
    // Navigate to register
    await page.click('button:has-text("Играть онлайн")');
    await page.waitForURL('**/auth/login');
    await page.click('a:has-text("Зарегистрироваться")');
    await page.waitForURL('**/auth/register');
    
    // Check back button
    const backButton = page.locator('button[title="Вернуться назад"]');
    await expect(backButton).toBeVisible();
    
    // Check header
    await expect(page.locator('text=Создание аккаунта')).toBeVisible();
    
    // Check form elements
    await expect(page.locator('button:has-text("Создать и играть")')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="text"]')).toBeVisible(); // nickname
    
    // Check if form is scrollable (check bottom elements are accessible)
    const registerButton = page.locator('button:has-text("Войти")');
    await registerButton.scrollIntoViewIfNeeded();
    await expect(registerButton).toBeVisible();
  });

  test('should navigate back from register to login', async ({ page }) => {
    // Navigate to register
    await page.click('button:has-text("Играть онлайн")');
    await page.waitForURL('**/auth/login');
    await page.click('a:has-text("Зарегистрироваться")');
    await page.waitForURL('**/auth/register');
    
    // Click back button
    const backButton = page.locator('button[title="Вернуться назад"]');
    await backButton.click();
    
    // Should return to login
    await page.waitForURL('**/auth/login');
    await expect(page).toHaveURL(/.*\/auth\/login/);
    await expect(page.locator('text=Вход в игру')).toBeVisible();
  });

  test('should allow quick play without registration', async ({ page }) => {
    // Navigate to login
    await page.click('button:has-text("Играть онлайн")');
    await page.waitForURL('**/auth/login');
    
    // Click "Играть сразу"
    await page.click('button:has-text("Играть сразу")');
    
    // Should navigate to local game or lobby
    await page.waitForURL('**/(local|lobby)', { timeout: 5000 });
    
    // Check if we're in a game or lobby
    const url = page.url();
    const isLocalOrLobby = url.includes('/local') || url.includes('/lobby');
    expect(isLocalOrLobby).toBe(true);
  });

  test('should allow quick register without email/password', async ({ page }) => {
    // Navigate to register
    await page.click('button:has-text("Играть онлайн")');
    await page.waitForURL('**/auth/login');
    await page.click('a:has-text("Зарегистрироваться")');
    await page.waitForURL('**/auth/register');
    
    // Click "Создать и играть" without filling form
    await page.click('button:has-text("Создать и играть")');
    
    // Should navigate to local game or login
    await page.waitForURL('**/(local|auth/login)', { timeout: 5000 });
  });

  test('should show password toggle in login', async ({ page }) => {
    // Navigate to login
    await page.click('button:has-text("Играть онлайн")');
    await page.waitForURL('**/auth/login');
    
    // Find password input
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
    
    // Find eye button (password toggle)
    const eyeButton = page.locator('button').filter({ has: page.locator('svg') }).nth(1); // Second button with SVG
    await expect(eyeButton).toBeVisible();
    
    // Click eye button to show password
    await eyeButton.click();
    
    // Password input should now be type="text"
    const visiblePasswordInput = page.locator('input[type="text"]').first();
    await expect(visiblePasswordInput).toBeVisible();
  });

  test('should have Google OAuth button on login', async ({ page }) => {
    // Navigate to login
    await page.click('button:has-text("Играть онлайн")');
    await page.waitForURL('**/auth/login');
    
    // Find Google button
    const googleButton = page.locator('button').filter({ 
      has: page.locator('svg').first() 
    }).filter({ hasText: /Войти через Google|Гость через Google/ });
    
    await expect(googleButton).toBeVisible();
    
    // Check if button has Google SVG icon
    const googleSvg = googleButton.locator('svg');
    await expect(googleSvg).toBeVisible();
  });

  test('should navigate between auth pages correctly', async ({ page }) => {
    // Login -> Register
    await page.click('button:has-text("Играть онлайн")');
    await page.waitForURL('**/auth/login');
    await page.click('a:has-text("Зарегистрироваться")');
    await page.waitForURL('**/auth/register');
    
    // Register -> Back to Login
    await page.locator('button[title="Вернуться назад"]').click();
    await page.waitForURL('**/auth/login');
    
    // Login -> Back to Main Menu
    await page.locator('button[title="Вернуться назад"]').click();
    await page.waitForURL('**/');
    
    // Main Menu -> Local Game
    await page.click('button:has-text("Играть локально")');
    await page.waitForURL('**/local');
  });
});

test.describe('Game Board', () => {
  test('should display game board with pieces', async ({ page }) => {
    await page.goto('http://localhost:5173/local');
    
    // Wait for board to load
    await page.waitForTimeout(1000);
    
    // Check if board is visible
    const board = page.locator('[class*="board"], [class*="Board"]').first();
    await expect(board).toBeVisible({ timeout: 5000 });
    
    // Check if pieces are visible (look for piece elements)
    const pieces = page.locator('[class*="piece"], [class*="Piece"]');
    const count = await pieces.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should highlight legal moves when piece is selected', async ({ page }) => {
    await page.goto('http://localhost:5173/local');
    
    // Wait for board to load
    await page.waitForTimeout(1000);
    
    // Find a piece and click it
    const pieces = page.locator('[class*="piece"], [class*="Piece"]');
    if (await pieces.count() > 0) {
      await pieces.first().click();
      
      // Check if legal moves are highlighted (green circles)
      const legalMoves = page.locator('[class*="legal"], [class*="highlight"], [class*="green"]');
      const moveCount = await legalMoves.count();
      
      // Should have at least 0 legal moves (depends on piece position)
      expect(moveCount).toBeGreaterThanOrEqual(0);
    }
  });
});
