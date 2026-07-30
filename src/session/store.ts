import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ModelMessage } from "ai";
import { anvilHome } from "../config/load.ts";
import type { TimelineItem } from "../ui/types.ts";

export function projectHash(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

export function sessionDir(cwd: string): string {
  return join(anvilHome(), "projects", projectHash(cwd));
}

export interface SessionMeta {
  id: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  title?: string;
}

export class SessionStore {
  readonly id: string;
  readonly path: string;
  private constructor(
    readonly cwd: string,
    id: string,
  ) {
    this.id = id;
    this.path = join(sessionDir(cwd), `${id}.jsonl`);
  }

  static async create(cwd: string, id?: string): Promise<SessionStore> {
    await mkdir(sessionDir(cwd), { recursive: true });
    const sessionId = id ?? new Date().toISOString().replace(/[:.]/g, "-");
    const store = new SessionStore(cwd, sessionId);
    const meta: SessionMeta = {
      id: sessionId,
      cwd,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.append({ type: "meta", ...meta });
    return store;
  }

  static async open(cwd: string, id: string): Promise<SessionStore> {
    await mkdir(sessionDir(cwd), { recursive: true });
    return new SessionStore(cwd, id);
  }

  async append(record: Record<string, unknown>): Promise<void> {
    const line = JSON.stringify({ ...record, ts: new Date().toISOString() }) + "\n";
    await appendFile(this.path, line, "utf8");
  }

  async appendMessage(message: ModelMessage): Promise<void> {
    await this.append({ type: "message", message });
  }

  async appendTimelineItem(item: TimelineItem): Promise<void> {
    await this.append({ type: "timeline", item });
  }

  async loadMessages(): Promise<ModelMessage[]> {
    const file = Bun.file(this.path);
    if (!(await file.exists())) return [];
    const text = await file.text();
    const messages: ModelMessage[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { type?: string; message?: ModelMessage };
        if (row.type === "message" && row.message) messages.push(row.message);
      } catch {
        // skip bad lines
      }
    }
    return messages;
  }

  async loadTimeline(): Promise<TimelineItem[]> {
    const file = Bun.file(this.path);
    if (!(await file.exists())) return [];
    const text = await file.text();
    const items: TimelineItem[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { type?: string; item?: TimelineItem };
        if (row.type === "timeline" && row.item && typeof row.item.kind === "string") {
          items.push(row.item);
        }
      } catch {
        // Keep a partially-written or legacy session usable.
      }
    }
    return items;
  }

  /** True when this session has a file on disk (i.e. it is not brand new). */
  async exists(): Promise<boolean> {
    return await Bun.file(this.path).exists();
  }

  /** Session ids for this project, newest first. Ids sort chronologically. */
  static async listIds(cwd: string): Promise<string[]> {
    const dir = sessionDir(cwd);
    try {
      const glob = new Bun.Glob("*.jsonl");
      const ids: string[] = [];
      for await (const match of glob.scan({ cwd: dir })) {
        ids.push(match.replace(/\.jsonl$/, ""));
      }
      return ids.sort().reverse();
    } catch {
      return [];
    }
  }

  /**
   * Summaries for the resume picker, newest first. Reading each file is the
   * only way to get a preview, so the scan is capped.
   */
  static async list(cwd: string, limit = 20): Promise<SessionSummary[]> {
    const ids = (await SessionStore.listIds(cwd)).slice(0, limit);
    const summaries: SessionSummary[] = [];
    for (const id of ids) {
      const store = new SessionStore(cwd, id);
      summaries.push(await store.summarize());
    }
    return summaries;
  }

  /** Most recent session for this project, or null when there is none. */
  static async mostRecent(cwd: string): Promise<string | null> {
    return (await SessionStore.listIds(cwd))[0] ?? null;
  }

  private async summarize(): Promise<SessionSummary> {
    const file = Bun.file(this.path);
    let messageCount = 0;
    let preview = "";
    let updatedAt = "";
    if (await file.exists()) {
      const text = await file.text();
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const row = JSON.parse(line) as {
            type?: string;
            ts?: string;
            message?: ModelMessage;
          };
          if (row.ts) updatedAt = row.ts;
          if (row.type !== "message" || !row.message) continue;
          messageCount += 1;
          if (!preview && row.message.role === "user") {
            preview = previewOf(row.message);
          }
        } catch {
          // Skip partial or legacy lines.
        }
      }
    }
    return { id: this.id, updatedAt, messageCount, preview };
  }
}

export interface SessionSummary {
  id: string;
  /** Timestamp of the last record written, ISO-8601. Empty when unknown. */
  updatedAt: string;
  messageCount: number;
  /** First user message, flattened and clipped. */
  preview: string;
}

const PREVIEW_LENGTH = 80;

function previewOf(message: ModelMessage): string {
  let text = "";
  if (typeof message.content === "string") {
    text = message.content;
  } else if (Array.isArray(message.content)) {
    text = message.content
      .flatMap((part) => ("text" in part && typeof part.text === "string" ? [part.text] : []))
      .join(" ");
  }
  // Inlined @-mention file bodies would swamp the preview.
  const trimmed = text.replace(/<file path="[\s\S]*?<\/file>/g, " ").replace(/\s+/g, " ").trim();
  if (trimmed.length <= PREVIEW_LENGTH) return trimmed;
  return `${trimmed.slice(0, PREVIEW_LENGTH - 1)}…`;
}

/** `3 minutes ago` — relative time for the picker. */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "unknown";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toISOString().slice(0, 10);
}
