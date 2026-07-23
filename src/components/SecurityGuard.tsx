import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Fingerprint, Loader2, LockKeyhole, LogOut, X } from 'lucide-react';
import { NativeLock } from '@/components/NativeLock';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { hasLocalPasskey, isPlatformAuthenticatorAvailable, registerLocalPasskey, verifyLocalPasskey } from '@/lib/webAuthn';
import { toast } from 'sonner';

const LOCK_AFTER_MS = 5 * 60 * 1000;
const SIGN_OUT_AFTER_MS = 30 * 60 * 1000;

export function SecurityGuard({ children }: { children: ReactNode }) {
  if (Capacitor.isNativePlatform()) {
    return <NativeLock>{children}</NativeLock>;
  }

  return <WebSessionLock>{children}</WebSessionLock>;
}

function WebSessionLock({ children }: { children: ReactNode }) {
  const { signOut, user } = useAuth();
  const [locked, setLocked] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [touchIdAvailable, setTouchIdAvailable] = useState(false);
  const [touchIdEnabled, setTouchIdEnabled] = useState(false);
  const [touchIdBusy, setTouchIdBusy] = useState(false);
  const [showTouchIdSetup, setShowTouchIdSetup] = useState(false);
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

  useEffect(() => {
    if (!user) return;
    let active = true;
    isPlatformAuthenticatorAvailable().then((available) => {
      if (!active) return;
      const enabled = hasLocalPasskey(user.id);
      setTouchIdAvailable(available);
      setTouchIdEnabled(enabled);
      setShowTouchIdSetup(available && !enabled && !sessionStorage.getItem('myfinstate-touchid-dismissed'));
    });
    return () => {
      active = false;
    };
  }, [user]);

  const enableTouchId = useCallback(async () => {
    if (!user) return;
    setTouchIdBusy(true);
    try {
      await registerLocalPasskey(user.id, user.email || 'MyFinState');
      setTouchIdEnabled(true);
      setShowTouchIdSetup(false);
      toast.success('Touch ID is ingeschakeld op deze Mac');
    } catch (error) {
      toast.error('Touch ID inschakelen mislukt', {
        description: error instanceof Error ? error.message : 'Probeer opnieuw in Safari of Chrome op je MacBook.',
      });
    } finally {
      setTouchIdBusy(false);
    }
  }, [user]);

  const unlockWithTouchId = useCallback(async () => {
    if (!user) return;
    setTouchIdBusy(true);
    try {
      await verifyLocalPasskey(user.id);
      lastActivityRef.current = Date.now();
      setLocked(false);
      toast.success('Ontgrendeld met Touch ID');
    } catch (error) {
      toast.error('Touch ID ontgrendeling mislukt', {
        description: error instanceof Error ? error.message : 'Gebruik opnieuw inloggen als fallback.',
      });
    } finally {
      setTouchIdBusy(false);
    }
  }, [user]);

  const dismissTouchIdSetup = () => {
    sessionStorage.setItem('myfinstate-touchid-dismissed', '1');
    setShowTouchIdSetup(false);
  };

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

  if (!locked) return (
    <>
      {children}
      {showTouchIdSetup && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-3xl border border-border/70 bg-card p-4 text-card-foreground shadow-xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Fingerprint className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Touch ID op deze Mac</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Ontgrendel MyFinState voortaan met je vingerafdruk na automatische vergrendeling.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => void enableTouchId()} disabled={touchIdBusy}>
                  {touchIdBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                  Inschakelen
                </Button>
                <Button size="sm" variant="ghost" onClick={dismissTouchIdSetup}>Later</Button>
              </div>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={dismissTouchIdSetup}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
          <LockKeyhole className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">MyFinState is vergrendeld</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Je financiële gegevens zijn verborgen na 5 minuten inactiviteit.
          {touchIdEnabled ? ' Ontgrendel met Touch ID of log opnieuw in.' : ' Log opnieuw in om verder te werken.'}
        </p>
        {touchIdAvailable && touchIdEnabled && (
          <Button className="mt-6 h-12 rounded-2xl px-6" onClick={() => void unlockWithTouchId()} disabled={touchIdBusy}>
            {touchIdBusy ? <Loader2 className="animate-spin" /> : <Fingerprint />}
            Ontgrendel met Touch ID
          </Button>
        )}
        <Button variant={touchIdEnabled ? 'outline' : 'default'} className={touchIdEnabled ? 'mt-3 h-12 rounded-2xl px-6' : 'mt-6 h-12 rounded-2xl px-6'} onClick={() => void secureSignOut()} disabled={signingOut}>
          {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
          Opnieuw inloggen
        </Button>
      </div>
    </div>
  );
}
