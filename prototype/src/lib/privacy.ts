import { ApiError } from './security'

// This catches recognizable credentials. It cannot identify every confidential fact.
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\b(?:sk-[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  /\b(?:api[_ -]?key|access[_ -]?token|client[_ -]?secret|password|passwd)\s*[:=]\s*["']?(?!\[|<|your[_ -]|example|placeholder|changeme|test|dummy|redacted|none|null)[A-Za-z0-9_+/!@#$%^&*()=.-]{12,}/i,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/:]+:[^\s@]{4,}@/i,
]
export function assertNoRecognizableSecrets(...texts: string[]): void {
  if (texts.some(text => secretPatterns.some(pattern => pattern.test(text)))) {
    throw new ApiError(400, 'Remove credentials, private keys and sensitive connection details before using this workspace. Use synthetic task data and placeholders. This check cannot detect every confidential detail.', 'sensitive_content')
  }
}
