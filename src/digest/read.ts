// Plan morning-digest § 1: runs/<night>.jsonl into one row per job.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunLine, RunStatus } from './types.js';

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'] satisfies RunStatus[];

const isStatus = (v: unknown): v is RunStatus => typeof v === 'string' && STATUSES.includes(v);

// Parse one log line at the edge; null when it isn't a valid RunLine.
export function parseLine(text: string): RunLine | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { at, job, status, owner, error } = raw as Record<string, unknown>;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  return error === undefined ? { at, job, status, owner } : { at, job, status, owner, error };
}

function toRow(job: string, lines: RunLine[]): DigestRow {
  // Time order by instant; ties keep log order (stable sort). `at` strings are kept as written.
  const ordered = [...lines].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  const lastWithError = ordered.findLast((l) => l.error !== undefined);
  return {
    job,
    owner: last.owner,
    runs: ordered.length,
    retries: ordered.filter((l) => l.status === 'retry').length,
    lastStatus: last.status,
    lastError: lastWithError?.error ?? null,
    firstAt: first.at,
    lastAt: last.at,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;

  const texts = readFileSync(file, 'utf8').split(/\r?\n/);
  // Blank trailing lines (including the one after the final newline) are not bad lines.
  while (texts.length > 0 && texts[texts.length - 1]!.trim() === '') texts.pop();

  const byJob = new Map<string, RunLine[]>();
  let badLines = 0;
  for (const text of texts) {
    const line = parseLine(text);
    if (line === null) {
      badLines++;
      continue;
    }
    const list = byJob.get(line.job);
    if (list) list.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows = [...byJob.entries()]
    .map(([job, lines]) => toRow(job, lines))
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { night, rows, badLines };
};
