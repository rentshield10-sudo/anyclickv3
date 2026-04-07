# Multi-Page / Popup / New Window Handling

Modern web applications frequently involve interactions across multiple pages, new tabs, popup windows, and dynamic content overlays. AnyClick is designed to robustly manage these scenarios, ensuring that automation flows can navigate complex multi-page user journeys, including common patterns like OAuth flows, payment gateways, or preview windows.

## Support Goals

AnyClick aims to provide comprehensive support for:

*   **Popup Windows**: Browser windows that open without full user interaction, often for alerts, login dialogs, or supplementary content.
*   **New Tabs**: New browser tabs launched, typically as a result of clicking a link with `target="_blank"` or programmatic opening.
*   **New Pages After Click**: Scenarios where clicking an element (e.g., a form submission button) navigates the current tab to an entirely new URL.
*   **OAuth/Payment/Preview Flows**: Multi-step processes that frequently involve redirects to third-party domains in new windows/tabs, followed by a return to the original application.

## Target Model: One Browser Context, Multiple Pages

AnyClick operates on a model where:

*   **One Browser Context**: A single, persistent browser session is managed by the server.
*   **Multiple Pages/Windows**: Within this context, multiple browser pages (tabs or windows) can be open simultaneously.
*   **One Active Page at a Time**: At any given moment, only one page is considered "active." All element querying, action execution, and screenshot capture will pertain to this active page. The system can switch the active page as needed.

## Dashboard Expectations for Multi-Page Flows

The Dashboard UX is designed to provide clear visibility and control over multi-page interactions:

*   **Show Page/Window List**: A dedicated area in the Dashboard (e.g., in the Top Section or a side panel) will display a list of all currently open pages/windows within the active session, showing their titles and URLs.
*   **Allow Switching Active Page**: Users will have the ability to explicitly select and switch the "active" page from the list. This action will update the Dashboard's view to reflect the newly active page.
*   **Left Pane Reflects Active Page Only**: The "Available Elements" (left pane) will always display elements exclusively from the *currently active page*. This ensures context relevance for flow building.
*   **Screenshot Reflects Active Page Only**: Any live screenshot display or captured screenshot will correspond directly to the content of the *active page*.
*   **Right Pane Includes Expectations**: The Flow Builder (right pane) will allow action cards to include expectations related to multi-page scenarios, such as `popup_expected` or `page_change_expected`. This informs the server about anticipated browser behavior.

## Preferred Post-Action Detection Order

After any user-initiated or automated action, the AnyClick server follows a specific order of detection to accurately understand the resulting browser state and handle multi-page interactions:

1.  **Download Started?**: First, check if a file download has been initiated. This takes precedence as downloads often occur in the background without changing the visible page.
2.  **New Page/Popup Opened?**: Next, detect if a new browser tab or popup window has opened. This is critical for flows that navigate to external sites or spawn secondary windows.
3.  **Modal/Dialog Appeared?**: Then, check for the appearance of any modal dialogs or system-level alert/confirm dialogs on the active page.
4.  **Same-Page URL/Title/Body Change?**: Following the above, determine if the active page has undergone a significant change (e.g., navigation to a new URL within the same tab, title change, or substantial DOM modification due to an SPA update).
5.  **Re-query Active Page**: After assessing all potential changes, the server re-queries the full state of the now-active page to refresh its understanding of available elements and overall page status.
6.  **Capture Screenshot**: Finally, a new screenshot of the active page is captured, reflecting the most up-to-date visual state.

This structured detection order ensures that AnyClick prioritizes critical browser events (like downloads or new windows) and accurately reflects the browser's state in the Dashboard, enabling robust automation even in complex multi-page environments.