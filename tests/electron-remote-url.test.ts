import { describe, expect, it } from 'vitest';
import { testRemoteConnection, validateServerUrl } from '../electron/remoteAdapter';

describe('URL do Electron remoto', () => {
  it('aceita somente origem HTTPS sem credenciais, caminho, query ou fragmento', () => {
    expect(validateServerUrl('https://farmacia.exemplo.com/', false)).toBe('https://farmacia.exemplo.com');
    for (const url of [
      'http://farmacia.exemplo.com',
      'https://usuario:senha@farmacia.exemplo.com',
      'https://farmacia.exemplo.com/app',
      'https://farmacia.exemplo.com/?tenant=outro',
      'https://farmacia.exemplo.com/#fragmento',
      'not-a-url',
    ]) expect(() => validateServerUrl(url, false)).toThrow();
  });

  it('permite HTTP somente em loopback no desenvolvimento', () => {
    expect(validateServerUrl('http://127.0.0.1:3001', true)).toBe('http://127.0.0.1:3001');
    expect(validateServerUrl('http://localhost:3001', true)).toBe('http://localhost:3001');
    expect(() => validateServerUrl('http://127.0.0.1:3001', false)).toThrow();
    expect(() => validateServerUrl('http://10.0.0.5:3001', true)).toThrow();
  });

  it('retorna indisponibilidade quando o endpoint não responde', async () => {
    const result = await testRemoteConnection({ connectionMode: 'remote', serverUrl: 'https://127.0.0.1:1', host: '', port: 3306, user: '', password: '', database: '' }, true);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
