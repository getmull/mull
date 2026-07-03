// Test-only helpers for mocking `@/lib/supabase/server`'s createClient().
// Supabase's query builder is chainable *and* thenable — every method
// returns `this`, and awaiting the builder itself resolves `{ data, error }`.
// `single()` breaks the chain and resolves directly.

type QueryResult<T = unknown> = { data: T; error: unknown }

export function chainable<T = unknown>(result: QueryResult<T> = { data: null as T, error: null }) {
  const builder: Record<string, unknown> = {}
  const chainMethods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'order', 'limit']
  for (const method of chainMethods) {
    builder[method] = jest.fn(() => builder)
  }
  builder.single = jest.fn(() => Promise.resolve(result))
  builder.then = (
    onfulfilled?: ((value: QueryResult<T>) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null
  ) => Promise.resolve(result).then(onfulfilled, onrejected)
  return builder
}

export function chainableStorage(overrides: {
  upload?: QueryResult
  createSignedUrl?: { data: { signedUrl: string } | null; error: unknown }
} = {}) {
  return {
    upload: jest.fn().mockResolvedValue(overrides.upload ?? { data: {}, error: null }),
    createSignedUrl: jest
      .fn()
      .mockResolvedValue(overrides.createSignedUrl ?? { data: { signedUrl: 'https://signed.example/file.pdf' }, error: null }),
  }
}

interface MockSupabaseOptions {
  user?: { id: string } | null
  /** Results returned by successive `.from(...)` calls, in call order. */
  fromResults?: QueryResult[]
  storage?: Parameters<typeof chainableStorage>[0]
}

export function mockSupabaseClient({ user = { id: 'user-1' }, fromResults = [], storage }: MockSupabaseOptions = {}) {
  const from = jest.fn()
  for (const result of fromResults) {
    from.mockReturnValueOnce(chainable(result))
  }

  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    from,
    storage: { from: jest.fn().mockReturnValue(chainableStorage(storage)) },
  }
}
