import { BarChart3, FileText, LineChart, MoreHorizontal, PiggyBank, TrendingUp, Upload } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/ui/sidebar';

type TabItem = {
  title: string;
  url: string;
  icon: typeof BarChart3;
  match?: (pathname: string) => boolean;
};

const incomeTabs: TabItem[] = [
  { title: 'Dashboard', url: '/', icon: BarChart3 },
  { title: 'Overzicht', url: '/records', icon: FileText },
  { title: 'Analyse', url: '/statistics', icon: TrendingUp },
  { title: 'Upload', url: '/upload', icon: Upload },
];

const pensionTabs: TabItem[] = [
  { title: 'Overzicht', url: '/pensioen', icon: PiggyBank, match: (pathname) => pathname === '/pensioen' },
  { title: 'Details', url: '/pensioen/overzicht', icon: FileText },
  { title: 'Analyse', url: '/pensioen/dashboard', icon: TrendingUp },
  { title: 'Upload', url: '/pensioen/upload', icon: Upload },
];

const wealthTabs: TabItem[] = [
  { title: 'Dashboard', url: '/', icon: BarChart3 },
  { title: 'Inkomen', url: '/records', icon: FileText, match: (pathname) => ['/', '/upload', '/records', '/statistics', '/goals', '/nomenclature', '/controle', '/simulations'].includes(pathname) },
  { title: 'Vermogen', url: '/vermogen', icon: LineChart, match: (pathname) => pathname === '/vermogen' || pathname === '/aandelen' },
  { title: 'Pensioen', url: '/pensioen', icon: PiggyBank, match: (pathname) => pathname.startsWith('/pensioen') },
];

export function MobileTabBar() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const tabs = getTabsForPath(location.pathname);
  const activeInTabs = tabs.some((tab) => isTabActive(tab, location.pathname));

  return (
    <nav className="ios-tab-bar md:hidden" aria-label={getTabBarLabel(location.pathname)}>
      {tabs.map((tab) => (
        <NavLink
          key={`${tab.title}-${tab.url}`}
          to={tab.url}
          end
          className={cn('ios-tab-item', isTabActive(tab, location.pathname) && 'ios-tab-item-active')}
          activeClassName="ios-tab-item-active"
        >
          <tab.icon className="h-5 w-5" strokeWidth={2.2} />
          <span>{tab.title}</span>
        </NavLink>
      ))}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className={cn('ios-tab-item', !activeInTabs && 'ios-tab-item-active')}
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={2.2} />
        <span>Meer</span>
      </button>
    </nav>
  );
}

function getTabsForPath(pathname: string) {
  if (pathname.startsWith('/pensioen')) return pensionTabs;
  if (pathname.startsWith('/vermogen') || pathname.startsWith('/aandelen')) return wealthTabs;
  return incomeTabs;
}

function getTabBarLabel(pathname: string) {
  if (pathname.startsWith('/pensioen')) return 'Pensioennavigatie';
  if (pathname.startsWith('/vermogen') || pathname.startsWith('/aandelen')) return 'Vermogennavigatie';
  return 'Inkomennavigatie';
}

function isTabActive(tab: TabItem, pathname: string) {
  if (tab.match) return tab.match(pathname);
  if (tab.url === '/') return pathname === '/' || pathname === '/dashboard';
  return pathname === tab.url;
}
