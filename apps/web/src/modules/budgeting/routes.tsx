import type { RouteObject } from 'react-router-dom';

import { BudgetAvailabilityInquiryPage } from './pages/BudgetAvailabilityInquiryPage';
import { BudgetDashboardPage } from './pages/BudgetDashboardPage';
import { BudgetDetailPage } from './pages/BudgetDetailPage';
import { BudgetListPage } from './pages/BudgetListPage';
import { BudgetReportsPage } from './pages/BudgetReportsPage';
import { BudgetReviewPage } from './pages/BudgetReviewPage';
import { CreateBudgetHeaderPage } from './pages/CreateBudgetHeaderPage';
import { CreateBudgetReleasePage } from './pages/CreateBudgetReleasePage';
import { CreateReservationPage } from './pages/CreateReservationPage';
import { ReservationDetailPage } from './pages/ReservationDetailPage';

export const budgetingRoutes: RouteObject[] = [
  {
    path: '/budgeting',
    element: <BudgetListPage />,
  },
  {
    path: '/budgeting/availability-inquiry',
    element: <BudgetAvailabilityInquiryPage />,
  },
  {
    path: '/budgeting/reports',
    element: <BudgetReportsPage />,
  },
  {
    path: '/budgeting/budget-headers/new',
    element: <CreateBudgetHeaderPage />,
  },
  {
    path: '/budgeting/dashboard/:budgetHeaderId',
    element: <BudgetDashboardPage />,
  },
  {
    path: '/budgeting/budget-headers/:budgetHeaderId/review',
    element: <BudgetReviewPage />,
  },
  {
    path: '/budgeting/budget-headers/:budgetHeaderId/releases/new',
    element: <CreateBudgetReleasePage />,
  },
  {
    path: '/budgeting/budget-headers/:budgetHeaderId',
    element: <BudgetDetailPage />,
  },
  {
    path: '/budgeting/budget-releases/:budgetReleaseId/reservations/new',
    element: <CreateReservationPage />,
  },
  {
    path: '/budgeting/reservations/:reservationId',
    element: <ReservationDetailPage />,
  },
];
