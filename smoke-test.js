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

class MockFileReader {
  readAsDataURL(file) {
    this.result = file.mockDataUrl;
    if (typeof this.onload === "function") {
      this.onload();
    }
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

function main() {
  const elements = {
    "login-panel": new MockElement("login-panel"),
    "dashboard-panel": new MockElement("dashboard-panel", { classes: ["hidden"] }),
    "login-form": new MockElement("login-form"),
    "login-message": new MockElement("login-message"),
    "avatar-input": new MockElement("avatar-input"),
    "logout-button": new MockElement("logout-button"),
    "reset-avatar-button": new MockElement("reset-avatar-button"),
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
  };

  elements["login-form"].currentValues = { username: "", password: "" };

  const localStorage = createStorage();
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
    FileReader: MockFileReader,
    Intl,
  });

  const scriptPath = path.join(__dirname, "app.js");
  const script = fs.readFileSync(scriptPath, "utf8");
  vm.runInContext(script, context, { filename: scriptPath });

  assert(!elements["login-panel"].classList.contains("hidden"), "login panel should be visible after boot");
  assert(elements["dashboard-panel"].classList.contains("hidden"), "dashboard should be hidden after boot");

  elements["login-form"].currentValues = { username: "admin", password: "Admin123!" };
  elements["login-form"].listeners.submit({
    preventDefault() {},
  });

  assert(elements["login-panel"].classList.contains("hidden"), "login panel should be hidden after login");
  assert(!elements["dashboard-panel"].classList.contains("hidden"), "dashboard should be visible after login");
  assert(elements["display-name"].textContent === "系统管理员", "display name should render for admin");
  assert(elements["user-email"].textContent === "admin@example.com", "email should render for admin");
  assert(elements["avatar-image"].src.startsWith("data:image/svg+xml"), "default avatar should be rendered");

  elements["avatar-input"].files = [
    {
      type: "image/png",
      size: 128,
      mockDataUrl: "data:image/png;base64,ZmFrZS1hdmF0YXI=",
    },
  ];
  elements["avatar-input"].listeners.change();

  assert(
    elements["avatar-image"].src === "data:image/png;base64,ZmFrZS1hdmF0YXI=",
    "uploaded avatar should replace default avatar"
  );

  elements["reset-avatar-button"].listeners.click();
  assert(elements["avatar-image"].src.startsWith("data:image/svg+xml"), "reset should restore default avatar");

  elements["logout-button"].listeners.click();
  assert(!elements["login-panel"].classList.contains("hidden"), "login panel should show after logout");
  assert(elements["dashboard-panel"].classList.contains("hidden"), "dashboard should hide after logout");

  const storageDump = localStorage.dump();
  assert(!storageDump["simple-user-system.session"], "session should be cleared after logout");

  console.log("smoke test passed");
}

main();
