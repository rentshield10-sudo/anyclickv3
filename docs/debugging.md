# Debugging the Locator Engine

The `LocatorEngine` provides structured debug logs on every resolution attempt.

```json
"logs": [
  { "step": "recipe_replay", "result": "miss", "ms": 2 },
  { "step": "deterministic", "result": "miss", "ms": 15 },
  { "step": "fuzzy", "result": "hit", "strategy": "fuzzy_text", "ms": 8, "detail": "similarity=0.82" }
]
```

## How to use `LocatorLogs` to fix unstable automations:

1. **Why is it slow?**
   If a recipe says `method: repair_ai` in the response, it means the target was completely missing or obscure. Either provide a better target object with `aria-label` or `testId`, or add proper `Wait-for-condition` nodes in n8n before the action.

2. **Why is it clicking the wrong element?**
   If `method: recipe_replay` hits but clicks the wrong thing, it means the DOM changed out from under the stored CSS selector. The recipe's `confidence` score drops for every failure. Delete the `data/recipes/{site}.json` file to force a fresh Discovery run.

3. **My element has no text.**
   For icon buttons, prefer passing the aria label. The deterministic engine matches `target: { "label": "Settings" }` natively. If there is no aria-label, the `Semantic AI` layer is smart enough to find `[class*="icon-cog"]` automatically.
