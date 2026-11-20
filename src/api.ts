
export const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export const API_ORIGIN = API_BASE.replace(/\/api$/, '');

export const getSessionToken = () => localStorage.getItem('uborka_session');

export type ApiUser = {
  id: string;
  email?: string;
  displayName: string;
};

export type ApiMember = {
  userId: string;
  role: 'OWNER' | 'MEMBER';
  user: {
    id: string;
    displayName: string;
  };
};

export type ApiGroup = {
  id: string;
  name: string;
  members: ApiMember[];
};

export type ApiMembership = {
  group: ApiGroup;
  role: 'OWNER' | 'MEMBER';
};

export type ApiTask = {
  id: string;
  title: string;
  description?: string | null;
  scheduledAt: string;
  status: 'OPEN' | 'COMPLETED';
  assigneeId?: string | null;
  assignee?: {
    id: string;
    displayName: string;
  } | null;
  creator?: {
    id: string;
    displayName: string;
  };
  completions: {
    userId: string;
  }[];
  recurringTaskId?: string | null;
  occurrenceNumber?: number | null;
};

export type ApiRecurringTask = {
  id: string;
  groupId: string;
  title: string;
  description?: string | null;
  alternateTitle?: string | null;
  startDate: string;
  assigneeIds: string[];
  active: boolean;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateRecurringTaskData = {
  title: string;
  alternateTitle?: string;
  description?: string;
  startDate: string;
  assigneeIds: string[];
};

export type UpdateRecurringTaskData = {
  title?: string;
  alternateTitle?: string | null;
  description?: string | null;
  assigneeIds?: string[];
  active?: boolean;
};

export type RatingRow = {
  userId: string;
  name: string;
  completed: number;
  assigned: number;
  overdue: number;
  score: number;
};

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getSessionToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'omit',
    headers,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.message || 'Не удалось выполнить запрос',
    );
  }

  if (
    payload &&
    typeof payload === 'object' &&
    typeof payload.token === 'string'
  ) {
    localStorage.setItem('uborka_session', payload.token);
  }

  return payload as T;
}

export function getRecurringTasks(groupId: string) {
  return api<ApiRecurringTask[]>(
    `/groups/${groupId}/recurring-tasks`,
  );
}

export function createRecurringTask(
  groupId: string,
  data: CreateRecurringTaskData,
) {
  return api<ApiRecurringTask>(
    `/groups/${groupId}/recurring-tasks`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

export function updateRecurringTask(
  groupId: string,
  recurringId: string,
  data: UpdateRecurringTaskData,
) {
  return api<ApiRecurringTask>(
    `/groups/${groupId}/recurring-tasks/${recurringId}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
  );
}

export function deleteRecurringTask(
  groupId: string,
  recurringId: string,
) {
  return api<{ ok: boolean }>(
    `/groups/${groupId}/recurring-tasks/${recurringId}`,
    {
      method: 'DELETE',
    },
  );
}

export function clearSessionToken() {
  localStorage.removeItem('uborka_session');
}
