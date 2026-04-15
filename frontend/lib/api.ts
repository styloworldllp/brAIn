const BASE = "http://localhost:8000/api";

export interface Dataset {
  id: string;
  name: string;
  source_type: string;
  row_count: number;
  schema_info: Record<string, any>;
  sample_data: Record<string, unknown>[];
  created_at: string;
  all_tables?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  executed_code?: string;
  code_output?: string;
  charts?: unknown[];
  created_at: string;
}

// Datasets
export const fetchDatasets = (): Promise<Dataset[]> =>
  fetch(`${BASE}/datasets/`).then((r) => r.json());

export const uploadFile = (file: File): Promise<Dataset> => {
  const fd = new FormData();
  fd.append("file", file);
  return fetch(`${BASE}/datasets/upload`, { method: "POST", body: fd }).then((r) => {
    if (!r.ok) return r.json().then((e) => Promise.reject(e.detail));
    return r.json();
  });
};

export const connectDB = (payload: Record<string, unknown>): Promise<Dataset> =>
  fetch(`${BASE}/datasets/connect-db`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => {
    if (!r.ok) return r.json().then((e) => Promise.reject(e.detail));
    return r.json();
  });

export const testDB = (payload: Record<string, unknown>) =>
  fetch(`${BASE}/datasets/test-db`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => r.json());

export const connectSheets = (payload: Record<string, unknown>): Promise<Dataset> =>
  fetch(`${BASE}/datasets/connect-sheets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => {
    if (!r.ok) return r.json().then((e) => Promise.reject(e.detail));
    return r.json();
  });

export const deleteDataset = (id: string) =>
  fetch(`${BASE}/datasets/${id}`, { method: "DELETE" }).then((r) => r.json());

// Conversations
export const fetchConversations = (dataset_id: string): Promise<Conversation[]> =>
  fetch(`${BASE}/chat/conversations?dataset_id=${dataset_id}`).then((r) => r.json());

export const createConversation = (dataset_id: string): Promise<{ id: string; title: string }> =>
  fetch(`${BASE}/chat/conversations?dataset_id=${dataset_id}`, { method: "POST" }).then((r) => r.json());

export const fetchMessages = (conversation_id: string): Promise<Message[]> =>
  fetch(`${BASE}/chat/conversations/${conversation_id}/messages`).then((r) => r.json());

// Stream chat
export function streamChat(
  conversation_id: string,
  message: string,
  onEvent: (event: Record<string, unknown>) => void
): Promise<void> {
  return fetch(`${BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation_id, message }),
  }).then((response) => {
    if (!response.ok) throw new Error("Stream failed");
    const reader  = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer    = "";

    function pump(): Promise<void> {
      return reader.read().then(({ done, value }) => {
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try { onEvent(JSON.parse(line.slice(6))); } catch {}
          }
        }
        return pump();
      });
    }
    return pump();
  });
}

// Settings
export interface AISettings {
  provider: string;
  anthropic_model: string;
  openai_model: string;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
}

export const fetchSettings = (): Promise<AISettings> =>
  fetch(`${BASE}/settings/`).then((r) => r.json());

export const saveSettings = (body: Record<string, string>): Promise<{ ok: boolean }> =>
  fetch(`${BASE}/settings/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
