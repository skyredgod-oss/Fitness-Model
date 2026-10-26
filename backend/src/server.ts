import app from './app.js';
import { db } from './core.js';
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, '0.0.0.0', () =>
  console.log(`WU Fitness API listening on port ${port}`),
);
const cleanup = setInterval(
  () => db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {}),
  3600000,
);
cleanup.unref();
process.on('SIGTERM', () => server.close(() => db.$disconnect().then(() => process.exit(0))));
