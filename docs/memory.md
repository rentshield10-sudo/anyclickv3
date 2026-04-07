# Memory Layers

AnyClick v2 solves the "AI cost and speed" problem by maintaining 3 distinct layers of memory. This allows it to act like a deterministic automation tool (Playwright) after just one supervised run.

## 1. Action Recipes (`data/recipes/{site}.json`)

The most important layer. Every time an action (e.g., "click the login button") succeeds, the LocatorEngine saves the exact selector and a confidence score.

```json
{
  "id": "recipe_1711234567890",
  "site": "example.com",
  "pageType": "login",
  "intent": "submit_login",
  "locators": [
    { "selector": "#login-submit", "confidence": 0.99, "priority": 0 },
    { "selector": "button:has-text('Log In')", "confidence": 0.95, "priority": 1 }
  ],
  "stale": false,
  "successCount": 5,
  "failureCount": 0
}
```
Recipes decay in confidence if the site changes. After setting `stale: true`, the engine knows it must re-explore the DOM and find the element organically next time.

## 2. Page Fingerprints (`data/fingerprints/{site}.json`)

A structural hash to know exactly what page the browser is currently looking at. Based on title, headings, and form label overlap. This allows the system to recognize a "Dashboard" page even if the URL changes completely.

```json
{
  "hostname": "example.com",
  "pathPattern": "/dashboard/*",
  "pageType": "dashboard",
  "matchCount": 12
}
```

## 3. Run Audit Logs (`data/runs/{date}-{site}-{status}.json`)

Complete traceability. Every step taken (click, type, navigate) logs exactly *how* it resolved the element (was it instantaneous Recipe Replay, or did it require a 5s AI Repair?). These records form the basis for continuous testing and analytics.
