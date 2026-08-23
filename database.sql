CREATE DATABASE IF NOT EXISTS attendance_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE attendance_system;

CREATE TABLE IF NOT EXISTS students (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_number VARCHAR(80) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  program_section VARCHAR(150) NOT NULL,
  contact VARCHAR(150),
  first_name VARCHAR(80),
  middle_name VARCHAR(80),
  last_name VARCHAR(80),
  program_id INT UNSIGNED NULL,
  year_level VARCHAR(40),
  birthday DATE NULL,
  institutional_email VARCHAR(150),
  gender ENUM('Male','Female','Other','Prefer not to say'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employees (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_number VARCHAR(80) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  department_role VARCHAR(150) NOT NULL,
  contact VARCHAR(150),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schools (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL UNIQUE,
  code VARCHAR(40) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS colleges (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_id INT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  code VARCHAR(40) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_college_school_code (school_id, code),
  CONSTRAINT fk_college_school FOREIGN KEY (school_id) REFERENCES schools(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS departments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  college_id INT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  code VARCHAR(40) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_department_college_code (college_id, code),
  CONSTRAINT fk_department_college FOREIGN KEY (college_id) REFERENCES colleges(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS programs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id INT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  code VARCHAR(40) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_program_department_code (department_id, code),
  CONSTRAINT fk_program_department FOREIGN KEY (department_id) REFERENCES departments(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(80) NULL AFTER contact,
  ADD COLUMN IF NOT EXISTS middle_name VARCHAR(80) NULL AFTER first_name,
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(80) NULL AFTER middle_name,
  ADD COLUMN IF NOT EXISTS program_id INT UNSIGNED NULL AFTER last_name,
  ADD COLUMN IF NOT EXISTS year_level VARCHAR(40) NULL AFTER program_id,
  ADD COLUMN IF NOT EXISTS birthday DATE NULL AFTER year_level,
  ADD COLUMN IF NOT EXISTS institutional_email VARCHAR(150) NULL AFTER birthday,
  ADD COLUMN IF NOT EXISTS gender ENUM('Male','Female','Other','Prefer not to say') NULL AFTER institutional_email,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER gender;

UPDATE students SET
  first_name=COALESCE(first_name,SUBSTRING_INDEX(full_name,' ',1)),
  last_name=COALESCE(last_name,CASE WHEN full_name LIKE '% %' THEN SUBSTRING_INDEX(full_name,' ',-1) ELSE full_name END),
  year_level=COALESCE(year_level,CASE WHEN program_section LIKE '%·%' THEN TRIM(SUBSTRING_INDEX(program_section,'·',-1)) ELSE NULL END),
  institutional_email=COALESCE(institutional_email,contact);

CREATE TABLE IF NOT EXISTS events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  description VARCHAR(500),
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  max_time_ins INT UNSIGNED NOT NULL DEFAULT 1,
  max_time_outs INT UNSIGNED NOT NULL DEFAULT 1,
  target_audience ENUM('Students','Employees','Both') NOT NULL DEFAULT 'Both',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_schedule (starts_at, ends_at)
);

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS target_audience ENUM('Students','Employees','Both') NOT NULL DEFAULT 'Both' AFTER max_time_outs;

CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  person_type ENUM('Student','Employee') NOT NULL,
  person_id INT UNSIGNED NOT NULL,
  id_number VARCHAR(80) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  event_id INT UNSIGNED NULL,
  attendance_action ENUM('Time In','Time Out') NOT NULL DEFAULT 'Time In',
  checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attendance_date (checked_in_at),
  INDEX idx_attendance_person (person_type, person_id),
  INDEX idx_attendance_event (event_id)
);

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS attendance_action ENUM('Time In','Time Out') NOT NULL DEFAULT 'Time In' AFTER full_name;
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS event_id INT UNSIGNED NULL AFTER full_name;

CREATE TABLE IF NOT EXISTS student_attendance (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  id_number VARCHAR(80) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  event_id INT UNSIGNED NULL,
  attendance_action ENUM('Time In','Time Out') NOT NULL DEFAULT 'Time In',
  checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  legacy_attendance_id BIGINT UNSIGNED NULL UNIQUE,
  INDEX idx_student_attendance_date (checked_in_at),
  INDEX idx_student_attendance_person (student_id),
  INDEX idx_student_attendance_event (event_id)
);

CREATE TABLE IF NOT EXISTS employee_attendance (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id INT UNSIGNED NOT NULL,
  id_number VARCHAR(80) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  event_id INT UNSIGNED NULL,
  attendance_action ENUM('Time In','Time Out') NOT NULL DEFAULT 'Time In',
  checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  legacy_attendance_id BIGINT UNSIGNED NULL UNIQUE,
  INDEX idx_employee_attendance_date (checked_in_at),
  INDEX idx_employee_attendance_person (employee_id),
  INDEX idx_employee_attendance_event (event_id)
);

-- Preserve records created before student and employee attendance were separated.
INSERT IGNORE INTO student_attendance
  (student_id,id_number,full_name,event_id,attendance_action,checked_in_at,legacy_attendance_id)
SELECT person_id,id_number,full_name,event_id,attendance_action,checked_in_at,id
FROM attendance WHERE person_type='Student';

INSERT IGNORE INTO employee_attendance
  (employee_id,id_number,full_name,event_id,attendance_action,checked_in_at,legacy_attendance_id)
SELECT person_id,id_number,full_name,event_id,attendance_action,checked_in_at,id
FROM attendance WHERE person_type='Employee';

-- The combined legacy table is no longer used after both migrations succeed.
DROP TABLE attendance;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('Superadmin','Administrator','Staff') NOT NULL DEFAULT 'Staff',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE users MODIFY role ENUM('Superadmin','Administrator','Staff') NOT NULL DEFAULT 'Staff';

-- Initial credentials: superadmin / SuperAdmin@123 (change after first login).
INSERT INTO users (full_name,username,password_hash,role,is_active)
VALUES ('System Superadmin','superadmin','$2b$12$D/sggVGojEt0X4jQfj5PmO/eBLIJRZqXh.RBJSaRATuCmH/0NBD7u','Superadmin',TRUE)
ON DUPLICATE KEY UPDATE role='Superadmin',is_active=TRUE;

INSERT IGNORE INTO system_settings (setting_key,setting_value) VALUES
('school_name','TapTrack Academy'),('duplicate_window','daily');

INSERT IGNORE INTO students (id_number,full_name,program_section,contact) VALUES
('STU-2026-001','Mikaela Reyes','BS Information Technology · 2A','mikaela@school.edu'),
('STU-2026-002','James Navarro','BS Business Administration · 1B','james@school.edu'),
('STU-2026-003','Alyssa Cruz','BS Computer Science · 3A','alyssa@school.edu');
INSERT IGNORE INTO employees (id_number,full_name,department_role,contact) VALUES
('EMP-2026-001','Dr. Elena Garcia','Academic Affairs · Faculty','elena@school.edu'),
('EMP-2026-002','Marco Villanueva','Administration · Registrar','marco@school.edu');
