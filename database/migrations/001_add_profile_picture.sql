-- Migration 001: add profile_picture_path to private_school_teachers
-- Run this if schema.sql was already applied before Prompt 04.
ALTER TABLE private_school_teachers
  ADD COLUMN profile_picture_path VARCHAR(500) NULL
  AFTER selection_test_attempt3;
