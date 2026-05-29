login: async (email, password) => {
  const res = await client.post('/auth/login', { email, password })

  console.log("FULL LOGIN RESPONSE:", res.data)

  // 🔍 try all common backend response shapes safely
  const data = res.data

  const token =
    data?.token ||
    data?.access_token ||
    data?.data?.token ||
    data?.data?.access_token

  const user =
    data?.user ||
    data?.data?.user ||
    null

  if (!token) {
    console.error("❌ No token found in login response", data)
    return data
  }

  // ✅ SAVE TO LOCAL STORAGE
  localStorage.setItem('tlp_token', token)

  if (user) {
    localStorage.setItem('tlp_user', JSON.stringify(user))
  }

  console.log("✅ Token saved:", token)

  return { token, user }
}