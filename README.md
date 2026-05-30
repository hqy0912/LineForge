# LineForge

## About

LineForge is a browser-based line editor for plain text configuration files. It lets you open `.txt`, `.ini`, `.cfg`, `.conf`, and `.log` files, edit them line by line, reorder content, filter noisy lines, and save the result back to disk when the browser supports direct file access.

## Features

- Open text files by drag-and-drop or file picker.
- Edit each line independently with textarea inputs.
- Add lines above or below any existing line.
- Delete individual lines.
- Drag lines to reorder content.
- Hide comment lines and blank lines while editing.
- Detect and preserve the original line ending style.
- Warn before replacing a file with unsaved changes.
- Save directly to the original file when supported, or download the edited file as a fallback.
- Traditional Chinese and English UI text through vue-i18n.

## Tech Stack

- Vue 3
- TypeScript
- Vite
- Element Plus
- vue-i18n
- SortableJS

## Getting Started

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Build for production:

```sh
npm run build
```

Preview the production build locally:

```sh
npm run preview
```

## Project Structure

```text
public/
src/
  assets/
  components/
  i18n/
    locales/
  App.vue
  main.ts
  style.css
vite.config.ts
```

## Deployment

LineForge builds to static files in the `dist/` directory, so it can be hosted on GitHub Pages, Netlify, Vercel, Cloudflare Pages, Firebase Hosting, Nginx, Apache, or any static web server.

For GitHub Pages project sites, the deployed URL usually looks like:

```text
https://your-username.github.io/LineForge/
```

In that case, set the Vite base path before building:

```ts
export default defineConfig({
  base: '/LineForge/',
})
```

For a custom domain or a user/organization site such as `your-username.github.io`, use:

```ts
export default defineConfig({
  base: '/',
})
```

## License

No license has been specified yet.
