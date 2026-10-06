// Executar com playwright-cli run-code --filename=website/tools/capture-previews.js.
async (page) => {
  const output = 'website/assets/images/sources';
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === 'http://127.0.0.1:5175' ? route.continue() : route.abort();
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-06T12:00:00-03:00'));
  await page.goto('http://127.0.0.1:5175/');
  await page.getByLabel('Usuário', { exact: true }).fill('demonstracao');
  await page.getByLabel('Senha', { exact: true }).fill('dados-ficticios');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  const settle = async () => {
    await page.evaluate(() => document.fonts.ready);
    await page.getByText('Carregando', { exact: false }).waitFor({ state: 'hidden' });
    await page.mouse.move(0, 0);
  };
  const capture = async (name, target) => {
    await settle();
    if (target && name.endsWith('-detail')) {
      const clip = await page.locator('.ui-content').evaluate(element => {
        element.scrollTop = 0;
        const rect = element.getBoundingClientRect();
        const bottom = Math.max(...Array.from(element.children).map(child => child.getBoundingClientRect().bottom));
        return { x: rect.x, y: rect.y, width: rect.width, height: Math.min(rect.height, bottom - rect.y + 32) };
      });
      await page.screenshot({ path: `${output}/${name}.png`, clip, animations: 'disabled' });
    } else if (target) await target.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
    else await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
  };
  const navigate = async name => {
    const area = name === 'Aguardando retirada' ? page : page.getByRole('navigation');
    await area.getByRole('button', { name, exact: true }).first().click();
    await settle();
  };
  await page.getByText('Bem-vindo, Equipe Demo', { exact: true }).waitFor();
  await page.getByText('9', { exact: true }).waitFor();
  await capture('dashboard');
  await capture('dashboard-detail', page.locator('main'));
  await navigate('Confirmadas');
  await page.getByRole('heading', { name: 'Fórmulas em produção' }).waitFor();
  await page.getByText('R$ 108,00', { exact: true }).waitFor();
  await capture('formulas');
  await capture('formulas-detail', page.locator('main'));
  await navigate('Aguardando retirada');
  await page.getByRole('heading', { name: 'Fórmulas aguardando retirada' }).waitFor();
  await page.getByText('Cliente Exemplo D', { exact: true }).waitFor();
  await capture('withdrawal');
  await capture('withdrawal-detail', page.locator('main'));
  await navigate('Confirmadas');
  await page.getByText('Cliente Exemplo A', { exact: true }).click();
  await page.getByRole('heading', { name: '3. Orçamento', exact: true }).waitFor();
  // A tela de cadastro tem rolagem: aumentar a janela preserva o layout original.
  await page.setViewportSize({ width: 1920, height: 1700 });
  await capture('recipe');
  const budgetPanel = page.locator('.ui-panel').filter({ has: page.getByRole('heading', { name: '3. Orçamento', exact: true }) });
  await capture('budget', budgetPanel);
  const finalPanel = page.locator('.ui-panel').filter({ has: page.getByRole('heading', { name: '5. Finalizar', exact: true }) });
  await capture('payment', finalPanel);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await navigate('Clientes');
  await page.getByText('Dependente Exemplo', { exact: true }).waitFor();
  await capture('customers');
  await capture('customers-detail', page.locator('main'));
  await navigate('Histórico');
  await page.getByRole('button', { name: 'Repetir', exact: true }).first().waitFor();
  await capture('history');
  await capture('history-detail', page.locator('main'));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Capturas da interface atual geradas, incluindo saldo de R$ 108,00 e histórico.');
}
