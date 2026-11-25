// Deterministic OpenAI-compatible provider for browser tests. No external calls.
import http from 'node:http'
http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'GET') { res.end('{"ok":true}'); return }
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const request = JSON.parse(Buffer.concat(chunks).toString())
    const prompt = request.messages.map((message) => typeof message.content === 'string' ? message.content : '').join('\n')
    const sources = prompt.split('=== Document ===')[1]?.split('=== Recent conversation ===')[0]?.split('=== Question ===')[0] ?? ''
    const question = prompt.split('=== Question ===').at(-1) ?? ''
    const found = sources.includes('--- Page 76 ---') && sources.includes('The zirconium catalyst reduced reaction time by forty percent.')
    const answer = {
      answer: found ? 'It reduced reaction time by forty percent.' : 'I could not find that in the provided passages.',
      foundInDocument: found,
      citations: found ? [{ page: question.includes('invalid citation') ? 9999 : 76, quote: 'The zirconium catalyst reduced reaction time by forty percent.' }] : [],
    }
    res.end(JSON.stringify({
      id: 'fixture-completion', object: 'chat.completion', created: 1, model: 'local-fixture',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(answer) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
    }))
  } catch {
    res.writeHead(400); res.end('{"error":{"message":"Invalid test request"}}')
  }
}).listen(4123, '127.0.0.1')
