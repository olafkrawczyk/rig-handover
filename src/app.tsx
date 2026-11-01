import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { nightCounts, type NightCounts } from './digest/counts.js';
import { lane } from './lane.js';
import { readNight } from './digest/read.js';
import { readStatus } from './status.js';
import { DigestTable, NoNight } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) => {
    const status = readStatus(config);
    const counts: Record<string, NightCounts | null> = {};
    for (const n of status.nights) {
      const night = readNight(config.runsDir, n);
      counts[n] = night ? nightCounts(night) : null;
    }
    return c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={status} counts={counts} />
      </Layout>,
    );
  });

  app.get('/digest/:night', (c) => {
    const id = c.req.param('night');
    const night = /^\d{4}-\d{2}-\d{2}$/.test(id) ? readNight(config.runsDir, id) : null;
    if (!night) {
      return c.html(
        <Layout title={`digest · ${id}`} lane={lane()}>
          <NoNight night={id} />
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest · ${id}`} lane={lane()}>
        <DigestTable night={night} />
      </Layout>,
    );
  });

  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    const data = /^\d{4}-\d{2}-\d{2}$/.test(night) ? readNight(config.runsDir, night) : null;
    if (!data) return c.json({ error: 'no such night', night }, 404);
    return c.json(data);
  });

  return app;
}
