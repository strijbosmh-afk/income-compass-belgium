import { useEffect, useState } from 'react';

/**
 * Lightweight global data-version store.
 * Pages that fetch derived data (Dashboard, Records, Statistics, Simulations, Export)
 * include `version` in their effect dependencies, so calling `bumpDataVersion()`
 * after mutations triggers an automatic refresh everywhere.
 */
let currentVersion = 0;
const listeners = new Set<(v: number) => void>();

export function bumpDataVersion() {
  currentVersion += 1;
  listeners.forEach((l) => l(currentVersion));
}

export function useDataVersion(): number {
  const [v, setV] = useState(currentVersion);
  useEffect(() => {
    const fn = (nv: number) => setV(nv);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return v;
}
