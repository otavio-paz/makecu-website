# MakeCU 2026 Website

Static Jekyll landing page for MakeCU, Columbia University Robotics Club's 24-hour hardware hackathon on November 7-8, 2026.

The site intentionally keeps unconfirmed items as placeholders: registration, sponsors, exact venue rooms, hardware inventory, prizes, judges, schedule, Discord, and contact email.

## Local Development

```bash
bundle install
bundle exec jekyll serve
```

Open `http://localhost:4000`.

## Edit Content

Most event copy lives in `_config.yml`.

Useful files:

- `index.html` - page structure and sections
- `_config.yml` - event details, FAQ, sponsor placeholders, schedule placeholders
- `css/makecu.css` - visual design, gradients, and minimal circuit motifs
- `images/` - favicon and legacy/static image assets
- `DEPLOYMENT.md` - Vercel, MLH, and domain access checklist

## Vercel

This repo includes `vercel.json`:

```json
{
  "installCommand": "bundle install --path vendor/bundle",
  "buildCommand": "bundle exec jekyll build",
  "outputDirectory": "_site"
}
```

Import the GitHub repo into Vercel and use the `mlh-hackathon-boilerplate` folder as the project root if the repository keeps this folder structure.
