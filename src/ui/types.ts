export type ToolStatus = "running" | "done" | "error";

export type TimelineItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "thinking"; id: string; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      input: unknown;
      status: ToolStatus;
      output?: string;
      ms?: number;
    }
  | { kind: "status"; id: string; text: string }
  | { kind: "error"; id: string; text: string };

let seq = 0;
export function nextId(prefix = "i"): string {
  seq += 1;
  return `${prefix}-${seq}`;
}
