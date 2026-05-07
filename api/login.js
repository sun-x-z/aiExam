const { createSessionToken } = require("./_lib/auth");
const { query } = require("./_lib/db");
const { readJsonBody, sendError, sendJson } = require("./_lib/http");
const { publicUser, userSelect } = require("./_lib/users");

module.exports = async function loginHandler(req, res) {
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed");
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendError(res, 400, "Invalid JSON body");
    return;
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) {
    sendError(res, 400, "Username and password are required");
    return;
  }

  try {
    const result = await query(
      `SELECT ${userSelect} FROM public.user_profiles WHERE username = $1 AND password_hash = crypt($2, password_hash) AND is_active = TRUE LIMIT 1`,
      [username, password]
    );

    const row = result.rows[0];
    if (!row) {
      sendError(res, 401, "用户名或密码错误");
      return;
    }

    const user = publicUser(row);
    const token = createSessionToken(user.username);
    sendJson(res, 200, { token, user });
  } catch (error) {
    sendError(res, 500, error.code === "DB_CONFIG_MISSING" ? "数据库连接未配置" : `登录接口异常: ${error.message}`);
  }
};
