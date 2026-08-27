-- Update password hash for seeded users
USE station_management;

-- Hash for password "123456"
UPDATE users SET password = '$2b$10$8K1p/a0dL1LXMc.0zKkQwOJQYz3HJrZ8p5e5e5e5e5e5e5e5e5e' WHERE id IN (1, 2, 3, 4);
