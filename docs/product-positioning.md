# Product Positioning

AnyClick is engineered as a multi-layered browser automation platform, providing a flexible and powerful solution for tasks ranging from guided interactive flow building to fully autonomous, scheduled operations. The system is conceptually divided into three main layers, each with distinct responsibilities and interactions. It's important to distinguish between **currently implemented capabilities** and **planned product features**.

## A. Server: The Core Execution Engine (Currently Implemented)

### Technology Stack
*   **Node.js + TypeScript Backend**: Provides a robust, scalable, and type-safe foundation for the server-side logic.
*   **Playwright-backed Browser Control**: Utilizes Playwright, a modern automation library, to ensure high fidelity, reliable, and fast interaction with web browsers (Chromium, Firefox, WebKit).

### Key Functionality and Endpoints
*   **Session Management**: Provides API endpoints for initiating, managing, and terminating a single global browser session.
*   **Action Execution**: Offers a comprehensive set of endpoints to perform various browser actions, including clicks, typing into input fields, selecting options from native dropdowns, hovering, form filling, scrolling, waiting for conditions, extracting text, and capturing screenshots.
*   **Query and State Retrieval**: Exposes endpoints to query the basic current state of the active browser page, extract interactable elements, and retrieve contextual page information.
*   **Login Checks**: Dedicated functionality to verify user login status within the active session.
*   **Scraping Capabilities**: Supports the extraction of structured data from web pages based on defined selectors or patterns, including paginated content.
*   **Memory Integration**: Interacts with the local memory store to retrieve and store automation recipes, historical run data, and page fingerprints, enhancing consistency and reliability.

### Locator Fallback and Repair Behavior
*   The server incorporates a sophisticated locator strategy that prioritizes reliability:
    1.  **Recipe Replay**: Attempts to reuse previously successful selectors for instant, deterministic re-execution.
    2.  **Deterministic Matching**: Uses robust, attribute-based (role, aria-label, text content) locators for stable element identification.
    3.  **Semantic AI**: Engages AI models (e.g., Gemini Flash) with small page snapshots to semantically identify elements when deterministic methods are insufficient.
    4.  **Repair AI**: As a last resort, utilizes powerful AI models (e.g., Gemini Pro) with full DOM and screenshot analysis to repair broken locators and identify elements in significantly changed page structures. Successful repairs are saved as new recipes.

### Memory-Backed Operations
*   **Recipes**: Stored sequences of actions for specific tasks, improving speed and reliability.
*   **Runs**: Records of automation flow executions, including outcomes and any encountered issues.
*   **Fingerprints**: Page structure hashes or partial DOM snapshots used for detecting page changes and aiding locator repair.

## B. Dashboard: The Human Interface for Control and Insight (Planned Product Feature)

### Purpose (Planned)
*   The AnyClick Dashboard is a **planned** human-facing user interface designed to provide comprehensive control and visibility over browser automation processes. It is intended to serve as the primary environment for:
    *   **Observation**: Live monitoring of browser interactions and page state.
    *   **Flow Building**: Visually constructing and editing automation sequences.
    *   **Recovery**: Interactively resolving errors and adapting flows to unexpected page changes.
    *   **Testing**: Manually executing and debugging individual steps or entire flows.

### Key Capabilities (Planned)
*   **Live Exploration**: Allows users to open any URL in a managed browser, view available elements, and interact with the web page in real-time.
*   **Visual Flow Builder**: A drag-and-drop or click-to-add interface for assembling action cards into a coherent automation flow.
*   **Element Discovery**: Presents a grouped list of interactable elements from the active page, along with human-readable metadata.
*   **Flow Management**: Enables saving, loading, editing, duplicating, and exporting automation flows.
*   **Interactive Recovery**: When an automation step fails, the dashboard is planned to pause the flow, present the current page state, highlight the error, and offer guided options for reselection, editing, or AI-assisted correction.

## C. n8n: The External Orchestrator (Current Integration Point)

### Role and Integration
*   n8n functions as an optional, external orchestration layer that integrates with the AnyClick server via its API endpoints, enabling advanced automation workflows.

### Orchestration Responsibilities
*   **Scheduling**: Define and manage timed execution of AnyClick flows by calling server endpoints (e.g., daily reports, hourly checks).
*   **Triggers/Webhooks**: Initiate automation flows by calling AnyClick server endpoints based on external events, system changes, or incoming webhooks from other applications.
*   **Loops and Repeat Runs**: Implement complex iteration logic in n8n to perform actions multiple times or process lists of data by repeatedly invoking AnyClick server actions.
*   **Integrations**: Leverage n8n's extensive library of integrations to connect AnyClick flows with databases, CRM systems, communication platforms, and other APIs, enabling end-to-end automation.
*   **Future Optional AI Retry/Recovery Coordinator**: n8n can host custom logic, potentially incorporating AI, to analyze server-side failure contexts from AnyClick. This would allow for intelligent decision-making, such as: 
    *   **Automated Retries**: Implementing sophisticated retry strategies based on error types.
    *   **AI-Driven Rerouting**: Using AI to suggest alternative paths or data inputs.
    *   **Human Recovery Escalation**: Pausing the n8n workflow and triggering a human-in-the-loop recovery mode in the **planned** AnyClick Dashboard for critical failures.

## Layer Interaction Summary

*   **Planned Dashboard**: Intended for **observing** browser behavior, **building** and **testing** automation flows, and providing a human touchpoint for **recovery**.
*   **Server Endpoints**: The functional core for **executing** browser actions and **querying** real-time page state. It is currently consumed by n8n workflows and serves as the backend for the **future Dashboard**.
*   **n8n**: Primarily handles the **orchestration** and unattended **automation** of flows, including scheduling, external triggers, complex logic, and deep integrations, operating outside the interactive environment of the **planned** dashboard.
