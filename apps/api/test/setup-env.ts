// Runs before every test file: point the app at the isolated test database.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://stockflow:stockflow@localhost:5432/stockflow_test?schema=public";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-that-is-long-enough-123456";
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.WEB_URL ??= "http://localhost:3000";
// Tests create several organizations to prove tenant isolation.
process.env.ALLOW_MULTI_ORG_SIGNUP = "true";
process.env.AUTH_RATE_LIMIT ??= "1000";
