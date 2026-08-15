import { useAuth } from './auth';

/**
 * Entity name + address lines for printed forms, driven by the configurable
 * District Profile (Admin → District Profile). Class names/styles are
 * parameterised so it drops into both the `gov-*` (procurement/accounting)
 * and `bill-print-header__*` (billing) form layouts.
 */
export function GovLetterhead({
  entityClass = 'gov-entity',
  subClass = 'gov-subtitle',
  entityStyle,
  subStyle,
}: {
  entityClass?: string;
  subClass?: string;
  entityStyle?: React.CSSProperties;
  subStyle?: React.CSSProperties;
}) {
  const { organization } = useAuth();
  const entity = (organization?.name ?? 'Sta. Barbara Water District').toUpperCase();
  const sub = organization?.address ?? '';
  return (
    <>
      <div className={entityClass} style={entityStyle}>
        {entity}
      </div>
      {sub ? (
        <div className={subClass} style={subStyle}>
          {sub}
        </div>
      ) : null}
    </>
  );
}
