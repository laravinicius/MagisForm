(() => {
  'use strict';

  const config = window.MAGISFORM_CONFIG;
  const number = config?.whatsappNumber ?? '';
  const validNumber = /^55\d{10,11}$/.test(number);
  const contactStatus = document.querySelector('[data-contact-status]');

  document.querySelectorAll('[data-whatsapp]').forEach(link => {
    const message = config?.messages?.[link.dataset.whatsapp];
    if (!validNumber || !message) {
      link.href = '#contato';
      link.removeAttribute('target');
      if (contactStatus) contactStatus.hidden = false;
      return;
    }
    link.href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });

  const menuButton = document.querySelector('[data-menu-toggle]');
  const navigation = document.querySelector('#main-navigation');
  const mobileMedia = window.matchMedia('(max-width: 900px)');
  function closeMenu(returnFocus = false) {
    navigation.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Abrir menu');
    if (returnFocus) menuButton.focus();
  }
  if (menuButton && navigation) {
    // O menu permanece visível sem JavaScript; só passa a recolhível após inicialização.
    document.documentElement.classList.add('menu-ready');
    menuButton.hidden = false;
    menuButton.addEventListener('click', () => {
      const opened = navigation.classList.toggle('is-open');
      menuButton.setAttribute('aria-expanded', String(opened));
      menuButton.setAttribute('aria-label', opened ? 'Fechar menu' : 'Abrir menu');
    });
    navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && navigation.classList.contains('is-open')) closeMenu(true);
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('.site-header')) closeMenu();
    });
    mobileMedia.addEventListener('change', () => closeMenu());
    document.addEventListener('focusin', event => {
      if (mobileMedia.matches && !event.target.closest('.site-header')) closeMenu();
    });
  }

  const dialog = document.querySelector('#preview-dialog');
  const modalImage = dialog?.querySelector('img');
  const modalTitle = dialog?.querySelector('[data-preview-title]');
  const closeButton = dialog?.querySelector('[data-dialog-close]');
  let lastTrigger = null;

  if (dialog && typeof dialog.showModal === 'function') {
    document.querySelectorAll('[data-preview]').forEach(trigger => {
      trigger.addEventListener('click', event => {
        event.preventDefault();
        lastTrigger = trigger;
        modalImage.src = trigger.href;
        modalImage.alt = trigger.querySelector('img')?.alt ?? trigger.dataset.title;
        modalTitle.textContent = trigger.dataset.title;
        dialog.showModal();
        document.body.classList.add('dialog-open');
        closeButton.focus();
      });
    });
    closeButton.addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(control => control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    dialog.addEventListener('click', event => {
      const bounds = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('dialog-open');
      lastTrigger?.focus();
    });
  }
})();
