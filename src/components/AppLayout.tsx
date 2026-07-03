import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileTabBar } from '@/components/MobileTabBar';
import { Stethoscope } from 'lucide-react';

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="app-header">
            <SidebarTrigger className="hidden md:inline-flex text-muted-foreground hover:text-foreground" />
            <div className="flex md:hidden items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Stethoscope className="h-4 w-4" />
              </div>
              <span className="font-semibold tracking-tight">MedIncome</span>
            </div>
          </header>
          <main className="app-main">
            {children}
          </main>
          <MobileTabBar />
        </div>
      </div>
    </SidebarProvider>
  );
}
