-- Update password hash for seeded users
USE station_management;

-- Hash for password "123456"
UPDATE users SET password = '$2b$10$fRKEtPkejupPEivKOJ0D0O22OfY8ad01jF2AN7P9/NBpzX3IukMIS' WHERE id IN (1, 2, 3, 4);
