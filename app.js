/* ==============================================
   PALS Community — Main Application JavaScript
   Three.js 3D Hero + Instagram Feed + Admin
   Connected to Backend API & Supabase Data Layer
   ============================================== */

const API_BASE = window.location.origin;

// ─── API Client Helper ─────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': 'pals2026',
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.warn(`[API Client] ${endpoint} error:`, err.message);
    return null;
  }
}

// Global state
let posts = [];
let nextCursor = null;
let hasMorePosts = false;
let currentCampaign = null;
let currentWinner = null;
let adminPostsList = [];

// ─── Utility ───────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return 'Just now';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function generateInitials(name) {
  if (!name) return 'PA';
  return name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function generateAvatarSVG(name, size = 34) {
  const colors = ['#e85d2a', '#2d8a4e', '#4a6fa5', '#9b59b6', '#e67e22', '#16a085', '#c0392b', '#2c3e50'];
  const hash = (name || 'PALS').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const color = colors[hash % colors.length];
  const initials = generateInitials(name);
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${size / 2}" fill="${color}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="DM Sans,sans-serif" font-weight="600" font-size="${size * 0.38}">${initials}</text></svg>`)}`;
}

function generatePostImage(color = '#e8d5c4', username = 'student') {
  const hash = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const shapes = hash % 4;
  let shapeSVG = '';

  if (shapes === 0) {
    shapeSVG = `<circle cx="150" cy="140" r="60" fill="rgba(0,0,0,0.06)"/>
                <circle cx="250" cy="200" r="40" fill="rgba(0,0,0,0.04)"/>
                <rect x="80" y="220" width="80" height="80" rx="12" fill="rgba(0,0,0,0.05)" transform="rotate(15, 120, 260)"/>`;
  } else if (shapes === 1) {
    shapeSVG = `<rect x="60" y="100" width="100" height="100" rx="16" fill="rgba(0,0,0,0.06)" transform="rotate(-10, 110, 150)"/>
                <circle cx="260" cy="180" r="50" fill="rgba(0,0,0,0.04)"/>
                <rect x="180" y="240" width="60" height="60" rx="30" fill="rgba(0,0,0,0.05)"/>`;
  } else if (shapes === 2) {
    shapeSVG = `<polygon points="200,80 260,180 140,180" fill="rgba(0,0,0,0.05)"/>
                <circle cx="120" cy="240" r="45" fill="rgba(0,0,0,0.04)"/>
                <rect x="220" y="220" width="70" height="70" rx="35" fill="rgba(0,0,0,0.06)"/>`;
  } else {
    shapeSVG = `<rect x="100" y="90" width="120" height="120" rx="60" fill="rgba(0,0,0,0.05)"/>
                <circle cx="80" cy="250" r="35" fill="rgba(0,0,0,0.04)"/>
                <circle cx="280" cy="140" r="28" fill="rgba(0,0,0,0.04)"/>
                <rect x="200" y="240" width="80" height="50" rx="8" fill="rgba(0,0,0,0.05)"/>`;
  }

  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="${color}"/>${shapeSVG}<text x="200" y="350" text-anchor="middle" fill="rgba(0,0,0,0.12)" font-family="DM Sans,sans-serif" font-weight="600" font-size="14">@palsofficial</text></svg>`)}`;
}

function getPostImageSrc(post) {
  if (post.media_url && typeof post.media_url === 'string' && post.media_url.trim()) {
    return post.media_url;
  }
  if (post.image && typeof post.image === 'string' && post.image.trim()) {
    return post.image;
  }
  return generatePostImage(post.color || '#e8d5c4', post.username || 'student');
}

function getAvatarSrc(post, size = 34) {
  if (post.profile_image_url && typeof post.profile_image_url === 'string' && post.profile_image_url.trim()) {
    return post.profile_image_url;
  }
  if (post.avatar && typeof post.avatar === 'string' && post.avatar.trim()) {
    return post.avatar;
  }
  return generateAvatarSVG(post.username || 'PALS', size);
}

// ─── Three.js Hero ─────────────────────────────────────────
function initHero() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 18);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Lighting — warm, soft, natural
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xfff5e6, 0.8);
  dirLight.position.set(5, 8, 6);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.3);
  fillLight.position.set(-4, 3, -4);
  scene.add(fillLight);

  // Materials — matte, clay-like
  const matOrange = new THREE.MeshStandardMaterial({
    color: 0xe85d2a,
    roughness: 0.85,
    metalness: 0.0,
    flatShading: false,
  });

  const matDark = new THREE.MeshStandardMaterial({
    color: 0x1a1a18,
    roughness: 0.9,
    metalness: 0.0,
  });

  const matLightGray = new THREE.MeshStandardMaterial({
    color: 0xf1f0ed,
    roughness: 0.95,
    metalness: 0.0,
  });

  const matWarm = new THREE.MeshStandardMaterial({
    color: 0xd4a574,
    roughness: 0.8,
    metalness: 0.0,
  });

  const matSage = new THREE.MeshStandardMaterial({
    color: 0x9cae9a,
    roughness: 0.85,
    metalness: 0.0,
  });

  // Floating 3D objects
  const objects = [];

  // Torus Knot
  const torusKnot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.35, 100, 16), matOrange);
  torusKnot.position.set(-6, 2, -4);
  torusKnot.castShadow = true;
  scene.add(torusKnot);
  objects.push({ mesh: torusKnot, speed: 0.003, axis: 'y', bobSpeed: 0.8, bobAmp: 0.3, initY: 2 });

  // Icosahedron
  const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), matDark);
  ico.position.set(7, -1, -3);
  ico.castShadow = true;
  scene.add(ico);
  objects.push({ mesh: ico, speed: 0.005, axis: 'xy', bobSpeed: 1.0, bobAmp: 0.25, initY: -1 });

  // Sphere
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 32), matWarm);
  sphere.position.set(-5, -3, -2);
  sphere.castShadow = true;
  scene.add(sphere);
  objects.push({ mesh: sphere, speed: 0.004, axis: 'y', bobSpeed: 1.2, bobAmp: 0.35, initY: -3 });

  // Box
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), matLightGray);
  box.position.set(5, 3, -5);
  box.rotation.set(0.4, 0.6, 0);
  box.castShadow = true;
  scene.add(box);
  objects.push({ mesh: box, speed: 0.004, axis: 'xz', bobSpeed: 0.7, bobAmp: 0.2, initY: 3 });

  // Dodecahedron
  const dodeca = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), matSage);
  dodeca.position.set(3, -3.5, -6);
  dodeca.castShadow = true;
  scene.add(dodeca);
  objects.push({ mesh: dodeca, speed: 0.003, axis: 'y', bobSpeed: 0.9, bobAmp: 0.28, initY: -3.5 });

  // Cylinder
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.0, 32), matOrange.clone());
  cyl.material.color.setHex(0xc04a22);
  cyl.position.set(-3, 4, -7);
  cyl.rotation.z = Math.PI / 4;
  cyl.castShadow = true;
  scene.add(cyl);
  objects.push({ mesh: cyl, speed: 0.005, axis: 'z', bobSpeed: 0.6, bobAmp: 0.22, initY: 4 });

  // Torus
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.25, 16, 100), matWarm.clone());
  torus.material.color.setHex(0xb8956a);
  torus.position.set(-7, -0.5, -6);
  torus.castShadow = true;
  scene.add(torus);
  objects.push({ mesh: torus, speed: 0.006, axis: 'xy', bobSpeed: 1.1, bobAmp: 0.2, initY: -0.5 });

  // Cone
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 6), matSage.clone());
  cone.material.color.setHex(0x7d947b);
  cone.position.set(6.5, 1.5, -8);
  cone.castShadow = true;
  scene.add(cone);
  objects.push({ mesh: cone, speed: 0.004, axis: 'y', bobSpeed: 0.85, bobAmp: 0.3, initY: 1.5 });

  // Particles
  const dotGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const dotMat = new THREE.MeshStandardMaterial({ color: 0xd4d3cf, roughness: 1, metalness: 0 });

  for (let i = 0; i < 18; i++) {
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 10 - 5
    );
    scene.add(dot);
    objects.push({
      mesh: dot,
      speed: 0.001 + Math.random() * 0.003,
      axis: 'y',
      bobSpeed: 0.5 + Math.random() * 1.0,
      bobAmp: 0.15 + Math.random() * 0.2,
      initY: dot.position.y,
    });
  }

  // Mouse parallax
  let mouseX = 0,
    mouseY = 0;
  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  // Animation loop
  let time = 0;
  function animate() {
    requestAnimationFrame(animate);
    time += 0.01;

    objects.forEach((obj) => {
      if (obj.axis.includes('x')) obj.mesh.rotation.x += obj.speed;
      if (obj.axis.includes('y')) obj.mesh.rotation.y += obj.speed;
      if (obj.axis.includes('z')) obj.mesh.rotation.z += obj.speed;
      obj.mesh.position.y = obj.initY + Math.sin(time * obj.bobSpeed) * obj.bobAmp;
    });

    camera.position.x += (mouseX * 0.8 - camera.position.x) * 0.02;
    camera.position.y += (-mouseY * 0.5 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ─── Navbar ────────────────────────────────────────────────
function initNavbar() {
  const navbar = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  });

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
  });

  navLinks.querySelectorAll('a:not(.nav-cta)').forEach((link) => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
    });
  });
}

// ─── Dynamic Stats Calculation ─────────────────────────────
function updateHeroStats() {
  const approvedPosts = posts.filter((p) => p.status === 'approved');
  const uniqueParticipants = new Set(posts.map((p) => (p.username || '').toLowerCase())).size;
  const winnersCount = currentWinner && currentWinner.post ? 1 : posts.filter((p) => p.is_winner).length;

  const statPostsEl = document.getElementById('statPosts');
  const statParticipantsEl = document.getElementById('statParticipants');
  const statWinnersEl = document.getElementById('statWinners');

  if (statPostsEl) statPostsEl.textContent = approvedPosts.length;
  if (statParticipantsEl) statParticipantsEl.textContent = uniqueParticipants;
  if (statWinnersEl) statWinnersEl.textContent = winnersCount;
}

// ─── Community Feed (Consumes GET /api/community/posts) ──────
let currentFilter = 'all';

async function fetchFeed(reset = false) {
  if (reset) {
    nextCursor = null;
    posts = [];
  }

  const query = new URLSearchParams({
    category: currentFilter,
    limit: '6',
  });
  if (nextCursor) {
    query.set('cursor', nextCursor);
  }

  const data = await apiFetch(`/api/community/posts?${query.toString()}`);
  if (data && Array.isArray(data.posts)) {
    if (reset) {
      posts = data.posts;
    } else {
      posts = [...posts, ...data.posts];
    }
    nextCursor = data.nextCursor;
    hasMorePosts = data.hasMore;
  }

  renderFeed();
  updateHeroStats();
}

function renderFeed() {
  const grid = document.getElementById('feedGrid');
  const emptyState = document.getElementById('feedEmpty');
  const loadMore = document.getElementById('loadMoreBtn');

  grid.innerHTML = '';

  if (posts.length === 0) {
    emptyState.classList.remove('hidden');
    loadMore.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  posts.forEach((post, i) => {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.style.animationDelay = `${i * 0.08}s`;
    card.dataset.postId = post.id;

    const handle = post.username.startsWith('@') ? post.username : `@${post.username}`;

    card.innerHTML = `
      <div class="post-card-img-wrapper">
        ${post.is_winner ? '<span class="post-card-winner-badge">🏆 Winner</span>' : ''}
        <img class="post-card-img" src="${getPostImageSrc(post)}" alt="Post by ${post.username}" loading="lazy" />
      </div>
      <div class="post-card-body">
        <div class="post-card-user">
          <img class="post-card-avatar" src="${getAvatarSrc(post, 34)}" alt="${post.username}" />
          <div>
            <div class="post-card-username">${post.username}</div>
            <div class="post-card-handle">${handle}</div>
          </div>
        </div>
        <p class="post-card-caption">${post.caption || ''}</p>
        <div class="post-card-meta">
          <span class="post-card-likes">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"/></svg>
            ${post.like_count || post.likes || 12}
          </span>
          <span class="post-card-type">${post.category || post.media_type || 'photo'}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => openPostModal(post));
    grid.appendChild(card);
  });

  loadMore.classList.toggle('hidden', !hasMorePosts);
}

function initFeed() {
  fetchFeed(true);

  // Filters
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      fetchFeed(true);
    });
  });

  // Load more
  document.getElementById('loadMoreBtn').addEventListener('click', () => {
    fetchFeed(false);
  });
}

// ─── Post Modal ────────────────────────────────────────────
function openPostModal(post) {
  const modal = document.getElementById('postModal');
  const body = document.getElementById('modalBody');
  const handle = post.username.startsWith('@') ? post.username : `@${post.username}`;

  body.innerHTML = `
    <img src="${getPostImageSrc(post)}" alt="Post by ${post.username}" />
    <div class="modal-details">
      <div class="modal-user">
        <img class="modal-avatar" src="${getAvatarSrc(post, 42)}" alt="${post.username}" />
        <div>
          <div class="modal-username">${post.username}</div>
          <div class="modal-handle">${handle}</div>
        </div>
      </div>
      <p class="modal-caption">${post.caption || ''}</p>
      <div class="modal-meta">
        <span>Category: <strong>${post.category || 'General'}</strong></span>
        <span>${timeAgo(post.instagram_created_at || post.created_at)}</span>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
}

function initModal() {
  const modal = document.getElementById('postModal');
  document.getElementById('modalCloseBtn').addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
}

// ─── Winners (Consumes GET /api/community/campaign) ─────────
async function fetchCampaignAndWinners() {
  const data = await apiFetch('/api/community/campaign');
  if (data) {
    currentCampaign = data.campaign;
    currentWinner = data.winner;
  }
  renderWinners();
  updateHeroStats();
}

function renderWinners() {
  const grid = document.getElementById('winnersGrid');
  grid.innerHTML = '';

  if (!currentWinner || !currentWinner.post) {
    const emptyCard = document.createElement('div');
    emptyCard.className = 'winners-empty-card reveal visible';
    emptyCard.innerHTML = `
      <div class="winner-trophy-icon">🏆</div>
      <div class="winners-empty-content">
        <h3>No Campaign Winners Crowned Yet</h3>
        <p>The "Tag. Post. Win." campaign is actively live! The <strong>first valid student post</strong> tagging <strong>@palsofficial</strong> that passes moderation wins this round's exclusive goodies.</p>
        <div class="winners-empty-action">
          <a href="#campaign" class="btn btn-outline btn-sm">See How to Win</a>
        </div>
      </div>
    `;
    grid.appendChild(emptyCard);
    return;
  }

  const w = currentWinner.post;
  const user = currentWinner.user || { username: w.username, profile_image_url: null };
  const card = document.createElement('div');
  card.className = 'winner-card reveal visible';
  const handle = user.username.startsWith('@') ? user.username : `@${user.username}`;

  card.innerHTML = `
    <img class="winner-avatar" src="${getAvatarSrc(w, 64)}" alt="${user.username}" />
    <div class="winner-info">
      <h4>${user.username}</h4>
      <p class="winner-handle">${handle}</p>
      <p class="winner-campaign">Campaign: ${currentCampaign?.name || 'Launch Round'}</p>
      <span class="winner-prize">🎁 ${currentWinner.reward || 'PALS Exclusive Goodies Kit'}</span>
    </div>
  `;
  grid.appendChild(card);
}

// ─── Admin Panel (Protected /api/admin/* APIs) ──────────────
let adminLoggedIn = false;
let adminTab = 'pending';

function initAdmin() {
  const overlay = document.getElementById('adminOverlay');
  const loginSection = document.getElementById('adminLogin');
  const dashboard = document.getElementById('adminDashboard');

  // Open
  document.getElementById('adminToggleBtn').addEventListener('click', (e) => {
    e.preventDefault();
    overlay.classList.remove('hidden');
    if (adminLoggedIn) {
      loginSection.classList.add('hidden');
      dashboard.classList.remove('hidden');
      loadAdminPosts();
    } else {
      loginSection.classList.remove('hidden');
      dashboard.classList.add('hidden');
    }
  });

  // Close
  document.getElementById('adminCloseBtn').addEventListener('click', () => {
    overlay.classList.add('hidden');
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });

  // Login
  document.getElementById('adminLoginBtn').addEventListener('click', () => {
    const pwd = document.getElementById('adminPassword').value;
    if (pwd === 'pals2026') {
      adminLoggedIn = true;
      loginSection.classList.add('hidden');
      dashboard.classList.remove('hidden');
      loadAdminPosts();
    } else {
      document.getElementById('adminPassword').style.borderColor = '#c0392b';
      setTimeout(() => {
        document.getElementById('adminPassword').style.borderColor = '';
      }, 1500);
    }
  });

  document.getElementById('adminPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('adminLoginBtn').click();
  });

  // Tabs
  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      adminTab = tab.dataset.tab;
      loadAdminPosts();
    });
  });
}

async function loadAdminPosts() {
  if (adminTab === 'ingest') {
    renderAdminIngestForm();
    return;
  }

  const container = document.getElementById('adminPosts');
  container.innerHTML = `<p style="text-align:center; color:#7a7870; padding:24px;">Loading ${adminTab} posts...</p>`;

  const data = await apiFetch(`/api/admin/posts?status=${adminTab}`);
  adminPostsList = data?.posts || [];
  renderAdminList();
}

function renderAdminIngestForm() {
  const container = document.getElementById('adminPosts');
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <p class="ingest-desc">Simulate an incoming Instagram post tagged with <strong>@palsofficial</strong>, or trigger auto-sync.</p>
      <button class="btn btn-outline btn-sm" id="adminSyncBtn" style="flex-shrink:0;">🔄 Trigger Sync</button>
    </div>
    
    <form id="ingestForm" class="ingest-form">
      <div class="form-row">
        <div class="form-group">
          <label for="ingestName">Instagram Username</label>
          <input type="text" id="ingestName" placeholder="e.g. rohan_codes" required class="admin-input-full" />
        </div>
        <div class="form-group">
          <label for="ingestType">Post Type</label>
          <select id="ingestType" class="admin-select-full">
            <option value="IMAGE">Photo</option>
            <option value="VIDEO">Reel / Video</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label for="ingestCaption">Caption (must mention @palsofficial)</label>
        <textarea id="ingestCaption" rows="2" placeholder="Excited for the hackathon hosted by @palsofficial! #TagPostWin" required class="admin-textarea"></textarea>
      </div>

      <div class="form-group">
        <label for="ingestImage">Media URL (Optional)</label>
        <input type="url" id="ingestImage" placeholder="https://images.unsplash.com/..." class="admin-input-full" />
      </div>

      <div style="display:flex; justify-content:flex-end; margin-top:8px;">
        <button type="submit" class="btn btn-primary btn-sm">Submit to Ingestion Pipeline</button>
      </div>
    </form>
  `;

  document.getElementById('adminSyncBtn').addEventListener('click', async () => {
    const btn = document.getElementById('adminSyncBtn');
    btn.textContent = 'Syncing...';
    const result = await apiFetch('/api/admin/instagram/sync', { method: 'POST' });
    if (result && result.success) {
      alert(`Sync finished! Received: ${result.stats.received}, Stored: ${result.stats.stored}, Duplicates: ${result.stats.duplicates}`);
      fetchFeed(true);
      fetchCampaignAndWinners();
    }
    btn.textContent = '🔄 Trigger Sync';
  });

  document.getElementById('ingestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('ingestName').value.trim();
    const caption = document.getElementById('ingestCaption').value.trim();
    const media_type = document.getElementById('ingestType').value;
    const media_url = document.getElementById('ingestImage').value.trim();

    const result = await apiFetch('/api/admin/posts', {
      method: 'POST',
      body: JSON.stringify({
        username,
        caption,
        media_type,
        media_url: media_url || null,
      }),
    });

    if (result && result.success) {
      alert(`Post processed successfully! Classified as: ${result.post.category} ${result.isWinner ? '🏆 Crowned Winner!' : ''}`);
      fetchFeed(true);
      fetchCampaignAndWinners();
      adminTab = 'approved';
      document.querySelectorAll('.admin-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === 'approved');
      });
      loadAdminPosts();
    } else {
      alert(`Ingestion rejected: ${result?.error || 'Unknown error'}`);
    }
  });
}

function renderAdminList() {
  const container = document.getElementById('adminPosts');

  if (adminPostsList.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:#7a7870; padding:48px 0; font-size:0.92rem;">No ${adminTab} posts found. Use "+ Ingest Post" to add new posts.</p>`;
    return;
  }

  container.innerHTML = adminPostsList
    .map(
      (post) => `
    <div class="admin-post-card" data-id="${post.id}">
      <img class="admin-post-thumb" src="${getPostImageSrc(post)}" alt="" />
      <div class="admin-post-info">
        <h4>${post.username} <span style="font-weight:400; color:#7a7870;">${post.category || 'General'}</span></h4>
        <p>${post.caption || ''}</p>
        <span style="font-size:0.75rem; color:#7a7870;">${timeAgo(post.instagram_created_at || post.created_at)} · ${post.media_type || 'IMAGE'}</span>
      </div>
      <div class="admin-post-actions">
        ${
          adminTab === 'pending'
            ? `
          <button class="admin-btn admin-btn-approve" onclick="adminAction('${post.id}','approve')">Approve</button>
          <button class="admin-btn admin-btn-reject" onclick="adminAction('${post.id}','reject')">Reject</button>
        `
            : adminTab === 'approved'
            ? `
          <span class="admin-status-badge badge-approved">Approved</span>
          ${!post.is_winner ? `<button class="admin-btn admin-btn-winner" onclick="adminAction('${post.id}','feature')">🏆 Winner</button>` : '<span class="admin-status-badge" style="background:#fef3ee;color:#e85d2a;">Winner</span>'}
          <button class="admin-btn admin-btn-reject" onclick="adminAction('${post.id}','reject')">Reject</button>
        `
            : `
          <span class="admin-status-badge badge-rejected">Rejected</span>
          <button class="admin-btn admin-btn-approve" onclick="adminAction('${post.id}','approve')">Approve</button>
        `
        }
      </div>
    </div>
  `
    )
    .join('');
}

window.adminAction = async function (postId, action) {
  const result = await apiFetch(`/api/admin/posts/${postId}/${action}`, { method: 'POST' });
  if (result && result.success) {
    await loadAdminPosts();
    fetchFeed(true);
    fetchCampaignAndWinners();
  }
};

// ─── Scroll Reveal ─────────────────────────────────────────
function initReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.reveal, .step-card, .rule-item').forEach((el) => {
    el.classList.add('reveal');
    observer.observe(el);
  });
}

// ─── Initialization ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initHero();
  initNavbar();
  initFeed();
  initModal();
  fetchCampaignAndWinners();
  initAdmin();
  initReveal();
});
