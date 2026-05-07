const users = [
  {
    id: "U-10001",
    username: "admin",
    password: "Admin123!",
    displayName: "系统管理员",
    role: "Platform Owner",
    department: "数字化平台部",
    email: "admin@example.com",
    phone: "138-0000-0001",
    location: "Shanghai",
    bio: "负责平台配置、账号治理和基础能力巡检，适合演示管理员视角的登录与信息呈现。",
    accent: "#0f766e",
  },
  {
    id: "U-10002",
    username: "alice",
    password: "Alice123!",
    displayName: "Alice Chen",
    role: "Operations Analyst",
    department: "经营分析组",
    email: "alice.chen@example.com",
    phone: "138-0000-0002",
    location: "Hangzhou",
    bio: "负责经营分析与月度报表复核，用于验证普通业务用户的资料展示和头像修改能力。",
    accent: "#c96f1f",
  },
  {
    id: "U-10003",
    username: "bob",
    password: "Bob123!",
    displayName: "Bob Wang",
    role: "Regional Manager",
    department: "华东区域",
    email: "bob.wang@example.com",
    phone: "138-0000-0003",
    location: "Nanjing",
    bio: "负责区域运营协同，适合验证多用户切换、会话保持和头像本地持久化效果。",
    accent: "#8a4b14",
  },
];

const storageKeys = {
  session: "simple-user-system.session",
  avatars: "simple-user-system.avatars",
  lastLogins: "simple-user-system.last-logins",
};

const loginPanel = document.getElementById("login-panel");
const dashboardPanel = document.getElementById("dashboard-panel");
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const avatarInput = document.getElementById("avatar-input");
const logoutButton = document.getElementById("logout-button");
const resetAvatarButton = document.getElementById("reset-avatar-button");

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
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getUserByUsername(username) {
  return users.find((user) => user.username === username);
}

function buildDefaultAvatar(user) {
  const initials = user.displayName
    .split(" ")
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="${user.displayName}">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${user.accent}" />
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

function getAvatarMap() {
  return readJson(storageKeys.avatars, {});
}

function getLastLoginMap() {
  return readJson(storageKeys.lastLogins, {});
}

function formatLocalDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function persistSession(user) {
  writeJson(storageKeys.session, { username: user.username });

  const lastLogins = getLastLoginMap();
  lastLogins[user.username] = formatLocalDate(new Date());
  writeJson(storageKeys.lastLogins, lastLogins);
}

function clearSession() {
  localStorage.removeItem(storageKeys.session);
}

function resolveAvatar(user) {
  const avatarMap = getAvatarMap();
  return avatarMap[user.username] || buildDefaultAvatar(user);
}

function renderUser(user) {
  loginPanel.classList.add("hidden");
  dashboardPanel.classList.remove("hidden");

  fields.avatarImage.src = resolveAvatar(user);
  fields.role.textContent = user.role;
  fields.displayName.textContent = user.displayName;
  fields.bio.textContent = user.bio;
  fields.userId.textContent = user.id;
  fields.department.textContent = user.department;
  fields.email.textContent = user.email;
  fields.phone.textContent = user.phone;
  fields.location.textContent = user.location;
  fields.lastLogin.textContent = getLastLoginMap()[user.username] || "首次登录";

  document.body.style.setProperty("--accent", user.accent);
}

function renderLogin() {
  clearSession();
  dashboardPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
  loginForm.reset();
  loginMessage.textContent = "";
  document.body.style.removeProperty("--accent");
}

function bootFromSession() {
  const session = readJson(storageKeys.session, null);
  if (!session || !session.username) {
    renderLogin();
    return;
  }

  const user = getUserByUsername(session.username);
  if (!user) {
    renderLogin();
    return;
  }

  renderUser(user);
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const user = getUserByUsername(username);

  if (!user || user.password !== password) {
    loginMessage.textContent = "用户名或密码错误，请使用页面左侧提供的演示账号。";
    return;
  }

  loginMessage.textContent = "";
  persistSession(user);
  renderUser(user);
});

logoutButton.addEventListener("click", () => {
  renderLogin();
});

resetAvatarButton.addEventListener("click", () => {
  const session = readJson(storageKeys.session, null);
  if (!session?.username) {
    return;
  }

  const avatarMap = getAvatarMap();
  delete avatarMap[session.username];
  writeJson(storageKeys.avatars, avatarMap);

  const user = getUserByUsername(session.username);
  if (user) {
    renderUser(user);
  }
});

avatarInput.addEventListener("change", () => {
  const file = avatarInput.files?.[0];
  const session = readJson(storageKeys.session, null);

  if (!file || !session?.username) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    loginMessage.textContent = "请选择图片文件作为头像。";
    avatarInput.value = "";
    return;
  }

  if (file.size > 1.5 * 1024 * 1024) {
    loginMessage.textContent = "头像文件请控制在 1.5MB 以内。";
    avatarInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const avatarMap = getAvatarMap();
    avatarMap[session.username] = String(reader.result);
    writeJson(storageKeys.avatars, avatarMap);

    const user = getUserByUsername(session.username);
    if (user) {
      renderUser(user);
    }

    loginMessage.textContent = "";
    avatarInput.value = "";
  };
  reader.readAsDataURL(file);
});

bootFromSession();
