import { createServer, type Server } from 'node:http';

/**
 * Minimal HTTP health server for Fly.io TCP/HTTP checks. Kept dependency-free
 * and separate from the queue processors so liveness never depends on Redis.
 */
export function startHealthServer(port = 8080): Server {
  const server = createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', ts: new Date().toISOString() }));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(port);
  return server;
}
