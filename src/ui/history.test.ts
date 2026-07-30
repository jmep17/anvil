import { describe, expect, test } from "bun:test";
import { createHistory, MAX_HISTORY, next, previous, release, remember } from "./history.ts";

describe("prompt history", () => {
  test("remembers submitted prompts in order", () => {
    let history = createHistory();
    history = remember(history, "first");
    history = remember(history, "second");
    expect(history.entries).toEqual(["first", "second"]);
  });

  test("ignores blanks and immediate repeats", () => {
    let history = createHistory(["only"]);
    history = remember(history, "   ");
    history = remember(history, "only");
    expect(history.entries).toEqual(["only"]);
  });

  test("walks backwards from newest to oldest and stops", () => {
    const history = createHistory(["one", "two"]);
    const first = previous(history, "draft");
    expect(first.value).toBe("two");
    const second = previous(first.history, "draft");
    expect(second.value).toBe("one");
    expect(previous(second.history, "draft").value).toBeNull();
  });

  test("walking forward again restores the stashed draft", () => {
    const history = createHistory(["one", "two"]);
    const back = previous(history, "half-typed");
    const forward = next(back.history);
    expect(forward.value).toBe("half-typed");
    expect(forward.history.index).toBeNull();
  });

  test("forward from the live draft does nothing", () => {
    expect(next(createHistory(["one"])).value).toBeNull();
  });

  test("previous on an empty history does nothing", () => {
    expect(previous(createHistory(), "draft").value).toBeNull();
  });

  test("editing releases recall so the next submit starts fresh", () => {
    const back = previous(createHistory(["one"]), "draft");
    expect(back.history.index).not.toBeNull();
    expect(release(back.history).index).toBeNull();
  });

  test("the ring is bounded", () => {
    let history = createHistory();
    for (let i = 0; i < MAX_HISTORY + 25; i++) history = remember(history, `p${i}`);
    expect(history.entries.length).toBe(MAX_HISTORY);
    expect(history.entries.at(-1)).toBe(`p${MAX_HISTORY + 24}`);
  });
});
