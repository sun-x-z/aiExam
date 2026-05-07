const storageKeys = {
  session: "ai-exam.session",
};

const loginPanel = document.getElementById("login-panel");
const dashboardPanel = document.getElementById("dashboard-panel");
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const usersGrid = document.getElementById("users-grid");
const usersCount = document.getElementById("users-count");
const logoutButton = document.getElementById("logout-button");

const fields = {
  avatarImage: document.getElementById("avatar-image"),
  role: document.getElementById("user-role"),
  displayName: document.getElementById("display-name"),
  bio: document.getElementById("user-bio"),
  userId: document.getElementById("user-id"),
  department: document.getElementById("user-department"),
  email: document.getElementById("user-email"),
  phone: document.getElementById("user-phone"),
  location: document.getElementById("user-location"),
  lastLogin: document.getElementById("last-login"),
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function clearSession() {
  localStorage.removeItem(storageKeys.session);
}

function buildDefaultAvatar(user) {
  const initials = String(user.displayName || user.username || "?")
    .split(" ")
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const accent = user.accent || "#0f766e";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="${user.displayName}">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${accent}" />
          <stop offset="100%" stop-color="#f1d3aa" />
        </linearGradient>
      </defs>
      <rect width="320" height="320" rx="48" fill="url(#g)" />
      <circle cx="160" cy="118" r="56" fill="rgba(255,255,255,0.26)" />
      <path d="M72 272c10-50 46-78 88-78s78 28 88 78" fill="rgba(255,255,255,0.26)" />
      <text
        x="160"
        y="174"
        text-anchor="middle"
        dominant-baseline="middle"
        fill="#fffdf8"
        font-size="68"
        font-family="Georgia, serif"
        font-weight="700"
      >
        ${initials}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function renderLogin() {
  clearSession();
  dashboardPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
  loginForm.reset();
  loginMessage.textContent = "";
  document.body.style.removeProperty("--accent");
}

function renderUsers(users, currentUser) {
  dashboardPanel.classList.remove("hidden");
  loginPanel.classList.add("hidden");

  fields.avatarImage.src = buildDefaultAvatar(currentUser);
  fields.role.textContent = currentUser.role;
  fields.displayName.textContent = currentUser.displayName;
  fields.bio.textContent = currentUser.bio;
  fields.userId.textContent = currentUser.id;
  fields.department.textContent = currentUser.department;
  fields.email.textContent = currentUser.email;
  fields.phone.textContent = currentUser.phone;
  fields.location.textContent = currentUser.location;
  fields.lastLogin.textContent = "登录成功";
  usersCount.textContent = `${users.length} 位用户`;
  document.body.style.setProperty("--accent", currentUser.accent || "#0f766e");

  usersGrid.innerHTML = users
    .map(
      (user) => `
        <article class="user-card ${user.username === currentUser.username ? "active" : ""}" data-username="${user.username}">
          <div class="user-card-avatar" style="--user-accent:${user.accent || "#0f766e"}">${String(
            user.displayName || user.username
          )
            .split(" ")
            .map((part) => part.trim()[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase()}</div>
          <div class="user-card-body">
            <h4>${user.displayName}</h4>
            <p>${user.role}</p>
            <span>${user.department}</span>
          </div>
        </article>
      `
    )
    .join("");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

async function loadSession() {
  const session = readJson(storageKeys.session, null);
  if (!session?.token) {
    renderLogin();
    return;
  }

  try {
    const payload = await fetchJson("/api/users", {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    writeJson(storageKeys.session, {
      token: session.token,
      user: payload.currentUser,
    });
    renderUsers(payload.users, payload.currentUser);
  } catch (error) {
    renderLogin();
    loginMessage.textContent = error.message || "请重新登录";
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";

  const formData = new FormData(loginForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    loginMessage.textContent = "请输入用户名和密码";
    return;
  }

  try {
    const payload = await fetchJson("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    writeJson(storageKeys.session, payload);
    await loadSession();
  } catch (error) {
    loginMessage.textContent = error.message || "登录失败";
  }
});

logoutButton.addEventListener("click", renderLogin);

loadSession();
