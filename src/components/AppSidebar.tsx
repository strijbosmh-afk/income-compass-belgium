import { Upload, BarChart3, Settings, LogOut, WalletCards, FileText, TrendingUp, Download, Calculator, ShieldCheck, AlertTriangle, Target, PiggyBank, Wallet, ChevronDown, LineChart, Printer, Landmark } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useControleIssues } from '@/hooks/useControleIssues';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

const incomePrimary = [
  { title: 'Dashboard', url: '/', icon: BarChart3 },
  { title: 'Overzicht', url: '/records', icon: FileText },
];

const incomeSecondary = [
  { title: 'Analyse', url: '/statistics', icon: TrendingUp },
  { title: 'Doelstellingen', url: '/goals', icon: Target },
  { title: 'Nomenclatuur', url: '/nomenclature', icon: Settings },
  { title: 'Controle', url: '/controle', icon: ShieldCheck },
  { title: 'Simulaties', url: '/simulations', icon: Calculator },
  { title: 'Uploaden', url: '/upload', icon: Upload },
];

const wealthItems = [
  { title: 'Cash', url: '/vermogen?tab=cash', icon: Wallet },
  { title: 'Pensioen', url: '/pensioen', icon: PiggyBank },
  { title: 'Beurs', url: '/vermogen?tab=portfolio', icon: LineChart },
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut } = useAuth();
  const issueCount = useControleIssues();
  const secondaryActive = incomeSecondary.some((item) => location.pathname === item.url);

  const isItemActive = (url: string) => {
    const [path, rawSearch = ''] = url.split('?');
    if (path === '/pensioen') return location.pathname === '/pensioen';
    if (path === '/vermogen') {
      if (location.pathname !== '/vermogen' && location.pathname !== '/aandelen') return false;
      const targetSearch = rawSearch ? `?${rawSearch}` : '';
      if (!targetSearch || targetSearch === '?tab=overview') {
        return !location.search || location.search === '?tab=overview';
      }
      return location.search === targetSearch;
    }
    return location.pathname === path;
  };

  const renderItem = (item: { title: string; url: string; icon: any }) => {
    const active = isItemActive(item.url);
    return (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild isActive={active}>
        <NavLink
          to={item.url}
          end
          onClick={() => { if (isMobile) setOpenMobile(false); }}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
          activeClassName={active ? 'bg-sidebar-accent text-sidebar-primary font-medium' : ''}
        >
          <item.icon className="h-4 w-4" />
          {!collapsed && <span className="flex-1">{item.title}</span>}
          {item.url === '/controle' && issueCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500/80 shrink-0" aria-label={`${issueCount} aandachtspunt${issueCount === 1 ? '' : 'en'}`} />
              </TooltipTrigger>
              <TooltipContent side="right">
                {issueCount} aandachtspunt{issueCount === 1 ? '' : 'en'}
              </TooltipContent>
            </Tooltip>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
    );
  };

  const renderSubItem = (item: { title: string; url: string; icon: any }) => {
    const active = isItemActive(item.url);
    return (
    <SidebarMenuSubItem key={item.title}>
      <SidebarMenuSubButton asChild isActive={active}>
        <NavLink
          to={item.url}
          end
          onClick={() => { if (isMobile) setOpenMobile(false); }}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
          activeClassName={active ? 'bg-sidebar-accent text-sidebar-primary font-medium' : ''}
        >
          <item.icon className="h-3.5 w-3.5" />
          <span className="flex-1">{item.title}</span>
          {item.url === '/controle' && issueCount > 0 && (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500/80 shrink-0" aria-label={`${issueCount} aandachtspunt${issueCount === 1 ? '' : 'en'}`} />
          )}
        </NavLink>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent className="bg-sidebar">
        {/* Brand */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted px-3 py-4 mb-2">
            {!collapsed ? (
              <div className="flex items-center gap-2">
                <WalletCards className="h-5 w-5 text-sidebar-primary" />
                <span className="font-semibold text-base text-sidebar-foreground tracking-tight">MyFinState</span>
              </div>
            ) : (
              <WalletCards className="h-5 w-5 text-sidebar-primary mx-auto" />
            )}
          </SidebarGroupLabel>
        </SidebarGroup>

        {/* INKOMEN sectie */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[13px] uppercase tracking-wider flex items-center gap-1.5 text-sidebar-foreground">
            <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-sidebar-accent/60">
              <Wallet className="h-3 w-3 text-sidebar-foreground" />
            </span>
            {!collapsed && <span className="font-bold">Inkomen</span>}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{incomePrimary.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-1 bg-sidebar-border" />

        {/* VERMOGEN sectie */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[13px] uppercase tracking-wider flex items-center gap-1.5 text-sidebar-foreground">
            <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-sidebar-accent/60">
              <Landmark className="h-3 w-3 text-sidebar-foreground" />
            </span>
            {!collapsed && <span className="font-bold">Vermogen</span>}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{wealthItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="bg-sidebar border-t border-sidebar-border">
        <SidebarMenu className={!collapsed ? 'rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/35 p-2' : ''}>
          <Collapsible asChild defaultOpen={secondaryActive}>
            <SidebarMenuItem className="group/income-tools">
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  isActive={secondaryActive}
                  className="text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  <Settings className="h-4 w-4" />
                  {!collapsed && <span className="flex-1">Analyse & beheer</span>}
                  {issueCount > 0 && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500/80 shrink-0" aria-label={`${issueCount} aandachtspunt${issueCount === 1 ? '' : 'en'}`} />
                  )}
                  {!collapsed && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/70 transition-transform group-data-[state=open]/income-tools:rotate-180" />}
                </SidebarMenuButton>
              </CollapsibleTrigger>
              {!collapsed && (
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {incomeSecondary.map(renderSubItem)}
                  </SidebarMenuSub>
                </CollapsibleContent>
              )}
            </SidebarMenuItem>
          </Collapsible>
        </SidebarMenu>

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={location.pathname === '/print'}>
              <NavLink
                to="/print"
                end
                onClick={() => { if (isMobile) setOpenMobile(false); }}
                className="text-sidebar-foreground hover:bg-sidebar-accent"
                activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
              >
                <Printer className="h-4 w-4" />
                {!collapsed && <span>Printen</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={location.pathname === '/export'}>
              <NavLink
                to="/export"
                end
                onClick={() => { if (isMobile) setOpenMobile(false); }}
                className="text-sidebar-foreground hover:bg-sidebar-accent"
                activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
              >
                <Download className="h-4 w-4" />
                {!collapsed && <span>Exporteren</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <Separator className="my-1 bg-sidebar-border" />
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => { if (isMobile) setOpenMobile(false); void signOut(); }} className="text-sidebar-foreground hover:bg-sidebar-accent">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Uitloggen</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
