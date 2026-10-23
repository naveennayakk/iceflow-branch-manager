import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL || 'file:../../data/iceflow.db',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  backupDir: path.resolve(__dirname, process.env.BACKUP_DIR || '../../../data/backups'),
  uploadDir: path.resolve(__dirname, process.env.UPLOAD_DIR || '../../../data/uploads'),
  mainAdminUsername: process.env.MAIN_ADMIN_USERNAME || 'mainadmin',
  mainAdminPassword: process.env.MAIN_ADMIN_PASSWORD || 'IceFlow@Main2026',
  encryptionKey: process.env.ENCRYPTION_KEY || 'iceflow-aes-256-key-change-me-now!!',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  loginRateLimitMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '20', 10),
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
  ashokLlmEnabled: (process.env.ASHOK_LLM_ENABLED || 'true') === 'true',
};
