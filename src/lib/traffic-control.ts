import { redis } from "@/lib/redis";
import { randomUUID } from "crypto";

const RELEASE_LOCK_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireLock(key: string, ttlMs: number) {
    const token = randomUUID();
    const result = await redis.set(key, token, "PX", ttlMs, "NX");
    if (result === "OK") return token;
    return null;
}

export async function releaseLock(key: string, token: string) {
    try {
        await redis.eval(RELEASE_LOCK_LUA, 1, key, token);
    } catch {
        // Best effort cleanup
    }
}

export async function waitForValue(key: string, timeoutMs: number, pollMs = 200) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await redis.get(key);
        if (value) return value;
        await sleep(pollMs);
    }
    return null;
}

/**
 * Circuit Breaker implementation using Redis.
 * Prevents cascading failures when external services are down or slow.
 */
export async function withCircuitBreaker<T>(serviceName: string, config: { failureThreshold?: number; resetTimeoutSec?: number } = { failureThreshold: 50, resetTimeoutSec: 60 }, work: () => Promise<T>) {
    const actualFailureThreshold = config.failureThreshold ?? 50;
    const actualResetTimeoutSec = config.resetTimeoutSec ?? 60;

    const stateKey = `cb:${serviceName}:state`; // OPEN or CLOSED
    const failureCountKey = `cb:${serviceName}:failures`;

    const state = await redis.get(stateKey);
    if (state === "OPEN") {
        throw new Error(`Service ${serviceName} is currently unavailable (Circuit Breaker OPEN)`);
    }

    try {
        const result = await work();
        // Success: clear failures if needed or keep it simple
        return result;
    } catch (error) {
        const failures = await redis.incr(failureCountKey);
        if (failures >= actualFailureThreshold) {
            await redis.set(stateKey, "OPEN", "EX", actualResetTimeoutSec);
            await redis.del(failureCountKey);
        }
        throw error;
    }
}

export async function rateLimitFixedWindow(key: string, limit: number, windowSec: number) {
    if (!Number.isFinite(limit) || limit <= 0) {
        return { allowed: true };
    }

    const count = await redis.incr(key);
    if (count === 1) {
        await redis.expire(key, windowSec);
    }

    return { allowed: count <= limit };
}

/**
 * Sliding Window Rate Limiter using Redis ZSET.
 * Much more accurate than fixed window.
 */
export async function rateLimitSlidingWindow(key: string, limit: number, windowSec: number) {
    if (!Number.isFinite(limit) || limit <= 0) {
        return { allowed: true };
    }

    const now = Date.now();
    const windowMs = windowSec * 1000;
    const min = now - windowMs;

    // Use a transaction to ensure atomicity
    const multi = redis.multi();
    multi.zremrangebyscore(key, 0, min); // 1. Remove old entries
    multi.zadd(key, now, `${now}-${Math.random()}`); // 2. Add current request
    multi.zcard(key); // 3. Count remaining
    multi.expire(key, windowSec + 1); // 4. Set expiry

    const results = await multi.exec();
    if (!results) return { allowed: false };

    // results[2][1] is the result of zcard
    const count = results[2][1] as number;
    return { allowed: count <= limit };
}

export async function withInflightLimiter<T>(key: string, maxConcurrent: number, ttlSec: number, work: () => Promise<T>) {
    if (!Number.isFinite(maxConcurrent) || maxConcurrent <= 0) {
        return work();
    }

    const current = await redis.incr(key);
    if (current === 1) {
        await redis.expire(key, ttlSec);
    }

    if (current > maxConcurrent) {
        await redis.decr(key);
        throw new Error("Sistem yoğun. Lütfen biraz sonra tekrar deneyin.");
    }

    try {
        return await work();
    } finally {
        await redis.decr(key);
    }
}
