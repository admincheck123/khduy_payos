// public/app.js — client logic with enforced login overlay + bank dropdown UI improvements + QR quicklink
// Full file — replace your existing public/app.js with this

// ---------- DOM ----------
const navHome = document.getElementById("navHome");
const navHistory = document.getElementById("navHistory");
const navTopup = document.getElementById("navTopup");
const pageHome = document.getElementById("pageHome");
const pageHistory = document.getElementById("pageHistory");
const pageTopup = document.getElementById("pageTopup");
const pageLogin = document.getElementById("pageLogin");

const balanceEl = document.getElementById("balance");
const refreshBalanceBtn = document.getElementById("refreshBalance");
const copyBalanceBtn = document.getElementById("copyBalance");

const payoutForm = document.getElementById("payoutForm");
const referenceIdHidden = document.getElementById("referenceId");
const referenceDisplay = document.getElementById("referenceDisplay");
const copyRefBtn = document.getElementById("copyRef");

const amountEl = document.getElementById("amount");
const categoryEl = document.getElementById("category");
const descriptionEl = document.getElementById("description");

const bankSearchEl = document.getElementById("bankSearch");
const bankDropdownEl = document.getElementById("bankDropdown");
const selectedBankEl = document.getElementById("selectedBank");
const toBinEl = document.getElementById("toBin");
const accountEl = document.getElementById("toAccountNumber");
const clearBtn = document.getElementById("clearBtn");

const resultEl = document.getElementById("result");

const historyBody = document.getElementById("historyBody");
const historyRefresh = document.getElementById("historyRefresh");
const historySearch = document.getElementById("historySearch");
const historyPrev = document.getElementById("historyPrev");
const historyNext = document.getElementById("historyNext");
const historyPageInfo = document.getElementById("historyPageInfo");

const topupForm = document.getElementById("topupForm");
const topupAmount = document.getElementById("topupAmount");
const topupGenerate = document.getElementById("topupGenerate");
const topupResult = document.getElementById("topupResult");
const topupResultMsg = document.getElementById("topupResultMsg");

const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const navGreeting = document.getElementById("navGreeting");
const loginForm = document.getElementById("loginForm");
const loginCancel = document.getElementById("loginCancel");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");

const toast = document.getElementById("toast");
const toastIcon = document.getElementById("toastIcon");
const toastMsg = document.getElementById("toastMsg");
const toastClose = document.getElementById("toastClose");

const btnToggleSidebar = document.getElementById("btnToggleSidebar");
const sidebar = document.getElementById("sidebar");

// ---------- state ----------
let vietqrBanks = []; // { short_name, logo, bins: [], slug }
let bankDropdownVisible = false;
let loggedIn = false;
let histPage = 1, histLimit = 10, histTotalPages = 1;

// ---------- utils ----------
function showToast(type, text, ttl = 4000) {
    if (!toast) return;
    toast.classList.remove('hidden');
    toastMsg.textContent = text;
    toastIcon.className = 'toast-icon';
    if (type === 'success') { toastIcon.classList.add('success'); toastIcon.textContent = '✓'; }
    else if (type === 'failed') { toastIcon.classList.add('failed'); toastIcon.textContent = '✕'; }
    else { toastIcon.textContent = 'ℹ'; }
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.add('hidden'), ttl);
}
if (toastClose) toastClose.addEventListener('click', () => { toast.classList.add('hidden'); clearTimeout(toast._t); });

function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function formatMoney(v) { const n = Number(v) || 0; return new Intl.NumberFormat('vi-VN').format(n) + ' ₫'; }

// ---------- NAV ----------
function showPage(name) {
    if (!loggedIn && name !== 'login') {
        showAuthOverlay();
        showPage('login');
        return;
    }
    pageHome.classList.toggle('active', name === 'home');
    pageHistory.classList.toggle('active', name === 'history');
    pageTopup.classList.toggle('active', name === 'topup');
    pageLogin.classList.toggle('active', name === 'login');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if (name === 'home') navHome.classList.add('active');
    if (name === 'history') navHistory.classList.add('active');
    if (name === 'topup') navTopup.classList.add('active');
}
navHome && navHome.addEventListener('click', () => showPage('home'));
navHistory && navHistory.addEventListener('click', () => { showPage('history'); loadHistory(1); });
navTopup && navTopup.addEventListener('click', () => showPage('topup'));

// ---------- AUTH overlay (simple blocking) ----------
function createAuthOverlay() {
    if (document.getElementById('authOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.zIndex = '9999';
    overlay.style.background = 'rgba(0,0,0,0.45)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.innerHTML = `
    <div style="background:#fff;padding:24px;border-radius:10px;max-width:420px;width:90%;box-shadow:0 10px 30px rgba(0,0,0,0.3);text-align:center;">
      <h3 style="margin:0 0 12px;">Vui lòng đăng nhập</h3>
      <p style="margin:0 0 18px;color:#666;">Bạn cần đăng nhập để sử dụng trang này.</p>
      <div style="display:flex;gap:8px;justify-content:center">
        <button id="authGoLogin" style="padding:10px 14px;border-radius:8px;border:0;background:#1f6feb;color:#fff;cursor:pointer">Đến trang đăng nhập</button>
        <button id="authCancel" style="padding:10px 14px;border-radius:8px;border:1px solid #ddd;background:#fff;color:#333;cursor:pointer">Đóng</button>
      </div>
      <div style="margin-top:12px;font-size:12px;color:#999">Hoặc tải lại trang sau khi đăng nhập trên tab khác.</div>
    </div>
  `;
    document.body.appendChild(overlay);
    document.getElementById('authGoLogin').addEventListener('click', () => {
        showPage('login'); overlay.style.display = 'none';
    });
    document.getElementById('authCancel').addEventListener('click', () => { overlay.style.display = 'none'; });
}
function showAuthOverlay() { createAuthOverlay(); const o = document.getElementById('authOverlay'); if (o) o.style.display = 'flex'; }
function hideAuthOverlay() { const o = document.getElementById('authOverlay'); if (o) o.style.display = 'none'; }
function requireClientAuthShowLogin() { showAuthOverlay(); showPage('login'); if (loginUsername) loginUsername.focus(); showToast('failed', 'Vui lòng đăng nhập để thực hiện thao tác'); throw new Error('not-authenticated'); }

// ---------- REF ----------
function initReference() { const v = `payout_${Date.now()}`; if (referenceIdHidden) referenceIdHidden.value = v; if (referenceDisplay) referenceDisplay.textContent = v; }
initReference();
copyRefBtn && copyRefBtn.addEventListener('click', () => navigator.clipboard?.writeText(referenceIdHidden.value || '').then(() => showToast('success', 'Sao chép Reference thành công')).catch(() => showToast('failed', 'Không thể sao chép')));

// ---------- VIETQR / BANKS ----------
async function loadVietqrBanks() {
    try {
        const r = await fetch('/api/vietqr-banks');
        if (!r.ok) { console.warn('vietqr fetch failed', r.status); return; }
        const j = await r.json();
        // map and ensure slug exists if server provided it
        vietqrBanks = (j?.data || []).map(item => {
            const name = (item.short_name || item.shortName || item.name || '').trim();
            const logo = item.logo || item.icon || item.image || '';
            const bins = Array.isArray(item.bins) ? item.bins.map(String) : (item.bins ? [String(item.bins)] : []);
            const slug = (item.slug || item.code || item.id || item.acqId || item.bank_code || item.bankId || "").toString().trim();
            return { short_name: name, logo, bins, slug };
        }).filter(x => x.short_name);
    } catch (e) { console.error('vietqr load error', e); }
}

// Build & show dropdown (updated: include slug)
function showBankDropdown(filtered) {
    if (!bankDropdownEl) return;
    if (!filtered || !filtered.length) {
        bankDropdownEl.innerHTML = `<div class="bank-item muted" style="padding:12px">Không tìm thấy</div>`;
    } else {
        bankDropdownEl.innerHTML = filtered.slice(0, 80).map(b => {
            const binStr = (b.bins || []).slice(0, 3).join(', ') || '-';
            const logoUrl = escapeHtml(b.logo || '');
            const initials = escapeHtml((b.short_name || '').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase());
            const slug = escapeHtml(b.slug || '');
            return `<div class="bank-item" role="option" data-bin="${escapeHtml(b.bins[0] || '')}" data-name="${escapeHtml(b.short_name)}" data-slug="${slug}">
        <div style="position:relative;display:flex;align-items:center;">
          <img class="bank-logo" src="${logoUrl}" alt="${escapeHtml(b.short_name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
          <div class="logo-fallback" style="display:${logoUrl ? 'none' : 'flex'}">${initials}</div>
        </div>
        <div class="bank-meta">
          <div class="bank-name">${escapeHtml(b.short_name)}</div>
          <div class="bank-bin">BIN: ${escapeHtml(binStr)}</div>
        </div>
      </div>`;
        }).join('');
    }
    bankDropdownEl.classList.remove('hidden');
    bankDropdownVisible = true;

    bankDropdownEl.querySelectorAll('.bank-item').forEach(node => {
        node.addEventListener('click', () => {
            const bin = node.dataset.bin || '';
            const name = node.dataset.name || '';
            const slug = node.dataset.slug || '';
            toBinEl.value = bin;
            bankSearchEl.value = '';
            renderSelectedBank({ name, bin, logo: node.querySelector('.bank-logo')?.src || '', slug });
            bankDropdownEl.classList.add('hidden');
            bankDropdownVisible = false;
            accountEl && accountEl.focus();
            showToast('info', `Đã chọn: ${name} (BIN ${bin})`, 1600);
        });
    });
}

// render selected bank & add "Tạo QR" action
function renderSelectedBank({ name, bin, logo, slug }) {
    if (!selectedBankEl) return;
    const logoSafe = escapeHtml(logo || '');
    const initials = escapeHtml((name || '').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase() || '');
    // create the QR holder (hidden initially)
    selectedBankEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;width:100%">
      <div style="display:flex;align-items:center;gap:8px">
        <img class="sb-logo" src="${logoSafe}" alt="${escapeHtml(name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="logo-fallback" style="display:${logoSafe ? 'none' : 'flex'}">${initials}</div>
      </div>
      <div class="sb-info">
        <div class="sb-name">${escapeHtml(name)}</div>
        <div class="sb-bin">BIN: ${escapeHtml(bin || '-')}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
        <button class="btn small sb-gen-qr">Tạo QR</button>
        <button class="sb-clear" title="Bỏ chọn">✕</button>
      </div>
    </div>
    <div class="qr-area" style="margin-top:10px;display:none">
      <div class="muted small">Quét mã QR để chuyển khoản</div>
      <div style="margin-top:8px">
        <img class="generated-qr" style="max-width:240px;border-radius:10px;border:1px solid rgba(0,0,0,0.05);display:block" alt="QR code"/>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px">
        <a class="btn small qr-open-link" target="_blank" rel="noopener">Mở ảnh</a>
        <a class="btn ghost small qr-download" download="vietqr.jpg">Tải xuống</a>
      </div>
    </div>
  `;
    selectedBankEl.classList.remove('hidden');
    // attach clear
    const btnClear = selectedBankEl.querySelector('.sb-clear');
    if (btnClear) btnClear.addEventListener('click', () => {
        toBinEl.value = '';
        selectedBankEl.classList.add('hidden');
        selectedBankEl.innerHTML = '';
        bankSearchEl.focus();
        showToast('info', 'Đã bỏ chọn ngân hàng', 1200);
    });

    // attach generate QR handler
    const genBtn = selectedBankEl.querySelector('.sb-gen-qr');
    const qrArea = selectedBankEl.querySelector('.qr-area');
    const qrImg = selectedBankEl.querySelector('.generated-qr');
    const qrOpen = selectedBankEl.querySelector('.qr-open-link');
    const qrDownload = selectedBankEl.querySelector('.qr-download');

    if (genBtn) {
        genBtn.addEventListener('click', () => {
            const acct = (accountEl && accountEl.value || '').trim();
            if (!acct) { showToast('failed', 'Vui lòng nhập số tài khoản trước khi tạo QR'); accountEl.focus(); return; }
            // build quick image url
            // template: compact (you can change to full)
            const tpl = 'compact';
            // slug may be numeric (acqId) or textual
            const slugPart = slug || '';
            // sanitize account: remove spaces
            const acctSafe = acct.replace(/\s+/g, '');
            // base quick image url provided by vietqr.io public service
            const imgUrl = `https://img.vietqr.io/image/${slugPart}-${acctSafe}-${tpl}.jpg`;
            // set image src
            qrImg.src = imgUrl;
            qrImg.alt = `VietQR ${slugPart} ${acctSafe}`;
            qrOpen.href = imgUrl;
            qrDownload.href = imgUrl;
            qrArea.style.display = 'block';
            showToast('success', 'QR đã tạo — quét để chuyển khoản', 2500);
        });
    }
}

// input handlers
bankSearchEl && bankSearchEl.addEventListener('input', (e) => {
    const q = (e.target.value || '').trim().toLowerCase();
    if (!q) { bankDropdownEl.classList.add('hidden'); bankDropdownVisible = false; return; }
    const filtered = vietqrBanks.filter(b => (b.short_name || '').toLowerCase().includes(q) || (b.bins || []).some(bin => String(bin).toLowerCase().includes(q)));
    showBankDropdown(filtered);
});

bankSearchEl && bankSearchEl.addEventListener('focus', (e) => {
    const q = (e.target.value || '').trim().toLowerCase();
    const filtered = q ? vietqrBanks.filter(b => (b.short_name || '').toLowerCase().includes(q)) : vietqrBanks.slice(0, 50);
    showBankDropdown(filtered);
});

bankSearchEl && bankSearchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const q = (bankSearchEl.value || '').trim().toLowerCase();
        if (!q) return;
        const filtered = vietqrBanks.filter(b => (b.short_name || '').toLowerCase() === q || (b.short_name || '').toLowerCase().includes(q));
        if (filtered.length === 1) { const b = filtered[0]; toBinEl.value = (b.bins && b.bins[0]) ? b.bins[0] : ''; renderSelectedBank({ name: b.short_name, bin: toBinEl.value, logo: b.logo, slug: b.slug }); bankDropdownEl.classList.add('hidden'); bankDropdownVisible = false; accountEl.focus(); showToast('success', `Đã chọn: ${b.short_name}`, 1500); }
        else showBankDropdown(filtered);
    }
});

bankSearchEl && bankSearchEl.addEventListener('blur', () => {
    setTimeout(() => {
        if (bankDropdownVisible) return;
        bankDropdownEl.classList.add('hidden');
        bankDropdownVisible = false;
    }, 160);
});

document.addEventListener('click', (e) => {
    if (!bankDropdownEl.contains(e.target) && e.target !== bankSearchEl) {
        bankDropdownEl.classList.add('hidden'); bankDropdownVisible = false;
    }
});

// ---------- SUBMIT / form ----------
payoutForm && payoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!loggedIn) { requireClientAuthShowLogin(); }
    resultEl.textContent = 'Đang gửi lệnh...';
    const payload = {
        referenceId: (referenceIdHidden.value || '').trim(),
        amount: Number(amountEl.value),
        description: descriptionEl.value || '',
        toBin: (toBinEl.value || '').trim(),
        toAccountNumber: (accountEl.value || '').trim(),
        category: categoryEl.value ? [categoryEl.value.trim()] : []
    };
    // attempt auto-find bin if empty
    if (!payload.toBin && bankSearchEl.value) {
        const q = bankSearchEl.value.trim().toLowerCase();
        const found = vietqrBanks.find(b => (b.short_name || '').toLowerCase() === q || (b.short_name || '').toLowerCase().includes(q));
        if (found && found.bins && found.bins.length) payload.toBin = found.bins[0];
        if (payload.toBin) toBinEl.value = payload.toBin;
    }
    if (!payload.referenceId || !payload.amount || !payload.toBin || !payload.toAccountNumber) {
        resultEl.textContent = 'Vui lòng điền đầy đủ referenceId, amount, toBin và toAccountNumber';
        showToast('failed', 'Thiếu trường bắt buộc (kiểm tra ngân hàng đã chọn chưa)', 4500);
        return;
    }
    try {
        const r = await fetch('/api/payouts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        const j = await r.json();
        if (!r.ok) { showToast('failed', j?.message || 'Gửi thất bại', 6000); resultEl.textContent = JSON.stringify(j, null, 2); return; }
        showToast('success', 'Yêu cầu gửi thành công', 3500);
        resultEl.textContent = JSON.stringify(j.payosResponse ?? j, null, 2);
        fetchBalance();
        loadHistory(1);
    } catch (err) {
        console.error(err);
        resultEl.textContent = 'Lỗi gửi lệnh: ' + (err.message || err);
        showToast('failed', 'Lỗi kết nối khi gửi lệnh', 5000);
    }
});

// clear form
clearBtn && clearBtn.addEventListener('click', () => {
    amountEl.value = ''; categoryEl.value = ''; descriptionEl.value = ''; bankSearchEl.value = ''; toBinEl.value = ''; accountEl.value = '';
    selectedBankEl.classList.add('hidden'); selectedBankEl.innerHTML = ''; resultEl.textContent = 'Chưa có hành động';
});

// ---------- HISTORY (skeleton) ----------
async function loadHistory(page = 1, search = "") {
    if (!loggedIn) { showAuthOverlay(); showToast('failed', 'Vui lòng đăng nhập'); return; }
    historyBody.innerHTML = `<tr><td colspan="7" class="muted">Đang tải...</td></tr>`;
    try {
        const params = new URLSearchParams();
        params.set('page', page); params.set('limit', histLimit);
        if (search) params.set('q', search);
        const r = await fetch(`/api/history?${params.toString()}`, { credentials: 'include' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        let items = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
        if (!items || !items.length) {
            historyBody.innerHTML = `<tr><td colspan="7" class="muted">Không có dữ liệu</td></tr>`;
            historyPageInfo.textContent = `Trang ${page} / 1`;
            return;
        }
        const total = data?.data?.total ?? items.length;
        histTotalPages = Math.max(1, Math.ceil((total || items.length) / histLimit));
        histPage = page;
        historyPageInfo.textContent = `Trang ${histPage} / ${histTotalPages}`;
        historyBody.innerHTML = items.map(it => {
            const batchId = it.id ?? it.batchId ?? it.batch_id ?? '-';
            const reference = it.referenceId ?? it.reference ?? '-';
            const txn = (Array.isArray(it.transactions) && it.transactions[0]) ? it.transactions[0] : (it.transaction ?? it);
            const amount = txn?.amount ?? it?.amount ?? '-';
            const recipient = txn?.toAccountName ?? txn?.toAccountNumber ?? '-';
            const bin = txn?.toBin ?? '-';
            const time = txn?.transactionDatetime ?? it?.createdAt ?? '-';
            const status = txn?.state ?? it?.approvalState ?? it?.status ?? '-';
            return `<tr><td>${escapeHtml(batchId)}</td><td>${escapeHtml(reference)}</td><td>${(typeof amount === 'number') ? formatMoney(amount) : escapeHtml(String(amount))}</td><td>${escapeHtml(recipient)}</td><td>${escapeHtml(bin)}</td><td>${escapeHtml(time)}</td><td>${escapeHtml(status)}</td></tr>`;
        }).join('');
    } catch (e) {
        console.error(e);
        historyBody.innerHTML = `<tr><td colspan="7" class="muted">Lỗi tải lịch sử</td></tr>`;
    }
}
historyRefresh && historyRefresh.addEventListener('click', () => loadHistory(1, historySearch.value.trim()));
historySearch && historySearch.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadHistory(1, historySearch.value.trim()); });
historyPrev && historyPrev.addEventListener('click', () => { if (histPage > 1) loadHistory(histPage - 1, historySearch.value.trim()); });
historyNext && historyNext.addEventListener('click', () => { if (histPage < histTotalPages) loadHistory(histPage + 1, historySearch.value.trim()); });

// ---------- TOPUP (skeleton) ----------
function clientGenDesc() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", alnum = letters + "0123456789";
    let s = letters.charAt(Math.floor(Math.random() * letters.length));
    for (let i = 1; i < 10; i++) s += alnum.charAt(Math.floor(Math.random() * alnum.length));
    return s;
}
topupGenerate && topupGenerate.addEventListener('click', () => { if (topupResultMsg) topupResultMsg.textContent = 'Mô tả (client): ' + clientGenDesc(); });
topupForm && topupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!loggedIn) requireClientAuthShowLogin();
    topupResult.style.display = 'none';
    const amount = Number(topupAmount.value || 0);
    if (!amount || amount < 1000) { showToast('failed', 'Số tiền không hợp lệ (>=1000)'); return; }
    try {
        const r = await fetch('/create-payment-link', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }) });
        const j = await r.json();
        if (!r.ok) { showToast('failed', j?.message || 'Tạo link thất bại'); topupResult.style.display = ''; topupResultMsg.textContent = JSON.stringify(j, null, 2); return; }
        topupResult.style.display = ''; topupResultMsg.textContent = `Link: ${j.checkoutUrl}\nMô tả(server): ${j.description}`;
        window.open(j.checkoutUrl, '_blank');
        showToast('success', 'Tạo link thành công');
    } catch (e) { console.error(e); showToast('failed', 'Lỗi kết nối'); topupResult.style.display = ''; topupResultMsg.textContent = 'Lỗi: ' + (e.message || e); }
});

// ---------- AUTH (skeleton) ----------
async function updateWhoami() {
    try {
        const r = await fetch('/whoami', { credentials: 'include' });
        if (!r.ok) throw new Error('not ok');
        const j = await r.json();
        if (j.loggedIn) { loggedIn = true; navGreeting.textContent = `Xin chào ${j.username}`; btnLogin.style.display = 'none'; btnLogout.style.display = ''; hideAuthOverlay(); fetchBalance(); }
        else { loggedIn = false; navGreeting.textContent = ''; btnLogin.style.display = ''; btnLogout.style.display = 'none'; showAuthOverlay(); showPage('login'); }
    } catch (e) { loggedIn = false; navGreeting.textContent = ''; btnLogin.style.display = ''; btnLogout.style.display = 'none'; showAuthOverlay(); showPage('login'); }
}
loginForm && loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { username: loginUsername.value.trim(), password: loginPassword.value };
    try {
        const r = await fetch('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        const j = await r.json();
        if (!r.ok) { showToast('failed', j.message || 'Đăng nhập thất bại'); return; }
        showToast('success', 'Đăng nhập thành công');
        await updateWhoami(); showPage('home'); fetchBalance();
    } catch (e) { console.error(e); showToast('failed', 'Lỗi đăng nhập'); }
});
loginCancel && loginCancel.addEventListener('click', () => showPage('home'));
btnLogin && btnLogin.addEventListener('click', () => showPage('login'));
btnLogout && btnLogout.addEventListener('click', async () => {
    try { await fetch('/logout', { method: 'POST', credentials: 'include' }); } catch (e) { }
    await updateWhoami(); showPage('home'); showToast('success', 'Đã đăng xuất');
});

// ---------- BALANCE (skeleton) ----------
async function fetchBalance() {
    if (!loggedIn) { balanceEl && (balanceEl.textContent = '--'); return; }
    if (!balanceEl) return;
    balanceEl.textContent = 'Đang tải...';
    try {
        const r = await fetch('/api/balance', { credentials: 'include' });
        if (!r.ok) { balanceEl.textContent = '--'; showToast('failed', 'Không thể tải số dư'); return; }
        const j = await r.json();
        const bal = j?.data?.balance ?? j?.balance ?? null;
        balanceEl.textContent = (typeof bal === 'number') ? formatMoney(bal) : (bal ? String(bal).slice(0, 40) : '--');
    } catch (e) { console.error(e); balanceEl.textContent = '--'; showToast('failed', 'Lỗi tải số dư (xem console)'); }
}
refreshBalanceBtn && refreshBalanceBtn.addEventListener('click', () => { if (!loggedIn) { showAuthOverlay(); showToast('failed', 'Vui lòng đăng nhập'); return; } fetchBalance(); });
copyBalanceBtn && copyBalanceBtn.addEventListener('click', () => navigator.clipboard?.writeText(balanceEl.textContent || '').then(() => showToast('success', 'Sao chép thành công')).catch(() => showToast('failed', 'Không thể sao chép')));

// ---------- SIDEBAR TOGGLE (mobile) ----------
btnToggleSidebar && btnToggleSidebar.addEventListener('click', () => {
    if (!sidebar) return;
    const isHidden = sidebar.style.display === 'none';
    sidebar.style.display = isHidden ? 'block' : 'none';
});

// ---------- INIT ----------
loadVietqrBanks().then(() => { /* banks loaded */ });
updateWhoami();
setInterval(() => { if (loggedIn) fetchBalance(); }, 120000);
