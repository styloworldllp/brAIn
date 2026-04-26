const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("brain_token") : null;
  const headers: Record<string, string> = { ...extra };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function authedFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const headers = authHeaders(opts.headers as Record<string, string> | undefined);
  return fetch(url, { ...opts, headers }).then(res => {
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("brain_token");
      localStorage.removeItem("brain_user");
      window.location.href = "/login";
    }
    if (res.status === 403 && typeof window !== "undefined") {
      try {
        const rawUser = localStorage.getItem("brain_user");
        const user = rawUser ? JSON.parse(rawUser) : null;
        if (user?.role === "super_admin") {
          window.location.href = "/superadmin";
        }
      } catch {}
    }
    return res;
  });
}

export interface Dataset {
  id: string;
  name: string;
  source_type: string;
  row_count: number;
  schema_info: Record<string, any>;
  sample_data: Record<string, unknown>[];
  created_at: string;
  all_tables?: string[];
  is_deleted?: boolean;
  deleted_at?: string;
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
  follow_up_questions?: string[];
  created_at: string;
}

// Datasets
export const fetchDatasets = (): Promise<Dataset[]> =>
  authedFetch(`${BASE}/datasets/`).then((r) => r.json());

export const uploadFile = (file: File): Promise<Dataset> => {
  const fd = new FormData();
  fd.append("file", file);
  return authedFetch(`${BASE}/datasets/upload`, { method: "POST", body: fd }).then((r) => {
    if (!r.ok) return r.json().then((e) => Promise.reject(e.detail));
    return r.json();
  });
};

export const connectDB = (payload: Record<string, unknown>): Promise<Dataset> =>
  authedFetch(`${BASE}/datasets/connect-db`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => {
    if (!r.ok) return r.json().then((e) => Promise.reject(e.detail));
    return r.json();
  });

export const testDB = (payload: Record<string, unknown>) =>
  authedFetch(`${BASE}/datasets/test-db`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => r.json());

export const connectSheets = (payload: Record<string, unknown>): Promise<Dataset> =>
  authedFetch(`${BASE}/datasets/connect-sheets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => {
    if (!r.ok) return r.json().then((e) => Promise.reject(e.detail));
    return r.json();
  });

export const deleteDataset = (id: string) =>
  authedFetch(`${BASE}/datasets/${id}`, { method: "DELETE" }).then((r) => r.json());

export const fetchArchivedDatasets = (): Promise<Dataset[]> =>
  authedFetch(`${BASE}/datasets/archived`).then((r) => r.json());

// Conversations
export const fetchConversations = (dataset_id: string): Promise<Conversation[]> =>
  authedFetch(`${BASE}/chat/conversations?dataset_id=${dataset_id}`).then((r) => r.json());

export const createConversation = (dataset_id: string): Promise<{ id: string; title: string }> =>
  authedFetch(`${BASE}/chat/conversations?dataset_id=${dataset_id}`, { method: "POST" }).then((r) => r.json());

export const fetchMessages = (conversation_id: string): Promise<Message[]> =>
  authedFetch(`${BASE}/chat/conversations/${conversation_id}/messages`).then((r) => r.json());

export const deleteConversation = (conversation_id: string): Promise<{ ok: boolean }> =>
  authedFetch(`${BASE}/chat/conversations/${conversation_id}`, { method: "DELETE" }).then((r) => r.json());

// Stream chat
export function streamChat(
  conversation_id: string,
  message: string,
  onEvent: (event: Record<string, unknown>) => void,
  extra_dataset_ids: string[] = []
): Promise<void> {
  return authedFetch(`${BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation_id, message, extra_dataset_ids }),
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

export interface NeurixStatus {
  has_instance: boolean;
  endpoint_url: string | null;
  model_name: string | null;
  neuron_balance: number;
  cost_per_query: number;
}

export const fetchNeurixStatus = (): Promise<NeurixStatus> =>
  authedFetch(`${BASE}/neurix/my-status`).then((r) => r.json());

export const fetchSettings = (): Promise<AISettings> =>
  authedFetch(`${BASE}/settings/`).then((r) => r.json());

export const saveSettings = (body: Record<string, string>): Promise<{ ok: boolean }> =>
  authedFetch(`${BASE}/settings/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
