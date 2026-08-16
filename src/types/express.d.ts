import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    sprApi: {
      id: string;
      tenantId: string;
      name: string;
      scopes: string[];
    };
  }
}
