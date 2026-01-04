# LinuxTampa Website

Static website built with [Eleventy (11ty)](https://www.11ty.dev/).

## Setup

1. Install dependencies:
```bash
npm install
```

## Development

Start the development server with live reload:
```bash
npm run serve
```

The site will be available at `http://localhost:8080`

## Build

Generate the static site:
```bash
npm run build
```

Output will be in the `_site/` directory, ready to deploy.

## Project Structure

```
src/
  _includes/     # Templates (base.njk)
  _data/         # Global data (site.json)
  css/           # Stylesheets
  work/          # Case studies (markdown)
  *.md           # Pages (markdown)
images/          # Static images (copied to output)
_site/           # Generated static site (gitignored)
```

## Writing Content

- Pages are written in **Markdown** (`.md` files)
- Each page has frontmatter with `layout`, `title`, and `description`
- Global site data is in `src/_data/site.json`
- Templates use Nunjucks syntax

## Customization

- Edit `src/_data/site.json` for site-wide data
- Edit `src/_includes/base.njk` for layout changes
- Edit individual `.md` files for page content
- Edit `src/css/style.css` for styling

