import { createMiddleware } from 'hono/factory';
import type { Env } from '../types.js';

type RateLimitEnv = {
  Bindings: Env;
};

interface RateLimitOptions {
  /** Max requests allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Key prefix for KV storage */
  prefix: string;
}

/**
 * Rate limiting middleware using Cloudflare KV.
 * Uses a sliding window counter per IP address.
 */
export function rateLimit(options: RateLimitOptions) {
  const { limit, windowSeconds, prefix } = options;

  return createMiddleware<RateLimitEnv>(async (c, next) => {
    const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown';
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % windowSeconds);
    const key = `${prefix}:${ip}:${windowStart}`;

    const current = await c.env.RATE_LIMIT.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= limit) {
      return c.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please try again later.',
          },
        },
        429,
      );
    }

    // Increment counter with TTL matching the window
    await c.env.RATE_LIMIT.put(key, String(count + 1), {
      expirationTtl: windowSeconds + 60, // extra minute buffer
    });

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(limit - count - 1));
    c.header('X-RateLimit-Reset', String(windowStart + windowSeconds));

    return next();
  });
}
