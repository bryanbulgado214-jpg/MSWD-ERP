-- Revenue-cycle JEV source types: water-bill generation and collection.
-- ADD VALUE cannot run in the same tx that uses the value, but these migrations
-- only add the labels (the app uses them on later requests), so this is safe.
ALTER TYPE "jev_source_type" ADD VALUE IF NOT EXISTS 'billing';
ALTER TYPE "jev_source_type" ADD VALUE IF NOT EXISTS 'collection';
