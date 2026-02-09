declare module 'pg' {
  export interface PoolConfig {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  }

  export interface QueryResult<T = any> {
    rows: T[];
    rowCount: number | null;
  }

  export interface PoolClient {
    query(sql: string, params?: any[]): Promise<QueryResult>;
    release(): void;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    connect(): Promise<PoolClient>;
    query(sql: string, params?: any[]): Promise<QueryResult>;
    end(): Promise<void>;
  }
}
