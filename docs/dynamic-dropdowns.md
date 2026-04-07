# Dynamic Dropdowns / Lazy-Loaded Selectors

Handling dropdowns effectively is crucial for robust browser automation, and AnyClick distinguishes between various types to apply appropriate interaction logic. This section documents the different dropdown behaviors, the recommended automation logic, and how these are represented within the Dashboard UX.

## Types of Dropdown Behavior

AnyClick categorizes dropdowns to ensure the correct interaction strategy is applied:

*   **Native HTML Select (`<select>`)**: These are standard browser-rendered dropdowns. Their options are typically all present in the DOM, making selection straightforward via index or value.
*   **Custom Static Dropdown**: A UI component that mimics a dropdown using non-`<select>` HTML elements (e.g., `div`, `ul`, `li`). All options are usually present in the DOM once the dropdown is opened, but the interaction might involve clicking a trigger element to reveal the options, then clicking an option.
*   **Custom Dynamic/Lazy-Loaded Dropdown**: Similar to custom static dropdowns, but options are loaded dynamically as the user scrolls or interacts. Not all options are initially present in the DOM; they are fetched from the server or rendered on demand.
*   **Searchable Dropdown/Combobox**: A custom dropdown that includes a text input field for filtering or searching options. Options may be dynamic/lazy-loaded, and selection often involves typing into the search box before selecting from filtered results.

## Recommended Automation Logic for Dynamic Dropdowns

AnyClick employs a sophisticated logic to interact with dynamic dropdowns, ensuring that all options can be accessed and selected reliably:

1.  **Open Selector**: First, the automation engine identifies and performs a `click` action on the dropdown's trigger element to make its options visible.
2.  **Detect Options Container**: It then identifies the HTML container element that holds the list of options (e.g., a `div` or `ul`).
3.  **Inspect Visible Options**: All currently visible options within the container are inspected and extracted.
4.  **Check Scrollability**: The system analyzes the options container to determine if it has scrollable content (e.g., `overflow: auto`, `overflow: scroll`).
5.  **Scroll Probe (if scrollable)**: If the container is scrollable, the system performs a small internal scroll action (e.g., a programmatic scroll) within the container.
6.  **Inspect for Additional Options**: After the scroll, the system re-inspects the options container to check if new options have appeared in the DOM, indicating lazy loading.
7.  **Classification**: Based on the scroll probe results, the dropdown is classified as `scrollable`, `lazy-loaded`, or `static`.
8.  **Scroll-Assisted Option Search**: When selecting an option from a classified `scrollable` or `lazy-loaded` dropdown, the system iteratively scrolls down, inspecting newly revealed options until the desired option is found, or a maximum scroll attempt limit is reached.
9.  **Search Input Handling (if searchable)**: If the dropdown is also a searchable combobox, the system will `type` the `search_text` into its internal input field, wait for options to filter, and then select from the displayed results.

### User Experience (UX) Considerations

*   Users should generally **not** need to manually construct complex sequences of `click` + `scroll` + `click` actions to select an option from a dynamic dropdown. The `select_dynamic` action (see Action Model) is designed to encapsulate this complex logic.

## Dashboard Representation

The Dashboard provides clear visual cues and dedicated action types to manage dynamic dropdowns.

### Left Pane: Available Elements

When a dynamic dropdown or combobox is detected on the active page:

*   **Show the Dropdown Control**: The main dropdown trigger element is listed.
*   **Indicate Type**: A clear label (e.g., "Dynamic Dropdown", "Searchable Combobox") indicates its special behavior.
*   **Visible Options (if opened)**: If the dropdown is currently open, the currently visible options are shown nested underneath the main control. This allows users to see immediate choices.
*   **"More Options on Scroll" Indicator**: A visual hint (e.g., an icon or text) suggests that additional options may appear if the container is scrolled, especially for lazy-loaded scenarios.

### Right Pane: Flow Builder

When a user selects a dynamic dropdown element for an action:

*   **Represent as One Action Card**: The interaction is abstracted into a single `select_dynamic` action card.
*   **Configurable Parameters**: The action card provides parameters specific to dynamic dropdowns:
    *   **Desired Option**: The text or value of the option to select.
    *   **Match Mode**: How the option should be matched (e.g., `exact`, `contains`, `starts_with`).
    *   **Search Text**: If it's a searchable combobox, the text to type into its internal search input.
    *   **Max Scroll Attempts**: A configurable limit for how many times the system should attempt to scroll to reveal more options.
    *   **Wait per Scroll**: A delay (in milliseconds) after each scroll to allow for lazy-loaded options to render.

This dedicated handling ensures that even the most complex dropdown interactions can be built and executed reliably within AnyClick, with a clear and intuitive user experience.