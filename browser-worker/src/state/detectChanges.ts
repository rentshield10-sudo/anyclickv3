import type { PageState } from '../utils/validation';
import { createLogger } from '../utils/logger';

const log = createLogger('detect-changes');

export interface PanelDiff {
  changed: boolean;
  region: string;
  beforeHeading: string;
  afterHeading: string;
  beforeText: string;
  afterText: string;
  beforeUrl: string;
  afterUrl: string;
  newElements: number[];
  removedElements: number[];
}

/**
 * Compute a meaningful diff between two page states.
 * Focuses on the watched region to give Gemini signal on what changed.
 */
export function detectChanges(before: PageState, after: PageState): PanelDiff {
  const beforeMainHeading = before.panels.main.heading;
  const afterMainHeading = after.panels.main.heading;
  const beforeRightHeading = before.panels.right.heading;
  const afterRightHeading = after.panels.right.heading;

  const headingChanged =
    beforeMainHeading !== afterMainHeading || beforeRightHeading !== afterRightHeading;
  const textChanged =
    before.panels.main.text !== after.panels.main.text ||
    before.panels.right.text !== after.panels.right.text;
  const urlChanged = before.url !== after.url;

  const beforeIds = new Set(before.elements.map((e) => e.id));
  const afterIds = new Set(after.elements.map((e) => e.id));

  const newElements = [...afterIds].filter((id) => !beforeIds.has(id));
  const removedElements = [...beforeIds].filter((id) => !afterIds.has(id));
  const elementsChanged = newElements.length > 0 || removedElements.length > 0;

  const changed = headingChanged || textChanged || urlChanged || elementsChanged;

  log.debug(
    { changed, headingChanged, textChanged, urlChanged, newElements, removedElements },
    'Change detection result'
  );

  return {
    changed,
    region: headingChanged || textChanged ? 'main_content' : urlChanged ? 'page' : 'unknown',
    beforeHeading: beforeMainHeading,
    afterHeading: afterMainHeading,
    beforeText: before.panels.main.text.slice(0, 200),
    afterText: after.panels.main.text.slice(0, 200),
    beforeUrl: before.url,
    afterUrl: after.url,
    newElements,
    removedElements,
  };
}
