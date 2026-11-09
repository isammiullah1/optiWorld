process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-0123456789';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://optiworld:optiworld@localhost:5432/optiworld?schema=public';
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
process.env.ADMIN_NEXTAUTH_URL = process.env.ADMIN_NEXTAUTH_URL || 'http://localhost:3001';
