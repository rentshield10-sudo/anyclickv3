import { Page } from 'playwright';
import { createLogger } from '../utils/logger';

const log = createLogger('detect-login');

export interface LoginStatus {
  loggedIn: boolean;
  evidence: string[];
}

/**
 * Heuristically detect whether the current page is in a logged-in state.
 * Checks for positive signals (authenticated markers) and negative signals (auth forms).
 */
export async function detectLogin(page: Page): Promise<LoginStatus> {
  const evidence: string[] = [];
  const url = page.url();

  // ── Negative signals: not logged in ────────────────────────────────────────
  const notLoggedInPatterns = [
    /\/(login|signin|sign-in|auth|authenticate|log-in|logon)(\/|$|\?)/i,
    /\/(sso|oauth|otp|verify|2fa)(\/|$|\?)/i,
  ];
  const isAuthUrl = notLoggedInPatterns.some((p) => p.test(url));

  const hasPasswordField = await page.locator('input[type="password"]').isVisible().catch(() => false);
  const hasLoginButton = await page
    .locator('button:has-text("Log in"), button:has-text("Sign in"), a:has-text("Log in"), a:has-text("Sign in")')
    .first()
    .isVisible()
    .catch(() => false);
  const hasOtpField = await page
    .locator('input[autocomplete="one-time-code"], input[name*="otp"], input[name*="token"]')
    .isVisible()
    .catch(() => false);

  // ── Positive signals: logged in ─────────────────────────────────────────────
  const hasAvatar = await page
    .locator('[aria-label*="account" i], [aria-label*="profile" i], img[alt*="avatar" i], .avatar, .user-avatar')
    .first()
    .isVisible()
    .catch(() => false);
  const hasLogoutLink = await page
    .locator('a:has-text("Logout"), a:has-text("Log out"), a:has-text("Sign out"), button:has-text("Logout")')
    .first()
    .isVisible()
    .catch(() => false);
  const hasDashboardContent = await page
    .locator('main, [role="main"], .dashboard, #dashboard, .app-content')
    .first()
    .isVisible()
    .catch(() => false);

  // ── Score ────────────────────────────────────────────────────────────────────
  const negativeScore = [isAuthUrl, hasPasswordField, hasLoginButton, hasOtpField].filter(Boolean).length;
  const positiveScore = [hasAvatar, hasLogoutLink, hasDashboardContent].filter(Boolean).length;

  if (isAuthUrl) evidence.push('URL matches auth/login pattern');
  if (hasPasswordField) evidence.push('password field visible');
  if (hasLoginButton) evidence.push('login/sign-in button visible');
  if (hasOtpField) evidence.push('OTP/2FA field visible');
  if (hasAvatar) evidence.push('account avatar/menu visible');
  if (hasLogoutLink) evidence.push('logout link visible');
  if (hasDashboardContent) evidence.push('main content area visible');

  const loggedIn = positiveScore > 0 && negativeScore === 0;

  log.debug({ loggedIn, positiveScore, negativeScore, evidence }, 'Login detection result');

  return { loggedIn, evidence };
}
