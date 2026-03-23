import { Upload, BarChart3, Settings, LogOut, Stethoscope, FileText, TrendingUp, Download, Calculator } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Separator } from '@/components/ui/separator';
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

const topItems = [
  { title: 'Uploaden', url: '/', icon: Upload },
  { title: 'Overzicht', url: '/records', icon: FileText },
  { title: 'Dashboard', url: '/dashboard', icon: BarChart3 },
];

const middleItems = [
  { title: 'Statistieken', url: '/statistics', icon: TrendingUp },
];

const bottomItems = [
  { title: 'Nomenclatuur', url: '/nomenclature', icon: Settings },
  { title: 'Simulaties', url: '/simulations', icon: Calculator },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut } = useAuth();

  const renderItems = (items: typeof topItems) =>
    items.map((item) => (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild isActive={location.pathname === item.url}>
          <NavLink to={item.url} end className="text-sidebar-foreground hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
            <item.icon className="h-4 w-4" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent className="bg-sidebar">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted px-3 py-4 mb-2">
            {!collapsed && (
              <div className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-sidebar-primary" />
                <span className="font-semibold text-base text-sidebar-foreground tracking-tight">MedIncome</span>
              </div>
            )}
            {collapsed && <Stethoscope className="h-5 w-5 text-sidebar-primary mx-auto" />}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {renderItems(topItems)}
            </SidebarMenu>
            <SidebarMenu>
              {renderItems(middleItems)}
            </SidebarMenu>
            <Separator className="my-2 bg-sidebar-border" />
            <SidebarMenu>
              {renderItems(bottomItems)}
            </SidebarMenu>
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
