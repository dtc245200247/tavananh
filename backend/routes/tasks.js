const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { taskCountGauge } = require('../middleware/metrics');

// Helper to refresh Prometheus task gauges
async function updatePrometheusTaskMetrics() {
  try {
    const [rows] = await query('SELECT status, COUNT(*) as count FROM tasks GROUP BY status');
    const statuses = ['todo', 'in_progress', 'review', 'done'];
    const map = {};
    rows.forEach(r => { map[r.status] = r.count; });
    statuses.forEach(s => {
      taskCountGauge.set({ status: s }, map[s] || 0);
    });
  } catch (err) {
    // Ignore metric update errors
  }
}

// GET /api/tasks/stats - Get task counts and breakdown
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [totalRows] = await query('SELECT COUNT(*) as total FROM tasks');
    const [statusRows] = await query('SELECT status, COUNT(*) as count FROM tasks GROUP BY status');
    const [priorityRows] = await query('SELECT priority, COUNT(*) as count FROM tasks GROUP BY priority');
    
    const byStatus = { todo: 0, in_progress: 0, review: 0, done: 0 };
    statusRows.forEach(r => { byStatus[r.status] = r.count; });

    const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 };
    priorityRows.forEach(r => { byPriority[r.priority] = r.count; });

    updatePrometheusTaskMetrics();

    return res.json({
      success: true,
      data: {
        total: totalRows[0].total || 0,
        byStatus,
        byPriority
      }
    });
  } catch (err) {
    console.error('[Tasks Error - Stats]:', err);
    return res.status(500).json({ success: false, message: 'Lỗi khi thống kê công việc.' });
  }
});

// GET /api/tasks - List all tasks with search & filter
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, priority, assigned_to, search } = req.query;
    let sql = `
      SELECT 
        t.id, t.title, t.description, t.status, t.priority, t.due_date,
        t.created_at, t.updated_at,
        u_creator.id as creator_id, u_creator.full_name as creator_name,
        u_assignee.id as assignee_id, u_assignee.full_name as assignee_name, 
        u_assignee.avatar as assignee_avatar, u_assignee.username as assignee_username
      FROM tasks t
      LEFT JOIN users u_creator ON t.created_by = u_creator.id
      LEFT JOIN users u_assignee ON t.assigned_to = u_assignee.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND t.status = ?';
      params.push(status);
    }
    if (priority) {
      sql += ' AND t.priority = ?';
      params.push(priority);
    }
    if (assigned_to) {
      sql += ' AND t.assigned_to = ?';
      params.push(assigned_to);
    }
    if (search) {
      sql += ' AND (t.title LIKE ? OR t.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY t.updated_at DESC, t.id DESC';

    const [tasks] = await query(sql, params);
    updatePrometheusTaskMetrics();

    return res.json({ success: true, data: tasks });
  } catch (err) {
    console.error('[Tasks Error - List]:', err);
    return res.status(500).json({ success: false, message: 'Lỗi khi tải danh sách công việc.' });
  }
});

// GET /api/tasks/:id - Task details with comments
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const [tasks] = await query(`
      SELECT 
        t.id, t.title, t.description, t.status, t.priority, t.due_date,
        t.created_at, t.updated_at,
        u_creator.id as creator_id, u_creator.full_name as creator_name,
        u_assignee.id as assignee_id, u_assignee.full_name as assignee_name, u_assignee.avatar as assignee_avatar
      FROM tasks t
      LEFT JOIN users u_creator ON t.created_by = u_creator.id
      LEFT JOIN users u_assignee ON t.assigned_to = u_assignee.id
      WHERE t.id = ?
    `, [taskId]);

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy công việc.' });
    }

    const [comments] = await query(`
      SELECT c.id, c.content, c.created_at, u.id as user_id, u.full_name, u.avatar
      FROM task_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
    `, [taskId]);

    return res.json({
      success: true,
      data: {
        ...tasks[0],
        comments
      }
    });
  } catch (err) {
    console.error('[Tasks Error - Get]:', err);
    return res.status(500).json({ success: false, message: 'Lỗi khi lấy chi tiết công việc.' });
  }
});

// POST /api/tasks - Create task
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, status, priority, due_date, assigned_to } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({ success: false, message: 'Tiêu đề công việc không được để trống.' });
    }

    const taskStatus = status || 'todo';
    const taskPriority = priority || 'medium';
    const createdBy = req.user.id;
    const assignee = assigned_to ? parseInt(assigned_to, 10) : null;
    const dueDate = due_date || null;

    const [result] = await query(
      'INSERT INTO tasks (title, description, status, priority, due_date, created_by, assigned_to) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title.trim(), description || '', taskStatus, taskPriority, dueDate, createdBy, assignee]
    );

    await query(
      'INSERT INTO activity_logs (task_id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [result.insertId, req.user.id, 'create_task', `Tạo công việc mới: ${title.trim()}`]
    );

    updatePrometheusTaskMetrics();

    return res.status(201).json({
      success: true,
      message: 'Khởi tạo công việc thành công.',
      data: { id: result.insertId }
    });
  } catch (err) {
    console.error('[Tasks Error - Create]:', err);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo công việc.' });
  }
});

// PUT /api/tasks/:id - Update task
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { title, description, status, priority, due_date, assigned_to } = req.body;

    const [existing] = await query('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy công việc để cập nhật.' });
    }

    const current = existing[0];
    const newTitle = title !== undefined ? title.trim() : current.title;
    const newDesc = description !== undefined ? description : current.description;
    const newStatus = status !== undefined ? status : current.status;
    const newPriority = priority !== undefined ? priority : current.priority;
    const newDueDate = due_date !== undefined ? due_date : current.due_date;
    const newAssignee = assigned_to !== undefined ? (assigned_to ? parseInt(assigned_to, 10) : null) : current.assigned_to;

    await query(
      'UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, due_date = ?, assigned_to = ? WHERE id = ?',
      [newTitle, newDesc, newStatus, newPriority, newDueDate, newAssignee, taskId]
    );

    await query(
      'INSERT INTO activity_logs (task_id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [taskId, req.user.id, 'update_task', `Cập nhật thông tin công việc: ${newTitle}`]
    );

    updatePrometheusTaskMetrics();

    return res.json({ success: true, message: 'Cập nhật công việc thành công.' });
  } catch (err) {
    console.error('[Tasks Error - Update]:', err);
    return res.status(500).json({ success: false, message: 'Lỗi khi cập nhật công việc.' });
  }
});

// PATCH /api/tasks/:id/status - Quick update status (Kanban drag-and-drop)
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { status } = req.body;

    const validStatuses = ['todo', 'in_progress', 'review', 'done'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái công việc không hợp lệ.' });
    }

    const [result] = await query('UPDATE tasks SET status = ? WHERE id = ?', [status, taskId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy công việc.' });
    }

    await query(
      'INSERT INTO activity_logs (task_id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [taskId, req.user.id, 'update_status', `Chuyển trạng thái sang: ${status}`]
    );

    updatePrometheusTaskMetrics();

    return res.json({ success: true, message: 'Cập nhật trạng thái thành công.', status });
  } catch (err) {
    console.error('[Tasks Error - Status]:', err);
    return res.status(500).json({ success: false, message: 'Lỗi khi cập nhật trạng thái công việc.' });
  }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const [result] = await query('DELETE FROM tasks WHERE id = ?', [taskId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy công việc để xóa.' });
    }

    await query(
      'INSERT INTO activity_logs (task_id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [taskId, req.user.id, 'delete_task', `Đã xóa công việc ID: ${taskId}`]
    );

    updatePrometheusTaskMetrics();

    return res.json({ success: true, message: 'Xóa công việc thành công.' });
  } catch (err) {
    console.error('[Tasks Error - Delete]:', err);
    return res.status(500).json({ success: false, message: 'Lỗi khi xóa công việc.' });
  }
});

// POST /api/tasks/:id/comments - Add comment to task
router.post('/:id/comments', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Nội dung bình luận không được rỗng.' });
    }

    const [result] = await query(
      'INSERT INTO task_comments (task_id, user_id, content) VALUES (?, ?, ?)',
      [taskId, req.user.id, content.trim()]
    );

    return res.status(201).json({
      success: true,
      message: 'Thêm bình luận thành công.',
      data: {
        id: result.insertId,
        content: content.trim(),
        user_id: req.user.id,
        full_name: req.user.full_name,
        created_at: new Date()
      }
    });
  } catch (err) {
    console.error('[Tasks Error - Comment]:', err);
    return res.status(500).json({ success: false, message: 'Lỗi khi gửi bình luận.' });
  }
});

module.exports = router;
