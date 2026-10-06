import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../services/lanDatabase';

interface PerfMetrics {
  ipcDurationMs: number;
  reloadCount: number;
  sqlQueryCount: number;
  recordsReturned: number;
  concurrentLoads: number;
  lastError: string | null;
}

const globalMetrics: PerfMetrics = {
  ipcDurationMs: 0,
  reloadCount: 0,
  sqlQueryCount: 0,
  recordsReturned: 0,
  concurrentLoads: 0,
  lastError: null,
};

let activeLoads = 0;

export function getPerfMetrics(): PerfMetrics {
  return { ...globalMetrics };
}

export function resetPerfMetrics(): void {
  globalMetrics.ipcDurationMs = 0;
  globalMetrics.reloadCount = 0;
  globalMetrics.sqlQueryCount = 0;
  globalMetrics.recordsReturned = 0;
  globalMetrics.concurrentLoads = 0;
  globalMetrics.lastError = null;
  activeLoads = 0;
}

interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  subscribers: Set<number>;
  inFlightPromise: Promise<T> | null;
  pollingTimer: ReturnType<typeof setInterval> | null;
  listenerCleanup: (() => void) | null;
  lastFetcher: (() => Promise<T>) | null;
}

const resourceRegistry = new Map<string, ResourceState<any>>();
let subscriberIdCounter = 0;

function getResourceKey(fetcher: () => Promise<any>): string {
  const str = fetcher.toString();
  const match = str.match(/db\.(\w+)\.list\(\)/);
  if (match) return match[1];
  return `unknown_${Math.random().toString(36).slice(2, 9)}`;
}

function getOrCreateResource<T>(key: string, fetcher: () => Promise<T>): ResourceState<T> {
  let resource = resourceRegistry.get(key) as ResourceState<T> | undefined;
  if (!resource) {
    resource = {
      data: null,
      loading: true,
      error: null,
      subscribers: new Set(),
      inFlightPromise: null,
      pollingTimer: null,
      listenerCleanup: null,
      lastFetcher: fetcher,
    };
    resourceRegistry.set(key, resource);
  }
  return resource;
}

function startPolling<T>(resource: ResourceState<T>, fetcher: () => Promise<T>): void {
  if (resource.pollingTimer) return;
  resource.pollingTimer = setInterval(() => {
    triggerLoad(resource, fetcher, true);
  }, 10_000);
}

function stopPolling(resource: ResourceState<any>): void {
  if (resource.pollingTimer) {
    clearInterval(resource.pollingTimer);
    resource.pollingTimer = null;
  }
}

function startListener<T>(resource: ResourceState<T>, fetcher: () => Promise<T>): void {
  if (resource.listenerCleanup) return;
  resource.listenerCleanup = db.data.onChanged(() => {
    triggerLoad(resource, fetcher, true);
  });
}

function stopListener(resource: ResourceState<any>): void {
  if (resource.listenerCleanup) {
    resource.listenerCleanup();
    resource.listenerCleanup = null;
  }
}

async function triggerLoad<T>(
  resource: ResourceState<T>,
  fetcher: () => Promise<T>,
  silent: boolean
): Promise<T | null> {
  if (resource.inFlightPromise) {
    return resource.inFlightPromise;
  }

  activeLoads++;
  globalMetrics.concurrentLoads = Math.max(globalMetrics.concurrentLoads, activeLoads);

  const start = performance.now();
  resource.inFlightPromise = (async () => {
    try {
      const result = await fetcher();
      const duration = performance.now() - start;
      globalMetrics.ipcDurationMs += duration;
      globalMetrics.reloadCount++;
      globalMetrics.lastError = null;

      if (Array.isArray(result)) {
        globalMetrics.recordsReturned += result.length;
      } else if (result && typeof result === 'object') {
        globalMetrics.recordsReturned += 1;
      }

      resource.data = result;
      resource.error = null;
      resource.loading = false;
      notifySubscribers(resource);
      return result;
    } catch (e: any) {
      globalMetrics.lastError = e.message ?? 'Erro desconhecido';
      resource.error = globalMetrics.lastError;
      resource.loading = false;
      notifySubscribers(resource);
      throw e;
    } finally {
      activeLoads--;
      resource.inFlightPromise = null;
    }
  })();

  if (!silent) {
    resource.loading = true;
    notifySubscribers(resource);
  }

  return resource.inFlightPromise;
}

function notifySubscribers<T>(resource: ResourceState<T>): void {
  for (const id of resource.subscribers) {
    const subscriber = subscriberMap.get(id);
    if (subscriber) {
      subscriber.forceUpdate();
    }
  }
}

interface Subscriber {
  forceUpdate: () => void;
}

const subscriberMap = new Map<number, Subscriber>();

export function useData<T>(fetcher: () => Promise<T>, deps: any[] = []) {
  const [, setTick] = useState(0);
  const subscriberIdRef = useRef(0);
  const resourceKeyRef = useRef('');
  const fetcherRef = useRef(fetcher);
  const depsRef = useRef(deps);

  fetcherRef.current = fetcher;
  depsRef.current = deps;

  const forceUpdate = useCallback(() => {
    setTick(t => t + 1);
  }, []);

  useEffect(() => {
    const key = getResourceKey(fetcher);
    resourceKeyRef.current = key;
    const resource = getOrCreateResource(key, fetcher);
    const id = ++subscriberIdCounter;
    subscriberIdRef.current = id;

    resource.subscribers.add(id);
    subscriberMap.set(id, { forceUpdate });

    if (!resource.listenerCleanup) {
      startListener(resource, fetcher);
    }
    if (!resource.pollingTimer) {
      startPolling(resource, fetcher);
    }

    if (resource.inFlightPromise) {
      resource.inFlightPromise.finally(() => forceUpdate());
    } else if (resource.data === null && resource.error === null) {
      triggerLoad(resource, fetcher, false);
    }

    return () => {
      resource.subscribers.delete(id);
      subscriberMap.delete(id);

      if (resource.subscribers.size === 0) {
        stopPolling(resource);
        stopListener(resource);
        resourceRegistry.delete(key);
      }
    };
  }, [forceUpdate]);

  const load = useCallback(async (silent = false) => {
    const key = resourceKeyRef.current;
    const resource = resourceRegistry.get(key) as ResourceState<T> | undefined;
    if (!resource) return;

    const currentFetcher = fetcherRef.current;
    resource.lastFetcher = currentFetcher;
    await triggerLoad(resource, currentFetcher, silent);
  }, []);

  useEffect(() => {
    const key = resourceKeyRef.current;
    const resource = resourceRegistry.get(key) as ResourceState<T> | undefined;
    if (resource && resource.lastFetcher !== fetcherRef.current) {
      resource.lastFetcher = fetcherRef.current;
      triggerLoad(resource, fetcherRef.current, false);
    }
  }, deps);

  const key = resourceKeyRef.current;
  const resource = resourceRegistry.get(key) as ResourceState<T> | undefined;

  if (!resource) {
    return { data: null, loading: true, error: null, reload: load };
  }

  return {
    data: resource.data,
    loading: resource.loading,
    error: resource.error,
    reload: load,
  };
}