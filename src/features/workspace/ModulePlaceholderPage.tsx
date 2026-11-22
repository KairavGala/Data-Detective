import { SectionEmptyState } from '@/components/ui/SectionEmptyState';
import { WORKSPACE_ROUTES, type RouteId } from '@/config/navigation';

interface ModulePlaceholderPageProps {
  routeId: Exclude<RouteId, 'overview' | 'settings'>;
}

/**
 * Renders the domain-specific empty state for an upcoming analytical section.
 */
export function ModulePlaceholderPage({ routeId }: ModulePlaceholderPageProps) {
  const route = WORKSPACE_ROUTES.find((item) => item.id === routeId);

  if (!route) {
    return null;
  }

  return <SectionEmptyState route={route} />;
}
