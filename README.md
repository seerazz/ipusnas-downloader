# iPusnas Downloader

A modern, production-ready web application to download and manage DRM-protected books from [iPusnas](https://ipusnas2.perpusnas.go.id/). Built with **Bun**, **Hono**, and **Alpine.js**.

## ✨ Features

### 📚 Library Management

- **Borrowed Books**: Browse and manage your borrowed books from iPusnas
- **My Library**: Access downloaded books offline with cover images
- **Search Books**: Discover and borrow from the entire iPusnas catalog
- **Smart Status**: See which books you've already borrowed in search results

### 📥 Smart Downloads

- **Queue System**: Automatic queue management (max 2 concurrent downloads)
- **Real-time Progress**: Live progress tracking with download speed (KB/s)
- **Background Sync**: Downloads continue even if you refresh the page
- **Instant Cancel**: Stop any download with one click
- **DRM Decryption**: Automatically decrypts and packages books

### 🎨 Premium UI/UX

- **V3 Light Design**: Clean, compact interface with subtle animations
- **Catppuccin Theme**: Beautiful Dark (Mocha) and Light (Latte) modes
- **Responsive**: Perfect on desktop and mobile (3-column → 2-column)
- **Micro-interactions**: Hover effects, smooth transitions, shimmer loading
- **Accessibility**: Keyboard navigation with visible focus states

### 🔧 Smart Features

- **Auto-Auth**: Detects expired sessions and prompts re-login
- **Cover Fallback**: Shows remote covers when local ones don't exist
- **Library Stats**: Track borrowed, downloaded, and cache size
- **One-click Actions**: Download, read, return, delete with ease

## 🚀 Quick Start

### Prerequisites

1. **Bun**: Install from [bun.sh](https://bun.sh/)
2. **QPDF**: Included in `bin/qpdf.exe` for PDF decryption

### Installation

```bash
# Install dependencies
bun install

# Start development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) and login with your iPusnas credentials.

## 🛠 Tech Stack

**Backend:**

- [Bun](https://bun.sh/) - Fast JavaScript runtime
- [Hono](https://hono.dev/) - Lightweight web framework
- QPDF - PDF decryption
- AdmZip - EPUB packaging

**Frontend:**

- [Alpine.js](https://alpinejs.dev/) - Reactive UI framework
- Catppuccin - Color palette
- Vanilla CSS - Styling

## 📁 Project Structure

```
.
├── src/
│   ├── backend/
│   │   ├── core/           # Auth, API, Cache
│   │   ├── services/       # Business Logic (Books, Downloads, Library)
│   │   └── utils/          # Helpers
│   ├── frontend/
│   │   ├── app.js          # Alpine.js Logic
│   │   ├── index.html      # UI Template
│   │   └── style.css       # Styling
│   ├── server.js           # Hono Server Entry
│   └── config.js           # Shared Config
├── books/                  # Downloaded books
├── temp/                   # Download cache
└── bin/                    # External binaries
```

## 🎯 Usage

### Borrowing Books

1. Go to **Search Books** tab
2. Search for a book by title or author
3. Click **Borrow** (shows "Already Borrowed" if you have it)
4. Book appears in **Borrowed Books** tab

### Downloading Books

1. In **Borrowed Books** tab, click **Download**
2. Watch real-time progress with speed indicator
3. Downloaded books appear in **My Library** tab
4. Click **Read Now** to open in browser

### Managing Library

- **Search**: Filter books by title
- **Sort**: By title or author
- **Sync**: Refresh borrowed books from server
- **Delete**: Remove downloaded books
- **Return**: Return books to iPusnas

## ⚙️ Configuration

Edit `src/config.js` to customize:

- Books directory path
- Temp cache location
- API endpoints

## � Features Comparison

| Feature        | V3 Light            | Previous     |
| -------------- | ------------------- | ------------ |
| UI Design      | ✅ Modern, compact  | Basic        |
| Download Speed | ✅ Real-time KB/s   | No indicator |
| Cover Images   | ✅ Remote fallback  | Local only   |
| Search Status  | ✅ Already borrowed | No detection |
| Theme          | ✅ Dark + Light     | Dark only    |
| Responsive     | ✅ Mobile optimized | Desktop only |
| Animations     | ✅ Subtle, smooth   | None         |

## 🐛 Known Limitations

- No book preview before borrowing
- No reading progress tracking
- No bulk operations
- **Search Metadata**: Search results show basic info (Title/Author). Detailed metadata (Publisher, Category, File Type) appears after borrowing/downloading.
- **Smart Actions**: "Download" button automatically becomes "**Read**" if the book is already in your library.

## 📝 Credits

Originally inspired by the iPusnas CLI tool. Rebuilt from scratch for modern web with enhanced UX and performance.

## ⚖️ License & Disclaimer

This tool is for **personal use only**. Please respect copyright laws and iPusnas terms of service. Only download books you have legitimately borrowed.

---
