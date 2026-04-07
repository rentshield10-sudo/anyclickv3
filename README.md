# AnyClick: Human-in-the-Loop Browser Automation

AnyClick is a powerful, Playwright-backed browser automation engine designed for building, executing, and recovering complex browser flows. It combines a robust Node.js server with a **planned** human-facing dashboard and optional n8n orchestration, enabling a flexible approach to automation—from guided flow building to automated, resilient operations.

## Architecture

AnyClick is conceptually structured into three distinct layers, each serving a specialized purpose. While the Server layer is currently implemented and functional, the Dashboard layer represents a **planned product direction** and the n8n layer describes external orchestration capabilities.

### A. Server (Core Execution Engine)
*   **Technology**: Node.js + TypeScript backend.
*   **Browser Control**: Powered by Playwright for high-performance, reliable browser interactions.
*   **Endpoints**: Provides a comprehensive API for:
    *   **Session Management**: Starting, stopping, and managing browser sessions.
    *   **Actions**: Executing browser actions (clicks, types, selects, form fills, scrolls, waits, extractions, screenshots).
    *   **Query/State**: Extracting basic page state, interactable element listings, and contextual information.
    *   **Login Checks**: Verifying authentication status.
    *   **Scraping**: Extracting structured data from web pages, including paginated content.
    *   **Memory**: Storing and retrieving automation "recipes," run histories, and page fingerprints.
*   **Locator Fallback & Repair**: Implements advanced logic for robust element identification, including deterministic locators, semantic AI, and repair mechanisms to handle dynamic page changes.
*   **Memory-Backed Operations**: Utilizes stored recipes, run data, and page fingerprints to enhance reliability and enable self-healing capabilities.

### B. Dashboard (Planned: Observe, Build, Recover, Test)
*   **Purpose**: A **planned** human-facing user interface designed for live page exploration, intuitive flow building, manual testing, and interactive error recovery. **This layer is currently represented by a basic HTML page serving as a placeholder.**
*   **Planned Capabilities**:
    *   **Live Exploration**: Allows users to open any URL in a managed browser, view available elements, and interact with the page in real-time.
    *   **Flow Building**: Provides a visual interface to construct automation flows by dragging and dropping elements or adding actions from the active page.
    *   **Human-in-the-Loop Recovery**: Offers a structured mechanism for users to intervene and correct failed automation steps, with options to reselect targets, edit steps, or utilize AI suggestions.
    *   **Saved Flow Library**: Manages a collection of pre-built automation flows for easy access, editing, and execution.

### C. n8n (External Orchestration and Automation)
*   **Role**: An optional external orchestration layer that integrates with the AnyClick Server's API for advanced automation, scheduling, and integration with other systems.
*   **Automation Capabilities**:
    *   **Scheduling**: Running flows at predefined intervals.
    *   **Triggers/Webhooks**: Initiating flows based on external events.
    *   **Loops & Repeat Runs**: Automating repetitive tasks by calling AnyClick Server endpoints.
    *   **Integrations**: Connecting AnyClick flows with a wide range of third-party services via n8n's extensive integration library.
    *   **Planned Optional AI Retry/Recovery Coordinator**: Can be configured to leverage AI within n8n workflows for more intelligent retry strategies or to trigger human recovery workflows in the **planned** AnyClick Dashboard when automated attempts fail.

## How the Layers Work Together

*   **Planned Dashboard**: Intended for **observing** browser state, **building** and **testing** automation flows, and providing a human touchpoint for **recovery**.
*   **Server Endpoints**: The functional core for **executing** browser actions and **querying** real-time page state, accessible programmatically by n8n or **future Dashboard implementations**.
*   **n8n**: Primarily handles the **orchestration** and unattended **automation** of flows, including scheduling, external triggers, complex logic, and deep integrations, operating outside the interactive environment of the **planned** dashboard.

## Getting Started

1.  Set up your `.env` (as per the existing instructions).
2.  Compile and run the worker (as per the existing instructions).
3.  Import `n8n/workflow.json` into your N8N instance (if using n8n orchestration).

## Data Storage

All recipes, fingerprints, and audit logs are saved locally in the `browser-worker/data/` directory. You own your memory.

## Current Strengths & Limitations

### Current Strengths
*   **Robust Browser Control**: Playwright-backed for reliable interactions via direct API calls.
*   **Memory-First Approach**: Utilizes stored knowledge (recipes, fingerprints) for faster and more reliable element location and basic self-healing.
*   **Flexible Integration**: Designed to be integrated with external orchestrators like n8n for powerful automation workflows.
*   **AI-Assisted Locators**: Incorporates AI for semantic and repair-based locator resolution when deterministic methods fail.

### Current Limitations
*   **Dashboard Implementation**: The comprehensive Dashboard UX (for live exploration, flow building, and error recovery) is **currently a placeholder** and represents a **planned feature, not a fully implemented one.**
*   **Limited Session Isolation**: Currently, browser and page execution are effectively global and shared across all incoming requests. Session isolation is limited to logical tracking within the server, not isolated browser contexts per request.
*   **Foundational Query/State Model**: The existing query/state layer provides basic page data extraction and interactable element listing. It is a **foundation for a much richer, planned page-state contract** required by the future Dashboard.
*   **Recovery UX**: While the server has internal locator fallback and repair, the structured, interactive human-in-the-loop recovery flow with a dedicated Dashboard UI is a **planned feature**.
*   **Single Page Focus**: The current server primarily operates on a single active page within the browser. Advanced multi-page/popup handling and active page switching are part of the roadmap.

## Roadmap Direction

The project is evolving towards a robust human-in-the-loop platform where the **planned Dashboard** will play a central role in simplifying flow creation, visual debugging, and guided error resolution. n8n will continue to serve as the powerful orchestration layer for fully automated and integrated workflows. Future enhancements will focus on enriching the page state model, refining dynamic element handling, implementing a sophisticated error recovery system that intelligently combines automated repair with human guidance, and strengthening session isolation.