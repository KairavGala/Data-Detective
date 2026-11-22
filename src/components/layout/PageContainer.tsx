import type { ReactNode } from 'react';
import { cn } from '@/utils';

type ContainerWidth = 'standard' | 'wide' | 'full';

interface PageContainerProps {
  children: ReactNode;
  width?: ContainerWidth;
  className?: string;
}

const WIDTH_CLASSES: Record<ContainerWidth, string> = {
  standard: 'max-w-[1160px]',
  wide: 'max-w-[1440px]',
  full: 'max-w-none',
};

/**
 * Flexible page content container allowing future analytical modules
 * (tables, charts, split workspaces, dossiers) to choose their optimal layout width
 * without altering the outer application shell.
 */
export function PageContainer({
  children,
  width = 'standard',
  className,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8',
        WIDTH_CLASSES[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
