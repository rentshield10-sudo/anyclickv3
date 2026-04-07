# Dashboard UX: Live Exploration and Flow Building (Planned)

The AnyClick Dashboard provides an intuitive human-facing interface for interacting with the browser automation engine. It is designed to facilitate live page exploration, visual flow building, manual testing, and human-in-the-loop error recovery. The layout is structured into three main sections: Top, Middle, and Bottom, each serving distinct purposes in the automation workflow. **It is important to note that this document describes the planned user experience for a future Dashboard implementation, not the currently existing basic HTML page.**

## Top Section: Session Control and Page Display (Planned)

This section is dedicated to initiating and managing browser sessions, and displaying critical information about the active page.

*   **URL Input**: A prominent input field where users can enter any URL to begin live exploration or initiate a new automation flow.
*   **Start/Open Session Button**: Triggers the launch of a new browser instance managed by the AnyClick server, opening the specified URL.
*   **Optional Goal Field**: An input field where users can define a high-level objective for the automation (e.g., "Log in and view dashboard"). This is planned for contextual AI assistance.
*   **Current Session / Current Active Page Display**: Shows the ID of the active browser session and the URL/title of the currently focused page or window. This helps users keep track of multi-page interactions.
*   **Login-Required Indicator**: A visual cue that indicates if the current page requires a login, based on server-side analysis.

## Middle Section: Interactive Element Discovery and Flow Construction (Planned)

This is the core workspace for building and refining automation flows, divided into two panes: the Left Pane for available elements and the Right Pane for the flow builder.

### Left Pane: Available Elements (from Active Page) (Planned)

This pane is **planned** to dynamically display a comprehensive list of interactable elements detected on the *currently active page/window*. Elements will be grouped by type for easy navigation and understanding.

*   **Grouped by Type (Planned)**:
    *   **Buttons**: All clickable button elements.
    *   **Links**: All hyperlink elements.
    *   **Text Inputs**: Single-line text input fields (`<input type="text">`, `<input type="email">`, etc.).
    *   **Textareas**: Multi-line text input fields (`<textarea>`).
    *   **Checkboxes/Radios**: Toggleable input elements (`<input type="checkbox">`, `<input type="radio">`).
    *   **Native Selects**: Standard HTML `<select>` dropdowns.
    *   **Dynamic Dropdowns / Comboboxes**: Custom-built or lazy-loaded dropdowns and searchable comboboxes that require special handling (see Dynamic Dropdowns documentation).
    *   **File Upload Inputs**: Input fields designed for file selection (`<input type="file">`).
    *   **Possible Download Triggers**: Elements that, when clicked, are likely to initiate a file download.
*   **Human-Readable Data Display (Planned)**: For each element, the dashboard is **planned** to show relevant, easily understandable information:
    *   **Label**: The visible label associated with the control (e.g., `<label for="username">Username</label>`).
    *   **Visible Text**: Any text content directly associated with the element.
    *   **Placeholder**: Placeholder text for input fields.
    *   **Control Type**: A clear indication of the element's functional type (e.g., "Button", "Text Input", "Checkbox").
    *   **Current Value or State**: The current value of an input field, the checked state of a checkbox, or the selected option of a dropdown, where relevant.
    *   **Optional Selector/Locator Preview**: A compact display of the primary locator strategy that would be used to target this element, useful for advanced debugging.
*   **Dynamic Reflection (Planned)**: The contents of the left pane will automatically update to reflect the elements present on the currently active page. When the user navigates or switches pages, this list will refresh.

### Right Pane: Flow Builder (Planned)

This pane is where users will construct their automation flows by arranging individual action steps. It is a visual representation of the planned sequence of browser interactions.

*   **Reorderable Planned Steps (Planned)**: Actions will be displayed as cards that can be reordered by dragging and dropping them within the list, allowing for easy adjustment of flow logic.
*   **Drag-and-Drop from Left Pane (Planned)**: Users will be able to drag elements from the "Available Elements" left pane directly into the flow builder to create corresponding action cards.
*   **Click-to-Add Support (Planned)**: In addition to drag-and-drop, clicking an element in the left pane will also add a default action (e.g., a click action for a button) to the flow builder, making quick additions efficient.
*   **Stores Action Cards, Not Raw Elements**: Crucially, the right pane will hold *action cards* (e.g., "Click 'Login Button'", "Type 'hello@example.com' into 'Email Field'"), which encapsulate the target element and the intended interaction, rather than storing raw references to page elements. This abstraction is planned to ensure flows are robust and reusable.

## Bottom Section: Saved Flow Library (Planned)

This section will provide access to all previously created and saved automation flows, allowing for management, reuse, and quick execution.

*   **List Saved Flows (Planned)**: Displays a list of all flows that have been saved within the dashboard.
*   **Flow Metadata Display (Planned)**: For each saved flow, the following metadata will be shown:
    *   **Name**: A user-defined name for the automation flow.
    *   **Start URL**: The URL at which the flow is intended to begin.
    *   **Step Count**: The total number of actions/steps within the flow.
    *   **Created/Updated**: Timestamps indicating when the flow was initially created and last modified.
    *   **Trigger Mode**: Indicates if the flow is designed for manual execution, or if it has external triggers (e.g., via n8n integration).
    *   **Last Run Status**: The outcome of the most recent execution (e.g., "Success", "Failed", "Interrupted").
*   **Actions per Flow (Planned)**: Users will be able to perform various management actions on each saved flow:
    *   **Open**: Load the flow into the Right Pane for editing.
    *   **Edit**: Directly modify the flow (same as Open).
    *   **Duplicate**: Create a copy of the flow for modification without altering the original.
    *   **Run Now**: Immediately execute the flow in the browser.
    *   **Export**: Download the flow definition (e.g., as JSON) for backup or sharing.
    *   **Delete**: Permanently remove the flow from the library.

## Important Design Decisions (Planned)

*   **Saved Flows Belong in Dashboard**: The management and storage of automation flow definitions are planned to be handled directly within the Dashboard, providing a central repository for user-created content.
*   **Schedule/Trigger Engine Belongs in n8n**: While flows are planned to be managed in the dashboard, the scheduling, triggering, and unattended execution mechanisms (e.g., recurring runs, webhooks) are delegated to the external n8n orchestrator. This separation of concerns ensures a powerful and flexible automation ecosystem.
