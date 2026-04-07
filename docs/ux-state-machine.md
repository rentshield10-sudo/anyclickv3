# UX State Machine: Dashboard Modes

The AnyClick Dashboard is designed around a clear set of operational modes, forming a state machine that guides the user through the process of building, running, and recovering automation flows. Understanding these modes is crucial for both user experience and future implementation efforts, as each mode dictates the primary interactions and available functionalities.

## Primary Dashboard Modes

### 1. Explore Mode

*   **Purpose**: To allow users to interactively browse any URL in a live, managed browser session and discover interactable elements.
*   **Entry Points**: Entering a URL and clicking "Start Session" or opening an existing session without loading a flow.
*   **Key Interactions**:
    *   URL input and session control (Top Section).
    *   Live display of the active page.
    *   "Available Elements" (left pane) dynamically populates with elements from the active page.
    *   Users can click elements in the live browser or in the left pane to see their properties.
    *   Users can drag elements from the left pane to the right pane to initiate flow building.
*   **Transitions**: Can transition to Build Mode (by adding an action), Run Mode (by initiating a manual run), or Save Mode (by saving the current session/context).

### 2. Build Mode

*   **Purpose**: To construct, edit, and refine automation flows using the visual Flow Builder.
*   **Entry Points**: Dragging an element from the left pane to the right pane, loading a saved flow for editing, or explicitly creating a new flow.
*   **Key Interactions**:
    *   "Available Elements" (left pane) provides elements for action creation.
    *   "Flow Builder" (right pane) displays reorderable action cards.
    *   Users can add, edit, duplicate, reorder, and delete action cards.
    *   Action card parameters (e.g., target, value, expectations) are configurable.
    *   The live browser reflects manual interactions or test runs of individual steps.
*   **Transitions**: Can transition to Run Mode (to execute the built flow), Save/Publish Mode (to save the flow), or Explore Mode (to continue element discovery).

### 3. Run Mode

*   **Purpose**: To execute an automation flow, either a full flow or individual steps, and observe its progress.
*   **Entry Points**: Clicking "Run Now" from the Saved Flow Library, or initiating a run from the Flow Builder in Build Mode.
*   **Key Interactions**:
    *   The Flow Builder (right pane) highlights the currently executing step.
    *   Live browser updates show the automation in progress.
    *   Output logs and status updates are displayed.
    *   Progress indicators show overall flow completion.
    *   Monitoring for success or failure conditions.
*   **Transitions**: Can transition to Recovery Mode (on failure), Build Mode (if stopped and user wants to edit), or back to Explore Mode (on successful completion).

### 4. Recovery Mode

*   **Purpose**: To guide the user through resolving failed automation steps with human-in-the-loop assistance.
*   **Entry Points**: An action fails during Run Mode.
*   **Key Interactions**:
    *   Automation pauses.
    *   Failed step is highlighted in the Flow Builder (right pane).
    *   Recovery Popup appears, offering options: Reselect Target, Use AI Suggestion, Retry, Edit Step, Skip Step, Stop Flow.
    *   "Available Elements" (left pane) and screenshot are refreshed to reflect the current page state at the point of failure.
    *   User interacts with the popup and the left pane to re-target or modify the step.
*   **Transitions**: Can transition back to Run Mode (after a successful retry/reselection) or Build Mode (if the user decides to significantly edit the flow), or Stop Flow.

### 5. Save/Publish Mode

*   **Purpose**: To store, manage, export, or publish automation flows.
*   **Entry Points**: Clicking "Save Flow" from Build Mode or interacting with the Saved Flow Library (Bottom Section).
*   **Key Interactions**:
    *   Prompt for flow name and metadata.
    *   Options to save, update, duplicate, export, or delete flows.
    *   Interaction with the Saved Flow Library (Bottom Section) to manage the collection of flows.
*   **Transitions**: Typically transitions back to Build Mode or Explore Mode.

This clear distinction between modes helps users understand the current context of their interaction and provides a structured framework for the Dashboard's implementation, ensuring a coherent and effective user journey.