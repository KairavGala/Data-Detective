import { cn } from '@/utils';

interface DossierLabelProps {
  code?: string;
  label: string;
  className?: string;
}

/**
 * Classified document-inspired metadata label using crisp unboxed typography
 * and technical separators rather than generic pill badges.
 */
export function DossierLabel({ code, label, className }: DossierLabelProps) {
  return (
    <div className={cn('dd-dossier-label', className)}>
      {code && (
        <>
          <span className="text-[var(--dd-accent-teal)] dd-tabular">
            {code}
          </span>
          <span className="text-[var(--dd-border-strong)]" aria-hidden="true">
            /
          </span>
        </>
      )}
      <span className="uppercase">{label}</span>
    </div>
  );
}
