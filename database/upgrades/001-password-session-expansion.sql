-- Atualiza o schema legado consolidado para v1.
-- O executor registra a versão somente após todos os passos. Estas operações
-- são retomáveis depois de DDL parcialmente confirmado pelo MariaDB.
DELETE FROM sessions;
ALTER TABLE users
  MODIFY COLUMN password VARCHAR(255) NOT NULL COMMENT 'Formato legado SHA-256 ou hash codificado';
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS policy ENUM('desktop_local','hosted') NOT NULL DEFAULT 'desktop_local',
  ADD COLUMN IF NOT EXISTS expires_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS absolute_expires_at DATETIME NULL;
ALTER TABLE sessions
  ADD UNIQUE INDEX IF NOT EXISTS uq_sessions_user_id (user_id),
  ADD INDEX IF NOT EXISTS idx_sessions_expires_at (expires_at);
