-- TapTrack Attendance System — upload-ready fresh installation schema.
-- Production database target: MySQL 8.0+ using the InnoDB storage engine.
--
-- Import this file after selecting an empty database in phpMyAdmin or your
-- hosting control panel. For the MySQL CLI, use:
--   mysql -u USER -p DATABASE_NAME < database.sql
--
-- No user account or default password is included. After importing, open
-- /setup in TapTrack to create the first administrator securely.

CREATE DATABASE IF NOT EXISTS attendance_system CHARACTER SET utf8 COLLATE utf8_general_ci;

USE attendance_system;

SET NAMES utf8 COLLATE utf8_general_ci;
SET default_storage_engine = InnoDB;
SET FOREIGN_KEY_CHECKS = 0;
CREATE TABLE IF NOT EXISTS sections (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  year_level VARCHAR(40) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sections_year_name (year_level, name),
  INDEX idx_sections_active_year (is_active, year_level, name)
);

CREATE TABLE IF NOT EXISTS students (
  card_id VARCHAR(128) NULL UNIQUE,
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_number VARCHAR(80) NOT NULL UNIQUE,
  contact VARCHAR(150),
  first_name VARCHAR(80) NOT NULL,
  middle_name VARCHAR(80),
  last_name VARCHAR(80) NOT NULL,
  program_id INT UNSIGNED NULL,
  year_level VARCHAR(40),
  section_id INT UNSIGNED NULL,
  birthday DATE NULL,
  institutional_email VARCHAR(150),
  photo_url VARCHAR(500),
  gender ENUM('Male', 'Female'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_students_name (last_name, first_name),
  INDEX idx_students_program (program_id),
  INDEX idx_students_active_name (is_active, last_name, first_name),
  INDEX idx_students_section (section_id),
  CONSTRAINT fk_students_section FOREIGN KEY (section_id) REFERENCES sections(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS employee_departments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL UNIQUE,
  code VARCHAR(40) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_employee_departments_active_name (is_active, name)
);

INSERT INTO employee_departments (id, name, code, is_active) VALUES
(1, 'NON-TEACHING PERSONNEL', 'NTP', 1),
(2, 'ADMINISTRATOR', 'ADMIN', 1),
(4, 'COLLEGE OF HEALTH SCIENCES', 'CHS', 1),
(5, 'COLLEGE OF ARTS AND SCIENCES', 'CAS', 1),
(6, 'COLLEGE OF BUSINESS, GOVERNANCE, AND ACCOUNTANCY', 'CBGA', 1),
(7, 'COLLEGE OF EDUCATION', 'CED', 1),
(8, 'COLLEGE OF ENGINEERING, ARCHITECTURE, AND COMPUTING', 'CEAC', 1),
(9, 'JUNIOR HIGH SCHOOL', 'JHS', 1),
(10, 'SENIOR HIGH SCHOOL', 'SHS', 1),
(11, 'ELEMENTARY', 'ELEM', 1),
(12, 'GRADUATE SCHOOL', 'GS', 1),
(13, 'LAW SCHOOL', 'LS', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  code = VALUES(code),
  is_active = VALUES(is_active);

CREATE TABLE IF NOT EXISTS gates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  campus VARCHAR(40) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gates_campus_name (campus, name),
  INDEX idx_gates_active_campus_name (is_active, campus, name)
);

INSERT INTO gates (id, name, campus, is_active) VALUES
(1, 'Gate 1', 'Main Campus', 1),
(2, 'Gate 2', 'Main Campus', 1),
(3, 'Gate 3', 'Main Campus', 1),
(4, 'Gate 4', 'Main Campus', 1);

CREATE TABLE IF NOT EXISTS kiosks (
  id VARCHAR(80) PRIMARY KEY,
  kiosk_type VARCHAR(32) NOT NULL,
  location VARCHAR(120) NOT NULL,
  display_name VARCHAR(120) NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at DATETIME NOT NULL,
  user_agent VARCHAR(500) NULL,
  ip_address VARCHAR(64) NULL,
  hostname VARCHAR(255) NULL,
  uptime_seconds BIGINT UNSIGNED NULL,
  browser_status VARCHAR(40) NULL,
  current_page VARCHAR(500) NULL,
  mac_address VARCHAR(32) NULL,
  operating_system VARCHAR(160) NULL,
  agent_last_seen_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_kiosks_seen (last_seen_at),
  INDEX idx_kiosks_type_location (kiosk_type, location)
);

CREATE TABLE IF NOT EXISTS alumni (
  card_id VARCHAR(128) NULL UNIQUE,
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NULL UNIQUE,
  id_number VARCHAR(80) NOT NULL UNIQUE,
  contact VARCHAR(150),
  first_name VARCHAR(80) NOT NULL,
  middle_name VARCHAR(80),
  last_name VARCHAR(80) NOT NULL,
  program_id INT UNSIGNED NULL,
  graduation_year SMALLINT UNSIGNED NOT NULL,
  birthday DATE NULL,
  institutional_email VARCHAR(150),
  photo_url VARCHAR(500),
  gender VARCHAR(30),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_alumni_name (last_name, first_name),
  INDEX idx_alumni_program (program_id),
  INDEX idx_alumni_active_name (is_active, last_name, first_name)
);

CREATE TABLE IF NOT EXISTS alumni_degrees (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  alumni_id INT UNSIGNED NOT NULL,
  program_id INT UNSIGNED NOT NULL,
  graduation_year SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_alumni_degree (alumni_id, program_id, graduation_year),
  INDEX idx_alumni_degrees_alumni (alumni_id)
);

CREATE TABLE IF NOT EXISTS kiosk_commands (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kiosk_id VARCHAR(80) NOT NULL,
  command VARCHAR(40) NOT NULL,
  channel ENUM('browser','agent') NOT NULL,
  payload JSON NULL,
  status ENUM('Queued','Dispatched','Completed','Failed','Unsupported') NOT NULL DEFAULT 'Queued',
  result_text VARCHAR(1000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  dispatched_at DATETIME NULL,
  completed_at DATETIME NULL,
  INDEX idx_kiosk_commands_poll (kiosk_id, channel, status, id),
  CONSTRAINT fk_kiosk_commands_kiosk FOREIGN KEY (kiosk_id) REFERENCES kiosks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS employees (
  card_id VARCHAR(128) NULL UNIQUE,
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_number VARCHAR(80) NOT NULL UNIQUE,
  first_name VARCHAR(80) NOT NULL,
  middle_name VARCHAR(80),
  last_name VARCHAR(80) NOT NULL,
  emp_dept_id INT UNSIGNED NOT NULL,
  contact VARCHAR(150),
  photo_url VARCHAR(500),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_employees_name (last_name, first_name),
  INDEX idx_employees_active_name (is_active, last_name, first_name),
  INDEX idx_employees_department_name (emp_dept_id, last_name, first_name),
  CONSTRAINT fk_employee_department FOREIGN KEY (emp_dept_id) REFERENCES employee_departments(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS schools (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL UNIQUE,
  code VARCHAR(40) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_schools_active_name (is_active, name)
);

-- Preliminary academic data imported from the installation templates.
-- These inserts are idempotent and preserve the school hierarchy.
INSERT INTO
  schools (name, code)
VALUES
  ('HIGHER EDUCATION', 'COLLEGE') ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  schools (name, code)
VALUES
  ('SENIOR HIGH SCHOOL', 'SHS') ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  schools (name, code)
VALUES
  ('JUNIOR HIGH SCHOOL', 'JHS') ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  schools (name, code)
VALUES
  ('ELEMENTARY', 'ELEM') ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

CREATE TABLE IF NOT EXISTS colleges (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_id INT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  code VARCHAR(40) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_college_school_code (school_id, code),
  INDEX idx_colleges_school_name (school_id, name),
  CONSTRAINT fk_college_school FOREIGN KEY (school_id) REFERENCES schools(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

INSERT INTO
  colleges (school_id, name, code)
SELECT
  id,
  'COLLEGE OF ARTS AND SCIENCES',
  'CAS'
FROM
  schools
WHERE
  code = 'COLLEGE'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  colleges (school_id, name, code)
SELECT
  id,
  'COLLEGE OF ENGINEERING, ARCHITECTURE & COMPUTING',
  'CEAC'
FROM
  schools
WHERE
  code = 'COLLEGE'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  colleges (school_id, name, code)
SELECT
  id,
  'COLLEGE OF BUSINESS, GOVERNANCE, & ACCOUNTANCY',
  'CBGA'
FROM
  schools
WHERE
  code = 'COLLEGE'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  colleges (school_id, name, code)
SELECT
  id,
  'COLLEGE OF EDUCATION',
  'CED'
FROM
  schools
WHERE
  code = 'COLLEGE'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  colleges (school_id, name, code)
SELECT
  id,
  'GRADUATE SCHOOL',
  'GRDSCHL'
FROM
  schools
WHERE
  code = 'COLLEGE'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  colleges (school_id, name, code)
SELECT
  id,
  'STDPRMT',
  '-'
FROM
  schools
WHERE
  code = 'COLLEGE'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  colleges (school_id, name, code)
SELECT
  id,
  'COLLEGE OF HEALTH SCIENCES',
  'CHS'
FROM
  schools
WHERE
  code = 'COLLEGE'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  colleges (school_id, name, code)
SELECT
  id,
  'RSTC',
  'RSTC'
FROM
  schools
WHERE
  code = 'COLLEGE'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  colleges (school_id, name, code)
SELECT
  id,
  'TESDA PROGRAMS',
  'TESDA'
FROM
  schools
WHERE
  code = 'COLLEGE'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  colleges (school_id, name, code)
SELECT
  id,
  'SENIOR HIGH SCHOOL',
  'SHS'
FROM
  schools
WHERE
  code = 'SHS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  colleges (school_id, name, code)
SELECT
  id,
  'COLLEGE OF LAW',
  'CL'
FROM
  schools
WHERE
  code = 'COLLEGE'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  colleges (school_id, name, code)
SELECT
  id,
  'ELEMENTARY',
  'ELEM'
FROM
  schools
WHERE
  code = 'ELEM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  colleges (school_id, name, code)
SELECT
  id,
  'JUNIOR HIGH SCHOOL',
  'JHS'
FROM
  schools
WHERE
  code = 'JHS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

CREATE TABLE IF NOT EXISTS departments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  college_id INT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  code VARCHAR(40) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_department_college_code (college_id, code),
  INDEX idx_departments_college_name (college_id, name),
  CONSTRAINT fk_department_college FOREIGN KEY (college_id) REFERENCES colleges(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  '-',
  '-'
FROM
  colleges
WHERE
  code = '-'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS (GENERAL) - OLD CURRICULUM',
  'AB'
FROM
  colleges
WHERE
  code = 'CAS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'ACCOUNTANCY',
  'ACCY'
FROM
  colleges
WHERE
  code = 'CBGA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS',
  'BA'
FROM
  colleges
WHERE
  code = 'CAS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'BUSN. ADMIN.',
  'BUSN.ADM.'
FROM
  colleges
WHERE
  code = 'CBGA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'CS/IT',
  'COMSTDS'
FROM
  colleges
WHERE
  code = 'CEAC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'DEPARTMENT OF EDUCATION PROGRAM',
  'DEPED'
FROM
  colleges
WHERE
  code = '-'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'EDUCATION',
  'EDUC'
FROM
  colleges
WHERE
  code = 'CED'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'ENGINEERING',
  'ENGG'
FROM
  colleges
WHERE
  code = 'CEAC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'ETEEAP',
  'ETEEAP'
FROM
  colleges
WHERE
  code = '-'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'GUIDANCE',
  'GUID'
FROM
  colleges
WHERE
  code = '-'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'HEALTH SCIENCES',
  'HLTSCI'
FROM
  colleges
WHERE
  code = 'CHS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'HRM',
  'HRM'
FROM
  colleges
WHERE
  code = 'CBGA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'LANGUAGE',
  'LANG'
FROM
  colleges
WHERE
  code = 'CAS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'LAW DEPARTMENT',
  'LAW'
FROM
  colleges
WHERE
  code = 'CL'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'MA/MS',
  'MA/MS'
FROM
  colleges
WHERE
  code = 'GRDSCHL'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'MATHEMATICS',
  'MATH'
FROM
  colleges
WHERE
  code = 'CAS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'MBA/MPA',
  'MBA/MPA'
FROM
  colleges
WHERE
  code = 'GRDSCHL'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'MEDTECH',
  'MEDTECH'
FROM
  colleges
WHERE
  code = 'CHS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'MIP/MIE/MIB/MIT/MIM/MIC',
  'MI PROGRAM'
FROM
  colleges
WHERE
  code = 'GRDSCHL'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'MN/MAN',
  'MN/MAN'
FROM
  colleges
WHERE
  code = 'GRDSCHL'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'NATIONAL SERVICE TRAINING PROGRAM',
  'NSTP'
FROM
  colleges
WHERE
  code = '-'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'NURSING',
  'NURSING'
FROM
  colleges
WHERE
  code = 'CHS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'OFFICE ADMINISTRATION',
  'OFC ADM'
FROM
  colleges
WHERE
  code = 'CBGA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'PHYSICAL EDUCATION',
  'P E'
FROM
  colleges
WHERE
  code = 'CED'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'PHD',
  'PHD'
FROM
  colleges
WHERE
  code = 'GRDSCHL'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'RELIGIOUS EDUCATION',
  'R E'
FROM
  colleges
WHERE
  code = 'CED'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'RSTC',
  'RSTC'
FROM
  colleges
WHERE
  code = 'RSTC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'SCIENCES',
  'SCIENCES'
FROM
  colleges
WHERE
  code = 'CAS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'SENIOR HIGH SCHOOL',
  'SEN-HISCH'
FROM
  colleges
WHERE
  code = 'SHS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'SOCIAL SCIENCES',
  'SOCSCI'
FROM
  colleges
WHERE
  code = 'CAS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'CROSS ENROLL, STUDY PERMIT',
  'STDPRMT'
FROM
  colleges
WHERE
  code = '-'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'TECHNOLOGICAL COURSES',
  'TECH'
FROM
  colleges
WHERE
  code = 'CEAC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'TECHNICAL & VOCATIONAL PROGRAMS',
  'TECHVOC'
FROM
  colleges
WHERE
  code = 'TESDA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  departments (college_id, name, code)
SELECT
  id,
  'GRADUATE SCHOOL',
  'U-GRDSCH'
FROM
  colleges
WHERE
  code = 'GRDSCHL'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

CREATE TABLE IF NOT EXISTS programs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id INT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  code VARCHAR(40) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_program_department_code (department_id, code),
  INDEX idx_programs_department_name (department_id, name),
  INDEX idx_programs_code (code),
  CONSTRAINT fk_program_department FOREIGN KEY (department_id) REFERENCES departments(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'ASSOCIATE IN AGRICULTURAL TECHNOLOGY',
  'AAT'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS (GENERAL) - OLD CURRICULUM',
  'AB'
FROM
  departments
WHERE
  code = 'AB'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS IN COMMUNICATION',
  'AB-COMM'
FROM
  departments
WHERE
  code = 'AB'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN ECONOMICS',
  'AB-ECON'
FROM
  departments
WHERE
  code = 'AB'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN ENGLISH',
  'AB-ENGL'
FROM
  departments
WHERE
  code = 'AB'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN HISTORY',
  'AB-HIST'
FROM
  departments
WHERE
  code = 'AB'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN LAW ENFORCEMENT & PUBLIC SAFETY',
  'AB-LEPS'
FROM
  departments
WHERE
  code = 'AB'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN LIBRARY SCIENCE',
  'AB-LS'
FROM
  departments
WHERE
  code = 'AB'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN MASS COMMUNICATION',
  'AB-MSCOM'
FROM
  departments
WHERE
  code = 'AB'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN PHILOSOPHY',
  'AB-PHILO'
FROM
  departments
WHERE
  code = 'AB'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN POLITICAL SCIENCE',
  'AB-POLSC'
FROM
  departments
WHERE
  code = 'AB'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN PSYCHOLOGY',
  'AB-PSYC'
FROM
  departments
WHERE
  code = 'AB'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'ACCOUNTING, BUSINESS & MANAGEMENT',
  'ABM'
FROM
  departments
WHERE
  code = 'SEN-HISCH'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'ASSOCIATE IN COMPUTER SCIENCE',
  'ACS'
FROM
  departments
WHERE
  code = 'COMSTDS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'ASSOCIATE IN COMPUTER TECHNOLOGY',
  'ACT'
FROM
  departments
WHERE
  code = 'COMSTDS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'ASSOCIATE IN FOOD TECHNOLOGY',
  'AFT'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'ASSOCIATE IN HOTEL & RESTAURANT MANAGEMENT',
  'AHRM'
FROM
  departments
WHERE
  code = 'HRM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'ASSOCIATE IN  HEALTH SCIENCE EDUCATION',
  'AHSE'
FROM
  departments
WHERE
  code = 'NURSING'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'ASSOCIATE IN INDUSTRIAL TECHNOLOGY - ARCHITECTURAL DRAFTING',
  'AIT-AD'
FROM
  departments
WHERE
  code = 'TECH'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'ASSOCIATE IN INDUSTRIAL TECHNOLOGY - ELECTRICITY & ELECTRONI',
  'AIT-EE'
FROM
  departments
WHERE
  code = 'TECH'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'ASSOCIATE IN INDUSTRIAL TECHNOLOGY - INDUSTRIAL ELECTRICITY',
  'AIT-IE'
FROM
  departments
WHERE
  code = 'TECH'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'ASSOCIATE IN NURSING AIDE',
  'ANA'
FROM
  departments
WHERE
  code = 'HLTSCI'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'ASSOCIATE IN OFFICE ADMINISTRATION',
  'AOA'
FROM
  departments
WHERE
  code = 'OFC ADM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS (GENERAL)',
  'BA'
FROM
  departments
WHERE
  code = 'BA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS IN COMMUNICATION',
  'BA-COMM'
FROM
  departments
WHERE
  code = 'BA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN ECONOMICS',
  'BA-ECON'
FROM
  departments
WHERE
  code = 'BA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN ENGLISH',
  'BA-ENGL'
FROM
  departments
WHERE
  code = 'BA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN HISTORY',
  'BA-HIST'
FROM
  departments
WHERE
  code = 'BA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN LAW ENFORCEMENT & PUBLIC SAFETY',
  'BA-LEPS'
FROM
  departments
WHERE
  code = 'BA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN LIBRARY SCIENCE',
  'BA-LS'
FROM
  departments
WHERE
  code = 'BA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN MASS COMMUNICATION',
  'BA-MSCOM'
FROM
  departments
WHERE
  code = 'BA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN PHILOSOPHY',
  'BA-PHILO'
FROM
  departments
WHERE
  code = 'BA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN POLITICAL SCIENCE',
  'BA-POLSC'
FROM
  departments
WHERE
  code = 'BA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF ARTS MAJOR IN PSYCHOLOGY',
  'BA-PSYC'
FROM
  departments
WHERE
  code = 'BA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN AGRICULTURAL TECHNOLOGY',
  'BAT'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN ELEMENTARY EDUCATION',
  'BEED'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BEED-ATTCC',
  'BEED-ATTCC'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN ELEMENTARY EDUCATION - EARLY CHILDHOOD',
  'BEED-ECED'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN ELEMENTARY EDUCATION - ENGLISH',
  'BEED-ENGL'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN ELEMENTARY EDUCATION - FILIPINO',
  'BEED-FIL'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN ELEMENTARY EDUCATION - GUIDANCE & COUNSELING',
  'BEED-GC'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN ELEMENTARY EDUCATION GENERAL',
  'BEED-GEN'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN ELEMENTARY EDUCATION - MUSIC,ARTS & PHYSICAL ED.',
  'BEED-MAPE'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN ELEMENTARY EDUCATION - MATHEMATICS',
  'BEED-MATH'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN ELEMENTARY EDUCATION - PRE-SCHOOL EDUCATION',
  'BEED-PRESCH'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN ELEMENTARY EDUCATION - SCIENCES & HEALTH',
  'BEED-SH'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN ELEMENTARY EDUCATION - SPECIAL EDUCATION',
  'BEED-SPED'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN ELEMENTARY EDUCATION - SOCIAL SCIENCES',
  'BEED-SS'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BIOLOGY INSTITUTE',
  'BIOL-INSTITUTE'
FROM
  departments
WHERE
  code = 'RSTC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF LIBRARY AND INFORMATION SCIENCE',
  'BLIS'
FROM
  departments
WHERE
  code = 'COMSTDS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN LIBRARY AND INFORMATION SCIENCE-ACA. LIB.',
  'BLIS-ACALIB'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN PUBLIC ADMINISTRATION',
  'BPA'
FROM
  departments
WHERE
  code = 'BUSN.ADM.'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN PHYSICAL EDUCATION MAJOR IN SCHOOL PHYSICAL EDUC',
  'BPE-SPE'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BPE MAJOR IN SPORTS AND WELLNESS MANAGEMENT',
  'BPE-SWM'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN PHYSICAL EDUCATION',
  'BPED'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN ENVIRONMENTAL SCIENCE',
  'BS-ENSCI'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BSMATH',
  'BS-MATH'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN AGRIBUSINESS',
  'BSAB'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN ACCOUNTANCY',
  'BSACCTCY'
FROM
  departments
WHERE
  code = 'ACCY'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BS IN ACCOUNTING TECHNOLOGY',
  'BSACCTECH'
FROM
  departments
WHERE
  code = 'ACCY'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN AGRICULTURE',
  'BSAGRI'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN AGRICULTURE - AGRIBUSINESS',
  'BSAGRI-AB'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN AGRICULTURE - ANIMAL SCIENCE',
  'BSAGRI-AS'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN AGRICULTURE - CROP SCIENCE',
  'BSAGRI-CS'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN AGRICULTURE - PLANT PATHOLOGY',
  'BSAGRI-PP'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN APPLIED MATHEMATICS',
  'BSAM'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN ARCHITECTURE',
  'BSARCH'
FROM
  departments
WHERE
  code = 'ENGG'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BSBA-MM WEEKEND SCHEDULE',
  'BSBA(WS)-MM'
FROM
  departments
WHERE
  code = 'BUSN.ADM.'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BSBA-FINANCIAL MANAGEMENT',
  'BSBA-FINMGT'
FROM
  departments
WHERE
  code = 'BUSN.ADM.'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BSBA MAJOR IN HUMAN RESOURCE DEVELOPMENT MANAGEMENT',
  'BSBA-HRDM'
FROM
  departments
WHERE
  code = 'BUSN.ADM.'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BSBA-MARKETING MANAGEMENT',
  'BSBA-MKTMGT'
FROM
  departments
WHERE
  code = 'BUSN.ADM.'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN BIOLOGY',
  'BSBIO'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN COMMERCE',
  'BSC'
FROM
  departments
WHERE
  code = 'BUSN.ADM.'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN COMMERECE MAJOR IN ACCOUNTING',
  'BSC-ACCTG'
FROM
  departments
WHERE
  code = 'ACCY'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN COMMERCE (B.S.C.) MAJOR IN AGRI-BUSN.',
  'BSC-AGRI-BUSN'
FROM
  departments
WHERE
  code = 'BUSN.ADM.'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN COMMERCE - ECONOMICS',
  'BSC-ECON'
FROM
  departments
WHERE
  code = 'BUSN.ADM.'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN COMMERCE - MANAGEMENT ACCOUNTING',
  'BSC-M A'
FROM
  departments
WHERE
  code = 'ACCY'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN COMMERCE - MANAGEMENT',
  'BSC-MGT'
FROM
  departments
WHERE
  code = 'BUSN.ADM.'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN COMMERCE - MARKETING',
  'BSC-MKTG'
FROM
  departments
WHERE
  code = 'BUSN.ADM.'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN COMMUNITY DEVELOPMENT',
  'BSCD'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN CIVIL ENGINEERING',
  'BSCE'
FROM
  departments
WHERE
  code = 'ENGG'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BSCE MAJOR IN STRUCTURAL ENGINEERING',
  'BSCE-SE'
FROM
  departments
WHERE
  code = 'ENGG'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN CHEMISTRY',
  'BSCHEM'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN CHEMICAL ENGINEERING',
  'BSCHEM E'
FROM
  departments
WHERE
  code = 'ENGG'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN COMPUTER ENGINEERING',
  'BSCOMP E'
FROM
  departments
WHERE
  code = 'ENGG'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN CRIMINOLOGY',
  'BSCRIM'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN COMPUTER SCIENCE',
  'BSCS'
FROM
  departments
WHERE
  code = 'COMSTDS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN EDUCATION',
  'BSE'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN EDUCATION - INVERTED',
  'BSE-INV.'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN ELECTRONICS ENGINEERING',
  'BSECE'
FROM
  departments
WHERE
  code = 'ENGG'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION',
  'BSED'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - BIOLOGY',
  'BSED-BIO'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - BIOLOGICAL SCIENCE',
  'BSED-BIOSCI'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - CHEMISTRY',
  'BSED-CHEM'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - ENGLISH & FILIPINO',
  'BSED-ENGFIL'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - ENGLISH',
  'BSED-ENGL'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - FILIPINO',
  'BSED-FIL'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - GUIDANCE & COUNSELING',
  'BSED-GC'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - GENERAL SCIENCE',
  'BSED-GENSC'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - HISTORY',
  'BSED-HIST'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - MUSIC, ARTS, PE & HEALTH',
  'BSED-MAPEH'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - MATHEMATICS',
  'BSED-MATH'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - PHYSICAL EDUCATION',
  'BSED-PE'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - PHYSICAL EDUC. & HEALTH',
  'BSED-PE-H'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - PHYSICS',
  'BSED-PHYS'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - PHYSICAL SCIENCES',
  'BSED-PHYSCI'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - RELIGIOUS EDUCATION',
  'BSED-RE'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - RELIGIOUS EDUC. (MAPAC)',
  'BSED-RE-MC'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION MAJOR IN SCIENCE',
  'BSED-SCI'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - SOCIAL STUDIES',
  'BSED-SS'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR IN SECONDARY EDUCATION - VALUES EDUCATION',
  'BSED-VALED'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN ELEMENTARY EDUCATION',
  'BSEED'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN ELECTRICAL ENGINEERING',
  'BSELEC E'
FROM
  departments
WHERE
  code = 'ENGG'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN FOOD TECHNOLOGY',
  'BSFT'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN GUIDANCE AND COUNSELING',
  'BSGC'
FROM
  departments
WHERE
  code = '-'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN GEODETIC ENGINEERING',
  'BSGE'
FROM
  departments
WHERE
  code = 'ENGG'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN HOSPITALITY MANAGEMENT',
  'BSHM'
FROM
  departments
WHERE
  code = 'HRM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN HOTEL & RESTAURANT MANAGEMENT',
  'BSHRM'
FROM
  departments
WHERE
  code = 'HRM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN INDUSTRIAL ENGINEERING',
  'BSIE'
FROM
  departments
WHERE
  code = 'ENGG'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN INFORMATION SYSTEMS',
  'BSIS'
FROM
  departments
WHERE
  code = 'COMSTDS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY',
  'BSIT'
FROM
  departments
WHERE
  code = 'COMSTDS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN MANAGEMENT ACCOUNTING',
  'BSMA'
FROM
  departments
WHERE
  code = 'ACCY'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN MATHEMATICS',
  'BSMATH'
FROM
  departments
WHERE
  code = 'MATH'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN MEDICAL TECHNOLOGY',
  'BSMEDTECH'
FROM
  departments
WHERE
  code = 'MEDTECH'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN NURSING',
  'BSN'
FROM
  departments
WHERE
  code = 'NURSING'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN OFFICE ADMINISTRATION-COMPUTER EDUC.',
  'BSOA-CE'
FROM
  departments
WHERE
  code = 'OFC ADM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN OFFICE ADMINISTRATION-OFFICE MANGT',
  'BSOA-OM'
FROM
  departments
WHERE
  code = 'OFC ADM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN PHARMACY',
  'BSPHAR'
FROM
  departments
WHERE
  code = 'HLTSCI'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BS PHYSICS - CERTIFICATION - PROGRAM',
  'BSPHYS-CERT'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN RELIGIOUS STUDIES',
  'BSRS'
FROM
  departments
WHERE
  code = 'BA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN SECRETARIAL ADMINISTRATION',
  'BSSA'
FROM
  departments
WHERE
  code = 'OFC ADM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN SOCIAL WORK',
  'BSSW'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BACHELOR OF SCIENCE IN THEOLOGY',
  'BSTHEO'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'CHEMISTRY INSTITUTE',
  'CHEM -INSTITUTE'
FROM
  departments
WHERE
  code = 'RSTC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'BS CHEMISTRY - CERTIFICATION - PROGRAM',
  'CHEM-CERT-PROG'
FROM
  departments
WHERE
  code = 'RSTC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'CERTIFICATION PROGRAM IN TECHNOLOGY & LIVELIHOOD EDUCATION',
  'CPTLE'
FROM
  departments
WHERE
  code = '-'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'DIPLOMA IN AGRICULTURAL TECHNOLOGY',
  'DAT'
FROM
  departments
WHERE
  code = 'SCIENCES'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'DIPLOMA IN COMMUNICATIONS AND COMPUTER TECHNOLOGY',
  'DCCT'
FROM
  departments
WHERE
  code = 'TECH'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'CERTIFICATE PROGRAM FOR TLE',
  'DEPED-CPTLE'
FROM
  departments
WHERE
  code = 'DEPED'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'DIPLOMA IN SECRETARIAL SCIENCE',
  'DSS'
FROM
  departments
WHERE
  code = 'OFC ADM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'EXPANDED TERTIARY EDUCATION EQUIVALENCY & ACCREDITATION PROG',
  'ETEEAP'
FROM
  departments
WHERE
  code = 'ETEEAP'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'HOUSE KEEPING',
  'HSKEP'
FROM
  departments
WHERE
  code = 'TECHVOC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'HUMANITIES, SOCIAL SCIENCES',
  'HUMSS'
FROM
  departments
WHERE
  code = 'SEN-HISCH'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'JURIS DOCTOR',
  'JD'
FROM
  departments
WHERE
  code = 'LAW'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'JUNIOR SECRETARIAL COURSE',
  'JSC'
FROM
  departments
WHERE
  code = 'OFC ADM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN LIBRARY SCIENCE',
  'MA-LS'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN EDUCATION',
  'MAED'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN EDUCATION MAJOR IN BIOLOGY',
  'MAED-BIO'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN EDUCATION MAJOR IN CHEMISTRY',
  'MAED-CHEM'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN EDUCATION MAJOR IN CULTURAL EDUCATION',
  'MAED-CULED'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN EDUCATION',
  'MAED-EA'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN EDUCATION MAJOR IN EDUCATIONAL MANAGEMENT',
  'MAED-EM'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN EDUCATION MAJOR IN FILIPINO',
  'MAED-FIL'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN EDUCATION MAJOR IN GUIDANCE & COUNSELING',
  'MAED-GC'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN EDUCATION MAJOR IN HISTORY',
  'MAED-HIST'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN EDUCATION MAJOR IN MATHEMATICS',
  'MAED-MATH'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN EDUCATION MAJOR IN PHYSICAL EDUCATION',
  'MAED-PE'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN EDUCATION MAJOR IN PHYSICS',
  'MAED-PHYSICS'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN EDUCATION MAJOR IN RELIGIOUS EDUCATION',
  'MAED-RE'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MAED- MAJOR IN TEACHING ENGLISH AS A SECOND LANGUAGE',
  'MAED-TESL'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN NURSING',
  'MAN'
FROM
  departments
WHERE
  code = 'MN/MAN'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS IN SCIENCE EDUCATION',
  'MASED'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF ARTS TEACHING ELEMENTARY AGRICULTURE',
  'MATEA'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER IN BUSINESS ADMINISTRATION',
  'MBA'
FROM
  departments
WHERE
  code = 'MBA/MPA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER IN BIOLOGY',
  'MIB'
FROM
  departments
WHERE
  code = 'MI PROGRAM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER IN CHEMISTRY',
  'MIC'
FROM
  departments
WHERE
  code = 'MI PROGRAM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER IN ENGLISH',
  'MIE'
FROM
  departments
WHERE
  code = 'MI PROGRAM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER IN MATHEMATICS',
  'MIM'
FROM
  departments
WHERE
  code = 'MI PROGRAM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER IN PHYSICS',
  'MIP'
FROM
  departments
WHERE
  code = 'MI PROGRAM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER IN INFORMATION TECHNOLOGY',
  'MIT'
FROM
  departments
WHERE
  code = 'MI PROGRAM'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER IN LEGAL STUDIES',
  'MLS'
FROM
  departments
WHERE
  code = 'LAW'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER IN NURSING',
  'MN'
FROM
  departments
WHERE
  code = 'MN/MAN'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER IN PUBLIC ADMINISTRATION',
  'MPA'
FROM
  departments
WHERE
  code = 'MBA/MPA'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF SCIENCE IN BIOLOGY',
  'MS-BIO'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF SCIENCE IN CHEMISTRY',
  'MS-CHEM'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF SCIENCE IN CROP SCIENCE',
  'MS-CRPSCI'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF SCIENCE IN INFORMATION TECHNOLOGY',
  'MS-IT'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF SCIENCE IN MATHEMATICS',
  'MS-MATH'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF SCIENCE IN PHYSICS',
  'MS-PHY'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'MASTER OF SCIENCE IN RURAL EXTENSION AND DEVELOPMENT',
  'MS-RED'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'NURSING AIDE',
  'NA'
FROM
  departments
WHERE
  code = 'HLTSCI'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'DOCTOR OF PHILOSOPHY IN EDUCATIONAL MANAGEMENT',
  'PH.D - EM'
FROM
  departments
WHERE
  code = 'PHD'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'DOCTOR OF PHILOSOPHY IN SCIENCE EDUCATION MAJOR IN CHEMISTRY',
  'PH.D.SCI.ED-CHM'
FROM
  departments
WHERE
  code = 'PHD'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'DOCTOR OF PHILOSOPHY IN SCIENCE EDUCATION MAJOR IN PHYSICS',
  'PH.D.SCI.ED-PHY'
FROM
  departments
WHERE
  code = 'PHD'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'PHYSICS INSTITUTE',
  'PHYS-INSTITUTE'
FROM
  departments
WHERE
  code = 'U-GRDSCH'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'RESIDENCY IN MASTERAL',
  'RESIDE-MA'
FROM
  departments
WHERE
  code = 'MA/MS'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'RESIDENCY IN DOCTORAL',
  'RESIDE-PHD'
FROM
  departments
WHERE
  code = 'PHD'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'STUDENTS TAKING ROTC ONLY',
  'ROTC'
FROM
  departments
WHERE
  code = '-'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'RSTC',
  'RSTC-BSE-BIO'
FROM
  departments
WHERE
  code = 'RSTC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'RSTC',
  'RSTC-BSE-CHEM'
FROM
  departments
WHERE
  code = 'RSTC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'RSTC',
  'RSTC-BSE-GENSC'
FROM
  departments
WHERE
  code = 'RSTC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'RSTC',
  'RSTC-BSE-MATH'
FROM
  departments
WHERE
  code = 'RSTC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'RSTC',
  'RSTC-BSE-PHYS'
FROM
  departments
WHERE
  code = 'RSTC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'RSTC',
  'RSTC-CPTLE'
FROM
  departments
WHERE
  code = 'RSTC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'SENIOR HIGH SCHOOL',
  'SHS'
FROM
  departments
WHERE
  code = 'SEN-HISCH'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'SPORTS',
  'SPORTS'
FROM
  departments
WHERE
  code = 'SEN-HISCH'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'SUMMER SCIENCE INSTITUTE',
  'SSI'
FROM
  departments
WHERE
  code = 'EDUC'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'STUDENT PERMIT',
  'STDPRMT'
FROM
  departments
WHERE
  code = '-'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

INSERT INTO
  programs (department_id, name, code)
SELECT
  id,
  'SCIENCE, TECHNOLOGY, ENGINEERING & MATHEMATICS',
  'STEM'
FROM
  departments
WHERE
  code = 'SEN-HISCH'
LIMIT
  1 ON DUPLICATE KEY
UPDATE
  name =
VALUES
(name),
  is_active = TRUE;

CREATE TABLE IF NOT EXISTS academic_periods (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_year VARCHAR(20) NOT NULL,
  term ENUM('First Semester', 'Second Semester', 'Summer', 'First Term', 'Second Term', 'Third Term') NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_academic_period (school_year, term),
  INDEX idx_academic_current (is_current)
);

INSERT INTO
  academic_periods (school_year, term, is_current)
VALUES
  ('2026-2027', 'First Semester', TRUE),
  ('2026-2027', 'Second Semester', FALSE),
  ('2026-2027', 'Summer', FALSE),
  ('2026-2027', 'First Term', FALSE),
  ('2026-2027', 'Second Term', FALSE),
  ('2026-2027', 'Third Term', FALSE) ON DUPLICATE KEY
UPDATE
  is_current = VALUES(is_current);

CREATE TABLE IF NOT EXISTS events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  description VARCHAR(500),
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  max_time_ins INT UNSIGNED NOT NULL DEFAULT 1,
  max_time_outs INT UNSIGNED NOT NULL DEFAULT 1,
  target_audience ENUM('Students', 'Employees', 'Both') NOT NULL DEFAULT 'Both',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT UNSIGNED,
  academic_period_id INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_schedule (starts_at, ends_at),
  INDEX idx_events_period_schedule (academic_period_id, starts_at),
  INDEX idx_events_creator_period (created_by, academic_period_id, starts_at)
);

CREATE TABLE IF NOT EXISTS university_entrance_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NULL,
  employee_id INT UNSIGNED NULL,
  person_type ENUM('Student', 'Employee', 'Alumnus') NULL,
  id_number_snapshot VARCHAR(80) NULL,
  name_snapshot VARCHAR(255) NULL,
  affiliation_snapshot VARCHAR(255) NULL,
  attendance_action ENUM('Time In', 'Time Out') NOT NULL DEFAULT 'Time In',
  scan_location VARCHAR(120) NULL,
  checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  academic_period_id INT UNSIGNED NULL,
  INDEX idx_university_period_time (academic_period_id, checked_in_at, id),
  INDEX idx_university_student_time (student_id, academic_period_id, checked_in_at, id),
  INDEX idx_university_employee_time (employee_id, academic_period_id, checked_in_at, id),
  CONSTRAINT fk_university_logs_student FOREIGN KEY (student_id) REFERENCES students(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_university_logs_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_university_logs_period FOREIGN KEY (academic_period_id) REFERENCES academic_periods(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_university_logs_identity CHECK ((student_id IS NULL) <> (employee_id IS NULL))
);

CREATE TABLE IF NOT EXISTS event_attendance_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NULL,
  employee_id INT UNSIGNED NULL,
  person_type ENUM('Student', 'Employee', 'Alumnus') NULL,
  id_number_snapshot VARCHAR(80) NULL,
  name_snapshot VARCHAR(255) NULL,
  affiliation_snapshot VARCHAR(255) NULL,
  attendance_action ENUM('Time In', 'Time Out') NOT NULL DEFAULT 'Time In',
  checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  academic_period_id INT UNSIGNED NULL,
  INDEX idx_event_attendance_event_time (event_id, checked_in_at, id),
  INDEX idx_event_attendance_student_time (student_id, event_id, checked_in_at, id),
  INDEX idx_event_attendance_employee_time (employee_id, event_id, checked_in_at, id),
  INDEX idx_event_attendance_period_time (academic_period_id, checked_in_at, id),
  INDEX idx_event_student_period_time (student_id, academic_period_id, checked_in_at, id),
  INDEX idx_event_employee_period_time (employee_id, academic_period_id, checked_in_at, id),
  CONSTRAINT fk_event_attendance_event FOREIGN KEY (event_id) REFERENCES events(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_event_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_event_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_event_attendance_period FOREIGN KEY (academic_period_id) REFERENCES academic_periods(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_event_attendance_identity CHECK ((student_id IS NULL) <> (employee_id IS NULL))
);

CREATE TABLE IF NOT EXISTS event_attendance_corrections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attendance_log_id BIGINT UNSIGNED NOT NULL,
  event_id INT UNSIGNED NOT NULL,
  attendee_id_number VARCHAR(50) NOT NULL,
  attendee_name VARCHAR(255) NOT NULL,
  attendee_type ENUM('Student', 'Employee', 'Alumnus') NOT NULL,
  correction_type ENUM('Updated', 'Deleted') NOT NULL,
  original_action ENUM('Time In', 'Time Out') NOT NULL,
  original_checked_in_at DATETIME NOT NULL,
  corrected_action ENUM('Time In', 'Time Out') NULL,
  corrected_checked_in_at DATETIME NULL,
  reason VARCHAR(500) NOT NULL,
  corrected_by INT UNSIGNED NOT NULL,
  corrector_name VARCHAR(255) NOT NULL,
  corrected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_corrections_event_time (event_id, corrected_at, id),
  INDEX idx_event_corrections_log (attendance_log_id, corrected_at)
);

CREATE TABLE IF NOT EXISTS permissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255),
  overview_access BOOLEAN NOT NULL DEFAULT FALSE,
  attendance_access BOOLEAN NOT NULL DEFAULT FALSE,
  special_events_access BOOLEAN NOT NULL DEFAULT FALSE,
  library_access BOOLEAN NOT NULL DEFAULT FALSE,
  maintenance_access BOOLEAN NOT NULL DEFAULT FALSE,
  maintenance_modules TEXT NULL,
  users_access BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO permissions (id, name, description, overview_access, attendance_access, special_events_access, library_access, maintenance_access, maintenance_modules, users_access, is_active) VALUES
(1, 'Administrator', 'Administrative access', TRUE, TRUE, TRUE, TRUE, TRUE, '["students","alumni","employees","schools","colleges","departments","employeeDepartments","programs","sections","gates","kiosks","academicPeriods","settings"]', TRUE, TRUE),
(2, 'Event Staff', 'Standard attendance access', FALSE, FALSE, TRUE, FALSE, FALSE, '[]', FALSE, TRUE),
(3, 'Student Organizations', NULL, FALSE, FALSE, TRUE, FALSE, FALSE, '[]', FALSE, TRUE),
(4, 'Superadmin', 'Full system access', TRUE, TRUE, TRUE, TRUE, TRUE, '["students","alumni","employees","schools","colleges","departments","employeeDepartments","programs","sections","gates","kiosks","academicPeriods","settings"]', TRUE, TRUE),
(156, 'Human Resources', NULL, FALSE, FALSE, TRUE, FALSE, FALSE, '[]', FALSE, TRUE),
(157, 'Attendance Access', NULL, TRUE, TRUE, FALSE, FALSE, FALSE, '[]', FALSE, TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  overview_access = VALUES(overview_access),
  attendance_access = VALUES(attendance_access),
  special_events_access = VALUES(special_events_access),
  library_access = VALUES(library_access),
  maintenance_access = VALUES(maintenance_access),
  maintenance_modules = VALUES(maintenance_modules),
  users_access = VALUES(users_access),
  is_active = VALUES(is_active);

INSERT IGNORE INTO permissions (name,description,maintenance_access,maintenance_modules)
VALUES ('Card Enrollment','Find people and enroll cards only',TRUE,'["cardEnrollment"]');

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(80) NOT NULL,
  middle_name VARCHAR(80),
  last_name VARCHAR(80) NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  institutional_email VARCHAR(190) NULL,
  password_hash VARCHAR(255) NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_institutional_email (institutional_email),
  INDEX idx_users_permission_name (permission_id, last_name, first_name),
  INDEX idx_users_name (last_name, first_name),
  CONSTRAINT fk_users_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  actor_name VARCHAR(255) NOT NULL,
  actor_username VARCHAR(80) NOT NULL,
  action VARCHAR(40) NOT NULL,
  module VARCHAR(80) NOT NULL,
  description VARCHAR(500) NOT NULL,
  method VARCHAR(10),
  path VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity_created (created_at),
  INDEX idx_activity_created_id (created_at, id),
  INDEX idx_activity_user (user_id),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE
  SET
    NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  jti CHAR(36) PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NULL,
  INDEX idx_auth_sessions_user (user_id),
  INDEX idx_auth_sessions_expiry (expires_at),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kiosk_sessions (
  jti CHAR(36) PRIMARY KEY,
  kiosk_id VARCHAR(80) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NULL,
  INDEX idx_kiosk_sessions_device (kiosk_id),
  INDEX idx_kiosk_sessions_expiry (expires_at)
);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket_key CHAR(64) NOT NULL,
  window_start BIGINT UNSIGNED NOT NULL,
  request_count INT UNSIGNED NOT NULL DEFAULT 1,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (bucket_key, window_start),
  INDEX idx_rate_limit_expiry (expires_at)
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- The users table intentionally starts empty. Create the first administrator
-- through the one-time /setup page after deployment.

INSERT
  IGNORE INTO system_settings (setting_key, setting_value)
VALUES
  ('school_name', 'Notre Dame of Marbel University'),
('duplicate_window', 'daily');

CREATE TABLE IF NOT EXISTS library_entrance_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NULL,
  employee_id INT UNSIGNED NULL,
  person_type ENUM('Student', 'Employee', 'Alumnus') NULL,
  id_number_snapshot VARCHAR(80) NULL,
  name_snapshot VARCHAR(255) NULL,
  affiliation_snapshot VARCHAR(255) NULL,
  checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  academic_period_id INT UNSIGNED NULL,
  INDEX idx_period_time (academic_period_id, checked_in_at, id),
  INDEX idx_student_time (student_id, checked_in_at, id),
  INDEX idx_employee_time (employee_id, checked_in_at, id),
  INDEX idx_student_period_time (student_id, academic_period_id, checked_in_at, id),
  INDEX idx_employee_period_time (employee_id, academic_period_id, checked_in_at, id)
  ,CONSTRAINT fk_library_logs_student FOREIGN KEY (student_id) REFERENCES students(id) ON UPDATE CASCADE ON DELETE RESTRICT
  ,CONSTRAINT fk_library_logs_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT
  ,CONSTRAINT fk_library_logs_period FOREIGN KEY (academic_period_id) REFERENCES academic_periods(id) ON UPDATE CASCADE ON DELETE RESTRICT
  ,CONSTRAINT chk_library_logs_identity CHECK ((student_id IS NULL) <> (employee_id IS NULL))
);

CREATE TABLE IF NOT EXISTS internet_section_entrance_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NULL,
  employee_id INT UNSIGNED NULL,
  person_type ENUM('Student', 'Employee', 'Alumnus') NULL,
  id_number_snapshot VARCHAR(80) NULL,
  name_snapshot VARCHAR(255) NULL,
  affiliation_snapshot VARCHAR(255) NULL,
  checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  academic_period_id INT UNSIGNED NULL,
  INDEX idx_period_time (academic_period_id, checked_in_at, id),
  INDEX idx_student_time (student_id, checked_in_at, id),
  INDEX idx_employee_time (employee_id, checked_in_at, id),
  INDEX idx_student_period_time (student_id, academic_period_id, checked_in_at, id),
  INDEX idx_employee_period_time (employee_id, academic_period_id, checked_in_at, id)
  ,CONSTRAINT fk_internet_logs_student FOREIGN KEY (student_id) REFERENCES students(id) ON UPDATE CASCADE ON DELETE RESTRICT
  ,CONSTRAINT fk_internet_logs_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT
  ,CONSTRAINT fk_internet_logs_period FOREIGN KEY (academic_period_id) REFERENCES academic_periods(id) ON UPDATE CASCADE ON DELETE RESTRICT
  ,CONSTRAINT chk_internet_logs_identity CHECK ((student_id IS NULL) <> (employee_id IS NULL))
);

SET FOREIGN_KEY_CHECKS = 1;

-- End of TapTrack installation schema.
