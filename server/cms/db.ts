export interface DbResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rows: Row[]
  rowCount: number
}

export interface DbClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<DbResult<Row>>
}
