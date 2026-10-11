// The cookie name carrying a pending two-factor challenge lives in its own module
// because both the login route and the 2FA route need it, and a route file may
// only export the HTTP verb itself.

export const TWO_FACTOR_COOKIE = "orkut_2fa";