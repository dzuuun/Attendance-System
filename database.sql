CREATE DATABASE IF NOT EXISTS attendance_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE attendance_system;

CREATE TABLE IF NOT EXISTS students (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_number VARCHAR(80) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  program_section VARCHAR(150) NOT NULL,
  contact VARCHAR(150),
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

CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  person_type ENUM('Student','Employee') NOT NULL,
  person_id INT UNSIGNED NOT NULL,
  id_number VARCHAR(80) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attendance_date (checked_in_at),
  INDEX idx_attendance_person (person_type, person_id)
);

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
