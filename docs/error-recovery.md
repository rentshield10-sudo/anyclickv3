# Error Recovery Mode: Structured Human-in-the-Loop Healing

Browser automation flows can be fragile, often failing due to minor page changes, dynamic content, or unexpected UI variations. AnyClick addresses this challenge with a structured "Error Recovery Mode," designed to pause automation, provide immediate context to the user, and facilitate human-in-the-loop correction. This ensures that even when automated locator strategies fail, flows can be quickly repaired and resumed without starting from scratch.

## Preferred Recovery Flow

The intended error recovery sequence within the Dashboard is as follows:

1.  **Action/Step Fails**: An automation action (e.g., `click`, `type`) initiated by the server fails to find its target element or complete successfully.
2.  **Pause the Flow**: The entire automation flow is paused immediately at the point of failure.
3.  **Re-query Current Page**: The server performs a full re-query of the current active page to get its absolute latest state.
4.  **Refresh Available Elements (Left Pane)**: The "Available Elements" (left pane) in the Dashboard is updated to reflect all currently detectable interactable elements on the page, ensuring the user sees the most current options.
5.  **Refresh Screenshot**: A new screenshot of the active page is captured and displayed in the Dashboard, providing a live visual context of the failure point.
6.  **Keep Existing Flow Visible (Right Pane)**: The "Flow Builder" (right pane) remains visible, showing the entire automation sequence, including steps already completed and those yet to run.
7.  **Highlight Failed Step**: The specific action card that failed in the Flow Builder is visually highlighted, drawing the user's attention to the problematic step.
8.  **Show Recovery Popup**: A dedicated "Recovery Popup" is displayed, prompting the user with options to resolve the failure.

## Recovery Popup Actions

The Recovery Popup offers a set of actionable choices to the user, allowing them to guide the recovery process:

*   **Reselect Target**: Allows the user to manually select a new target element from the refreshed "Available Elements" (left pane) on the current page. This is the primary human-in-the-loop correction method.
*   **Use AI Suggestion**: If available, this option presents AI-generated suggestions for alternative target elements that are highly likely to be the intended replacement for the failed element. (See AI's Role below).
*   **Retry Current Step**: Attempts to re-execute the *original* failed step without any changes, useful if the failure was transient (e.g., a temporary network glitch or element not yet rendered).
*   **Edit Step**: Allows the user to open the failed action card for full editing, changing its type, parameters, or expectations.
*   **Skip Step**: Bypasses the current failed step and proceeds to the next action in the flow. This is useful for non-critical steps or when the user wants to manually perform the action in the browser.
*   **Stop Flow**: Terminates the automation flow entirely.

### Post-Replacement Flow

After the user chooses a replacement target (via "Reselect target" or "Use AI suggestion"):

1.  **Update Failed Step Target**: The `target` of the failed action card in the Flow Builder is updated with the newly selected element's locator.
2.  **Retry the Step**: The server immediately attempts to re-execute the now-modified step.
3.  **Continue if Successful**: If the retried step succeeds, the automation flow resumes from that point forward.
4.  **Optionally Ask to Save Remap**: The system can optionally prompt the user whether to save this successful remapping (original locator -> new locator) as a new "recipe" or "fingerprint" for future runs, enhancing the system's self-healing memory.

## AI's Role in Recovery

AI plays a supportive, not autonomous, role in AnyClick's error recovery:

*   **AI Can Suggest Likely Replacements**: The AI engine can analyze the context of the failed element and the current page to suggest highly probable alternative elements (e.g., a button with similar text or role) that the user might want to reselect. These suggestions are presented as options to the user.
*   **AI Can Help Infer Page States**: AI can assist in detecting complex page states like unexpected modals, dialogs, or popups, helping to contextualize why an original locator might have failed.
*   **AI Should Not Invent Non-Visible Elements**: Crucially, AI will only suggest elements that are *actually visible and interactable* on the current page. It will not hallucinate or invent non-existent elements.
*   **AI Should Assist Recovery, Not Silently Replace**: The AI's primary role is to *assist* the human operator in making informed recovery decisions, not to silently or autonomously replace failed locators without human review. Human oversight remains central to the recovery process.

This human-in-the-loop recovery model ensures that AnyClick flows are resilient to change, allowing users to maintain high automation success rates even in dynamic web environments.