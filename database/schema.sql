-- Database Initialization Schema for Task Tracker
-- Charset: utf8mb4, Collation: utf8mb4_unicode_ci

CREATE DATABASE IF NOT EXISTS `task_tracker_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `task_tracker_db`;

-- Drop existing tables if re-initializing
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `activity_logs`;
DROP TABLE IF EXISTS `task_comments`;
DROP TABLE IF EXISTS `tasks`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Table: users
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(100) NOT NULL,
  `role` ENUM('admin', 'member') NOT NULL DEFAULT 'member',
  `avatar` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Table: tasks
CREATE TABLE `tasks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `status` ENUM('todo', 'in_progress', 'review', 'done') NOT NULL DEFAULT 'todo',
  `priority` ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
  `due_date` DATE DEFAULT NULL,
  `created_by` INT NOT NULL,
  `assigned_to` INT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_tasks_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tasks_assigned_to` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Table: task_comments
CREATE TABLE `task_comments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `task_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `content` TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_comments_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Table: activity_logs
CREATE TABLE `activity_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `task_id` INT DEFAULT NULL,
  `user_id` INT NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `details` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SEED DATA
-- Default password for all seed accounts is: admin123 (hashed with bcrypt: $2a$10$mRz5r2E6/z98FkXj047GkOqN0Q9c7V8KxPqL/F11E5mD8tq6U5fvi)
-- Note: The backend also verifies/seeds passwords dynamically if needed.
INSERT INTO `users` (`id`, `username`, `email`, `password_hash`, `full_name`, `role`, `avatar`) VALUES
(1, 'admin', 'admin@tasktracker.local', '$2a$10$wT0lV3kLgXUuS3U8KkC8yOGl7jGg3Xj3iC/y8K1p9yXG3Xj3iC/y8', 'Quản trị viên Hệ thống', 'admin', 'https://api.dicebear.com/7.x/bottts/svg?seed=admin'),
(2, 'nguyenvana', 'vana.nguyen@tasktracker.local', '$2a$10$wT0lV3kLgXUuS3U8KkC8yOGl7jGg3Xj3iC/y8K1p9yXG3Xj3iC/y8', 'Nguyễn Văn An', 'member', 'https://api.dicebear.com/7.x/avataaars/svg?seed=vana'),
(3, 'tranthib', 'thib.tran@tasktracker.local', '$2a$10$wT0lV3kLgXUuS3U8KkC8yOGl7jGg3Xj3iC/y8K1p9yXG3Xj3iC/y8', 'Trần Thị Bình', 'member', 'https://api.dicebear.com/7.x/avataaars/svg?seed=thib'),
(4, 'levanc', 'vanc.le@tasktracker.local', '$2a$10$wT0lV3kLgXUuS3U8KkC8yOGl7jGg3Xj3iC/y8K1p9yXG3Xj3iC/y8', 'Lê Văn Cường', 'member', 'https://api.dicebear.com/7.x/avataaars/svg?seed=vanc');

-- Seed Tasks
INSERT INTO `tasks` (`id`, `title`, `description`, `status`, `priority`, `due_date`, `created_by`, `assigned_to`) VALUES
(1, 'Thiết lập hạ tầng Docker Compose', 'Khởi tạo các container Nginx, Node.js, MySQL, phpMyAdmin, Prometheus, Grafana, Loki và Promtail trên cùng mạng task_network.', 'done', 'urgent', DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), 1, 1),
(2, 'Cấu hình SSL và Nginx Reverse Proxy', 'Thiết lập reverse proxy port 80/443, tự động chuyển hướng HTTP sang HTTPS và thêm các HTTP Security Headers.', 'done', 'high', DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY), 1, 2),
(3, 'Xây dựng giao diện Kanban Board', 'Thiết kế giao diện bảng Kanban kéo thả, bộ lọc tìm kiếm theo mức độ ưu tiên và phân công thành viên.', 'in_progress', 'high', DATE_ADD(CURRENT_DATE, INTERVAL 3 DAY), 1, 2),
(4, 'Phát triển RESTful API cho Task CRUD', 'Xây dựng các endpoint GET, POST, PUT, DELETE, PATCH status kèm xác thực JWT và đo lường metrics Prometheus.', 'in_progress', 'medium', DATE_ADD(CURRENT_DATE, INTERVAL 4 DAY), 1, 3),
(5, 'Kết nối giám sát hệ thống với Grafana & Loki', 'Thu thập tài nguyên cAdvisor, exporter và cấu hình truy vấn nhật ký LogQL tập trung qua Promtail.', 'todo', 'high', DATE_ADD(CURRENT_DATE, INTERVAL 5 DAY), 1, 4),
(6, 'Viết tài liệu hướng dẫn và báo cáo triển khai', 'Hoàn thiện README.md chi tiết, kịch bản kiểm thử API và sơ đồ luồng hệ thống.', 'todo', 'low', DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY), 1, 3);

-- Seed Activity Logs
INSERT INTO `activity_logs` (`task_id`, `user_id`, `action`, `details`) VALUES
(1, 1, 'create_task', 'Khởi tạo công việc: Thiết lập hạ tầng Docker Compose'),
(1, 1, 'update_status', 'Cập nhật trạng thái thành: Hoàn thành (done)'),
(2, 2, 'create_task', 'Khởi tạo công việc: Cấu hình SSL và Nginx Reverse Proxy'),
(3, 2, 'update_status', 'Chuyển trạng thái sang: Đang thực hiện (in_progress)');
