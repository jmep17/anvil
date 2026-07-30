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

  static async list(cwd: string): Promise<string[]> {
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
}
