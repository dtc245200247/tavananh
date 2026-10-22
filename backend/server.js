require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./config/db');
const { register, metricsMiddleware } = require('./middleware/metrics');

const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all requests (will be proxied via Nginx)
app.use(cors());
app.use(express.json());

// Structured JSON log format for Docker & Promtail & Loki ingestion
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'error' : (res.statusCode >= 400 ? 'warn' : 'info'),
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
    };
    if (res.statusCode >= 500) {
      console.error(JSON.stringify(logEntry));
    } else if (res.statusCode >= 400) {
      console.warn(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  });
  next();
});

// Prometheus metrics recording middleware
app.use(metricsMiddleware);

// Prometheus metrics scrape endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'task-tracker-backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Mount Application Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);

// Serve frontend static files
const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend')));

// 404 Fallback for unhandled API or file routes
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: `Tài nguyên ${req.originalUrl} không tồn tại trên hệ thống.` });
  }
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    message: err.message,
    stack: err.stack
  }));
  res.status(500).json({ success: false, message: 'Đã xảy ra lỗi nội bộ máy chủ.' });
});

// Start Server and Connect Database
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Task Tracker Backend API is running on port ${PORT}`
      }));
    });
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'fatal',
      message: 'Failed to start server due to database connection error',
      error: err.message
    }));
    process.exit(1);
  }
}

startServer();
