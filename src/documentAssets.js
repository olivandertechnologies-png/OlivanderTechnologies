const FONT_ASSETS = {
  dmSans: {
    id: "olivander-font-dm-sans",
    href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap",
  },
  jetbrainsMono: {
    id: "olivander-font-jetbrains",
    href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap",
  },
  sora: {
    id: "olivander-font-sora",
    href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap",
  },
};

function ensureStylesheet({ id, href }) {
  if (document.getElementById(id)) {
    return;
  }

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function ensureInlineStyle({ id, css }) {
  if (document.getElementById(id)) {
    return;
  }

  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

export function loadDocumentAssets({ fonts = [], styles = [] } = {}) {
  fonts.forEach((font) => ensureStylesheet(FONT_ASSETS[font]));
  styles.forEach(ensureInlineStyle);
}
