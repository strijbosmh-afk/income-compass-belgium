import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileTabBar } from '@/components/MobileTabBar';
import { LOCK_APP_EVENT } from '@/components/NativeSecurityGate';
import { Capacitor } from '@capacitor/core';
import { LockKeyhole, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-dvh flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="ios-header flex h-14 items-center justify-between border-b border-border/50 bg-card/80 px-4 backdrop-blur-xl sticky top-0 z-10">
            <SidebarTrigger className="hidden text-muted-foreground hover:text-foreground md:inline-flex" />
            <div className="flex items-center gap-2 md:hidden">
              <Stethoscope className="h-5 w-5 text-primary" />
              <span className="font-semibold tracking-tight">MedIncome</span>
            </div>
            {Capacitor.isNativePlatform() && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Vergrendel app"
                onClick={() => window.dispatchEvent(new Event(LOCK_APP_EVENT))}
              >
                <LockKeyhole className="h-4 w-4" />
              </Button>
            )}
          </header>
          <main className="flex-1 overflow-auto p-4 pb-24 sm:p-6 md:pb-6">
            {children}
          </main>
          <MobileTabBar />
        </div>
      </div>
    </SidebarProvider>
  );
}
