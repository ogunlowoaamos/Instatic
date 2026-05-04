import { SQL } from 'bun'

export interface DbResult<Row = Record<string, unknown>> {
  rows: Row[]
  rowCount: number
}

/**
 * The shared DB client interface. Used by repositories and handlers.
 * Tagged-template callable returning DbResult, plus `.unsafe()` for
 * executing raw SQL strings (e.g. stored migration blocks) and
 * `.transaction()` that fixes the cross-connection transaction bug from
 * the old pg-Pool API.
 */
export interface DbClient {
  <Row = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<DbResult<Row>>
  unsafe<Row = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<DbResult<Row>>
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>
}

export function createDbClient(connectionString: string): DbClient {
  const sql = new SQL(connectionString)
  return wrapSql(sql)
}

function wrapSql(sql: SQL): DbClient {
  const fn = (async <Row>(strings: TemplateStringsArray, ...values: unknown[]) => {
    const rows = await sql<Row[]>(strings, ...values)
    return { rows, rowCount: rows.length }
  }) as DbClient

  fn.unsafe = async <Row = Record<string, unknown>>(rawSql: string, params?: unknown[]): Promise<DbResult<Row>> => {
    const rows = params !== undefined
      ? await sql.unsafe<Row[]>(rawSql, params as unknown[])
      : await sql.unsafe<Row[]>(rawSql)
    return { rows, rowCount: rows.length }
  }

  fn.transaction = async <T>(cb: (tx: DbClient) => Promise<T>): Promise<T> => {
    return await sql.begin(async (txSql) => cb(wrapSql(txSql as unknown as SQL)))
  }
  return fn
}
