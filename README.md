# 🗺️ Cartographic Studio

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![MapLibre](https://img.shields.io/badge/MapLibre-GL-yellow?style=for-the-badge&logo=maplibre)](https://maplibre.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)

**Cartographic Studio** is an interactive map design studio built with Next.js and MapLibre GL. It allows creators to build custom map posters, wallpapers, and social assets with full visual control and export-ready output.

---

## ✨ Features

- Interactive map styling with custom color controls
- Print-ready poster layouts (A1–A5, US Letter)
- Social media formats for Instagram and Stories
- Layer visibility controls for roads, buildings, parks, and more
- Reverse geocoding for dynamic location labels
- High-resolution export using `html-to-image`
- Responsive UI for desktop and mobile

---

## 🚀 Tech Stack

- **Next.js 16**
- **React 19**
- **TypeScript**
- **MapLibre GL**
- **Tailwind CSS 4**
- **Radix UI**
- **Lucide Icons**
- **html-to-image**

---

## 🛠️ Getting Started

### Requirements

- Node.js (Latest LTS recommended)
- `npm` or `pnpm`

### Install

```bash
git clone <repository-url>
cd map
pnpm install
```

### Run locally

```bash
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

---

## 📦 Available Scripts

- `pnpm dev` — start development server
- `pnpm build` — build production app
- `pnpm start` — serve production build
- `pnpm lint` — run ESLint

> If you prefer `npm`, use `npm install`, `npm run dev`, etc.

---

## 🧭 Usage

1. Search for a location in the search bar.
2. Choose a theme and adjust map styles.
3. Select a layout format in the Layout section.
4. Change layer visibility and map detail.
5. Export the final design.

---

## 📁 Project Structure

- `app/` — Next.js app routes and layout
- `components/` — UI and map components
- `hooks/` — reusable React hooks
- `lib/` — utility functions
- `app/api/` — local API routes for tile proxying
- `styles/` — global styling

---

## 💡 Notes

- Map tiles are proxied through `/api/tiles` for same-origin loading.
- Reverse geocoding updates the location label when the map stops moving.
- The project is currently set as private.

---

## 📄 License

All rights reserved.

<p align="center">Built with ❤️ by Kanishk Kumar Singh.</p>
