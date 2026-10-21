-- Run once on existing production databases before deploying enrollment-only access.
INSERT IGNORE INTO permissions (name,description,maintenance_access,maintenance_modules)
VALUES ('Card Enrollment','Find people and enroll cards only',TRUE,'["cardEnrollment"]');
