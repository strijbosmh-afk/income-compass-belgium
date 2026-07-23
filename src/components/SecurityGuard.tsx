import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Loader2, LockKeyhole, LogOut } from 'lucide-react';
import { NativeLock } from '@/components/NativeLock';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

const LOCK_AFTER_MS = 5 * 60 * 1000;
const SIGN_OUT_AFTER_MS = 30 * 60 * 1000;

export function SecurityGuard({ children }: { children: ReactNode }) {
  if (Capacitor.isNativePlatform()) {
    return <NativeLock>{children}</NativeLock>;
  }

  return <WebSessionLock>{children}</WebSessionLock>;
}

function WebSessionLock({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const [locked, setLocked] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const signingOutRef = useRef(false);

  const secureSignOut = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      window.location.href = '/login';
    }
  }, [signOut]);

  const evaluateIdleState = useCallback(() => {
    const idleFor = Date.now() - lastActivityRef.current;
    if (idleFor >= SIGN_OUT_AFTER_MS) {
      void secureSignOut();
      return;
    }
    if (idleFor >= LOCK_AFTER_MS) setLocked(true);
  }, [secureSignOut]);

  useEffect(() => {
    const noteActivity = () => {
      if (locked || signingOutRef.current) return;
      lastActivityRef.current = Date.now();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') evaluateIdleState();
    };

    const events = ['pointerdown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach((eventName) => window.addEventListener(eventName, noteActivity, { passive: true }));
    window.addEventListener('focus', evaluateIdleState);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = window.setInterval(evaluateIdleState, 30 * 1000);

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, noteActivity));
      window.removeEventListener('focus', evaluateIdleState);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(interval);
    };
  }, [evaluateIdleState, locked]);

  if (!locked) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
          <LockKeyhole className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">MyFinState is vergrendeld</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Je financiële gegevens zijn verborgen na 5 minuten inactiviteit. Log opnieuw in om verder te werken.
        </p>
        <Button className="mt-6 h-12 rounded-2xl px-6" onClick={() => void secureSignOut()} disabled={signingOut}>
          {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
          Opnieuw inloggen
        </Button>
      </div>
    </div>
  );
}
