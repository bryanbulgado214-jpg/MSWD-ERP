import { useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { exportReportExcel, exportReportPdf } from '../report-export';

import { REPORT_GROUPS } from './ReportsSubNav';
import { ReportsSubNav } from './ReportsSubNav';
import './reports.css';

/** Label of the report currently being viewed (null on the reports home). */
function activeReportLabel(pathname: string): string | null {
  for (const g of REPORT_GROUPS) {
    for (const item of g.items) {
      if (pathname.startsWith(item.to)) return item.label;
    }
  }
  return null;
}

export function ReportsLayout() {
  const { pathname } = useLocation();
  const { organization } = useAuth();
  const contentRef = useRef<HTMLDivElement>(null);

  const label = activeReportLabel(pathname);
  const onReport = label !== null;
  const dateStr = new Date().toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const meta = {
    filename: `${(label ?? 'report')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')}-${new Date().toISOString().slice(0, 10)}`,
    organizationName: organization?.legalName || organization?.name || 'Water District',
    reportLabel: label ?? 'Report',
    dateStr,
  };

  return (
    <div className="reports-page">
      <div className="reports-page__header">
        <h1>Reports &amp; Analytics</h1>
        {onReport && (
          <div className="reports-export">
            <button
              type="button"
              className="reports-export__btn"
              onClick={() => exportReportExcel(contentRef.current, meta)}
              title="Download this report as an Excel workbook"
            >
              ⭳ Excel
            </button>
            <button
              type="button"
              className="reports-export__btn"
              onClick={() => exportReportPdf(contentRef.current, meta)}
              title="Download this report as a PDF"
            >
              ⭳ PDF
            </button>
          </div>
        )}
      </div>
      <ReportsSubNav />
      <div ref={contentRef}>
        <Outlet />
      </div>
    </div>
  );
}
