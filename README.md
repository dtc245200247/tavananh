# 🚀 Task Tracker - Hệ Thống Quản Lý Công Việc & Giám Sát Tập Trung

> **Đồ án môn học / Dự án triển khai hệ thống container hóa đa dịch vụ (DevOps & Microservices Architecture)**  
> Ứng dụng quản lý công việc và tiến độ (Kanban Board) chuẩn RESTful API, tích hợp Nginx Reverse Proxy (SSL/HTTPS), cơ sở dữ liệu MySQL, và hệ sinh thái giám sát - gom log toàn diện (Prometheus, cAdvisor, Grafana, Loki, Promtail).

---

## 📁 1. Cấu trúc thư mục dự án

```text
task-tracker/
├── backend/            # Mã nguồn backend (Node.js/Express, RESTful API & Prometheus Metrics)
│   ├── config/         # Cấu hình kết nối MySQL pool và tự động khởi tạo
│   ├── middleware/     # JWT Auth & Prometheus metrics collectors
│   ├── routes/         # API routes (Auth, Tasks CRUD/Kanban, Users)
│   ├── Dockerfile      # Dockerfile tối ưu Node.js Alpine
│   ├── package.json    # Thư viện phụ thuộc
│   └── server.js       # File khởi chạy ứng dụng Express
├── frontend/           # Mã nguồn giao diện người dùng tĩnh (SPA hiện đại)
│   ├── css/            # Giao diện Glassmorphism hiện đại (style.css)
│   ├── js/             # Logic tương tác Kanban kéo-thả, RESTful API (app.js)
│   ├── index.html      # Trang giao diện chính (Login, Board, Members)
│   ├── nginx.conf      # Cấu hình Nginx phục vụ web tĩnh
│   └── Dockerfile      # Dockerfile Nginx Alpine phục vụ Frontend
├── database/           # Khởi tạo CSDL MySQL
│   └── schema.sql      # Bảng dữ liệu (users, tasks, logs) và seed data mẫu
├── nginx/              # Cấu hình Nginx Reverse Proxy và chứng chỉ SSL
│   ├── certs/          # Tệp chứng chỉ SSL tự ký (nginx.crt, nginx.key)
│   ├── nginx.conf      # Reverse Proxy điều phối /api và /, ép HTTPS & Security Headers
│   └── Dockerfile      # Dockerfile cho task_proxy
├── monitoring/         # Cấu hình hệ thống giám sát và gom log
│   ├── prometheus/     # File cấu hình prometheus.yml kéo metrics từ các dịch vụ
│   ├── loki/           # File cấu hình loki-config.yml lưu trữ log tập trung
│   ├── promtail/       # File promtail-config.yml gom log từ Docker containers
│   └── grafana/        # Tự động nạp datasources và Dashboards mẫu
│       ├── provisioning/
│       └── dashboards/ # Dashboard trực quan hóa CPU/RAM/HTTP/Logs
├── docker-compose.yml  # File khai báo triển khai đồng bộ 10 container
├── .env.example        # Mẫu biến môi trường
├── .env                # Biến môi trường thực thi
└── README.md           # Hướng dẫn chi tiết dự án
```

---

## 🏗️ 2. Danh mục các dịch vụ triển khai (10 Containers)

Hệ thống được đóng gói hoàn toàn bằng Docker Compose, liên kết thông qua mạng nội bộ `task_network` và persistence dữ liệu bằng Docker Volumes:

| Container Name | Dịch vụ | Cổng Host : Container | Vai trò & Chức năng |
|---|---|---|---|
| `task_proxy` | Nginx Reverse Proxy | `80:80`, `443:443` | Cổng giao tiếp duy nhất tiếp nhận request từ bên ngoài, tự động chuyển HTTP sang HTTPS, đính kèm HTTP Security Headers và điều phối `/api` -> Backend, `/` -> Frontend. |
| `task_frontend` | Frontend SPA | `80` (Nội bộ) | Phục vụ mã nguồn giao diện HTML5/CSS3/JS tĩnh, hỗ trợ bảng Kanban kéo thả mượt mà. |
| `task_backend` | Backend Node.js | `5000` (Nội bộ) | Tiếp nhận & xử lý nghiệp vụ RESTful API, xác thực JWT, tương tác MySQL và xuất metrics `/metrics` cho Prometheus. |
| `task_mysql` | MySQL Database 8.0 | `3306` (Nội bộ) | Lưu trữ bền vững dữ liệu tài khoản, phân công và công việc với volume `task_mysql_data`. |
| `task_phpmyadmin` | phpMyAdmin GUI | `8080:80` | Giao diện đồ họa trực quan quản trị cơ sở dữ liệu MySQL. |
| `task_prometheus` | Prometheus | `9090:9090` | Thu thập metrics định kỳ từ cAdvisor, Backend Node.js và hệ thống proxy. |
| `task_cadvisor` | Google cAdvisor | `8085:8080` | Thu thập chi tiết thông số CPU, RAM, Network I/O thời gian thực của từng container. |
| `task_grafana` | Grafana Dashboard | `3000:3000` | Trực quan hóa dữ liệu giám sát tài nguyên và tích hợp tra cứu log tập trung từ Loki. |
| `task_loki` | Grafana Loki | `3100:3100` | Hệ thống lưu trữ tập trung và index log từ toàn bộ container. |
| `task_promtail` | Promtail Agent | Nội bộ | Tự động thu gom log từ Docker daemon socket đẩy về Loki. |

---

## ⚡ 3. Hướng dẫn khởi chạy hệ thống

### 3.1. Yêu cầu tiên quyết
* Đã cài đặt **Docker** và **Docker Compose** (hoặc Docker Desktop).
* Các cổng `80`, `443`, `3000`, `8080`, `8085`, `9090`, `3100` chưa bị ứng dụng khác chiếm dụng.

### 3.2. Lệnh khởi chạy một chạm
Mở terminal tại thư mục gốc của dự án và chạy câu lệnh:

```bash
docker compose up -d --build
```

### 3.3. Kiểm tra trạng thái hệ thống
Để đảm bảo tất cả 10 container đều có trạng thái **UP** và khỏe mạnh:

```bash
docker compose ps
```

Xem log theo dõi hoạt động thời gian thực:
```bash
docker compose logs -f task_backend
```

---

## 🌐 4. Địa chỉ truy cập & Tài khoản mặc định

| Mục tiêu | Địa chỉ truy cập | Tài khoản đăng nhập mặc định |
|---|---|---|
| **Ứng dụng Task Tracker (Giao diện chính)** | [https://localhost](https://localhost) *(hoặc http://localhost)* | **Admin:** `admin` / `admin123`<br>**Member:** `nguyenvana` / `admin123` |
| **Bảng điều khiển Grafana** | [http://localhost:3000](http://localhost:3000) | `admin` / `admin` |
| **Quản trị CSDL phpMyAdmin** | [http://localhost:8080](http://localhost:8080) | **User:** `task_user` / `task_password`<br>*(hoặc root / root_password)* |
| **Prometheus Targets** | [http://localhost:9090/targets](http://localhost:9090/targets) | Không yêu cầu đăng nhập |
| **cAdvisor Container Metrics** | [http://localhost:8085](http://localhost:8085) | Không yêu cầu đăng nhập |
| **Prometheus Raw Metrics** | [https://localhost/metrics](https://localhost/metrics) | Không yêu cầu đăng nhập |

> ⚠️ **Lưu ý về chứng chỉ HTTPS:**  
> Vì chứng chỉ SSL được tạo tự ký (*Self-signed Certificate*), khi truy cập `https://localhost` lần đầu, trình duyệt sẽ hiển thị cảnh báo bảo mật. Bạn chỉ cần chọn **Nâng cao (Advanced)** -> **Tiếp tục truy cập localhost (Proceed to localhost)** để vào ứng dụng.

---

## 📊 5. Hướng dẫn Giám sát & Quản lý Nhật ký (Logging)

### 5.1. Kiểm tra trạng thái mục tiêu (Prometheus Targets)
1. Truy cập `http://localhost:9090/targets`.
2. Kiểm tra các job: `backend`, `cadvisor`, `prometheus`, `nginx_proxy` đều hiển thị trạng thái **UP** (xanh lá).

### 5.2. Trực quan hóa dữ liệu trên Grafana
Hệ thống đã tự động cấu hình sẵn:
* **Datasources:** Prometheus (`http://task_prometheus:9090`) và Loki (`http://task_loki:3100`).
* **Dashboard mẫu:** Truy cập **Dashboards** -> thư mục **Task Tracker System** -> mở **Task Tracker - System Overview**.
* Dashboard hiển thị:
  * Biểu đồ công việc phân loại theo trạng thái (Todo, In Progress, Review, Done).
  * Thông lượng và tần suất yêu cầu HTTP (Requests/sec).
  * Thời gian phản hồi trung bình của API backend (Latency).
  * Biểu đồ tiêu thụ CPU & RAM của từng container theo thời gian thực từ cAdvisor.
  * Khung xem log tập trung trực tiếp từ Loki.

### 5.3. Tra cứu nhật ký bằng LogQL trong Grafana Explore
Truy cập mục **Explore** trên thanh điều hướng Grafana (`http://localhost:3000/explore`), chọn datasource **Loki**:
* Xem toàn bộ log của backend:
  ```logql
  {container="task_backend"}
  ```
* Tìm kiếm các bản ghi lỗi:
  ```logql
  {container="task_backend"} |= "error"
  ```
* Xem log của container Nginx Proxy:
  ```logql
  {container="task_proxy"}
  ```

---

## 🔒 6. Cấu hình Bảo mật và Tạo lại SSL nếu cần

Các chứng chỉ đã được tạo sẵn trong thư mục `nginx/certs/`. Nếu muốn cấp phát lại chứng chỉ tự ký mới, sử dụng lệnh OpenSSL:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/certs/nginx.key \
  -out nginx/certs/nginx.crt \
  -subj "/C=VN/ST=Hanoi/L=Hanoi/O=TaskTracker/OU=DevOps/CN=localhost"
```

Sau đó khởi động lại container Nginx Proxy:
```bash
docker compose restart task_proxy
```

---

## 🛡️ 7. Dừng và Thu dọn tài nguyên

Khi muốn dừng toàn bộ hệ thống:
```bash
docker compose down
```

Nếu muốn xóa toàn bộ dữ liệu database và volume để khởi tạo lại từ đầu:
```bash
docker compose down -v
```
