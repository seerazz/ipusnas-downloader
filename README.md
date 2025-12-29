# iPusnas Downloader

A modern, high-performance toolkit to download and decrypt DRM-protected books from [ipusnas.perpusnas.go.id](https://ipusnas2.perpusnas.go.id/). Built for speed with **Bun** and **Hono**.

## ✨ Key Features

- **Smart Downloader**: Automatically decrypts and packages books into high-quality PDF or EPUB formats.
- **Queue Manager**: Limits concurrent downloads (max 2) to prevent system overload, with smart auto-queueing.
- **Live Sync**: Real-time progress tracking that survives page refreshes ("Background Sync").
- **Full Control**: Cancel any download instantly with the **Stop** button.
- **Pro Dashboard**: A clean, "Catppuccin Mocha" aesthetic UI with real-time search, library statistics, and instant filtering.
- **Theme Toggle**: Switch between **Dark (Mocha)** and **Light (Latte)** modes to suit your viewing environment. 🌗
- **Library Cleanup**: Reclaim storage space with a one-click 🗑 **Delete** feature for any local book.
- **Local Serving**: Open and read your books directly in the browser or your preferred local reader.

## 🚀 Quick Start

### Prerequisites

1.  **Bun**: Ensure you have [Bun](https://bun.sh/) installed.
2.  **QPDF**: The app uses `qpdf.exe` located in `bin/` for decryption.

### Running the App

```bash
# Install dependencies
bun install

# Start development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🛠 Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Backend Framework**: [Hono](https://hono.dev/) (Native Bun mode)
- **Frontend**: Alpine.js (Reactive UI) + CSS (Catppuccin Mocha Palette)
- **Tooling**: QPDF (Decryption), AdmZip (EPUB packaging)

## 📁 Project Structure

- `src/server.js`: Modern Hono server using native Bun exports.
- `src/index.html`: Reactive Alpine.js frontend.
- `src/modules/`: Functional core (Auth, Crypto, Downloader, Processor).
- `bin/`: External binaries for decryption.
- `books/`: Your decrypted offline library.

---

## 📄 Credits

Originally inspired by the iPusnas CLI tool. Enhanced for the modern web for educational purposes and easier access to materials you've already borrowed.

---

_Disclaimer: This tool is for personal use only. Please respect copyright laws and the terms of service of IPUSNAS._
