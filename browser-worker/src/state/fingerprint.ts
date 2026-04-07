import { Page } from 'playwright';
import { createLogger } from '../utils/logger';
import type { PageType } from '../memory/types';

const log = createLogger('fingerprint');

export interface FingerprintData {
  hostname: string;
  pathname: string;
  pathPattern: string;
  title: string;
  headings: string[];
  navLabels: string[];
  formLabels: string[];
  pageType: PageType;
}

/**
 * Generate a structural fingerprint of the current page.
 * Used for page identification and recipe matching.
 */
export async function generateFingerprint(page: Page): Promise<FingerprintData> {
  const url = new URL(page.url());
  const title = await page.title();

  const pageData = await page.evaluate(() => {
    // Headings
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .map(h => (h.textContent || '').trim())
      .filter(h => h.length > 0 && h.length < 150)
      .slice(0, 15);

    // Nav labels
    const navLabels = Array.from(document.querySelectorAll('nav a, [role="navigation"] a, .nav a, .sidebar a'))
      .map(a => (a.textContent || '').trim())
      .filter(l => l.length > 0 && l.length < 50)
      .slice(0, 20);

    // Form labels  
    const formLabels = Array.from(document.querySelectorAll('label, [for], .form-label'))
      .map(l => (l.textContent || '').trim())
      .filter(l => l.length > 0 && l.length < 80)
      .slice(0, 15);

    // Page type signals
    const hasPasswordField = !!document.querySelector('input[type="password"]');
    const hasLoginForm = !!document.querySelector('form:has(input[type="password"])');
    const hasSearchInput = !!document.querySelector('input[type="search"], [role="search"] input, input[placeholder*="search" i]');
    const hasTable = !!document.querySelector('table, [role="grid"]');
    const hasList = !!document.querySelector('ul.list, ol.list, [role="list"], .item-list, .results');
    const hasDetailPanel = !!document.querySelector('[class*="detail"], [class*="profile"], [class*="info-panel"]');
    const hasSettingsForm = !!document.querySelector('[class*="setting"], [class*="preference"]');
    const hasComposer = !!document.querySelector('[class*="compose"], [class*="editor"], [contenteditable="true"]');
    const hasInbox = !!document.querySelector('[class*="inbox"], [class*="message-list"], [class*="conversation"]');
    const hasDashboard = !!document.querySelector('[class*="dashboard"], [class*="overview"], [class*="summary"]');

    return {
      headings, navLabels, formLabels,
      signals: {
        hasPasswordField, hasLoginForm, hasSearchInput, hasTable,
        hasList, hasDetailPanel, hasSettingsForm, hasComposer,
        hasInbox, hasDashboard,
      },
    };
  }).catch(() => ({
    headings: [], navLabels: [], formLabels: [],
    signals: {
      hasPasswordField: false, hasLoginForm: false, hasSearchInput: false,
      hasTable: false, hasList: false, hasDetailPanel: false,
      hasSettingsForm: false, hasComposer: false, hasInbox: false, hasDashboard: false,
    },
  }));

  const pageType = classifyPageType(url, title, pageData.signals);
  const pathPattern = generatePathPattern(url.pathname);

  log.debug({ hostname: url.hostname, pageType, pathPattern }, 'Fingerprint generated');

  return {
    hostname: url.hostname,
    pathname: url.pathname,
    pathPattern,
    title,
    headings: pageData.headings,
    navLabels: pageData.navLabels,
    formLabels: pageData.formLabels,
    pageType,
  };
}

// ─── Page Type Classification ────────────────────────────────────────────────

function classifyPageType(
  url: URL,
  title: string,
  signals: Record<string, boolean>
): PageType {
  const path = url.pathname.toLowerCase();
  const titleLower = title.toLowerCase();

  // Login detection (highest priority)
  if (signals.hasLoginForm || signals.hasPasswordField) return 'login';
  if (/\/(login|signin|sign-in|auth|log-in)/i.test(path)) return 'login';

  // Specific page types  
  if (signals.hasComposer) return 'compose';
  if (signals.hasInbox) return 'inbox';
  if (signals.hasSettingsForm || /\/(settings|preferences|config)/i.test(path)) return 'settings';
  if (signals.hasSearchInput && /\/(search|find|results)/i.test(path)) return 'search';
  if (signals.hasDashboard || /\/(dashboard|home|overview)/i.test(path)) return 'dashboard';
  if (signals.hasDetailPanel || /\/[a-z-]+\/\d+/i.test(path)) return 'detail';
  if (signals.hasList || signals.hasTable) return 'list';
  if (/\/(new|create|add|edit|form)/i.test(path)) return 'form';
  
  return 'unknown';
}

// ─── Path Pattern ────────────────────────────────────────────────────────────

/**
 * Generate a generalized path pattern from a specific pathname.
 * Example: /users/12345/messages becomes /users/{id}/messages
 */
function generatePathPattern(pathname: string): string {
  const hashPattern = new RegExp('\\/[a-f0-9]{8,}', 'gi');
  return pathname
    .replace(/\/\d+/g, '/*')               // /users/123 → /users/*
    .replace(hashPattern, '/*')             // /users/abc123def → /users/*  (hashes/UUIDs)
    .replace(/\/$/, '') || '/';             // strip trailing slash
}
