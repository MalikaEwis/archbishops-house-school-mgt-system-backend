-- Migration 002: Add profile_picture_path to international_school_teachers
ALTER TABLE international_school_teachers
  ADD COLUMN profile_picture_path VARCHAR(500) NULL
  AFTER email;
