// Test-only Supabase HTTP fixture. Exercises Next handlers and PDF.js without
// Docker or credentials; it does not verify Postgres migrations or RLS.
import http from 'node:http'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const userId = '11111111-1111-4111-8111-111111111111'
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'reader@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const tables = { documents: [], document_pages: [], bookmarks: [], highlights: [], notes: [] }
const files = new Map()
const port = 54329
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') { res.end(); return }
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = Buffer.concat(chunks)
  const json = (value, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(value))
  }
  if (url.pathname === '/reset' && req.method === 'POST') {
    Object.values(tables).forEach((rows) => rows.splice(0))
    files.clear()
    json({ ok: true }); return
  }
  if (url.pathname === '/auth/v1/user') { json(user); return }
  if (url.pathname.startsWith('/storage/v1/object/sign/')) {
    const key = decodeURIComponent(url.pathname.slice('/storage/v1/object/sign/'.length))
    if (req.method === 'POST') { json({ signedURL: `/object/sign/${key}?token=fixture` }); return }
    const file = files.get(key)
    if (!file) { json({ error: 'Not found' }, 404); return }
    res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(file); return
  }
  if (url.pathname.startsWith('/storage/v1/object/')) {
    const key = decodeURIComponent(url.pathname.slice('/storage/v1/object/'.length))
    files.set(key, body)
    json({ Key: key }); return
  }
  const table = url.pathname.split('/rest/v1/')[1]
  const rows = tables[table]
  if (!rows) { json({ error: `Unknown fixture endpoint ${url.pathname}` }, 404); return }
  const matches = (row) => [...url.searchParams].every(([key, value]) => !value.startsWith('eq.') || String(row[key]) === value.slice(3))
  let result = rows.filter(matches)
  if (req.method === 'POST') {
    const data = JSON.parse(body.toString())
    result = (Array.isArray(data) ? data : [data]).map((row) => ({
      ...(table === 'documents' ? { reading_state: 'unread', progress_pct: 0, page_count: null, last_page: null, last_read_at: null, is_scanned: false } : {}),
      id: randomUUID(), created_at: new Date().toISOString(), ...row,
    }))
    rows.push(...result)
  }
  if (req.method === 'PATCH') result.forEach((row) => Object.assign(row, JSON.parse(body.toString())))
  if (req.method === 'DELETE') result.forEach((row) => rows.splice(rows.indexOf(row), 1))
  const order = url.searchParams.get('order')
  if (order) {
    const [key, direction] = order.split('.')
    result.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (direction === 'desc' ? -1 : 1))
  }
  if (table === 'highlights' && req.method === 'GET') result = result.map((highlight) => ({ ...highlight, notes: tables.notes.filter((note) => note.highlight_id === highlight.id) }))
  if (req.headers.accept?.includes('vnd.pgrst.object')) {
    if (!result[0]) { json({ code: 'PGRST116', message: 'Not found' }, 406); return }
    json(result[0]); return
  }
  json(result)
})
server.listen(port, '127.0.0.1', () => {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--port', '3107'], {
    stdio: 'inherit',
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${port}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-key', AI_PROVIDER: '', PORT: '3107' },
  })
  child.on('exit', (code) => { server.close(); process.exit(code ?? 0) })
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { child.kill(signal); server.close() })
})
