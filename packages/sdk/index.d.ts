export interface SPRClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}
export interface RegisterSoftwareInput {
  name: string;
  version?: string;
  publisher?: string;
  category?: string;
  repository?: string;
  url?: string;
  licenseType?: string;
}
export class SPRApiError extends Error {
  status: number;
  payload: unknown;
}
export class SPRClient {
  constructor(options: SPRClientOptions);
  software: {
    register(input: RegisterSoftwareInput): Promise<{ softwareId: string; passportId: string; status: string }>;
    get(id: string): Promise<unknown>;
  };
  passports: {
    get(id: string): Promise<unknown>;
    trust(id: string): Promise<unknown>;
    evidence(id: string): Promise<unknown>;
    risks(id: string): Promise<unknown>;
    history(id: string): Promise<unknown>;
    scan(id: string): Promise<{ passportId: string; jobId: string; status: string }>;
    recalculateTrust(id: string): Promise<unknown>;
  };
  jobs: {
    get(id: string): Promise<unknown>;
  };
}
export class SPRPublicClient {
  constructor(options: { baseUrl: string; fetchImpl?: typeof fetch });
  getPassport(id: string): Promise<unknown>;
}
