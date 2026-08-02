-- Add work_order to JEV source type enum
ALTER TYPE jev_source_type ADD VALUE IF NOT EXISTS 'work_order';
