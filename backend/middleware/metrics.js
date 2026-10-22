const client = require('prom-client');

// Create a Registry which registers the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'task-tracker-backend'
});

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

// Custom HTTP request counter
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests received',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

// Custom HTTP request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Histogram of HTTP response duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register]
});

// Task count gauge by status
const taskCountGauge = new client.Gauge({
  name: 'task_tracker_tasks_count',
  help: 'Current number of tasks categorized by status',
  labelNames: ['status'],
  registers: [register]
});

function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics') {
    return next();
  }

  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    
    // Normalize path to avoid high cardinality
    const route = req.baseUrl || req.path || 'unknown';
    const statusCode = res.statusCode ? res.statusCode.toString() : '500';

    httpRequestCounter.inc({
      method: req.method,
      route: route,
      status_code: statusCode
    });

    httpRequestDuration.observe({
      method: req.method,
      route: route,
      status_code: statusCode
    }, durationInSeconds);
  });

  next();
}

module.exports = {
  register,
  metricsMiddleware,
  taskCountGauge
};
