-- Run once on existing databases before deploying employee/alumni card enrollment.
-- Alumni enroll a separate physical card; student card IDs are not copied.
ALTER TABLE employees ADD COLUMN card_id VARCHAR(128) NULL UNIQUE;
ALTER TABLE alumni ADD COLUMN card_id VARCHAR(128) NULL UNIQUE;
