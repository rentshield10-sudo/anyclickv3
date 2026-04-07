# AnyClick v2 Architecture

AnyClick v2 represents a shift from a "planner-first" AI agent to a "capability-centric, memory-first" automation controller.

## The Core Concept
V1 used an orchestrator (n8n) to control a loop: `get page state -> send to LLM (Gemini Pro) -> get plan -> execute action -> repeat`. Even for a simple login, this was slow and expensive.

V2 flips this. The local browser worker now provides **Capability Endpoints** (`/browser/click`, `/browser/type`, `/browser/scrape`). N8n is used to orchestrate specific sequences, not generic while-loops.

When N8N asks the browser worker to `/browser/click`, the worker resolves the target using a deterministic-first cascade:

## The Locator Cascade

1. **Recipe Replay (Instant)**: We look up the action intent in the `RecipeMemory`. If we have a working CSS selector from a previous run, we just use it.
2. **Deterministic Resolution (~10ms)**: If no recipe exists, we use a robust code-based resolution engine (checking aria-labels, test IDs, roles + text, placeholders, nearby text). NO AI IS USED.
3. **Semantic Inference (~1000ms)**: If code-based resolution fails, we send a *reduced state* payload (just interactive elements and nearby text) to a fast model (Gemini 2.5 Flash) to infer semantic intent.
4. **Repair / Repair Inference (~5000ms)**: If the element is truly hidden or complicated, we send a full state payload to a reasoning model (Gemini 2.5 Pro) as a last resort. **If repair succeeds, a new Action Recipe is saved so next time it is instantaneous.**

## Memory Layers

The system's speed comes from its 3 memory layers (stored as JSON in `/data`):

- **Page Fingerprints**: Quick identity hashing of pages based on their structure, headings, titles, and form labels.
- **Action Recipes**: Known-good selectors per intent and page type, complete with confidence scores and success/fail counts.
- **Run Audit Logs**: Complete records of end-to-end sessions.

## Execution vs. Discovery Mode

When a session starts, AnyClick takes a fingerprint of the destination URL.
- **Discovery Mode**: If the page is unknown, the worker assumes it will need to use AI inference. Every successful action is recorded as a new Recipe.
- **Execution Mode**: If the page is known and has non-stale recipes, it executes instantaneously without calling Gemini at all.
