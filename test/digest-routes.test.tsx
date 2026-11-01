import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const NIGHT = '2026-10-28';
const lines = [
  '{"at":"2026-10-28T23:00:02+01:00","job":"b/job","status":"ok","owner":null}',
  '{"at":"2026-10-28T23:05:00+01:00","job":"a/job","status":"retry","owner":"x","error":"boom"}',
  '{"at":"2026-10-28T23:09:00+01:00","job":"a/job","status":"ok","owner":"x"}',
  '{"at":"2026-10-28T23:10:00+01:00","job":"c/job","status":"fail","owner":"y","error":"bad"}',
];

let dir: string;
let app: ReturnType<typeof createApp>;

function write(night: string, content: string) {
  fs.writeFileSync(path.join(dir, `${night}.jsonl`), content);
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'digest-routes-'));
  write(NIGHT, lines.join('\n') + '\n');
  write('2026-10-27', '');
  write('2026-10-26', [lines[0], lines[1], '{"at":"2026-10-26T23:00:02+01:00","job":"tr', lines[3]].join('\n'));
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

type Body = { night: string; rows: DigestRow[]; badLines: number };

describe('GET /digest/:night', () => {
  it('renders every job', async () => {
    const res = await app.request(`/digest/${NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['a/job', 'b/job', 'c/job']) expect(html).toContain(job);
  });

  it('404s when the night has no file', async () => {
    expect((await app.request('/digest/2020-01-01')).status).toBe(404);
  });

  it('says nothing ran for an empty file', async () => {
    const res = await app.request('/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('survives a truncated line and still renders valid jobs', async () => {
    const res = await app.request('/digest/2026-10-26');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['a/job', 'b/job', 'c/job']) expect(html).toContain(job);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns rows sorted by job', async () => {
    const res = await app.request(`/api/digest/${NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.night).toBe(NIGHT);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['a/job', 'b/job', 'c/job']);
    expect(body.rows.find((r) => r.job === 'b/job')?.owner).toBeNull();
  });

  it('404s when the night has no file', async () => {
    expect((await app.request('/api/digest/2020-01-01')).status).toBe(404);
  });

  it('returns no rows and no bad lines for an empty file', async () => {
    const res = await app.request('/api/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-10-27', rows: [], badLines: 0 });
  });

  it('counts a truncated line and keeps valid rows', async () => {
    const res = await app.request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['a/job', 'b/job', 'c/job']);
  });
});

describe('page and JSON agree', () => {
  it('lists jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${NIGHT}`)).text();
    const body = (await (await app.request(`/api/digest/${NIGHT}`)).json()) as Body;
    const positions = body.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
