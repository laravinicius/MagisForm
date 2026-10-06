"""Captura o renderer atual com dados fictícios e gera as imagens do website."""
from pathlib import Path
import shutil
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which('node')
NPX = shutil.which('npx.cmd') or shutil.which('npx')
SESSION = 'magisform-captura'


def cli(*args):
    result = subprocess.run(
        [NPX, '--yes', '--package', '@playwright/cli', 'playwright-cli',
         f'-s={SESSION}', *args], cwd=ROOT, capture_output=True, text=True,
        encoding='utf-8', errors='replace', timeout=120,
    )
    if result.returncode or '### Error' in result.stdout:
        raise RuntimeError(result.stdout + result.stderr)
    return result


if __name__ == '__main__':
    if not NODE or not NPX:
        raise SystemExit('Node.js e npx são necessários para capturar as telas.')
    # Não reutiliza servidores que possam estar ligados a uma operação real.
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', 5175)) == 0:
            raise SystemExit('A porta 5175 está ocupada. Encerre esse servidor antes da captura.')
    server = subprocess.Popen([NODE, 'website/tools/preview-server.mjs'], cwd=ROOT)
    opened = False
    try:
        for attempt in range(60):
            if server.poll() is not None:
                raise RuntimeError('O servidor de captura encerrou antes de ficar pronto.')
            try:
                with urllib.request.urlopen('http://127.0.0.1:5175/', timeout=1) as response:
                    if response.status == 200:
                        break
            except (OSError, TimeoutError):
                time.sleep(0.5)
        else:
            raise RuntimeError('O servidor de captura não respondeu na porta 5175.')
        cli('open', '--browser=chrome')
        opened = True
        cli('run-code', '--filename=website/tools/capture-previews.js')
        subprocess.run([NODE, 'website/tools/render-assets.cjs', '--previews-only'], cwd=ROOT, check=True)
        print('Capturas atuais e versões WebP/AVIF geradas com dados fictícios.')
    finally:
        try:
            if opened:
                cli('close')
        finally:
            server.terminate()
            server.wait(timeout=10)
