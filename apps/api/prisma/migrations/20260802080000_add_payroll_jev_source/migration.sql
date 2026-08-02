-- Add payroll to jev_source_type enum
ALTER TYPE jev_source_type ADD VALUE IF NOT EXISTS 'payroll';

-- Add account mappings for payroll integration
INSERT INTO account_mappings (id, organization_id, mapping_key, chart_of_account_id, is_active, created_at, updated_at)
SELECT gen_random_uuid(), o.id, 'payroll.salaries_expense', coa.id, true, NOW(), NOW()
FROM organizations o
CROSS JOIN chart_of_accounts coa
WHERE coa.organization_id = o.id AND coa.account_code = '5010101000'
AND NOT EXISTS (SELECT 1 FROM account_mappings am WHERE am.organization_id = o.id AND am.mapping_key = 'payroll.salaries_expense')
ON CONFLICT DO NOTHING;

INSERT INTO account_mappings (id, organization_id, mapping_key, chart_of_account_id, is_active, created_at, updated_at)
SELECT gen_random_uuid(), o.id, 'payroll.payable', coa.id, true, NOW(), NOW()
FROM organizations o
CROSS JOIN chart_of_accounts coa
WHERE coa.organization_id = o.id AND coa.account_code = '2010101000'
AND NOT EXISTS (SELECT 1 FROM account_mappings am WHERE am.organization_id = o.id AND am.mapping_key = 'payroll.payable')
ON CONFLICT DO NOTHING;
