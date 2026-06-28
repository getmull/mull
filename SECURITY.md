# Security Policy

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's [private vulnerability reporting](https://github.com/[org]/mull/security/advisories/new) to report a vulnerability confidentially. You can also email **security@getmull.com**.

Include:
- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You'll receive an acknowledgement within 48 hours and a status update within 7 days. We'll coordinate a disclosure timeline with you before anything is made public.

## Scope

In scope:
- Authentication and authorization bypass
- Data access across user accounts (RLS violations)
- File upload vulnerabilities (path traversal, malicious file execution)
- SQL injection or query manipulation
- API key or credential exposure
- XSS in the document reader or AI responses

Out of scope:
- Vulnerabilities in third-party services (Supabase, Anthropic, ElevenLabs)
- Denial of service attacks
- Social engineering
- Spam or abuse of AI features

## Supported Versions

Only the latest release receives security fixes.

## Disclosure Policy

Once a fix is confirmed and deployed, we will publish a GitHub Security Advisory crediting the reporter (unless you prefer to remain anonymous).
