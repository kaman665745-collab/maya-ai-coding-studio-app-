import 'dotenv/config';
import path from 'node:path';
import cors from '@fastify/cors';
import middie from '@fastify/middie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { createServer as createViteServer } from 'vite';
import { registerV1Routes } from './src/server/routes/v1.ts';
import { previewManager } from './src/server/services/previewManager.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'warn',
    },
    disableRequestLogging: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 180,
    timeWindow: '1 minute',
  });

  // Register versioned REST + SSE API under /api/v1
  await app.register(registerV1Routes, { prefix: '/api/v1' });

  // Serve real sandbox-bundled preview HTML under /preview/:sessionId/*
  app.get('/preview/:sessionId/*', async (request, reply) => {
    const params = request.params as { sessionId: string };
    const asset = previewManager.getSessionAsset(params.sessionId);
    if (!asset) {
      return reply
        .code(404)
        .type('text/html; charset=utf-8')
        .send('<html><body style="background:#0b0f17;color:#cbd5e1;font-family:sans-serif;padding:24px;"><h3>Preview session stopped or expired.</h3></body></html>');
    }
    return reply.code(200).type('text/html; charset=utf-8').send(asset.html);
  });

  if (!isProduction) {
    await app.register(middie);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use((req, res, next) => {
      const url = req.url || '';
      if (url.startsWith('/api/') || url.startsWith('/preview/')) {
        next();
        return;
      }
      vite.middlewares(req, res, next);
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    await app.register(fastifyStatic, {
      root: distDir,
      prefix: '/',
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/preview/')) {
        return reply.code(404).send({ error: 'Not Found' });
      }
      return reply.sendFile('index.html');
    });
  }

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Advanced Coding Studio server listening on http://0.0.0.0:${PORT}`);
}

bootstrap().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
