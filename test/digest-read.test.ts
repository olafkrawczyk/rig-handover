import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28')!;

  it('has 5 jobs, sorted by job, and 1 bad line', () => {
    expect(night.night).toBe('2026-10-28');
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries, keeps the last error and the offsets', () => {
    expect(night.rows.find((r) => r.job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(night.rows.find((r) => r.job === 'lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
    expect(night.rows.find((r) => r.job === 'notes/backup')).toMatchObject({
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
  });

  it('keeps a row whose owner is null', () => {
    expect(night.rows.find((r) => r.job === 'digest/render')).toMatchObject({
      owner: null,
      runs: 1,
      lastError: null,
    });
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (night: string, text: string) => writeFileSync(join(dir, `${night}.jsonl`), text);
  const line = (o: object) => JSON.stringify(o);

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('an empty file gives no rows and no bad lines', () => {
    write('n', '');
    expect(readNight(dir, 'n')).toEqual({ night: 'n', rows: [], badLines: 0 });
  });

  it('blank trailing lines are not bad lines', () => {
    write('n', line({ at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'ok', owner: 'x' }) + '\n\n  \n');
    const n = readNight(dir, 'n')!;
    expect(n.badLines).toBe(0);
    expect(n.rows).toHaveLength(1);
  });

  it('counts bad JSON and missing or invalid fields, never throws', () => {
    write(
      'n',
      [
        '{not json',
        '[]',
        'null',
        line({ job: 'a', status: 'ok', owner: 'x' }),
        line({ at: 'yesterday', job: 'a', status: 'ok', owner: 'x' }),
        line({ at: '2026-10-28T23:00:00+01:00', status: 'ok', owner: 'x' }),
        line({ at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'done', owner: 'x' }),
        line({ at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'ok' }),
        line({ at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'ok', owner: 7 }),
        line({ at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'fail', owner: 'x', error: 42 }),
        line({ at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'ok', owner: 'x' }),
      ].join('\n'),
    );
    const n = readNight(dir, 'n')!;
    expect(n.badLines).toBe(10);
    expect(n.rows).toHaveLength(1);
  });

  it('takes last status, time and error in time order, not file order, and keeps offsets', () => {
    write(
      'n',
      [
        line({ at: '2026-10-29T02:00:00+01:00', job: 'a', status: 'retry', owner: 'x', error: 'late' }), // 01:00Z
        line({ at: '2026-10-29T00:30:00+01:00', job: 'a', status: 'fail', owner: 'y', error: 'early' }), // 23:30Z
        line({ at: '2026-10-29T00:30:00Z', job: 'a', status: 'ok', owner: 'z' }), // 00:30Z
      ].join('\n'),
    );
    expect(readNight(dir, 'n')!.rows).toEqual([
      {
        job: 'a',
        owner: 'x',
        runs: 3,
        retries: 1,
        lastStatus: 'retry',
        lastError: 'late',
        firstAt: '2026-10-29T00:30:00+01:00',
        lastAt: '2026-10-29T02:00:00+01:00',
      },
    ]);
  });

  it('lastError survives a later ok; null when no line had one', () => {
    write(
      'n',
      [
        line({ at: '2026-10-28T23:00:00+01:00', job: 'b', status: 'ok', owner: null }),
        line({ at: '2026-10-28T23:00:00+01:00', job: 'a', status: 'fail', owner: 'x', error: 'boom' }),
        line({ at: '2026-10-28T23:05:00+01:00', job: 'a', status: 'ok', owner: 'x' }),
      ].join('\n'),
    );
    const n = readNight(dir, 'n')!;
    expect(n.rows.map((r) => r.job)).toEqual(['a', 'b']);
    expect(n.rows[0]).toMatchObject({ lastStatus: 'ok', lastError: 'boom' });
    expect(n.rows[1]).toMatchObject({ owner: null, lastError: null });
  });
});
