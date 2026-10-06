// Verificação no navegador: executar com playwright-cli run-code --filename.
async (page) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  await page.goto('http://127.0.0.1:5174/');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const image of await page.locator('#sistema img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(element => element.decode());
    }
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    check(!overflow, `Rolagem horizontal na página em ${width}px.`);
    check(await page.locator('.feature-row').count() === 6, 'Faltam blocos da rotina.');
    const images = await page.locator('#sistema img, .hero-preview img').evaluateAll(elements => elements.map(image => ({
      valid: image.complete && image.naturalWidth > 0,
      heightDelta: Math.abs(image.getBoundingClientRect().height - image.getBoundingClientRect().width * Number(image.getAttribute('height')) / Number(image.getAttribute('width'))),
    })));
    check(images.every(image => image.valid && image.heightDelta < 1.5), 'Imagem ausente ou proporção incorreta.');
    const trigger = page.locator('#pagamentos .feature-image');
    await trigger.click();
    const dialog = page.locator('#preview-dialog');
    check(await dialog.evaluate(element => element.open), 'A ampliação não abriu.');
    await dialog.locator('img').evaluate(element => element.decode());
    check(await page.getByRole('button', { name: 'Fechar prévia' }).evaluate(element => element === document.activeElement), 'Foco inicial incorreto.');
    await page.keyboard.press('Shift+Tab');
    check(await dialog.evaluate(element => element.contains(document.activeElement)), 'Shift+Tab saiu do diálogo.');
    await page.keyboard.press('Tab');
    check(await dialog.evaluate(element => element.contains(document.activeElement)), 'Tab saiu do diálogo.');
    if (width === 375) {
      check(await dialog.locator('.preview-image-scroll').evaluate(element => element.scrollWidth > element.clientWidth), 'A imagem não permite deslizar no celular.');
    }
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    check(await trigger.evaluate(element => element === document.activeElement), 'Foco não voltou à imagem.');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `output/playwright/magisform-visual/website-${width}.png`, fullPage: true });
    results.push({ width, images: images.length, overflow: false, dialog: 'OK' });
  }
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  check(await page.locator('#main-navigation').isVisible(), 'Menu móvel não abriu.');
  await page.keyboard.press('Escape');
  check(!await page.locator('#main-navigation').isVisible(), 'Escape não fechou o menu.');
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.locator('#main-navigation a[href="#sistema"]').click();
  check(new URL(page.url()).hash === '#sistema', 'Âncora do sistema incorreta.');
  check(!await page.locator('#main-navigation').isVisible(), 'Menu permaneceu aberto após navegação.');
  const question = page.locator('summary').filter({ hasText: 'Posso registrar pagamentos parciais?' });
  await question.focus();
  await page.keyboard.press('Enter');
  check(await question.evaluate(element => element.parentElement.open), 'FAQ não abriu pelo teclado.');
  await page.keyboard.press('Enter');
  check(!await question.evaluate(element => element.parentElement.open), 'FAQ não fechou pelo teclado.');
  const contacts = await page.locator('[data-whatsapp]').evaluateAll(elements => elements.every(element =>
    element.href.startsWith('https://wa.me/5541991942228?text=') && element.target === '_blank' && element.rel.includes('noopener')));
  check(contacts, 'Link comercial incorreto.');
  for (const trigger of await page.locator('#sistema [data-preview]').all()) {
    await trigger.click();
    await page.locator('#preview-dialog img').evaluate(element => element.decode());
    check(await page.locator('#preview-dialog img').evaluate(element => element.naturalWidth > 0), 'Ampliação sem imagem.');
    await page.getByRole('button', { name: 'Fechar prévia' }).click();
  }
  check(errors.length === 0, errors.join('\n'));
  await page.setViewportSize({ width: 1440, height: 5000 });
  await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.locator('#sistema').screenshot({ path: 'output/playwright/magisform-visual/funcionalidades-desktop.png' });
  await page.locator('#pagamentos').screenshot({ path: 'output/playwright/magisform-visual/pagamentos-desktop.png' });
  await page.setViewportSize({ width: 375, height: 1600 });
  await page.locator('#pagamentos').screenshot({ path: 'output/playwright/magisform-visual/pagamentos-mobile.png' });
  return { responsive: results, menu: 'OK', faq: 'OK', contacts: 'OK', previews: 'OK', errors };
}
