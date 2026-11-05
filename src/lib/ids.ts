export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion

/** Human-friendly ticket code, e.g. "DT-7KQ4-M2XP" */
export function ticketCode(rand: () => number = Math.random): string {
  const pick = () => CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  const chunk = () => Array.from({ length: 4 }, pick).join('');
  return `DT-${chunk()}-${chunk()}`;
}

export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^DT/, 'DT-').replace(/^(DT-[A-Z0-9]{4})/, '$1-');
}
