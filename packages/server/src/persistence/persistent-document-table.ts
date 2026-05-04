const LOCK_NAMESPACE = 42871;
const LOCK_KEY = 1001;

const CREATE_PERSISTENT_DOCUMENTS_SQL = `
  CREATE TABLE IF NOT EXISTS persistent_documents (
    scope varchar(64) NOT NULL,
    key varchar(100) NOT NULL,
    payload jsonb NOT NULL,
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, key)
  )
`;

interface PersistentDocumentClient {
  query(sql: string, params?: readonly unknown[]): Promise<unknown>;
  release(): void;
}

interface PersistentDocumentPool {
  connect(): Promise<PersistentDocumentClient>;
}

export async function ensurePersistentDocumentsTable(pool: PersistentDocumentPool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [LOCK_NAMESPACE, LOCK_KEY]);
    await client.query(CREATE_PERSISTENT_DOCUMENTS_SQL);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1, $2)', [LOCK_NAMESPACE, LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
