-- Run once on existing databases before deploying the HID card enrollment update.
ALTER TABLE students ADD COLUMN card_id VARCHAR(128) NULL UNIQUE;
