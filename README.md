# 🗺️ Cartographic Studio

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/MapLibre-GL-blue?style=for-the-badge&logo=maplibre" alt="MapLibre" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=for-the-badge&logo=tailwind-css" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript" />
</p>

**Cartographic Studio** is a high-fidelity, professional-grade map design studio. Built with Next.js 16 and MapLibre GL, it empowers creators to design stunning map posters, wallpapers, and social media assets with granular control over every visual layer.

**[🚀 Live Demo](https://cartographic-studio.vercel.app/)**

---

## ✨ Key Highlights

- **🎨 300+ Professional Themes**: A massive collection of curated palettes, from *Midnight Blue* luxury atlas aesthetics to *Neon City* cyberpunk vibes.
- **🖼️ High-Resolution Export Engine**: Support for up to **8K resolution** exports with embedded **DPI metadata** (300 DPI) for print-ready perfection.
- **📐 Precise Layout Control**: Over 50+ predefined layouts including ISO A-series (A0-A6), US Paper, Social Media formats (Instagram, Reels, X), and Digital Screen sizes (4K, Ultrawide, Mobile).
- **🔬 Advanced Map Engine**: Powered by **OpenFreeMap** planet vector tiles with custom "Over-Zoom" rendering logic that captures 5.5x more detail than standard web maps.
- **🛡️ Hardened Reliability**: Synchronized export pipeline that ensures fonts, map textures, and UI elements are perfectly rendered before the final download.
- **📍 Dynamic Geocoding**: Real-time reverse geocoding using Photon, automatically updating location labels as you explore.

---

## 🚀 Tech Stack

- **Core Engine**: [Next.js 16](https://nextjs.org/) (App Router) & [React 19](https://react.dev/)
- **Mapping**: [MapLibre GL JS](https://maplibre.org/) with [OpenFreeMap](https://openfreemap.org/)
- **Styling**: [Tailwind CSS 4.0](https://tailwindcss.com/) & [Radix UI](https://www.radix-ui.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Export**: [html-to-image](https://github.com/bubkoo/html-to-image) with custom DPI injection logic
- **Geocoding**: [Photon API](https://photon.komoot.io/)

---

## 🛠️ Getting Started

### Prerequisites

- Node.js (Latest LTS recommended)
- `pnpm` (recommended), `npm`, or `yarn`

### Installation

```bash
# Clone the repository
git clone <repository-url>

# Navigate to the project directory
cd map

# Install dependencies
pnpm install
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to start designing.

---

## 🧭 Under the Hood

### High-Fidelity Rendering
Unlike standard screenshot tools, Cartographic Studio uses an **Over-Zoom** technique. The map is rendered in a hidden high-resolution canvas (5.5x scale) before being composited, ensuring that small details like street names and building outlines remain crisp even in 8K exports.

### DPI Embedding
For professional printing, images require DPI metadata. Our engine manually injects the `pHYs` (Physical pixel dimensions) chunk into the PNG data stream, ensuring printers correctly interpret the image's physical scale.

### Tile Proxying
To prevent CORS "tainting" of the canvas (which blocks exports), all map tiles and fonts are proxied through a local API route (`/api/tiles`), ensuring same-origin compliance.

---

## 📁 Project Structure

```text
├── app/
│   ├── api/tiles/     # Tile proxy for CORS stabilization
│   ├── layout.tsx     # Global providers and meta tags
│   └── page.tsx       # Main Entry point
├── components/
│   ├── map-poster.tsx # The CORE Studio Component (120KB+ of logic)
│   ├── ui/            # Radix-based UI system
│   └── map/           # MapLibre wrapper components
├── lib/
│   ├── map-style.ts   # Dynamic StyleSpecification generator
│   └── utils.ts       # Tailored utility functions
└── public/            # Static assets and fonts
```

---

## 📄 License

All rights reserved. Internal project for Cartographic Studio.

<p align="center">Built with ❤️ by Kanishk Kumar Singh.</p>
