import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { Button } from '@/components/ui/button';
import { Loader2, LockKeyhole, ScanFace } from 'lucide-react';

export const LOCK_APP_EVENT = 'medincome:lock';

export function NativeSecurityGate({ children }: { children: ReactNode }) {
  const isNative = Capacitor.isNativePlatform();
  const [locked, setLocked] = useState(isNative);
  const [authenticating, setAuthenticating] = useState(false);
  const [message, setMessage] = useState('Ontgrendel met Face ID om verder te gaan.');
  const authenticatingRef = useRef(false);

  const unlock = useCallback(async () => {
    if (!isNative || authenticatingRef.current) return;
    authenticatingRef.current = true;
    setAuthenticating(true);
    setMessage('Face ID controleren...');

    try {
      const availability = await BiometricAuth.checkBiometry();
      if (!availability.isAvailable && !availability.deviceIsSecure) {
        setMessage('Stel Face ID of een toegangscode in op dit toestel.');
        return;
      }

      await BiometricAuth.authenticate({
        reason: 'Ontgrendel je financiële gegevens',
        cancelTitle: 'Annuleer',
        allowDeviceCredential: true,
        iosFallbackTitle: 'Gebruik toegangscode',
      });
      setLocked(false);
    } catch {
      setMessage('Authenticatie geannuleerd. Probeer opnieuw.');
    } finally {
      authenticatingRef.current = false;
      setAuthenticating(false);
    }
  }, [isNative]);

  useEffect(() => {
    if (!isNative) return;

    void unlock();
    const lockManually = () => setLocked(true);
    window.addEventListener(LOCK_APP_EVENT, lockManually);

    let removeAppListener: (() => Promise<void>) | undefined;
    void App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        setLocked(true);
      } else {
        void unlock();
      }
    }).then(handle => {
      removeAppListener = () => handle.remove();
    });

    return () => {
      window.removeEventListener(LOCK_APP_EVENT, lockManually);
      void removeAppListener?.();
    };
  }, [isNative, unlock]);

  if (!locked) return <>{children}</>;

  return (
    <div className="native-lock-screen fixed inset-0 z-[100] flex min-h-dvh flex-col items-center justify-center bg-background px-8 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-primary shadow-lg shadow-primary/20">
        <LockKeyhole className="h-9 w-9 text-primary-foreground" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">MedIncome is vergrendeld</h1>
      <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{message}</p>
      <Button className="mt-8 h-12 min-w-52 rounded-xl text-base" onClick={unlock} disabled={authenticating}>
        {authenticating ? <Loader2 className="animate-spin" /> : <ScanFace />}
        Ontgrendel
      </Button>
    </div>
  );
}
