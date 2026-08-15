/**
 * Shared shell for reports whose underlying module/data source does not yet
 * exist in the system. It states clearly that the report is pending — it never
 * fabricates figures.
 */
export function ReportPlaceholder({
  title,
  description,
  requiredData,
}: {
  title: string;
  description: string;
  requiredData: string;
}) {
  return (
    <div>
      <h2>{title}</h2>
      <p className="reports-subtitle">{description}</p>
      <div className="reports-placeholder">
        <div className="reports-placeholder__badge">Not yet available</div>
        <p className="reports-placeholder__title">
          This report will become available once the corresponding module / data source is
          implemented.
        </p>
        <p className="reports-placeholder__detail">Depends on: {requiredData}</p>
      </div>
    </div>
  );
}
