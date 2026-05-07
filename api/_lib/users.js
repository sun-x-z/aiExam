const userSelect = `
  id,
  username,
  display_name,
  role,
  department,
  email,
  phone,
  location,
  bio,
  accent
`;

function publicUser(row) {
  return {
    accent: row.accent,
    bio: row.bio,
    department: row.department,
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    location: row.location,
    phone: row.phone,
    role: row.role,
    username: row.username,
  };
}

module.exports = {
  publicUser,
  userSelect,
};
