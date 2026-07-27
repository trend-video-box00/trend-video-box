// public/admin.js
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const initData = tg?.initData;

async function callAdmin(action, extra = {}) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, initData, ...extra }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

async function init() {
  if (!initData) {
    document.getElementById('deniedState').hidden = false;
    return;
  }
  try {
    const { pending } = await callAdmin('pendingUploads');
    document.getElementById('adminApp').hidden = false;

    const select = document.getElementById('pendingSelect');
    select.innerHTML = pending.length
      ? pending.map((p) => `<option value="${p._id}">Upload ${p._id} — ${new Date(p.createdAt).toLocaleString('bn-BD')}</option>`).join('')
      : '<option value="">কোনো নতুন ভিডিও নেই — বটে ভিডিও পাঠান আগে</option>';

    await loadVideos();
    await loadTasks();
    await loadWithdrawals();
  } catch (e) {
    document.getElementById('deniedState').hidden = false;
    document.getElementById('deniedState').textContent = 'অ্যাক্সেস নেই: ' + e.message;
  }
}

// --- Videos ---
async function loadVideos() {
  const { videos } = await callAdmin('listVideos');
  const list = document.getElementById('videoList');
  list.innerHTML = videos.length
    ? videos.map((v) => `
        <div class="pending-item">
          <span>${escapeHtml(v.title)}</span>
          <span style="display:flex; align-items:center; gap:10px;">
            ${new Date(v.createdAt).toLocaleDateString('bn-BD')}
            <button class="delete-btn" data-id="${v._id}" title="ডিলিট করুন">🗑️</button>
          </span>
        </div>
      `).join('')
    : '<div class="pending-item">এখনো কিছু পাবলিশ করা হয়নি।</div>';

  list.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteVideo(btn.dataset.id));
  });
}

async function deleteVideo(videoId) {
  const confirmed = confirm('আপনি কি নিশ্চিত এই ভিডিওটি ডিলিট করতে চান? এটা আর ফিরিয়ে আনা যাবে না।');
  if (!confirmed) return;
  try {
    await callAdmin('deleteVideo', { videoId });
    await loadVideos();
  } catch (e) {
    alert('ডিলিট করতে সমস্যা হয়েছে: ' + e.message);
  }
}

// --- Thumbnail file upload (Choose File -> gallery/PC -> Cloudinary) ---
const thumbFileInput = document.getElementById('thumbFile');
const thumbPreview = document.getElementById('thumbPreview');
const thumbUploadStatus = document.getElementById('thumbUploadStatus');
const thumbInput = document.getElementById('thumbInput');
const publishBtn = document.getElementById('publishBtn');

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result); // "data:image/png;base64,...."
    reader.onerror = () => reject(new Error('ফাইল পড়তে সমস্যা হয়েছে'));
    reader.readAsDataURL(file);
  });
}

thumbFileInput?.addEventListener('change', async () => {
  const file = thumbFileInput.files?.[0];
  if (!file) return;

  // Instant local preview while it uploads
  const localPreviewUrl = URL.createObjectURL(file);
  thumbPreview.src = localPreviewUrl;
  thumbPreview.classList.add('show');

  thumbUploadStatus.textContent = 'আপলোড হচ্ছে...';
  thumbUploadStatus.style.color = 'var(--text-dim)';
  publishBtn.disabled = true;
  thumbInput.value = '';

  try {
    const imageBase64 = await fileToBase64(file);
    const { url } = await callAdmin('uploadThumbnail', { imageBase64 });
    thumbInput.value = url;
    thumbPreview.src = url;
    thumbUploadStatus.textContent = 'আপলোড সম্পন্ন ✅';
    thumbUploadStatus.style.color = 'var(--green-glow)';
  } catch (e) {
    thumbUploadStatus.textContent = 'আপলোড ব্যর্থ: ' + e.message;
    thumbUploadStatus.style.color = '#ef4b4b';
    thumbPreview.classList.remove('show');
    thumbInput.value = '';
  } finally {
    publishBtn.disabled = false;
  }
});

document.getElementById('publishBtn').addEventListener('click', async () => {
  const pendingUploadId = document.getElementById('pendingSelect').value;
  const title = document.getElementById('titleInput').value.trim();
  const thumbnailUrl = document.getElementById('thumbInput').value.trim();
  const statusEl = document.getElementById('publishStatus');

  if (!pendingUploadId || !title || !thumbnailUrl) {
    statusEl.textContent = 'সব ফিল্ড পূরণ করুন (থাম্বনেইল আপলোড শেষ হওয়া পর্যন্ত অপেক্ষা করুন)।';
    statusEl.className = 'status-msg err';
    return;
  }
  try {
    await callAdmin('publishVideo', { pendingUploadId, title, thumbnailUrl });
    statusEl.textContent = 'পাবলিশ হয়েছে ✅';
    statusEl.className = 'status-msg ok';
    document.getElementById('titleInput').value = '';
    thumbInput.value = '';
    thumbFileInput.value = '';
    thumbPreview.classList.remove('show');
    thumbUploadStatus.textContent = '';
    await init();
  } catch (e) {
    statusEl.textContent = 'সমস্যা হয়েছে: ' + e.message;
    statusEl.className = 'status-msg err';
  }
});

// --- Broadcast ---
document.getElementById('broadcastBtn').addEventListener('click', async () => {
  const text = document.getElementById('broadcastText').value.trim();
  const imageUrl = document.getElementById('broadcastImage').value.trim();
  const buttonUrl = document.getElementById('broadcastButtonUrl').value.trim();
  const buttonText = document.getElementById('broadcastButtonText').value.trim();
  const statusEl = document.getElementById('broadcastStatus');

  if (!text) {
    statusEl.textContent = 'মেসেজ লিখুন।';
    statusEl.className = 'status-msg err';
    return;
  }
  statusEl.textContent = 'পাঠানো হচ্ছে...';
  statusEl.className = 'status-msg';
  try {
    const result = await callAdmin('broadcast', {
      text,
      imageUrl: imageUrl || undefined,
      buttonUrl: buttonUrl || undefined,
      buttonText: buttonText || undefined,
    });
    statusEl.textContent = `পাঠানো হয়েছে ✅ (${result.sent}/${result.total})`;
    statusEl.className = 'status-msg ok';
    document.getElementById('broadcastText').value = '';
    document.getElementById('broadcastImage').value = '';
    document.getElementById('broadcastButtonUrl').value = '';
    document.getElementById('broadcastButtonText').value = '';
  } catch (e) {
    statusEl.textContent = 'সমস্যা হয়েছে: ' + e.message;
    statusEl.className = 'status-msg err';
  }
});

// --- Tasks ---
async function loadTasks() {
  const { tasks } = await callAdmin('listTasks');
  const list = document.getElementById('taskListAdmin');
  list.innerHTML = tasks.length
    ? tasks.map((t) => `
        <div class="pending-item">
          <span>${escapeHtml(t.title)} — $${t.reward.toFixed(2)}</span>
          <button class="delete-btn" data-id="${t._id}" title="ডিলিট করুন">🗑️</button>
        </div>
      `).join('')
    : '<div class="pending-item">এখনো কোনো টাস্ক নেই।</div>';

  list.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('এই টাস্কটি ডিলিট করবেন?')) return;
      await callAdmin('deleteTask', { taskId: btn.dataset.id });
      await loadTasks();
    });
  });
}

document.getElementById('addTaskBtn').addEventListener('click', async () => {
  const title = document.getElementById('taskTitle').value.trim();
  const link = document.getElementById('taskLink').value.trim();
  const reward = document.getElementById('taskReward').value;
  const statusEl = document.getElementById('taskStatus');

  if (!title || !link || !reward) {
    statusEl.textContent = 'সব ফিল্ড পূরণ করুন।';
    statusEl.className = 'status-msg err';
    return;
  }
  try {
    await callAdmin('createTask', { title, link, reward });
    statusEl.textContent = 'টাস্ক যোগ হয়েছে ✅';
    statusEl.className = 'status-msg ok';
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskLink').value = '';
    document.getElementById('taskReward').value = '';
    await loadTasks();
  } catch (e) {
    statusEl.textContent = 'সমস্যা হয়েছে: ' + e.message;
    statusEl.className = 'status-msg err';
  }
});

// --- Withdrawals ---
async function loadWithdrawals() {
  const { withdrawals } = await callAdmin('listWithdrawals');
  const list = document.getElementById('withdrawListAdmin');
  list.innerHTML = withdrawals.length
    ? withdrawals.map((w) => `
        <div class="pending-item">
          <span>${escapeHtml(w.username || w.telegramId)} — $${w.amount.toFixed(2)} (${escapeHtml(w.method)}: ${escapeHtml(w.accountNumber)})</span>
          <span>
            ${w.status === 'paid'
              ? '<span style="color:var(--green-glow); font-size:12px;">পরিশোধিত ✅</span>'
              : `<button class="admin-btn" data-id="${w._id}" style="padding:6px 10px; font-size:11.5px;">পরিশোধ করা হয়েছে</button>`}
          </span>
        </div>
      `).join('')
    : '<div class="pending-item">কোনো উইথড্র রিকোয়েস্ট নেই।</div>';

  list.querySelectorAll('button[data-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await callAdmin('markWithdrawalPaid', { withdrawId: btn.dataset.id });
      await loadWithdrawals();
    });
  });
}

init();
