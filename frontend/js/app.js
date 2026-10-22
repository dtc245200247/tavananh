/**
 * Task Tracker Pro - Frontend Application Logic
 */

// Determine API base url (relative /api for Nginx reverse proxy, fallback to localhost:5000 if opened directly)
const API_BASE = window.location.port === '5000' 
  ? '/api' 
  : (window.location.protocol === 'file:' ? 'http://localhost:5000/api' : '/api');

// Application State
const state = {
  token: localStorage.getItem('tt_token') || null,
  user: JSON.parse(localStorage.getItem('tt_user') || 'null'),
  tasks: [],
  members: [],
  activeView: 'kanban',
  searchQuery: '',
  draggedTaskId: null,
  activeTaskId: null
};

// ============================================================================
// Initialization & Navigation
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  if (state.token && state.user) {
    showMainApp();
  } else {
    showAuthView();
  }
});

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function showAuthView() {
  document.getElementById('auth-view').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
}

function showMainApp() {
  document.getElementById('auth-view').style.display = 'none';
  document.getElementById('main-app').style.display = 'flex';

  // Update sidebar profile
  document.getElementById('sidebar-user-name').textContent = state.user.full_name || state.user.username;
  document.getElementById('sidebar-user-role').textContent = state.user.role === 'admin' ? 'Quản trị viên' : 'Thành viên';
  document.getElementById('sidebar-user-avatar').src = state.user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${state.user.username}`;

  // Hide admin-only controls if member
  const btnAddMember = document.getElementById('btn-add-member');
  if (btnAddMember) {
    btnAddMember.style.display = state.user.role === 'admin' ? 'inline-flex' : 'none';
  }

  // Initial data fetch
  loadMembers().then(() => {
    loadTasks();
    loadStats();
  });
}

function switchView(viewName) {
  state.activeView = viewName;
  document.getElementById('view-kanban').style.display = viewName === 'kanban' ? 'block' : 'none';
  document.getElementById('view-members').style.display = viewName === 'members' ? 'block' : 'none';

  document.getElementById('nav-kanban').classList.toggle('active', viewName === 'kanban');
  document.getElementById('nav-members').classList.toggle('active', viewName === 'members');

  const titleEl = document.getElementById('page-title-text');
  const subtitleEl = document.getElementById('page-subtitle-text');

  if (viewName === 'kanban') {
    titleEl.textContent = 'Bảng quản lý công việc (Kanban Board)';
    subtitleEl.textContent = 'Kéo thả để cập nhật trạng thái tiến độ các công việc';
    loadTasks();
    loadStats();
  } else if (viewName === 'members') {
    titleEl.textContent = 'Quản lý thành viên nhóm';
    subtitleEl.textContent = 'Phân quyền và theo dõi khối lượng công việc của từng thành viên';
    loadMembers();
  }
}

function refreshCurrentView() {
  if (state.activeView === 'kanban') {
    loadTasks();
    loadStats();
    showToast('Đã làm mới dữ liệu công việc', 'info');
  } else {
    loadMembers();
    showToast('Đã làm mới danh sách thành viên', 'info');
  }
}

// ============================================================================
// Authentication
// ============================================================================
function switchAuthTab(tab) {
  document.getElementById('tab-login-btn').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register-btn').classList.toggle('active', tab === 'register');
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
}

function quickFill(user, pass) {
  document.getElementById('login-username').value = user;
  document.getElementById('login-password').value = pass;
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const result = await res.json();

    if (!res.ok) {
      showToast(result.message || 'Đăng nhập thất bại', 'error');
      return;
    }

    state.token = result.data.token;
    state.user = result.data.user;
    localStorage.setItem('tt_token', state.token);
    localStorage.setItem('tt_user', JSON.stringify(state.user));

    showToast(`Chào mừng trở lại, ${state.user.full_name}!`, 'success');
    showMainApp();
  } catch (err) {
    showToast('Không thể kết nối đến máy chủ backend.', 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const full_name = document.getElementById('reg-fullname').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name, username, email, password })
    });
    const result = await res.json();

    if (!res.ok) {
      showToast(result.message || 'Đăng ký thất bại', 'error');
      return;
    }

    state.token = result.data.token;
    state.user = result.data.user;
    localStorage.setItem('tt_token', state.token);
    localStorage.setItem('tt_user', JSON.stringify(state.user));

    showToast('Tạo tài khoản thành công!', 'success');
    showMainApp();
  } catch (err) {
    showToast('Lỗi máy chủ khi đăng ký tài khoản.', 'error');
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('tt_token');
  localStorage.removeItem('tt_user');
  showAuthView();
  showToast('Đã đăng xuất khỏi hệ thống.', 'info');
}

// Authenticated fetch helper
async function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['Authorization'] = `Bearer ${state.token}`;
  options.headers['Content-Type'] = 'application/json';

  const res = await fetch(url, options);
  if (res.status === 401 || res.status === 403) {
    logout();
    throw new Error('Phiên đăng nhập đã hết hạn.');
  }
  return res;
}

// ============================================================================
// Tasks & Kanban Logic
// ============================================================================
async function loadStats() {
  try {
    const res = await authFetch(`${API_BASE}/tasks/stats`);
    const result = await res.json();
    if (result.success) {
      document.getElementById('stat-total').textContent = result.data.total;
      document.getElementById('stat-todo').textContent = result.data.byStatus.todo || 0;
      document.getElementById('stat-in_progress').textContent = result.data.byStatus.in_progress || 0;
      document.getElementById('stat-done').textContent = result.data.byStatus.done || 0;
    }
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

async function loadTasks() {
  const priority = document.getElementById('filter-priority')?.value || '';
  const assignee = document.getElementById('filter-assignee')?.value || '';
  const search = state.searchQuery;

  let query = new URLSearchParams();
  if (priority) query.append('priority', priority);
  if (assignee) query.append('assigned_to', assignee);
  if (search) query.append('search', search);

  try {
    const res = await authFetch(`${API_BASE}/tasks?${query.toString()}`);
    const result = await res.json();
    if (result.success) {
      state.tasks = result.data;
      renderKanban();
    }
  } catch (err) {
    showToast('Lỗi khi tải danh sách công việc', 'error');
  }
}

function renderKanban() {
  const columns = {
    todo: document.getElementById('tasks-todo'),
    in_progress: document.getElementById('tasks-in_progress'),
    review: document.getElementById('tasks-review'),
    done: document.getElementById('tasks-done')
  };

  const counts = { todo: 0, in_progress: 0, review: 0, done: 0 };

  // Clear columns
  Object.values(columns).forEach(col => { if (col) col.innerHTML = ''; });

  state.tasks.forEach(task => {
    const col = columns[task.status];
    if (col) {
      counts[task.status]++;
      col.appendChild(createTaskCard(task));
    }
  });

  // Update column badges
  document.getElementById('count-todo').textContent = counts.todo;
  document.getElementById('count-in_progress').textContent = counts.in_progress;
  document.getElementById('count-review').textContent = counts.review;
  document.getElementById('count-done').textContent = counts.done;
}

function createTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.draggable = true;
  card.id = `task-card-${task.id}`;

  const priorityLabels = {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
    urgent: 'Khẩn cấp'
  };

  const formattedDate = task.due_date ? new Date(task.due_date).toLocaleDateString('vi-VN') : 'Không có hạn';
  const assigneeAvatar = task.assignee_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${task.assignee_username || 'user'}`;
  const assigneeName = task.assignee_name || 'Chưa gán';

  card.innerHTML = `
    <div class="task-card-header">
      <span class="priority-badge priority-${task.priority}">${priorityLabels[task.priority] || task.priority}</span>
      <button class="btn-icon" style="padding: 2px;" onclick="openEditTaskModal(${task.id}, event)" title="Chỉnh sửa">
        ✏️
      </button>
    </div>
    <div class="task-title">${escapeHtml(task.title)}</div>
    ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
    <div class="task-meta">
      <div class="task-due">
        <span>📅</span> <span>${formattedDate}</span>
      </div>
      <div class="task-assignee" title="${escapeHtml(assigneeName)}">
        <img src="${assigneeAvatar}" alt="${escapeHtml(assigneeName)}">
      </div>
    </div>
  `;

  // Drag and drop listeners
  card.addEventListener('dragstart', (e) => {
    state.draggedTaskId = task.id;
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', task.id);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    state.draggedTaskId = null;
  });

  // Click card to open edit
  card.addEventListener('click', (e) => {
    if (!e.target.closest('button')) {
      openEditTaskModal(task.id);
    }
  });

  return card;
}

function allowDrop(e) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.add('drag-over');
}

function dragLeave(e) {
  const col = e.currentTarget;
  col.classList.remove('drag-over');
}

async function handleDrop(e, targetStatus) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.remove('drag-over');

  const taskId = e.dataTransfer.getData('text/plain') || state.draggedTaskId;
  if (!taskId) return;

  const task = state.tasks.find(t => t.id == taskId);
  if (!task || task.status === targetStatus) return;

  // Optimistic update
  const previousStatus = task.status;
  task.status = targetStatus;
  renderKanban();

  try {
    const res = await authFetch(`${API_BASE}/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: targetStatus })
    });
    const result = await res.json();
    if (!res.ok) {
      task.status = previousStatus;
      renderKanban();
      showToast(result.message || 'Không thể chuyển trạng thái', 'error');
    } else {
      loadStats();
      showToast(`Đã chuyển việc sang: ${getStatusLabel(targetStatus)}`, 'success');
    }
  } catch (err) {
    task.status = previousStatus;
    renderKanban();
    showToast('Lỗi khi gửi yêu cầu chuyển trạng thái', 'error');
  }
}

function getStatusLabel(s) {
  const map = { todo: 'Cần làm', in_progress: 'Đang làm', review: 'Đang xét duyệt', done: 'Hoàn thành' };
  return map[s] || s;
}

function handleTaskSearch() {
  const val = document.getElementById('task-search-input').value.trim();
  state.searchQuery = val;
  loadTasks();
}

// ============================================================================
// Task Modal (Create & Edit)
// ============================================================================
function openCreateTaskModal() {
  state.activeTaskId = null;
  document.getElementById('task-modal-title').textContent = 'Khởi tạo công việc mới';
  document.getElementById('task-id').value = '';
  document.getElementById('task-title-input').value = '';
  document.getElementById('task-desc-input').value = '';
  document.getElementById('task-status-select').value = 'todo';
  document.getElementById('task-priority-select').value = 'medium';
  document.getElementById('task-due-date-input').value = '';
  document.getElementById('task-assignee-select').value = '';
  
  document.getElementById('btn-delete-task').style.display = 'none';
  document.getElementById('task-comments-wrapper').style.display = 'none';

  document.getElementById('task-modal').classList.add('active');
}

async function openEditTaskModal(taskId, e) {
  if (e) e.stopPropagation();
  state.activeTaskId = taskId;

  try {
    const res = await authFetch(`${API_BASE}/tasks/${taskId}`);
    const result = await res.json();
    if (!result.success) {
      showToast('Không thể tải chi tiết công việc', 'error');
      return;
    }

    const task = result.data;
    document.getElementById('task-modal-title').textContent = `Chi tiết công việc #${task.id}`;
    document.getElementById('task-id').value = task.id;
    document.getElementById('task-title-input').value = task.title;
    document.getElementById('task-desc-input').value = task.description || '';
    document.getElementById('task-status-select').value = task.status;
    document.getElementById('task-priority-select').value = task.priority;
    document.getElementById('task-due-date-input').value = task.due_date ? task.due_date.substring(0, 10) : '';
    document.getElementById('task-assignee-select').value = task.assignee_id || '';

    // Show delete button
    document.getElementById('btn-delete-task').style.display = 'inline-flex';

    // Show comments
    document.getElementById('task-comments-wrapper').style.display = 'block';
    renderComments(task.comments || []);

    document.getElementById('task-modal').classList.add('active');
  } catch (err) {
    showToast('Lỗi kết nối khi tải chi tiết', 'error');
  }
}

function renderComments(comments) {
  const container = document.getElementById('comments-list');
  container.innerHTML = '';
  if (comments.length === 0) {
    container.innerHTML = '<div style="font-size: 0.8125rem; color: var(--text-muted); font-style: italic;">Chưa có bình luận nào.</div>';
    return;
  }
  comments.forEach(c => {
    const item = document.createElement('div');
    item.style.cssText = 'background: rgba(255,255,255,0.04); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.8125rem;';
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
        <span style="font-weight: 600; color: var(--primary);">${escapeHtml(c.full_name)}</span>
        <span style="color: var(--text-muted); font-size: 0.75rem;">${new Date(c.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div>${escapeHtml(c.content)}</div>
    `;
    container.appendChild(item);
  });
  container.scrollTop = container.scrollHeight;
}

async function addComment() {
  const input = document.getElementById('new-comment-input');
  const content = input.value.trim();
  if (!content || !state.activeTaskId) return;

  try {
    const res = await authFetch(`${API_BASE}/tasks/${state.activeTaskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
    const result = await res.json();
    if (result.success) {
      input.value = '';
      // Reload task details to update comments
      openEditTaskModal(state.activeTaskId);
      showToast('Đã thêm bình luận', 'success');
    }
  } catch (err) {
    showToast('Không thể gửi bình luận', 'error');
  }
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.remove('active');
}

async function handleSaveTask(e) {
  e.preventDefault();
  const id = document.getElementById('task-id').value;
  const title = document.getElementById('task-title-input').value.trim();
  const description = document.getElementById('task-desc-input').value.trim();
  const status = document.getElementById('task-status-select').value;
  const priority = document.getElementById('task-priority-select').value;
  const due_date = document.getElementById('task-due-date-input').value || null;
  const assigned_to = document.getElementById('task-assignee-select').value || null;

  const payload = { title, description, status, priority, due_date, assigned_to };

  try {
    const url = id ? `${API_BASE}/tasks/${id}` : `${API_BASE}/tasks`;
    const method = id ? 'PUT' : 'POST';

    const res = await authFetch(url, {
      method,
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (res.ok) {
      closeTaskModal();
      loadTasks();
      loadStats();
      showToast(id ? 'Cập nhật công việc thành công!' : 'Tạo mới công việc thành công!', 'success');
    } else {
      showToast(result.message || 'Lưu công việc thất bại', 'error');
    }
  } catch (err) {
    showToast('Lỗi máy chủ khi lưu công việc', 'error');
  }
}

async function deleteCurrentTask() {
  if (!state.activeTaskId) return;
  if (!confirm('Bạn có chắc chắn muốn xóa công việc này không?')) return;

  try {
    const res = await authFetch(`${API_BASE}/tasks/${state.activeTaskId}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (res.ok) {
      closeTaskModal();
      loadTasks();
      loadStats();
      showToast('Đã xóa công việc thành công', 'info');
    } else {
      showToast(result.message || 'Xóa thất bại', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối khi xóa công việc', 'error');
  }
}

// ============================================================================
// Members View & Management
// ============================================================================
async function loadMembers() {
  try {
    const res = await authFetch(`${API_BASE}/users`);
    const result = await res.json();
    if (result.success) {
      state.members = result.data;
      renderMembersTable();
      populateAssigneeDropdowns();
    }
  } catch (err) {
    console.error('Error loading members:', err);
  }
}

function populateAssigneeDropdowns() {
  const filterSelect = document.getElementById('filter-assignee');
  const taskModalSelect = document.getElementById('task-assignee-select');

  if (filterSelect) {
    filterSelect.innerHTML = '<option value="">Tất cả người thực hiện</option>';
    state.members.forEach(m => {
      filterSelect.innerHTML += `<option value="${m.id}">${escapeHtml(m.full_name)} (@${escapeHtml(m.username)})</option>`;
    });
  }

  if (taskModalSelect) {
    taskModalSelect.innerHTML = '<option value="">-- Chưa gán người thực hiện --</option>';
    state.members.forEach(m => {
      taskModalSelect.innerHTML += `<option value="${m.id}">${escapeHtml(m.full_name)} (@${escapeHtml(m.username)})</option>`;
    });
  }
}

function renderMembersTable() {
  const tbody = document.getElementById('members-table-body');
  if (!tbody) return;

  if (state.members.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Không có thành viên nào.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  state.members.forEach(m => {
    const tr = document.createElement('tr');
    const avatar = m.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.username}`;
    const roleBadge = m.role === 'admin' 
      ? '<span class="role-badge role-admin">Quản trị viên</span>' 
      : '<span class="role-badge role-member">Thành viên</span>';

    const canDelete = state.user.role === 'admin' && m.id !== state.user.id;

    tr.innerHTML = `
      <td>
        <div class="member-cell">
          <img src="${avatar}" alt="${escapeHtml(m.full_name)}">
          <span style="font-weight: 600;">${escapeHtml(m.full_name)}</span>
        </div>
      </td>
      <td>@${escapeHtml(m.username)}</td>
      <td>${escapeHtml(m.email)}</td>
      <td>${roleBadge}</td>
      <td><span style="font-weight: 600; color: var(--primary);">${m.assigned_tasks_count || 0}</span> việc</td>
      <td>
        ${canDelete ? `<button class="btn btn-danger" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;" onclick="deleteMember(${m.id})">Xóa</button>` : '<span style="color: var(--text-muted); font-size: 0.75rem;">-</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openAddMemberModal() {
  document.getElementById('member-form').reset();
  document.getElementById('member-modal').classList.add('active');
}

function closeMemberModal() {
  document.getElementById('member-modal').classList.remove('active');
}

async function handleCreateMember(e) {
  e.preventDefault();
  const full_name = document.getElementById('mem-fullname').value.trim();
  const username = document.getElementById('mem-username').value.trim();
  const email = document.getElementById('mem-email').value.trim();
  const password = document.getElementById('mem-password').value;
  const role = document.getElementById('mem-role').value;

  try {
    const res = await authFetch(`${API_BASE}/users`, {
      method: 'POST',
      body: JSON.stringify({ full_name, username, email, password, role })
    });
    const result = await res.json();

    if (res.ok) {
      closeMemberModal();
      loadMembers();
      showToast('Thêm thành viên mới thành công!', 'success');
    } else {
      showToast(result.message || 'Thêm thành viên thất bại', 'error');
    }
  } catch (err) {
    showToast('Lỗi máy chủ khi thêm thành viên', 'error');
  }
}

async function deleteMember(userId) {
  if (!confirm('Bạn có chắc chắn muốn xóa thành viên này khỏi hệ thống?')) return;

  try {
    const res = await authFetch(`${API_BASE}/users/${userId}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (res.ok) {
      loadMembers();
      showToast('Đã xóa thành viên', 'info');
    } else {
      showToast(result.message || 'Xóa thất bại', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối khi xóa thành viên', 'error');
  }
}

// Utility: HTML escape helper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
