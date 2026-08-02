-- HR & Payroll Module

-- ── Enums ──

CREATE TYPE employment_status AS ENUM ('active','resigned','retired','terminated','on_leave','suspended');
CREATE TYPE employment_type AS ENUM ('permanent','casual','contractual','job_order','co_terminous','elected');
CREATE TYPE leave_request_status AS ENUM ('pending','approved','rejected','cancelled');
CREATE TYPE dtr_upload_status AS ENUM ('pending','processed','error');
CREATE TYPE payroll_status AS ENUM ('draft','computing','computed','reviewing','approved','paid','voided');

-- ── Positions ──

CREATE TABLE positions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code              VARCHAR(20) NOT NULL,
  title             VARCHAR(255) NOT NULL,
  salary_grade      INT,
  salary_step       INT DEFAULT 1,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);
CREATE INDEX idx_positions_org ON positions(organization_id);

-- ── Salary Grades (SSL table) ──

CREATE TABLE salary_grades (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  grade             INT NOT NULL,
  step              INT NOT NULL DEFAULT 1,
  monthly_salary    DECIMAL(14,2) NOT NULL,
  effective_date    DATE NOT NULL,
  end_date          DATE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, grade, step, effective_date)
);
CREATE INDEX idx_salary_grades_org ON salary_grades(organization_id);

-- ── Employees ──

CREATE TABLE employees (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  employee_number      VARCHAR(20) NOT NULL,
  first_name           VARCHAR(100) NOT NULL,
  middle_name          VARCHAR(100),
  last_name            VARCHAR(100) NOT NULL,
  suffix               VARCHAR(20),
  date_of_birth        DATE,
  gender               VARCHAR(10),
  civil_status         VARCHAR(20),
  address              TEXT,
  contact_number       VARCHAR(30),
  email                VARCHAR(255),
  tin                  VARCHAR(20),
  sss_gsis_number      VARCHAR(20),
  philhealth_number    VARCHAR(20),
  pagibig_number       VARCHAR(20),
  department_id        UUID REFERENCES departments(id) ON DELETE SET NULL,
  position_id          UUID REFERENCES positions(id) ON DELETE SET NULL,
  employment_type      employment_type NOT NULL DEFAULT 'permanent',
  employment_status    employment_status NOT NULL DEFAULT 'active',
  date_hired           DATE,
  date_regularized     DATE,
  date_separated       DATE,
  separation_reason    TEXT,
  basic_salary         DECIMAL(14,2),
  salary_grade         INT,
  salary_step          INT DEFAULT 1,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  version              INT NOT NULL DEFAULT 1,
  UNIQUE(organization_id, employee_number)
);
CREATE INDEX idx_employees_org ON employees(organization_id);
CREATE INDEX idx_employees_user ON employees(user_id);
CREATE INDEX idx_employees_dept ON employees(department_id);
CREATE INDEX idx_employees_status ON employees(employment_status);

-- ── Leave Types ──

CREATE TABLE leave_types (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code              VARCHAR(20) NOT NULL,
  name              VARCHAR(100) NOT NULL,
  default_days      DECIMAL(5,1) NOT NULL DEFAULT 0,
  is_convertible    BOOLEAN NOT NULL DEFAULT FALSE,
  is_cumulative     BOOLEAN NOT NULL DEFAULT TRUE,
  max_accumulation  DECIMAL(6,1),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

-- ── Leave Balances ──

CREATE TABLE leave_balances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id   UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year            INT NOT NULL,
  earned          DECIMAL(6,1) NOT NULL DEFAULT 0,
  used            DECIMAL(6,1) NOT NULL DEFAULT 0,
  balance         DECIMAL(6,1) NOT NULL DEFAULT 0,
  carry_over      DECIMAL(6,1) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, leave_type_id, year)
);
CREATE INDEX idx_leave_balances_employee ON leave_balances(employee_id);

-- ── Leave Applications ──

CREATE TABLE leave_applications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id     UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  days_applied      DECIMAL(5,1) NOT NULL,
  reason            TEXT,
  status            leave_request_status NOT NULL DEFAULT 'pending',
  approved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  version           INT NOT NULL DEFAULT 1
);
CREATE INDEX idx_leave_applications_employee ON leave_applications(employee_id);
CREATE INDEX idx_leave_applications_status ON leave_applications(status);

-- ── DTR Uploads ──

CREATE TABLE dtr_uploads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  file_name         VARCHAR(255) NOT NULL,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  total_records     INT NOT NULL DEFAULT 0,
  processed_records INT NOT NULL DEFAULT 0,
  error_records     INT NOT NULL DEFAULT 0,
  status            dtr_upload_status NOT NULL DEFAULT 'pending',
  error_log         TEXT,
  uploaded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dtr_uploads_org ON dtr_uploads(organization_id);

-- ── DTR Records ──

CREATE TABLE dtr_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  upload_id         UUID REFERENCES dtr_uploads(id) ON DELETE SET NULL,
  record_date       DATE NOT NULL,
  time_in_am        TIME,
  time_out_am       TIME,
  time_in_pm        TIME,
  time_out_pm       TIME,
  hours_worked      DECIMAL(5,2) NOT NULL DEFAULT 0,
  hours_late        DECIMAL(5,2) NOT NULL DEFAULT 0,
  hours_undertime   DECIMAL(5,2) NOT NULL DEFAULT 0,
  hours_overtime    DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_absent         BOOLEAN NOT NULL DEFAULT FALSE,
  is_holiday        BOOLEAN NOT NULL DEFAULT FALSE,
  is_rest_day       BOOLEAN NOT NULL DEFAULT FALSE,
  remarks           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, record_date)
);
CREATE INDEX idx_dtr_records_employee ON dtr_records(employee_id);
CREATE INDEX idx_dtr_records_date ON dtr_records(record_date);
CREATE INDEX idx_dtr_records_upload ON dtr_records(upload_id);

-- ── Allowance Types ──

CREATE TABLE allowance_types (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code              VARCHAR(20) NOT NULL,
  name              VARCHAR(100) NOT NULL,
  is_taxable        BOOLEAN NOT NULL DEFAULT FALSE,
  is_fixed          BOOLEAN NOT NULL DEFAULT TRUE,
  default_amount    DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

-- ── Employee Allowances ──

CREATE TABLE employee_allowances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  allowance_type_id UUID NOT NULL REFERENCES allowance_types(id) ON DELETE CASCADE,
  amount            DECIMAL(14,2) NOT NULL,
  effective_date    DATE NOT NULL,
  end_date          DATE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_employee_allowances_emp ON employee_allowances(employee_id);

-- ── Deduction Types ──

CREATE TABLE deduction_types (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code              VARCHAR(20) NOT NULL,
  name              VARCHAR(100) NOT NULL,
  category          VARCHAR(30) NOT NULL DEFAULT 'mandatory',
  is_percentage     BOOLEAN NOT NULL DEFAULT FALSE,
  employer_share    DECIMAL(8,4) NOT NULL DEFAULT 0,
  employee_share    DECIMAL(8,4) NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

-- ── Employee Deductions ──

CREATE TABLE employee_deductions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  deduction_type_id UUID NOT NULL REFERENCES deduction_types(id) ON DELETE CASCADE,
  amount            DECIMAL(14,2) NOT NULL DEFAULT 0,
  start_date        DATE,
  end_date          DATE,
  remaining_balance DECIMAL(14,2),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  remarks           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_employee_deductions_emp ON employee_deductions(employee_id);

-- ── Payroll Periods ──

CREATE TABLE payroll_periods (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name              VARCHAR(100) NOT NULL,
  period_type       VARCHAR(20) NOT NULL DEFAULT 'semi_monthly',
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  pay_date          DATE NOT NULL,
  is_locked         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  version           INT NOT NULL DEFAULT 1,
  UNIQUE(organization_id, name)
);
CREATE INDEX idx_payroll_periods_org ON payroll_periods(organization_id);

-- ── Payroll Runs ──

CREATE TABLE payroll_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  payroll_period_id   UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE RESTRICT,
  run_number          VARCHAR(20) NOT NULL,
  status              payroll_status NOT NULL DEFAULT 'draft',
  total_gross         DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_deductions    DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_net           DECIMAL(14,2) NOT NULL DEFAULT 0,
  employee_count      INT NOT NULL DEFAULT 0,
  computed_at         TIMESTAMPTZ,
  approved_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  voided_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  voided_at           TIMESTAMPTZ,
  void_reason         TEXT,
  remarks             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  version             INT NOT NULL DEFAULT 1,
  UNIQUE(organization_id, run_number)
);
CREATE INDEX idx_payroll_runs_org ON payroll_runs(organization_id);
CREATE INDEX idx_payroll_runs_period ON payroll_runs(payroll_period_id);
CREATE INDEX idx_payroll_runs_status ON payroll_runs(status);

-- ── Payroll Items (one per employee per run) ──

CREATE TABLE payroll_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  payroll_run_id      UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id         UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  basic_pay           DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_allowances    DECIMAL(14,2) NOT NULL DEFAULT 0,
  gross_pay           DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_deductions    DECIMAL(14,2) NOT NULL DEFAULT 0,
  net_pay             DECIMAL(14,2) NOT NULL DEFAULT 0,
  days_worked         DECIMAL(5,1) NOT NULL DEFAULT 0,
  days_absent         DECIMAL(5,1) NOT NULL DEFAULT 0,
  hours_late          DECIMAL(6,2) NOT NULL DEFAULT 0,
  hours_undertime     DECIMAL(6,2) NOT NULL DEFAULT 0,
  hours_overtime      DECIMAL(6,2) NOT NULL DEFAULT 0,
  late_deduction      DECIMAL(14,2) NOT NULL DEFAULT 0,
  undertime_deduction DECIMAL(14,2) NOT NULL DEFAULT 0,
  overtime_pay        DECIMAL(14,2) NOT NULL DEFAULT 0,
  absent_deduction    DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(payroll_run_id, employee_id)
);
CREATE INDEX idx_payroll_items_run ON payroll_items(payroll_run_id);
CREATE INDEX idx_payroll_items_employee ON payroll_items(employee_id);

-- ── Payroll Item Details (individual allowances/deductions per employee per run) ──

CREATE TABLE payroll_item_details (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_item_id     UUID NOT NULL REFERENCES payroll_items(id) ON DELETE CASCADE,
  detail_type         VARCHAR(20) NOT NULL,
  reference_code      VARCHAR(20) NOT NULL,
  reference_name      VARCHAR(100) NOT NULL,
  amount              DECIMAL(14,2) NOT NULL DEFAULT 0,
  employer_share      DECIMAL(14,2) NOT NULL DEFAULT 0,
  remarks             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payroll_item_details_item ON payroll_item_details(payroll_item_id);
