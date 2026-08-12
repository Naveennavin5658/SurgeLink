const CAPACITY_API = import.meta.env.VITE_CAPACITY_API_URL || 'http://localhost:5001';
const TRANSFER_API = import.meta.env.VITE_TRANSFER_API_URL || 'http://localhost:5002';
const CACHE_TTL_MS = 60 * 60 * 1000;
const apiCache = new Map();

function getToken() {
  return localStorage.getItem('surgelink_token');
}

function getCacheKey(baseUrl, path, options = {}) {
  return `${baseUrl}${path}:${(options.method || 'GET').toUpperCase()}`;
}

function getCachedData(key) {
  const entry = apiCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    apiCache.delete(key);
    return null;
  }

  return entry.data;
}

function setCachedData(key, data) {
  apiCache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

async function request(baseUrl, path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const cacheKey = getCacheKey(baseUrl, path, options);

  if (method === 'GET') {
    const cached = getCachedData(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${baseUrl}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('surgelink_token');
    localStorage.removeItem('surgelink_user');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  if (method === 'GET') {
    setCachedData(cacheKey, data);
  }

  return data;
}

export const capacityApi = {
  login: (email, password) =>
    request(CAPACITY_API, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getHospitals: (region) =>
    request(CAPACITY_API, `/hospitals${region ? `?region=${region}` : ''}`),

  getBulkCapacity: (hospitalIds = []) => {
    if (!hospitalIds.length) return Promise.resolve({});
    const qs = new URLSearchParams({ hospital_ids: hospitalIds.join(',') });
    return request(CAPACITY_API, `/hospitals/capacity?${qs.toString()}`);
  },

  getCapacity: (hospitalId) =>
    request(CAPACITY_API, `/hospitals/${hospitalId}/capacity`),

  updateCapacity: (hospitalId, data) =>
    request(CAPACITY_API, `/hospitals/${hospitalId}/capacity`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCapacityHistory: (hospitalId, hours = 24) =>
    request(CAPACITY_API, `/hospitals/${hospitalId}/capacity/history?hours=${hours}`),
};

export const transferApi = {
  getTransfers: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(TRANSFER_API, `/transfers${qs ? `?${qs}` : ''}`);
  },

  createTransfer: (data, idempotencyKey) =>
    request(TRANSFER_API, '/transfers', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(data),
    }),

  acceptTransfer: (id) =>
    request(TRANSFER_API, `/transfers/${id}/accept`, { method: 'POST' }),

  rejectTransfer: (id) =>
    request(TRANSFER_API, `/transfers/${id}/reject`, { method: 'POST' }),

  forceReassign: (id, toHospitalId) =>
    request(TRANSFER_API, `/transfers/${id}/force-reassign`, {
      method: 'POST',
      body: JSON.stringify({ to_hospital_id: toHospitalId }),
    }),

  getAuditLog: (limit = 100) =>
    request(TRANSFER_API, `/audit-log?limit=${limit}`),

  streamUrl: `${TRANSFER_API}/transfers/stream`,
};

export function capacityLevel(available, total) {
  if (total === 0) return 'low';
  const pct = available / total;
  if (pct > 0.3) return 'high';
  if (pct >= 0.1) return 'medium';
  return 'low';
}

export function generateCaseId() {
  const num = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
  return `CASE-2026-${num}`;
}

export function generateIdempotencyKey() {
  return crypto.randomUUID();
}
