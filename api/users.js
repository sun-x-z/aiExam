const { verifySessionToken } = require("./_lib/auth");
const { query } = require("./_lib/db");
const { getBearerToken, sendError, sendJson } = require("./_lib/http");
const { publicUser, userSelect } = require("./_lib/users");

module.exports = async function usersHandler(req, res) {
  if (req.method !== "GET") {
    sendError(res, 405, "Method not allowed");
    return;
  }

  const token = getBearerToken(req);
  const payload = verifySessionToken(token);
  if (!payload?.sub) {
    sendError(res, 401, "会话已失效，请重新登录");
    return;
  }

  try {
    const result = await query(
      `SELECT ${userSelect} FROM public.user_profiles WHERE is_active = TRUE ORDER BY display_name ASC, id ASC`
    );

    const users = result.rows.map(publicUser);
    const currentUser = users.find((user) => user.username === payload.sub);
    if (!currentUser) {
      sendError(res, 401, "会话已失效，请重新登录");
      return;
    }

    sendJson(res, 200, {
      currentUser,
      users,
    });
  } catch (error) {
    sendError(res, 500, error.code === "DB_CONFIG_MISSING" ? "数据库连接未配置" : `用户列表查询失败: ${error.message}`);
  }
};
