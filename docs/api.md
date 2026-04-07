# AnyClick v2 API Reference

## Session Management

### `POST /browser/session/start`
Start a persistent browser session.

**Body:**
```json
{
  "taskId": "optional_n8n_execution_id",
  "url": "https://example.com"
}
```

### `POST /browser/session/stop`
Close the active browser tab/context.

## Actions (Capability Endpoints)

All action endpoints try to resolve the target via Memory > Deterministic > Semantic AI > Repair AI.

### `POST /browser/click`
```json
{
  "sessionId": "...",
  "intent": "submit_login", 
  "target": {
    "text": "Log In",
    "role": "button",
    "testId": "login-submit"
  }
}
```

### `POST /browser/type`
```json
{
  "intent": "type_email",
  "target": { "placeholder": "jane@example.com" },
  "value": "admin@mycompany.com"
}
```

### `POST /browser/form-fill`
Fill multiple fields sequentially.
```json
{
  "fields": [
    { "placeholder": "Email", "value": "admin@test.com" },
    { "label": "Password", "value": "secret123" }
  ]
}
```

### `POST /browser/wait-for-condition`
```json
{
  "condition": "url_change", // load, network_idle, text_appears, element_appears
  "timeout": 10000
}
```

## Data Extraction

### `POST /browser/page-query`
Search for text on the page.

### `POST /browser/scrape`
Structured extraction.
```json
{
  "selector": ".property-card",
  "fields": [
    { "name": "price", "selector": ".price-text" },
    { "name": "address", "selector": "h3" }
  ]
}
```

### `POST /browser/paginated-extraction`
Scrape across multiple pages autonomously.
```json
{
  "itemSelector": ".result-item",
  "fields": [...],
  "nextButton": { "text": "Next Page", "role": "button" },
  "maxPages": 5
}
```
