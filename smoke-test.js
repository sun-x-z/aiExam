const fs = require("fs");
const path = require("path");
const vm = require("vm");

class MockClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  add(name) {
    this.values.add(name);
  }

  remove(name) {
    this.values.delete(name);
  }

  contains(name) {
    return this.values.has(name);
  }
}

class MockElement {
  constructor(id, options = {}) {
    this.id = id;
    this.textContent = "";
    this.value = "";
    this.src = "";
    this.innerHTML = "";
    this.files = [];
    this.listeners = {};
    this.classList = new MockClassList(options.classes || []);
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  reset() {
    this.currentValues = { username: "", password: "" };
  }
}

class MockFormData {
  constructor(form) {
    this.form = form;
  }

  get(name) {
    return this.form.currentValues?.[name] ?? "";
  }
}

function createStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map.entries());
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const elements = {
    "login-panel": new MockElement("login-panel"),
    "dashboard-panel": new MockElement("dashboard-panel", { classes: ["hidden"] }),
    "login-form": new MockElement("login-form"),
    "login-message": new MockElement("login-message"),
    "logout-button": new MockElement("logout-button"),
    "avatar-image": new MockElement("avatar-image"),
    "user-role": new MockElement("user-role"),
    "display-name": new MockElement("display-name"),
    "user-bio": new MockElement("user-bio"),
    "user-id": new MockElement("user-id"),
    "user-department": new MockElement("user-department"),
    "user-email": new MockElement("user-email"),
    "user-phone": new MockElement("user-phone"),
    "user-location": new MockElement("user-location"),
    "last-login": new MockElement("last-login"),
    "users-grid": new MockElement("users-grid"),
    "users-count": new MockElement("users-count"),
  };

  elements["login-form"].currentValues = { username: "", password: "" };

  const localStorage = createStorage();
  const responses = {
    "/api/login": {
      token: "mock.token",
      user: {
        username: "admin",
        id: "U-10001",
        displayName: "系统管理员",
        role: "Platform Owner",
        department: "数字化平台部",
        email: "admin@example.com",
        phone: "138-0000-0001",
        location: "Shanghai",
        bio: "负责平台配置、账号治理和基础能力巡检。",
        accent: "#0f766e",
      },
    },
    "/api/users": {
      currentUser: {
        username: "admin",
        id: "U-10001",
        displayName: "系统管理员",
        role: "Platform Owner",
        department: "数字化平台部",
        email: "admin@example.com",
        phone: "138-0000-0001",
        location: "Shanghai",
        bio: "负责平台配置、账号治理和基础能力巡检。",
        accent: "#0f766e",
      },
      users: [
        {
          username: "admin",
          id: "U-10001",
          displayName: "系统管理员",
          role: "Platform Owner",
          department: "数字化平台部",
          email: "admin@example.com",
          phone: "138-0000-0001",
          location: "Shanghai",
          bio: "负责平台配置、账号治理和基础能力巡检。",
          accent: "#0f766e",
        },
        {
          username: "alice",
          id: "U-10002",
          displayName: "Alice Chen",
          role: "Operations Analyst",
          department: "经营分析组",
          email: "alice.chen@example.com",
          phone: "138-0000-0002",
          location: "Hangzhou",
          bio: "负责经营分析与月度报表复核。",
          accent: "#c96f1f",
        },
      ],
    },
  };

  const document = {
    body: {
      style: {
        state: {},
        setProperty(name, value) {
          this.state[name] = value;
        },
        removeProperty(name) {
          delete this.state[name];
        },
      },
    },
    getElementById(id) {
      if (!elements[id]) {
        throw new Error(`Missing element: ${id}`);
      }
      return elements[id];
    },
  };

  const context = vm.createContext({
    console,
    document,
    localStorage,
    FormData: MockFormData,
    Intl,
    fetch: async (url, options = {}) => {
      if (url === "/api/login") {
        return {
          ok: true,
          json: async () => responses["/api/login"],
        };
      }

      if (url === "/api/users") {
        return {
          ok: true,
          json: async () => responses["/api/users"],
        };
      }

      return {
        ok: false,
        json: async () => ({ error: "not found" }),
      };
    },
  });

  const scriptPath = path.join(__dirname, "app.js");
  const script = fs.readFileSync(scriptPath, "utf8");
  vm.runInContext(script, context, { filename: scriptPath });

  await new Promise((resolve) => setImmediate(resolve));

  elements["login-form"].currentValues = { username: "admin", password: "Admin123!" };
  await elements["login-form"].listeners.submit({
    preventDefault() {},
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert(elements["login-panel"].classList.contains("hidden"), "login panel should be hidden after login");
  assert(!elements["dashboard-panel"].classList.contains("hidden"), "dashboard should be visible after login");
  assert(elements["display-name"].textContent === "系统管理员", "current user should render");
  assert(elements["users-count"].textContent === "2 位用户", "user count should render");
  assert(elements["users-grid"].innerHTML.includes("Alice Chen"), "user list should render");

  elements["logout-button"].listeners.click();
  assert(!elements["login-panel"].classList.contains("hidden"), "login panel should show after logout");
  assert(elements["dashboard-panel"].classList.contains("hidden"), "dashboard should hide after logout");

  const storageDump = localStorage.dump();
  assert(!storageDump["ai-exam.session"], "session should be cleared after logout");

  console.log("smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
