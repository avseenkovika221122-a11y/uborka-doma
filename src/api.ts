export const API_BASE = import.meta.env.VITE_API_URL || '/api';
export type ApiUser = { id: string; email: string; displayName: string };
export type ApiMember = { userId: string; role: 'OWNER' | 'MEMBER'; user: { id: string; displayName: string } };
export type ApiGroup = { id: string; name: string; members: ApiMember[] };
export type ApiMembership = { group: ApiGroup; role: 'OWNER' | 'MEMBER' };
export type ApiTask = { id: string; title: string; description?: string | null; scheduledAt: string; status: 'OPEN' | 'COMPLETED'; assigneeId?: string | null; assignee?: { id: string; displayName: string } | null; creator?: { id: string; displayName: string }; completions: { userId: string }[] };
export type RatingRow = { userId: string; name: string; completed: number; assigned: number; overdue: number; score: number };
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, { ...init, credentials: 'include', headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Не удалось выполнить запрос');
  return payload as T;
}
