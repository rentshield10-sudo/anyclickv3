# API Reference: AnyClick Server Endpoints

The AnyClick Server exposes a comprehensive set of RESTful API endpoints that enable programmatic control of browser automation, session management, page querying, and memory interaction. These endpoints are designed to be consumed by external orchestrators like n8n and will serve as the backend for the **planned** AnyClick Dashboard.

## Current Endpoint Families and Representative Endpoints

### 1. Session Endpoints (`/browser/session/*`)

*   **Purpose**: Manage the lifecycle of the single, global browser context and associated logical sessions.
*   **Typical Usage**: Starting new browser sessions, stopping the browser, and retrieving current page state.
*   **Who Uses It**: External orchestrators (n8n) to control browser lifecycle; **planned** Dashboard for interactive session management.
*   **Failure/Recovery Considerations**: Failures here typically relate to browser launch issues (e.g., Playwright misconfiguration, missing browser executable) or ungraceful session termination.

#### Representative Endpoints:
    *   `POST /browser/session/start`:
        *   **Description**: Starts a new browser session, navigates to an initial URL, and records initial page fingerprint. Returns a `sessionId`.
        *   **Request Body**: `{ url: string, taskId?: string, goal?: string }`
        *   **Response**: `{ ok: boolean, sessionId: string, mode: 'execution' | 'discovery', url: string, loginStatus: object, fingerprint: object }`
    *   `POST /browser/session/stop`:
        *   **Description**: Closes the currently active browser.
        *   **Request Body**: `{ sessionId?: string }`
        *   **Response**: `{ ok: boolean }`
    *   `GET /browser/session/state`:
        *   **Description**: Retrieves the current page state, including URL, title, and a basic page fingerprint.
        *   **Response**: `{ ok: boolean, state: object, fingerprint: object }`

### 2. Action Endpoints (`/browser/*`)

*   **Purpose**: Execute specific browser interactions on the active page, leveraging AnyClick's locator resolution and repair mechanisms.
*   **Typical Usage**: Performing clicks, typing text, selecting dropdown options, handling form submissions, general page navigation, and capturing screenshots.
*   **Who Uses It**: External orchestrators (n8n) as core automation steps; **planned** Dashboard to execute flow steps.
*   **Failure/Recovery Considerations**: Most common failures here are "element not found," "element not interactable," or timeouts. These are intended to trigger the **planned** Error Recovery Mode in the Dashboard or retry logic in n8n.

#### Representative Endpoints:
    *   `POST /browser/load-url`:
        *   **Description**: Navigates the browser to a specified URL.
        *   **Request Body**: `{ url: string, sessionId?: string }`
        *   **Response**: `{ ok: boolean, data: { url: string, title: string } }`
    *   `POST /browser/click`:
        *   **Description**: Performs a click action on an element identified by a target specification.
        *   **Request Body**: `{ sessionId?: string, intent?: string, target: object, site?: string }`
        *   **Response**: `{ ok: boolean, data: { matched: boolean, target?: object, method: string, pageChanged: boolean } }`
    *   `POST /browser/type`:
        *   **Description**: Types a specified value into an input element.
        *   **Request Body**: `{ sessionId?: string, intent?: string, target: object, value: string, site?: string }`
        *   **Response**: `{ ok: boolean, data: { matched: boolean, target?: object, method: string, pageChanged: boolean, value: string } }`
    *   `POST /browser/form-fill`:
        *   **Description**: Fills multiple form fields simultaneously based on provided field specifications and values.
        *   **Request Body**: `{ sessionId?: string, fields: Array<{label?: string, placeholder?: string, name?: string, text?: string, value: string}>, site?: string }`
        *   **Response**: `{ ok: boolean, results: Array<object> }`
    *   `POST /browser/wait-for-condition`:
        *   **Description**: Pauses execution until a specified page condition (e.g., URL change, element appears, network idle) is met.
        *   **Request Body**: `{ condition: 'url_change' | 'text_appears' | 'element_appears' | 'network_idle' | 'load', timeout?: number, text?: string, selector?: string }`
        *   **Response**: `{ ok: boolean, data: { urlChanged: boolean, currentUrl: string } }`
    *   `POST /browser/screenshot`:
        *   **Description**: Captures a screenshot of the current active page and returns it as binary PNG data.
        *   **Response**: Binary PNG image data.

### 3. Query Endpoints (`/browser/*` and `/api/*`)

*   **Purpose**: Retrieve various forms of data and state from the active browser page or server.
*   **Typical Usage**: Getting lists of interactable elements, performing full-page text queries, and structured data scraping.
*   **Who Uses It**: External orchestrators (n8n) for conditional logic, data extraction, and assertions; **planned** Dashboard to populate UI elements.
*   **Failure/Recovery Considerations**: Failures might occur if the page is unreachable or if selectors are invalid for data extraction. These are generally less critical than action failures but require robust error handling.

#### Representative Endpoints:
    *   `POST /browser/get-interactable-elements`:
        *   **Description**: Returns a list of interactable HTML elements detected on the current page with basic properties.
        *   **Response**: `{ ok: boolean, data: { url: string, title: string, elementCount: number, elements: Array<object> } }`
    *   `POST /browser/page-query`:
        *   **Description**: Performs a text query against the page content and returns page context (panels) and a subset of elements.
        *   **Request Body**: `{ query: string }`
        *   **Response**: `{ ok: boolean, data: { url: string, title: string, pageType: string, query: string, found: boolean, matchCount: number, matchedText: string, matchedTokens: Array<string>, panels: object, elements: Array<object> } }`
    *   `POST /browser/scrape`:
        *   **Description**: Extracts data from the page based on provided CSS selectors; supports structured field extraction or simple text collection.
        *   **Request Body**: `{ selector?: string, fields?: Array<{ name: string, selector: string }>, limit?: number }`
        *   **Response**: `{ ok: boolean, data: { itemCount: number, items: Array<object> | Array<string> } }`
    *   `POST /browser/paginated-extraction`:
        *   **Description**: Extracts items across multiple pages by clicking a 'next' button; combines scraping and navigation.
        *   **Request Body**: `{ itemSelector: string, fields: Array<{ name: string, selector: string }>, nextButton: { text?: string, selector?: string }, maxPages?: number }`
        *   **Response**: `{ ok: boolean, data: { totalItems: number, pagesScraped: number, items: Array<object> } }`
    *   `GET /api/sessions`:
        *   **Description**: Retrieves a list of active logical sessions managed by the server.
        *   **Response**: `{ ok: boolean, data: { count: number, sessions: Array<object> } }`

### 4. Login Endpoints (`/browser/*`)

*   **Purpose**: Manage and check the login status within the active browser session.
*   **Typical Usage**: Triggering a login prompt for human intervention, or programmatically checking if a user is logged in.
*   **Who Uses It**: External orchestrators (n8n) to detect login state; **planned** Dashboard for login status indicators and interactive login flows.
*   **Failure/Recovery Considerations**: Errors may occur if login detection heuristics fail or if the login prompt UI cannot be rendered.

#### Representative Endpoints:
    *   `POST /browser/request-login`:
        *   **Description**: Triggers a server-side UI prompt for human intervention to log in to a specified site.
        *   **Request Body**: `{ site: string, message?: string }`
        *   **Response**: `{ ok: boolean, message: string }`
    *   `GET /browser/check-login-status`:
        *   **Description**: Detects and reports the current login status on the active page based on heuristics.
        *   **Response**: `{ ok: boolean, data: { loggedIn: boolean, evidence: Array<string>, currentUrl: string } }`

### 5. Memory Endpoints (`/memory/*` and `/api/*`)

*   **Purpose**: Interact with the server's local memory store for recipes, run history, and page fingerprints, primarily for internal system learning and resilience.
*   **Typical Usage**: Looking up, saving, and managing automation recipes, run records, and page structure fingerprints.
*   **Who Uses It**: Primarily the Server's internal logic for locator fallback and self-healing. Limited programmatic access for reporting or specialized management. **Planned** Dashboard to manage saved flows (which encapsulate recipes).
*   **Failure/Recovery Considerations**: Failures typically relate to file system access or data schema issues. These are usually handled internally by the server.

#### Representative Endpoints:
    *   `POST /memory/lookup-recipe`:
        *   **Description**: Retrieves a stored automation recipe based on site, intent, and page type.
        *   **Request Body**: `{ site: string, intent: string, pageType?: string }`
        *   **Response**: `{ ok: boolean, data: { found: boolean, recipe?: object } }`
    *   `POST /memory/save-recipe`:
        *   **Description**: Stores a new or updates an existing automation recipe.
        *   **Request Body**: `{ recipe: object }`
        *   **Response**: `{ ok: boolean, data: { recipe: object } }`
    *   `GET /api/memory`:
        *   **Description**: Retrieves summary and lists of all stored recipes, fingerprints, and recent runs.
        *   **Response**: `{ ok: boolean, data: { recipes: object, fingerprints: object, recentRuns: object } }`

### 6. Dashboard UI & Health Endpoints

*   **Purpose**: Serve the basic HTML interface and provide system health checks.
*   **Typical Usage**: Accessing the rudimentary web UI, checking server status.
*   **Who Uses It**: Browser for the basic UI; Monitoring systems for health checks.

#### Representative Endpoints:
    *   `GET /`:
        *   **Description**: Serves the basic HTML placeholder for the Dashboard UI.
        *   **Response**: HTML content.
    *   `GET /health`:
        *   **Description**: Provides a simple health check, indicating server status, active sessions, and memory store counts.
        *   **Response**: `{ ok: boolean, sessions: number, uptime: number, memory: object }`

## API Roadmap / Planned Future Endpoints

To support the **planned** Dashboard UX and enhanced n8n orchestration, the following API endpoints are anticipated as future additions:

*   **`POST /browser/session/{sessionId}/screenshot`**: Captures and returns a screenshot of a specific active page, potentially with options for full page or viewport. (Enriching existing `/browser/screenshot` for multi-page context).
*   **`GET /browser/session/{sessionId}/pages`**: Returns a list of all open pages/windows within a session, including their IDs, URLs, and titles. (Supports Planned Multi-Page Handling).
*   **`POST /browser/session/{sessionId}/activePage`**: Sets the active page within a session based on `page_id` or `url_pattern`. (Supports Planned Multi-Page Handling).
*   **`GET /browser/session/{sessionId}/enrichedState`**: A comprehensive endpoint returning the full, structured page-state contract as described in `Query / State Model`, including grouped interactables, rich metadata, and overlay information. This will be the primary endpoint for the **planned** Dashboard's left pane.
*   **`GET /browser/session/{sessionId}/recoveryInfo`**: Returns detailed failure context, suggested alternatives, and other recovery-specific metadata when a flow is in error state. (Supports Planned Error Recovery Mode).
*   **`GET /browser/session/{sessionId}/dropdowns/{elementId}/options`**: Supports introspection of dynamic dropdowns, allowing the **planned** Dashboard to query available options, including those requiring scrolling. (Supports Planned Dynamic Dropdowns).

## General API Considerations

*   **Authentication & Authorization**: All sensitive endpoints should be protected (see Security / Hardening documentation).
*   **Error Handling**: Standard HTTP status codes and detailed JSON error responses are provided for easy programmatic consumption.
*   **Asynchronous Operations**: Many browser operations are inherently asynchronous. Endpoints are designed to block until completion or return errors, reflecting the synchronous nature of a single request-response cycle for most current actions. While the `sessionId` is passed, it primarily serves for internal logging and session tracking rather than managing fully asynchronous, long-running tasks via explicit task IDs.
*   **Idempotency**: The system does not currently guarantee full idempotency across all actions in complex scenarios involving dynamic page changes. Callers should be aware that repeated calls to certain action endpoints might lead to unintended side effects if the page state has changed. Design for idempotency is a future consideration for more robust automation workflows.
