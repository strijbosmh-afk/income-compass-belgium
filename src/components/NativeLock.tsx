import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { Loader2, LockKeyhole, ScanFace } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NativeLock({ children }: { children: ReactNode }) {
  const isNative = Capacitor.isNativePlatform();
  const [locked, setLocked] = useState(isNative);
  const [checking, setChecking] = useState(isNative);
  const [available, setAvailable] = useState(false);
  const authenticatingRef = useRef(false);
  const unlockedRef = useRef(!isNative);
  const backgroundedAtRef = useRef<number | null>(null);
  const lastUnlockedAtRef = useRef<number>(0);

  const unlock = useCallback(async () => {
    if (!isNative || authenticatingRef.current) return;
    authenticatingRef.current = true;
    setChecking(true);
    try {
      const status = await NativeBiometric.isAvailable({ useFallback: true });
      setAvailable(status.isAvailable);
      if (!status.isAvailable) {
        setLocked(true);
        return;
      }
      await NativeBiometric.verifyIdentity({
        reason: 'Ontgrendel MedIncome om je financiële gegevens te bekijken.',
        title: 'Ontgrendel MedIncome',
        useFallback: true,
        fallbackTitle: 'Gebruik toegangscode',
      });
      unlockedRef.current = true;
      lastUnlockedAtRef.current = Date.now();
      backgroundedAtRef.current = null;
      setLocked(false);
    } catch {
      unlockedRef.current = false;
      setLocked(true);
    } finally {
      authenticatingRef.current = false;
      setChecking(false);
    }
  }, [isNative]);

  useEffect(() => {
    if (!isNative) return;
    void unlock();
    const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        if (Date.now() - lastUnlockedAtRef.current < 2500) return;
        // The native Face ID sheet briefly makes the app inactive. Do not let
        // that system transition relock the app while authentication is active.
        if (!authenticatingRef.current) backgroundedAtRef.current = Date.now();
        return;
      }

      const backgroundedAt = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      const wasActuallyBackgrounded = backgroundedAt !== null && Date.now() - backgroundedAt > 2500;

      if (wasActuallyBackgrounded && unlockedRef.current) {
        unlockedRef.current = false;
        setLocked(true);
        void unlock();
      }
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, [isNative, unlock]);

  if (!isNative || !locked) return <>{children}</>;

  return (
    <div className="native-lock-screen">
      <div className="native-lock-icon">
        {available ? <ScanFace className="h-9 w-9" /> : <LockKeyhole className="h-8 w-8" />}
      </div>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">MedIncome is vergrendeld</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Gebruik Face ID of je toegangscode om je financiële gegevens te openen.
        </p>
      </div>
      <Button size="lg" className="min-w-52 rounded-2xl" onClick={() => void unlock()} disabled={checking}>
        {checking ? <Loader2 className="animate-spin" /> : <ScanFace />}
        {checking ? 'Controleren…' : 'Ontgrendel'}
      </Button>
    </div>
  );
}
