/** Configuração desktop. Campos MariaDB permanecem para compatibilidade com config.json antigo. */
export interface DesktopConfigDto {
  connectionMode?: 'local' | 'remote';
  serverUrl?: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}
export interface DesktopConnectionResultDto { success: boolean; error?: string; restartRequired?: boolean }
