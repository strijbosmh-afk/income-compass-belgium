import { BarChart3, FileText, MoreHorizontal, TrendingUp, Upload } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';

const tabs = [
  { title: 'Dashboard', url: '/', icon: BarChart3 },
  { title: 'Uploaden', url: '/upload', icon: Upload },
  { title: 'Overzicht', url: '/records', icon: FileText },
  { title: 'Statistieken', url: '/statistics', icon: TrendingUp },
];

export function MobileTabBar() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();

  return (
    <nav className="ios-tab-bar md:hidden" aria-label="Hoofdnavigatie">
      {tabs.map((tab) => (
        <NavLink
          key={tab.url}
          to={tab.url}
          end
          className="ios-tab-item"
          activeClassName="ios-tab-item-active"
        >
          <tab.icon className="h-5 w-5" strokeWidth={2.2} />
          <span>{tab.title}</span>
        </NavLink>
      ))}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className={cn('ios-tab-item', !tabs.some((tab) => tab.url === location.pathname) && 'ios-tab-item-active')}
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={2.2} />
        <span>Meer</span>
      </button>
    </nav>
  );
}
