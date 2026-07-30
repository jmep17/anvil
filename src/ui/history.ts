/**
 * Recall ring for previously submitted prompts. Navigation is stateful: the
 * draft in progress is stashed on the first step back so returning past the
 * newest entry restores what the user was typing.
 */
export interface PromptHistory {
  entries: string[];
  /** null when the user is on their live draft rather than a recalled entry. */
  index: number | null;
  draft: string;
}

export const MAX_HISTORY = 200;

export function createHistory(entries: string[] = []): PromptHistory {
  return { entries: entries.slice(-MAX_HISTORY), index: null, draft: "" };
}

/** Append a submitted prompt, skipping blanks and immediate repeats. */
export function remember(history: PromptHistory, text: string): PromptHistory {
  const value = text.trim();
  if (!value) return { ...history, index: null, draft: "" };
  const entries =
    history.entries.at(-1) === value ? history.entries : [...history.entries, value];
  return {
    entries: entries.slice(-MAX_HISTORY),
    index: null,
    draft: "",
  };
}

export interface HistoryStep {
  history: PromptHistory;
  /** null when there was nothing to move to and the buffer should not change. */
  value: string | null;
}

/** Step towards older entries. */
export function previous(history: PromptHistory, currentDraft: string): HistoryStep {
  if (history.entries.length === 0) return { history, value: null };
  if (history.index === null) {
    const index = history.entries.length - 1;
    return {
      history: { ...history, index, draft: currentDraft },
      value: history.entries[index]!,
    };
  }
  if (history.index === 0) return { history, value: null };
  const index = history.index - 1;
  return { history: { ...history, index }, value: history.entries[index]! };
}

/** Step towards newer entries, ending on the stashed draft. */
export function next(history: PromptHistory): HistoryStep {
  if (history.index === null) return { history, value: null };
  const index = history.index + 1;
  if (index >= history.entries.length) {
    return { history: { ...history, index: null }, value: history.draft };
  }
  return { history: { ...history, index }, value: history.entries[index]! };
}

/** Leave recall mode without changing the buffer (called when the user edits). */
export function release(history: PromptHistory): PromptHistory {
  return history.index === null ? history : { ...history, index: null };
}
