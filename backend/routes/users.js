const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// GET /api/users - List members
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [users] = await query(`
      SELECT 
        u.id, u.username, u.email, u.full_name, u.role, u.avatar, u.created_at,
        COUNT(t.id) as assigned_tasks_count
      FROM users u
      LEFT JOIN tasks t ON u.id = t.assigned_to
      GROUP BY u.id
      ORDER BY u.role ASC, u.id ASC
    `);

    return res.json({ success: true, data: users });
  } catch (err) {
    console.error('[Users Error - List]:', err);
    return res.status(500).json({ success: false, message: 'Lỗi khi tải danh sách thành viên.' });
  }
});

// POST /api/users - Create new member (Admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, email, password, full_name, role } = req.body;

    if (!username || !email || !password || !full_name) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đủ thông tin người dùng.' });
    }

    const [existing] = await query('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Username hoặc email đã tồn tại.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userRole = role === 'admin' ? 'admin' : 'member';
    const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`;

    const [result] = await query(
      'INSERT INTO users (username, email, password_hash, full_name, role, avatar) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, passwordHash, full_name, userRole, avatar]
    );

    return res.status(201).json({
      success: true,
      message: 'Thêm thành viên mới thành công.',
      data: {
        id: result.insertId,
        username,
        email,
        full_name,
        role: userRole,
        avatar
      }
    });
  } catch (err) {
    console.error('[Users Error - Create]:', err);
    return res.status(500).json({ success: false, message: 'Lỗi khi thêm thành viên.' });
  }
});

// PUT /api/users/:id - Update member (Admin or self)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const isSelf = req.user.id === targetId;
    const isAdmin = req.user.role === 'admin';

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền chỉnh sửa tài khoản này.' });
    }

    const { full_name, email, role, password } = req.body;

    const [existing] = await query('SELECT * FROM users WHERE id = ?', [targetId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }

    const current = existing[0];
    const newFullName = full_name || current.full_name;
    const newEmail = email || current.email;
    const newRole = (isAdmin && role) ? role : current.role;

    let updateSql = 'UPDATE users SET full_name = ?, email = ?, role = ?';
    let params = [newFullName, newEmail, newRole];

    if (password && password.length >= 6) {
      const passwordHash = await bcrypt.hash(password, 10);
      updateSql += ', password_hash = ?';
      params.push(passwordHash);
    }

    updateSql += ' WHERE id = ?';
    params.push(targetId);

    await query(updateSql, params);

    return res.json({ success: true, message: 'Cập nhật thông tin thành viên thành công.' });
  } catch (err) {
    console.error('[Users Error - Update]:', err);
    return res.status(500).json({ success: false, message: 'Lỗi khi cập nhật thành viên.' });
  }
});

// DELETE /api/users/:id - Delete member (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);

    if (targetId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Không thể tự xóa tài khoản của chính mình.' });
    }

    const [result] = await query('DELETE FROM users WHERE id = ?', [targetId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng để xóa.' });
    }

    return res.json({ success: true, message: 'Đã xóa người dùng thành công.' });
  } catch (err) {
    console.error('[Users Error - Delete]:', err);
    return res.status(500).json({ success: false, message: 'Lỗi khi xóa người dùng.' });
  }
});

module.exports = router;
