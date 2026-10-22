const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const dbConfig = {
  host: process.env.DB_HOST || 'task_mysql',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'task_user',
  password: process.env.DB_PASSWORD || 'task_password',
  database: process.env.DB_NAME || 'task_tracker_db',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
};

let pool = null;
let useFallback = false;

// In-memory fallback database for local execution when Docker/MySQL is not running
const memoryDb = {
  users: [
    { id: 1, username: 'admin', email: 'admin@tasktracker.local', password_hash: '', full_name: 'Quản trị viên Hệ thống', role: 'admin', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=admin', created_at: new Date() },
    { id: 2, username: 'nguyenvana', email: 'vana.nguyen@tasktracker.local', password_hash: '', full_name: 'Nguyễn Văn An', role: 'member', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=vana', created_at: new Date() },
    { id: 3, username: 'tranthib', email: 'thib.tran@tasktracker.local', password_hash: '', full_name: 'Trần Thị Bình', role: 'member', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=thib', created_at: new Date() },
    { id: 4, username: 'levanc', email: 'vanc.le@tasktracker.local', password_hash: '', full_name: 'Lê Văn Cường', role: 'member', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=vanc', created_at: new Date() }
  ],
  tasks: [
    { id: 1, title: 'Thiết lập hạ tầng Docker Compose', description: 'Khởi tạo các container Nginx, Node.js, MySQL, phpMyAdmin, Prometheus, Grafana, Loki và Promtail trên cùng mạng task_network.', status: 'done', priority: 'urgent', due_date: '2026-10-23', created_by: 1, assigned_to: 1, created_at: new Date(), updated_at: new Date() },
    { id: 2, title: 'Cấu hình SSL và Nginx Reverse Proxy', description: 'Thiết lập reverse proxy port 80/443, tự động chuyển hướng HTTP sang HTTPS và thêm các HTTP Security Headers.', status: 'done', priority: 'high', due_date: '2026-10-24', created_by: 1, assigned_to: 2, created_at: new Date(), updated_at: new Date() },
    { id: 3, title: 'Xây dựng giao diện Kanban Board', description: 'Thiết kế giao diện bảng Kanban kéo thả, bộ lọc tìm kiếm theo mức độ ưu tiên và phân công thành viên.', status: 'in_progress', priority: 'high', due_date: '2026-10-25', created_by: 1, assigned_to: 2, created_at: new Date(), updated_at: new Date() },
    { id: 4, title: 'Phát triển RESTful API cho Task CRUD', description: 'Xây dựng các endpoint GET, POST, PUT, DELETE, PATCH status kèm xác thực JWT và đo lường metrics Prometheus.', status: 'in_progress', priority: 'medium', due_date: '2026-10-26', created_by: 1, assigned_to: 3, created_at: new Date(), updated_at: new Date() },
    { id: 5, title: 'Kết nối giám sát hệ thống với Grafana & Loki', description: 'Thu thập tài nguyên cAdvisor, exporter và cấu hình truy vấn nhật ký LogQL tập trung qua Promtail.', status: 'todo', priority: 'high', due_date: '2026-10-27', created_by: 1, assigned_to: 4, created_at: new Date(), updated_at: new Date() },
    { id: 6, title: 'Viết tài liệu hướng dẫn và báo cáo triển khai', description: 'Hoàn thiện README.md chi tiết, kịch bản kiểm thử API và sơ đồ luồng hệ thống.', status: 'todo', priority: 'low', due_date: '2026-10-29', created_by: 1, assigned_to: 3, created_at: new Date(), updated_at: new Date() }
  ],
  comments: [],
  logs: []
};

let nextTaskId = 7;
let nextUserId = 5;
let nextCommentId = 1;

function getPool() {
  if (!pool && !useFallback) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

// Function to test and wait for MySQL connection
async function initDatabase(maxRetries = 2, delayMs = 1500) {
  // Pre-hash password 'admin123' for in-memory accounts
  const hash = await bcrypt.hash('admin123', 10);
  memoryDb.users.forEach(u => { u.password_hash = hash; });

  let attempts = 0;
  while (attempts < maxRetries) {
    attempts++;
    try {
      const p = getPool();
      const [rows] = await p.query('SELECT 1 as connected');
      console.log(`[Database] Connected successfully to MySQL (${dbConfig.host}:${dbConfig.port}/${dbConfig.database})`);
      await ensureSeedAdmin(p);
      return p;
    } catch (err) {
      if (attempts >= maxRetries) {
        console.warn(`[Database] MySQL not reachable at ${dbConfig.host}:${dbConfig.port}. Activating robust local in-memory store.`);
        useFallback = true;
        return null;
      }
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
}

async function ensureSeedAdmin(p) {
  try {
    const [users] = await p.query('SELECT * FROM users WHERE username = ?', ['admin']);
    const passwordHash = await bcrypt.hash('admin123', 10);
    
    if (users.length === 0) {
      await p.query(
        'INSERT INTO users (username, email, password_hash, full_name, role, avatar) VALUES (?, ?, ?, ?, ?, ?)',
        ['admin', 'admin@tasktracker.local', passwordHash, 'Quản trị viên Hệ thống', 'admin', 'https://api.dicebear.com/7.x/bottts/svg?seed=admin']
      );
    } else {
      await p.query('UPDATE users SET password_hash = ? WHERE username = ?', [passwordHash, 'admin']);
    }
  } catch (err) {
    console.error('[Database] Note on seeding admin:', err.message);
  }
}

// Universal query dispatcher
async function query(sql, params = []) {
  if (!useFallback && pool) {
    try {
      return await pool.query(sql, params);
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        useFallback = true;
      } else {
        throw err;
      }
    }
  }

  // In-memory Query Engine
  const trimmed = sql.trim();
  const lower = trimmed.toLowerCase();

  // 1. SELECT COUNT / stats on tasks
  if (lower.startsWith('select count(*) as total from tasks')) {
    return [[{ total: memoryDb.tasks.length }]];
  }
  if (lower.startsWith('select status, count(*) as count from tasks')) {
    const map = {};
    memoryDb.tasks.forEach(t => { map[t.status] = (map[t.status] || 0) + 1; });
    const rows = Object.keys(map).map(status => ({ status, count: map[status] }));
    return [rows];
  }
  if (lower.startsWith('select priority, count(*) as count from tasks')) {
    const map = {};
    memoryDb.tasks.forEach(t => { map[t.priority] = (map[t.priority] || 0) + 1; });
    const rows = Object.keys(map).map(priority => ({ priority, count: map[priority] }));
    return [rows];
  }

  // 2. SELECT users
  if (lower.includes('from users') && lower.includes('username = ? or email = ?')) {
    const term = params[0];
    const match = memoryDb.users.filter(u => u.username === term || u.email === term);
    return [match];
  }
  if (lower.includes('from users') && lower.includes('where id = ?')) {
    const id = parseInt(params[0], 10);
    const match = memoryDb.users.filter(u => u.id === id);
    return [match];
  }
  if (lower.includes('from users') && lower.includes('where username = ?')) {
    const username = params[0];
    const match = memoryDb.users.filter(u => u.username === username);
    return [match];
  }
  if (lower.includes('from users') && lower.includes('count(t.id) as assigned_tasks_count')) {
    const rows = memoryDb.users.map(u => ({
      ...u,
      assigned_tasks_count: memoryDb.tasks.filter(t => t.assigned_to === u.id).length
    }));
    return [rows];
  }

  // 3. SELECT tasks
  if (lower.includes('from tasks t') && lower.includes('where t.id = ?')) {
    const id = parseInt(params[0], 10);
    const task = memoryDb.tasks.find(t => t.id === id);
    if (!task) return [[]];
    const creator = memoryDb.users.find(u => u.id === task.created_by) || {};
    const assignee = memoryDb.users.find(u => u.id === task.assigned_to) || {};
    return [[{
      ...task,
      creator_id: creator.id,
      creator_name: creator.full_name,
      assignee_id: assignee.id,
      assignee_name: assignee.full_name,
      assignee_avatar: assignee.avatar,
      assignee_username: assignee.username
    }]];
  }
  if (lower.includes('from tasks t')) {
    let result = memoryDb.tasks.map(task => {
      const creator = memoryDb.users.find(u => u.id === task.created_by) || {};
      const assignee = memoryDb.users.find(u => u.id === task.assigned_to) || {};
      return {
        ...task,
        creator_id: creator.id,
        creator_name: creator.full_name,
        assignee_id: assignee.id,
        assignee_name: assignee.full_name,
        assignee_avatar: assignee.avatar,
        assignee_username: assignee.username
      };
    });

    // Check filters
    if (lower.includes('status = ?')) {
      const s = params[0];
      result = result.filter(t => t.status === s);
    }
    if (lower.includes('priority = ?')) {
      const p = params[params.length - 1];
      result = result.filter(t => t.priority === p);
    }
    if (lower.includes('assigned_to = ?')) {
      const a = parseInt(params[0], 10);
      result = result.filter(t => t.assigned_to === a);
    }

    result.sort((a, b) => b.id - a.id);
    return [result];
  }

  // 4. SELECT comments
  if (lower.includes('from task_comments c') && lower.includes('where c.task_id = ?')) {
    const taskId = parseInt(params[0], 10);
    const comments = memoryDb.comments
      .filter(c => c.task_id === taskId)
      .map(c => {
        const u = memoryDb.users.find(usr => usr.id === c.user_id) || {};
        return { ...c, full_name: u.full_name, avatar: u.avatar };
      });
    return [comments];
  }

  // 5. INSERT INTO tasks
  if (lower.startsWith('insert into tasks')) {
    const [title, description, status, priority, due_date, created_by, assigned_to] = params;
    const newTask = {
      id: nextTaskId++,
      title,
      description,
      status,
      priority,
      due_date,
      created_by,
      assigned_to,
      created_at: new Date(),
      updated_at: new Date()
    };
    memoryDb.tasks.push(newTask);
    return [{ insertId: newTask.id, affectedRows: 1 }];
  }

  // 6. UPDATE tasks (status patch or full)
  if (lower.startsWith('update tasks set status = ? where id = ?')) {
    const [status, id] = params;
    const task = memoryDb.tasks.find(t => t.id === parseInt(id, 10));
    if (task) {
      task.status = status;
      task.updated_at = new Date();
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 0 }];
  }
  if (lower.startsWith('update tasks set title = ?')) {
    const [title, description, status, priority, due_date, assigned_to, id] = params;
    const task = memoryDb.tasks.find(t => t.id === parseInt(id, 10));
    if (task) {
      task.title = title;
      task.description = description;
      task.status = status;
      task.priority = priority;
      task.due_date = due_date;
      task.assigned_to = assigned_to;
      task.updated_at = new Date();
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 0 }];
  }

  // 7. DELETE FROM tasks
  if (lower.startsWith('delete from tasks where id = ?')) {
    const id = parseInt(params[0], 10);
    const idx = memoryDb.tasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      memoryDb.tasks.splice(idx, 1);
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 0 }];
  }

  // 8. INSERT INTO users
  if (lower.startsWith('insert into users')) {
    const [username, email, password_hash, full_name, role, avatar] = params;
    const newUser = {
      id: nextUserId++,
      username,
      email,
      password_hash,
      full_name,
      role,
      avatar,
      created_at: new Date()
    };
    memoryDb.users.push(newUser);
    return [{ insertId: newUser.id, affectedRows: 1 }];
  }

  // 9. INSERT INTO task_comments
  if (lower.startsWith('insert into task_comments')) {
    const [task_id, user_id, content] = params;
    const newComment = {
      id: nextCommentId++,
      task_id: parseInt(task_id, 10),
      user_id: parseInt(user_id, 10),
      content,
      created_at: new Date()
    };
    memoryDb.comments.push(newComment);
    return [{ insertId: newComment.id, affectedRows: 1 }];
  }

  // 10. INSERT INTO activity_logs
  if (lower.startsWith('insert into activity_logs')) {
    return [{ insertId: 1, affectedRows: 1 }];
  }

  // Fallback default
  return [[]];
}

module.exports = {
  getPool,
  initDatabase,
  query
};
