# Query / State Model: Understanding Page Dynamics

The Query / State Model is fundamental to how AnyClick understands and interacts with web pages. It encompasses the capabilities to extract, process, and represent the current state of a browser session and its active page. This document distinguishes between **currently implemented capabilities** of the server and the **richer, planned page-state contract** envisioned for the future Dashboard.

## Current Capabilities (Implemented Foundation)

At a high level, the existing server-side query layer offers the following capabilities via its API:

*   **Basic Page State Extraction**: Endpoints can retrieve general information about the current active page, such as its URL and title.
*   **Interactable Element Listing**: The `/browser/get-interactable-elements` endpoint can identify and list various interactable elements present on the page, including their basic attributes like text, label, placeholder, role, and selector.
*   **Page Text/Context Querying**: The `/browser/page-query` endpoint allows for general text searching within the visible page content and provides a structured breakdown into main, right, and (if present) left panels. It also returns a subset of elements.
*   **Locator Support for Actions**: The server uses extracted page state and element information internally to resolve locators for performing actions.
*   **Scraping**: The `/browser/scrape` and `/browser/paginated-extraction` endpoints can extract structured data or simple text content from the page based on CSS selectors.

## Recommended Richer Future Page-State Contract (Planned for Dashboard)

For the AnyClick Dashboard to deliver a comprehensive live exploration, flow building, and robust recovery experience, a more detailed and standardized page-state contract is required. This **planned** model will structure the data returned by the server, enabling the Dashboard to render a rich, interactive view of the browser's current state.

### Planned Page/Session Metadata

High-level information about the browser session and its open pages:

*   **`session_id`**: Unique identifier for the current browser session.
*   **`active_page_id`**: Identifier for the currently focused or active page/window within the session.
*   **`current_url`**: The full URL of the active page.
*   **`title`**: The title of the active page as displayed in the browser tab.
*   **`login_status`**: An indicator of whether the user is logged in on the current page (e.g., `true`, `false`, `unknown`).
*   **`open_pages_list`**: A list of all currently open pages/windows within the session, each with its own `page_id`, `url`, and `title`.

### Planned Screenshot Metadata

Information related to the visual representation of the active page:

*   **`screenshot_path` or `screenshot_url`**: The file path or URL to a captured screenshot of the active page.
*   **`timestamp`**: The time when the screenshot was captured.
*   **`active_page_association`**: A reference linking the screenshot to its corresponding `active_page_id`.

### Planned Grouped Interactables

A structured list of all interactable elements on the active page, categorized by type, enabling the Left Pane of the Dashboard to present a clear overview:

*   **`buttons`**: List of all detected button elements.
*   **`links`**: List of all detected hyperlink elements.
*   **`text_inputs`**: List of all single-line text input fields.
*   **`textareas`**: List of all multi-line text input fields.
*   **`checkboxes_radios`**: List of all checkbox and radio button elements.
*   **`selects`**: List of all native HTML `<select>` dropdowns.
*   **`comboboxes`**: List of all custom or dynamic dropdowns/comboboxes requiring special handling.
*   **`upload_inputs`**: List of all file upload input elements.
*   **`probable_download_triggers`**: List of elements identified as likely to initiate a file download upon interaction.

### Planned Per-Element Metadata

For each interactable element listed above, the following detailed metadata will be provided:

*   **`internal_id`**: A unique identifier assigned by the AnyClick server for internal tracking.
*   **`label`**: The human-readable label associated with the element (e.g., from `<label>` tag, `aria-label`, or inferred).
*   **`visible_text`**: Any directly visible text content of the element.
*   **`placeholder`**: The placeholder text for input fields.
*   **`current_value`**: The current input value for text fields or selected value for dropdowns.
*   **`checked_state`**: For checkboxes/radios, indicates if it's checked (`true`) or unchecked (`false`).
*   **`enabled_disabled`**: Indicates if the element is interactable (`true`) or disabled (`false`).
*   **`required`**: For input fields, indicates if it's a required field.
*   **`role`**: The ARIA role of the element (e.g., `button`, `textbox`, `link`).
*   **`tag`**: The HTML tag name (e.g., `BUTTON`, `A`, `INPUT`).
*   **`selector_or_locator_reference`**: The primary CSS selector or internal locator used to identify the element.
*   **`visible_interactable_state`**: A boolean indicating if the element is currently visible and interactable in the viewport.
*   **`owning_page_window`**: The `page_id` of the page/window to which this element belongs.
*   **`group_section_form_context`**: Information about the element's parent form, section, or logical grouping, aiding in semantic understanding.
*   **`dynamic_dropdown_metadata`**: Specific details for dynamic dropdowns, if applicable (e.g., whether it's scrollable, search input selector).

### Planned Overlay / State Metadata

Indicators for transient or dynamic page states that impact interaction:

*   **`modal_detected`**: `true` if a modal dialog is currently active.
*   **`dialog_detected`**: `true` if a non-modal dialog is currently active.
*   **`popup_detected`**: `true` if a new browser popup window has opened.
*   **`download_detected`**: `true` if a file download is currently in progress or has recently started.
*   **`same_page_change_indicators`**: Flags or hashes indicating significant DOM changes without a full page navigation (e.g., SPA updates).

### Planned Recovery Metadata (For Future Error Recovery Mode)

Additional data specifically designed to assist with human-in-the-loop error recovery:

*   **`failed_step_info`**: Details about the action that failed, including its original target and parameters.
*   **`likely_alternatives`**: A list of elements that the AI or system identifies as potential substitutes for the failed target.
*   **`same_type_candidates`**: Other elements on the page of the same type as the failed target, which might be relevant for reselection.
*   **`locator_logs`**: Detailed logs from the locator resolution process, indicating why the original locator failed.
*   **`current_page_window_hints`**: Contextual information about the active page and open windows, helping the user understand the failure environment.
