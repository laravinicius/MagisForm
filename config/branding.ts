// ─── Configuração central de marca ────────────────────────────────────────────
// Único arquivo que diferencia a versão genérica das versões por cliente.
// Sempre importe as cores da marca daqui (e não hex solto nos componentes),
// para que trocar de cliente = apenas editar este arquivo.

export const BRAND = {
  name: 'MagisForm',
  windowTitle: 'MagisForm - Manipulação',
  caption: 'Manipulação',
};

export const COLORS = {
  primary: '#D95C4F', primaryHover: '#E46D60', onPrimary: '#101814',
  secondary: '#173E35', secondaryHover: '#245347', onSecondary: '#FFFDF8',
  background: '#F4F1E9', surface: '#FFFDF8', surfaceHover: '#F0F3EC',
  ink: '#17201D', muted: '#5F6965', border: '#DCDDD4', controlBorder: '#7B8880',
  sage: '#DCE8E1', sageBorder: '#C4D1C8',
  selectionBg: '#DCE8E1', selectionColor: '#173E35',
  navActive: '#FFFDF8', navActiveBg: '#355D51', navMuted: '#CDDDD3', rowAlt: '#F5F6F0',
  success: '#245D43', successSoft: '#E7F0E7', successStrong: '#D5E5D6', successBorder: '#9BBBA4',
  warning: '#795119', warningSoft: '#F7ECD3', warningStrong: '#F0DDB8', warningBorder: '#B89A61',
  danger: '#A5342D', dangerSoft: '#FAEAE5', dangerStrong: '#F3D4CD', dangerBorder: '#CB8E84',
  info: '#355F68', infoSoft: '#E5EFF0', infoStrong: '#D4E5E7', infoBorder: '#8EAFB5',
  overlay: 'rgba(10, 24, 19, 0.65)',
} as const;

// As variáveis CSS e os estilos React compartilham esta fonte de cores.
export function applyBrandTheme() {
  for (const [name, value] of Object.entries(COLORS)) {
    const cssName = name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    document.documentElement.style.setProperty(`--mf-${cssName}`, value);
  }
}

export const LOGO = {
  original: {
    src: 'brand/logo-horizontal-green.svg',
    fallback: 'brand/symbol-green.svg',
  },
  white: {
    src: 'brand/logo-horizontal-white.svg',
    fallback: 'brand/symbol-white.svg',
  },
  symbol: {
    original: { src: 'brand/symbol-green.svg', fallback: null },
    white: { src: 'brand/symbol-white.svg', fallback: null },
  },
  // Quando src for null, renderiza o CrossIcon + texto.
  textParts: [
    { text: 'Magis', color: COLORS.secondary },
    { text: 'Form', color: COLORS.secondary },
  ],
};
