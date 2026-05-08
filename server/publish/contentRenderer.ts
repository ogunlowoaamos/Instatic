import { renderContentMarkdownToHtml } from '@core/content/renderMarkdown'
import { escapeHtml, safeUrl } from '@core/publisher/utils'

interface RenderContentDocumentInput {
  title: string
  bodyMarkdown: string
  seoTitle: string
  seoDescription: string
  featuredMediaPath: string | null
}

export function renderContentDocumentHtml(input: RenderContentDocumentInput): string {
  const title = escapeHtml(input.title || 'Untitled')
  const seoTitle = escapeHtml(input.seoTitle || input.title || 'Untitled')
  const seoDescription = escapeHtml(input.seoDescription || '')
  const bodyHtml = renderContentMarkdownToHtml(input.bodyMarkdown)
  const featuredMedia = input.featuredMediaPath
    ? `<img class="featured-media" src="${safeUrl(input.featuredMediaPath)}" alt="" loading="lazy">`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${seoTitle}</title>
  ${seoDescription ? `<meta name="description" content="${seoDescription}">` : ''}
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #f7f7f5; color: #141414; }
    main { width: min(760px, calc(100vw - 40px)); margin: 0 auto; padding: 72px 0 96px; }
    h1 { margin: 0 0 24px; font-size: clamp(40px, 7vw, 72px); line-height: .95; letter-spacing: 0; }
    .featured-media { display: block; width: 100%; margin: 0 0 32px; border-radius: 8px; object-fit: cover; }
    article { font-size: 18px; line-height: 1.72; }
    article h1, article h2, article h3 { margin: 1.5em 0 .5em; line-height: 1.15; letter-spacing: 0; }
    article h1 { font-size: 40px; }
    article h2 { font-size: 30px; }
    article h3 { font-size: 24px; }
    article p { margin: 0 0 1.1em; }
    article a { color: #3346d3; }
    article img, article video { display: block; max-width: 100%; margin: 28px 0; border-radius: 8px; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    ${featuredMedia}
    <article>${bodyHtml}</article>
  </main>
</body>
</html>`
}
