/**
 * Shared HTML layout for all pages.
 * DaisyUI v5 + Tailwind CSS 4 loaded via CDN (no build step).
 */
export function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@5" rel="stylesheet" type="text/css" />
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
</head>
<body class="min-h-screen flex items-center justify-center bg-base-200">
  ${body}
</body>
</html>`
}
