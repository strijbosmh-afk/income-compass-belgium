import { Upload, BarChart3, Settings, LogOut, Stethoscope, FileText, TrendingUp, Download, Calculator, ShieldCheck, AlertTriangle, Target, PiggyBank, Wallet } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useControleIssues } from '@/hooks/useControleIssues';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

const incomeMain = [
  { title: 'Uploaden', url: '/', icon: Upload },
  { title: 'Overzicht', url: '/records', icon: FileText },
  { title: 'Dashboard', url: '/dashboard', icon: BarChart3 },
  { title: 'Statistieken', url: '/statistics', icon: TrendingUp },
  { title: 'Doelstellingen', url: '/goals', icon: Target },
];

const incomeTools = [
  { title: 'Nomenclatuur', url: '/nomenclature', icon: Settings },
  { title: 'Controle', url: '/controle', icon: ShieldCheck },
  { title: 'Simulaties', url: '/simulations', icon: Calculator },
];

const pensionItems = [
  { title: 'PDF uploaden', url: '/pensioen/upload', icon: Upload },
  { title: 'Overzicht', url: '/pensioen/overzicht', icon: FileText },
  { title: 'Dashboard', url: '/pensioen/dashboard', icon: BarChart3 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut } = useAuth();
  const issueCount = useControleIssues();

  const renderItem = (item: { title: string; url: string; icon: any }) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild isActive={location.pathname === item.url}>
        <NavLink to={item.url} end className="text-sidebar-foreground hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
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

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent className="bg-sidebar">
        {/* Brand */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted px-3 py-4 mb-2">
            {!collapsed ? (
              <div className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-sidebar-primary" />
                <span className="font-semibold text-base text-sidebar-foreground tracking-tight">MedIncome</span>
              </div>
            ) : (
              <Stethoscope className="h-5 w-5 text-sidebar-primary mx-auto" />
            )}
          </SidebarGroupLabel>
        </SidebarGroup>

        {/* INKOMSTEN sectie */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-wider flex items-center gap-1.5 text-sidebar-foreground/80">
            <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-sidebar-accent/60">
              <Wallet className="h-3 w-3 text-sidebar-foreground" />
            </span>
            {!collapsed && <span>Inkomsten</span>}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{incomeMain.map(renderItem)}</SidebarMenu>
            <Separator className="my-2 bg-sidebar-border" />
            <SidebarMenu>{incomeTools.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-1 bg-sidebar-border" />

        {/* PENSIOEN sectie */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-wider text-sidebar-muted flex items-center gap-1.5">
            <PiggyBank className="h-3 w-3" />
            {!collapsed && <span>Pensioen</span>}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{pensionItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="bg-sidebar border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={location.pathname === '/export'}>
              <NavLink to="/export" end className="text-sidebar-foreground hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                <Download className="h-4 w-4" />
                {!collapsed && <span>Exporteren</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <Separator className="my-1 bg-sidebar-border" />
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="text-sidebar-foreground hover:bg-sidebar-accent">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Uitloggen</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
