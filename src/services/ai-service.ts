// ═══════════════════════════════════════════════════════
// AI SERVICE — Claude API integration
// Ported from original sap-migration-studio-v3.html
// ═══════════════════════════════════════════════════════

import type { MigrationState } from '../store/migration-store';

export async function ai(
  prompt: string,
  aiLog: MigrationState['aiLog'],
  maxTok = 1000
): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTok,
      system: 'You are a senior SAP S/4HANA data migration consultant with 20 years of hands-on experience.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  const t = (d.content || []).map((b: { text?: string }) => b.text || '').join('');
  aiLog.push({
    ts: new Date().toISOString(),
    p: prompt.slice(0, 120) + '…',
    r: t.slice(0, 250) + '…',
  });
  return t;
}

export function parseAI(t: string): Record<string, unknown> | Record<string, unknown>[] | null {
  const c = t.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const a = c.search(/[[\{]/);
  const b = Math.max(c.lastIndexOf(']'), c.lastIndexOf('}')) + 1;
  try {
    return JSON.parse(c.slice(a, b));
  } catch {
    return null;
  }
}
