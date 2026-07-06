import { BarChart3, BriefcaseBusiness, Camera, FileText, MoreHorizontal } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useSidebar } from '@/components/ui/sidebar';

const tabs = [
  { title: 'Scan', url: '/', icon: Camera },
  { title: 'Overzicht', url: '/records', icon: FileText },
  { title: 'Dashboard', url: '/dashboard', icon: BarChart3 },
  { title: 'Portfolio', url: '/portfolio', icon: BriefcaseBusiness },
];

export function MobileTabBar() {
  const { toggleSidebar } = useSidebar();

  return (
    <nav className="ios-tab-bar fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border/70 bg-card/95 px-2 backdrop-blur-xl md:hidden">
      {tabs.map(tab => (
        <NavLink
          key={tab.url}
          to={tab.url}
          end
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground"
          activeClassName="text-primary"
        >
          <tab.icon className="h-5 w-5" />
          <span>{tab.title}</span>
        </NavLink>
      ))}
      <button
        type="button"
        onClick={toggleSidebar}
        className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-primary"
        aria-label="Meer navigatie"
      >
        <MoreHorizontal className="h-5 w-5" />
        <span>Meer</span>
      </button>
    </nav>
  );
}
