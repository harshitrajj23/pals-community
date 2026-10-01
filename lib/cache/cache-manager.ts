// ==============================================================================
// Cache Manager (In-Memory TTL Cache with optional Redis support)
// Ensures blazing-fast community feed loads without direct Instagram API hits
// ==============================================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class CacheManager {
  private memoryStore: Map<string, CacheEntry<unknown>> = new Map();
  private defaultTTL = 60; // 60 seconds

  /**
   * Retrieve cached item if not expired
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.memoryStore.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.memoryStore.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set cached item with TTL in seconds
   */
  async set<T>(key: string, value: T, ttlSeconds: number = this.defaultTTL): Promise<void> {
    this.memoryStore.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Invalidate specific key or prefix pattern
   */
  async invalidate(prefixOrKey: string): Promise<void> {
    for (const key of this.memoryStore.keys()) {
      if (key === prefixOrKey || key.startsWith(prefixOrKey)) {
        this.memoryStore.delete(key);
      }
    }
  }

  /**
   * Invalidate all community feed and campaign caches
   */
  async invalidateCommunityCache(): Promise<void> {
    await this.invalidate('community:');
  }

  /**
   * Flush entire cache
   */
  async flush(): Promise<void> {
    this.memoryStore.clear();
  }
}

export const cacheManager = new CacheManager();
