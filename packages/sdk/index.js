export class SPRApiError extends Error {
  constructor(status, payload) {
    super(payload?.message || payload?.error || `SPR API request failed with ${status}`);
    this.name = 'SPRApiError';
    this.status = status;
    this.payload = payload;
  }
}

export class SPRClient {
  constructor({ baseUrl, apiKey, fetchImpl = globalThis.fetch } = {}) {
    if (!baseUrl) throw new Error('SPRClient requires baseUrl');
    if (!apiKey) throw new Error('SPRClient requires apiKey for server-side use');
    if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  async request(path, options = {}) {
    const response = await this.fetch(`${this.baseUrl}/api/v1${path}`, {
      ...options,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-spr-api-key': this.apiKey,
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw new SPRApiError(response.status, payload);
    return payload;
  }

  software = {
    register: (input) => this.request('/software', { method: 'POST', body: JSON.stringify(input) }),
    get: (id) => this.request(`/software/${encodeURIComponent(id)}`)
  };

  passports = {
    get: (id) => this.request(`/passports/${encodeURIComponent(id)}`),
    trust: (id) => this.request(`/passports/${encodeURIComponent(id)}/trust`),
    evidence: (id) => this.request(`/passports/${encodeURIComponent(id)}/evidence`),
    risks: (id) => this.request(`/passports/${encodeURIComponent(id)}/risks`),
    history: (id) => this.request(`/passports/${encodeURIComponent(id)}/history`),
    scan: (id) => this.request(`/passports/${encodeURIComponent(id)}/scan`, { method: 'POST', body: '{}' }),
    recalculateTrust: (id) => this.request(`/passports/${encodeURIComponent(id)}/recalculate-trust`, { method: 'POST', body: '{}' })
  };

  jobs = {
    get: (id) => this.request(`/jobs/${encodeURIComponent(id)}`)
  };
}

export class SPRPublicClient {
  constructor({ baseUrl, fetchImpl = globalThis.fetch } = {}) {
    if (!baseUrl) throw new Error('SPRPublicClient requires baseUrl');
    if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
  }

  async getPassport(id) {
    const response = await this.fetch(`${this.baseUrl}/api/v1/public/passports/${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw new SPRApiError(response.status, payload);
    return payload;
  }
}
