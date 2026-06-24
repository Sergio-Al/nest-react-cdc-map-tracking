/**
 * True if the error is a MySQL duplicate-key violation (ER_DUP_ENTRY / errno
 * 1062). TypeORM wraps the driver error, so check the common shapes. Used to
 * treat a redelivered, already-applied command as success rather than a
 * retryable DB error.
 */
export function isDuplicateKeyError(err: unknown): boolean {
  const e = err as { code?: string; errno?: number; driverError?: { code?: string; errno?: number } };
  return (
    e?.code === 'ER_DUP_ENTRY' ||
    e?.errno === 1062 ||
    e?.driverError?.code === 'ER_DUP_ENTRY' ||
    e?.driverError?.errno === 1062
  );
}
