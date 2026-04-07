# Action Model: Defining Browser Interactions

In the AnyClick Dashboard, a clear distinction is made between raw page elements and executable automation actions. The "Available Elements" (left pane) displays the raw, interactable elements detected on the current page. The "Flow Builder" (right pane) then composes these into structured "action cards" that represent the steps of an automation flow.

## Elements vs. Actions

*   **Left Pane (Available Elements)**: Contains detailed information about discovered web elements (buttons, inputs, links, etc.) directly extracted from the active page. These are the *targets* for actions.
*   **Right Pane (Flow Builder)**: Contains *action cards*. Each card represents a specific interaction with a target element or a control action within the browser. An action card is an abstraction that takes a target element (or implicitly acts on the page) and defines *what* to do with it.

## First-Class Action Vocabulary

AnyClick defines a core vocabulary of first-class actions that can be performed by the automation engine. These actions are designed to cover the most common and essential browser interactions.

*   **`click`**: Simulates a mouse click on a target element.
    *   **Description**: Useful for buttons, links, toggles, or any clickable UI component.
*   **`type`**: Enters text into a target input field.
    *   **Description**: Used for text inputs, textareas, or searchable comboboxes.
    *   **Parameters**: Requires a `value` (the text string to type).
*   **`select_native`**: Selects an option from a standard HTML `<select>` element.
    *   **Description**: Interacts with native browser dropdowns.
    *   **Parameters**: Requires a `value` (the option's value or visible text) or `index`.
*   **`select_dynamic`**: Handles selection for custom, dynamic, or lazy-loaded dropdowns/comboboxes.
    *   **Description**: Designed for more complex selection logic, including scrolling to reveal options or typing into search fields within dropdowns. See Dynamic Dropdowns documentation for more details.
    *   **Parameters**: Requires `option_value` or `option_text`, and may include `search_text`, `max_scroll_attempts`, `wait_per_scroll`.
*   **`toggle`**: Changes the state of a checkbox or radio button.
    *   **Description**: Sets a checkbox to checked/unchecked or selects a radio option.
    *   **Parameters**: Requires a `state` (e.g., `true` for checked, `false` for unchecked, or the specific `radio_value`).
*   **`upload`**: Attaches a file to a file input element.
    *   **Description**: Used to interact with `<input type="file">` elements.
    *   **Parameters**: Requires a `file_path` (absolute path to the file to upload).
*   **`download`**: Initiates and monitors a file download, typically after clicking a download trigger.
    *   **Description**: Handles scenarios where an action leads to a file download. The action might be a `click` on a download link, followed by this `download` expectation.
    *   **Parameters**: May include `expected_filename_pattern`, `timeout`.
*   **`wait`**: Pauses the automation for a specified duration or until a condition is met.
    *   **Description**: Essential for handling asynchronous page loads, animations, or backend processing.
    *   **Parameters**: Can include `duration` (in milliseconds), `selector_visible`, `url_changed`, `network_idle`.
*   **`extract`**: Captures data from a target element or the page.
    *   **Description**: Used for scraping text content, attribute values, or structured data.
    *   **Parameters**: Requires a `target` selector and `type` of extraction (e.g., `text`, `attribute`, `json`).
*   **`switch_page`**: Changes the active page context within a multi-page session.
    *   **Description**: Used to switch focus between open tabs, windows, or popups (e.g., an OAuth flow in a new window).
    *   **Parameters**: Requires `page_id` or `url_pattern` to identify the target page.

## Action Parameters and Expectations

Each action card in the Flow Builder can include specific parameters to define its behavior and optional expectations to validate its outcome.

*   **`target`**: A reference to the element on which the action should be performed. This is typically derived from the element selected in the left pane.
*   **`value`/`path`**: Required for actions like `type` (the text to enter), `select_native` (the option value), or `upload` (the file path).
*   **Optional Expectations**: Actions can include post-action assertions or conditions to check for, ensuring the automation proceeds as intended. These can include:
    *   **`modal_expected`**: Indicates that a modal dialog is expected to appear after the action.
    *   **`popup_expected`**: Indicates that a new browser window or tab is expected to open.
    *   **`download_expected`**: Indicates that a file download is expected to start.
    *   **`page_change_expected`**: Indicates that the current page's URL, title, or significant content is expected to change.

These rich action definitions allow for the construction of detailed and robust automation flows, with built-in mechanisms to detect and react to common browser behaviors.