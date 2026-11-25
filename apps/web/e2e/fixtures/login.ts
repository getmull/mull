export async function loginFixture(context: import('@playwright/test').BrowserContext) {
  const token = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: '11111111-1111-4111-8111-111111111111', exp: 4102444800 })).toString('base64url'),
    'fixture',
  ].join('.')
  const session = { access_token: token, refresh_token: 'fixture', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user: { id: '11111111-1111-4111-8111-111111111111' } }
  await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain: 'localhost', path: '/' }])
}

