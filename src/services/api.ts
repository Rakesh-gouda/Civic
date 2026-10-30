/**
 * Typed API client for the CIVICTRACK AI backend.
 * All requests are same-origin and proxied by Vite in development.
 */

import type {
  AIAnalysisState,
  AIFullAnalysis,
  Complaint,
  ComplaintPriority,
  ComplaintStatus,
  Department,
  GeographicHotspot,
  User,
} from '../types';

const TOKEN_KEY = 'civictrack_session_token';

export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;

  constructor(message: string, status: number, code?: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage can be unavailable in private mode */
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new ApiError('Cannot reach the CIVICTRACK AI server. Start it with "npm run server".', 0, 'NETWORK');
  }

  if (!response.ok) {
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(
      body?.error || `Request failed with status ${response.status}.`,
      response.status,
      body?.code,
      body?.fields,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export interface AuthResponse {
  token: string;
  user: User;
}

export const authApi = {
  login: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (payload: { name: string; email: string; password: string; phone?: string; ward?: string }) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request<{ user: User }>('/api/auth/me'),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  updateProfile: (payload: { name: string; phone?: string; ward?: string }) =>
    request<{ user: User }>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(payload) }),
};

// ── Uploads ──────────────────────────────────────────────────────────────────
export async function uploadImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
    throw new ApiError('Only PNG, JPG or WEBP images can be uploaded.', 400);
  }
  if (file.size > 6 * 1024 * 1024) throw new ApiError('Image must be 6 MB or smaller.', 413);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ApiError('The selected image could not be read.', 400));
    reader.readAsDataURL(file);
  });
  const result = await request<{ url: string }>('/api/uploads', {
    method: 'POST',
    body: JSON.stringify({ dataUrl }),
  });
  return result.url;
}

// ── Complaints ───────────────────────────────────────────────────────────────
export interface CreateComplaintPayload {
  title: string;
  description: string;
  category: string;
  lat: number;
  lng: number;
  address: string;
  ward?: string;
  zone?: string;
  landmark?: string;
  imageUrl?: string | null;
  isAnonymous?: boolean;
}

export const complaintsApi = {
  list: (scope: 'all' | 'mine' = 'all') =>
    request<{ complaints: Complaint[] }>(`/api/complaints?scope=${scope}`),
  get: (id: string) => request<{ complaint: Complaint }>(`/api/complaints/${encodeURIComponent(id)}`),
  create: (payload: CreateComplaintPayload) =>
    request<{ complaint: Complaint }>('/api/complaints', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: {
    status?: ComplaintStatus;
    priority?: ComplaintPriority;
    departmentId?: string;
    assignedOfficer?: string;
    note?: string;
    resolutionNotes?: string;
    resolutionImageUrl?: string | null;
    duplicateOf?: string | null;
  }) => request<{ complaint: Complaint }>(`/api/complaints/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  note: (id: string, note: string) =>
    request<{ complaint: Complaint }>(`/api/complaints/${encodeURIComponent(id)}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  vote: (id: string) =>
    request<{ upvotes: number; voted: boolean }>(`/api/complaints/${encodeURIComponent(id)}/vote`, {
      method: 'POST',
    }),
  analyze: (id: string) =>
    request<{ complaint: Complaint; analysis: AIFullAnalysis }>(`/api/complaints/${encodeURIComponent(id)}/analyze`, {
      method: 'POST',
    }),
  reviewAi: (id: string, payload: {
    categoryOverride?: string;
    priorityOverride?: ComplaintPriority;
    duplicateRejected?: boolean;
    duplicateConfirmed?: boolean;
    matchedTicketId?: string;
    merge?: boolean;
    note?: string;
  }) => request<{ complaint: Complaint; overrides: AIAnalysisState['overrides'] }>(
    `/api/complaints/${encodeURIComponent(id)}/ai-review`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  ),
};

// ── AI preview ───────────────────────────────────────────────────────────────
export const aiApi = {
  analyzePreview: (complaint: {
    title: string;
    description: string;
    category: string;
    location?: { lat: number; lng: number; address?: string; ward?: string; zone?: string };
  }) => request<{ analysis: AIFullAnalysis }>('/api/ai/analyze-preview', {
    method: 'POST',
    body: JSON.stringify({ complaint }),
  }),
  health: () => request<{ status: string; aiConfigured: boolean; aiModel: string }>('/api/health'),
};

// ── Read models ──────────────────────────────────────────────────────────────
export interface PlatformStats {
  total: number;
  resolved: number;
  pending: number;
  inProgress: number;
  critical: number;
  overdue: number;
  underReview: number;
  submitted: number;
  resolvedRate: number;
  avgResolutionHours: number | null;
  duplicates: number;
  aiAnalyzed: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  demoData: boolean;
}

export interface AnalyticsResponse {
  kpis: {
    totalComplaints: number;
    resolvedRate: number;
    avgResolutionHours: number | null;
    activeCritical: number;
    duplicateLinks: number;
    aiAnalyzed: number;
    overdue: number;
    aiConfigured: boolean;
    aiModel: string;
  };
  months: Array<{ month: string; key: string; received: number; resolved: number; duplicates: number }>;
  categories: Array<{ category: string; label: string; count: number; percentage: number }>;
  wards: Array<{ ward: string; complaints: number; resolvedPercent: number; avgHours: number | null }>;
  departments: Array<{
    id: string; name: string; activeComplaints: number; resolvedThisMonth: number;
    avgResolutionHours: number | null; slaComplianceRate: number | null;
  }>;
  recent: Complaint[];
  demoData: boolean;
  generatedAt: string;
}

export const platformApi = {
  stats: () => request<PlatformStats>('/api/stats'),
  hotspots: (eps = 400, minPts = 3, days?: number) =>
    request<{
      hotspots: GeographicHotspot[];
      params: { epsMeters: number; minPts: number };
      filters: { days: number | null };
      generatedAt: string;
    }>(`/api/hotspots?eps=${eps}&minPts=${minPts}${days ? `&days=${days}` : ''}`),
  analytics: () => request<AnalyticsResponse>('/api/analytics'),
  departments: () => request<{ departments: Department[] }>('/api/departments'),
  updateDepartment: (id: string, payload: Partial<Department>) =>
    request<{ department: Department }>(`/api/departments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};
