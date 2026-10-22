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

function getPool() {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
}

// Function to test and wait for MySQL connection with retries
async function initDatabase(maxRetries = 15, delayMs = 3000) {
  let attempts = 0;
  while (attempts < maxRetries) {
    attempts++;
    try {
      const p = getPool();
      const [rows] = await p.query('SELECT 1 as connected');
      console.log(`[Database] Connected successfully to MySQL (${dbConfig.host}:${dbConfig.port}/${dbConfig.database})`);
      
      // Ensure seed admin exists with valid bcrypt password 'admin123'
      await ensureSeedAdmin(p);
      return p;
    } catch (err) {
      console.warn(`[Database] Connection attempt ${attempts}/${maxRetries} failed: ${err.message}. Retrying in ${delayMs / 1000}s...`);
      if (attempts >= maxRetries) {
        console.error('[Database] Could not connect to MySQL after maximum retries.');
        throw err;
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
      console.log('[Database] Seed admin user created.');
    } else {
      // Refresh admin password hash to ensure admin123 works properly
      await p.query('UPDATE users SET password_hash = ? WHERE username = ?', [passwordHash, 'admin']);
    }
  } catch (err) {
    console.error('[Database] Note on seeding admin:', err.message);
  }
}

module.exports = {
  getPool,
  initDatabase,
  query: async (sql, params) => {
    const p = getPool();
    return await p.query(sql, params);
  }
};
