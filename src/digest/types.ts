// Plan morning-digest § 1. The contract every part of § 2 starts against: one row per job for
// one night of runs/<night>.jsonl.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One parsed line of the run log.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

export type DigestRow = {
  job: string;
  // null renders as `—`; the row is kept.
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  // Error of the last line that had one; null when none did.
  lastError: string | null;
  // As written in the log, offset kept; never converted to UTC.
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  // Sorted by job.
  rows: DigestRow[];
  // Lines that didn't parse: counted, never thrown.
  badLines: number;
};

// Returns null when runs/<night>.jsonl doesn't exist (the routes answer 404).
export type ReadNight = (runsDir: string, night: string) => Night | null;
