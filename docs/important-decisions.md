# Important Decisions to State Explicitly

This document consolidates key architectural and product decisions made for the AnyClick platform. These decisions are foundational to its design, user experience, and future development, ensuring consistency and clarity across all layers. It distinguishes between **current implementation decisions** and **planned product directions**.

## Core Principles and Architectural Split

*   **Planned: Available Elements Belong in the Server Dashboard**: The raw, interactable elements discovered on a live web page are **planned** to be primarily presented and managed within the **future** AnyClick Dashboard. This will provide the human operator with direct visual context and selection capabilities.
*   **Planned: Right Pane Contains Actions, Not Raw Elements**: The "Flow Builder" (right pane) in the **planned** Dashboard is designed to store and display *action cards*. These action cards represent abstracted browser interactions (e.g., `click`, `type`) and their associated parameters, rather than direct references to raw HTML elements. This is **planned** to promote flow readability, reusability, and resilience.
*   **Planned: Saved Flows Belong in the Dashboard**: The management, storage, editing, and local execution of automation flow definitions are **planned** to be centralized within the **future** AnyClick Dashboard's "Saved Flow Library." This will make the Dashboard the single source of truth for user-created automation sequences.
*   **Current: Scheduling/Loops/Unattended Triggers Belong in n8n**: All capabilities related to scheduling, complex looping, and initiating unattended automation runs (e.g., via webhooks or external triggers) are explicitly delegated to the external n8n orchestrator. This clear separation leverages n8n's strengths in workflow automation and integration.

## Interaction and Element Handling

*   **Planned: Dynamic Dropdowns Need Special Handling**: It is a critical design decision that dynamic, lazy-loaded, or searchable dropdowns/comboboxes **will require** specialized automation logic (e.g., scroll probing, search input interaction). Users should not have to manually chain basic `click` and `scroll` actions for these. The system **is planned to provide** a dedicated `select_dynamic` action.
*   **Planned: Popup/New Window Flows Require Active-Page Awareness**: Automation flows involving new browser tabs, popup windows, or external redirects (e.g., OAuth) **are planned to be managed** with explicit awareness of the "active page" context. The system **will provide** mechanisms to list open pages and switch the active page to ensure actions are performed in the correct context.

## Error Handling and Recovery

*   **Planned: Error Recovery Should Be Human-in-the-Loop First**: For robust automation, AnyClick **plans** a human-in-the-loop approach for error recovery. When an automation step fails, the system **will pause** the flow, present the failure context to the user in the **planned** Dashboard, and offer guided options for resolution.
*   **Planned: AI Assists Recovery But Should Not Be the Only Decision-Maker**: While AI **can provide** valuable suggestions for alternative locators, infer page states, and assist in recovery decisions, it is **planned to be** strictly an *assistant*. AI should not autonomously or silently modify automation flows or replace failed elements without explicit human review and confirmation.

## State Management and System Refresh

*   **Current: Query Logic is a Foundation, Not the Final Builder-State Engine**: The existing server-side query capabilities (e.g., `/browser/page-query`, `/browser/get-interactable-elements`) are recognized as a foundational layer. However, the **planned** Dashboard UX requires a significantly richer and more structured page-state contract (`Query / State Model`) to enable comprehensive live exploration and flow building.
*   **Planned: The System Should Re-query and Refresh After Every Meaningful Action**: To maintain an accurate and up-to-date view of the browser's state, the AnyClick server **is planned to** automatically re-query the active page and refresh all relevant **planned** Dashboard UI components (left pane, screenshot) after every significant automation action or page navigation.