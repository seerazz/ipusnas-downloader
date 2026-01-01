function app() {
  return {
    isLoggedIn: false,
    currentTab: "shelf", // 'shelf' | 'local' | 'discover'
    mobileMenuOpen: false,
    isLoading: false,
    async apiFetch(url, options = {}) {
      const res = await fetch(url, options);
      if (res.status === 401) {
        if (this.isLoggedIn) {
          this.isLoggedIn = false;
          this.showToast("Session expired or invalid token. Please login again.", "error");
        }
      }
      return res;
    },
    searchQuery: "",
    tempSize: "...",
    cacheStats: { size: "...", files: 0, items: 0 },
    theme: localStorage.getItem("theme") || "dark",

    // Data
    books: [],
    user: null, // { name, email }
    localBooks: [],
    downloads: {}, // Map of bookId -> { percentage, status }
    toasts: [],

    get stats() {
      const local = this.localBooks;
      const shelf = this.books;

      const formats = local.reduce((acc, b) => {
        const fmt = (b.format || b.localFormat || "unknown").toUpperCase();
        acc[fmt] = (acc[fmt] || 0) + 1;
        return acc;
      }, {});

      const categories = shelf.reduce((acc, b) => {
        const cat = b.category_name || b.catalog_info?.category_name || "Uncategorized";
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {});

      const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];

      return {
        shelf: shelf.length,
        local: local.length,
        pdf: formats.PDF || 0,
        epub: formats.EPUB || 0,
        topCategory: topCategory ? topCategory[0] : "None",
        topCategoryCount: topCategory ? topCategory[1] : 0,
      };
    },

    auth: {
      email: "",
      password: "",
      loading: false,
      error: "",
    },

    // Discover
    discoverBooks: [],
    discoverQuery: "",
    discoverLoading: false,
    discoverOffset: 0,
    discoverTotal: 0,
    hasSearched: false,
    searchTimeout: null,
    searchAbortController: null,

    async init() {
      // Theme Init
      document.documentElement.setAttribute("data-theme", this.theme);

      // Check auth on load
      this.isLoading = true;
      try {
        const res = await this.apiFetch("/api/books");
        const data = await res.json();
        if (data.success) {
          this.isLoggedIn = true;
          this.books = data.books;
          this.user = data.user;
          this.showToast(`Welcome back, ${this.user.name}!`, "success");
          this.fetchLocal();
          this.fetchTempSize();

          // Restore active downloads state
          try {
            const activeRes = await this.apiFetch("/api/downloads/active");
            const activeData = await activeRes.json();

            if (activeData.success) {
              const activeCount = activeData.active;
              if (activeCount > 0) {
                this.showToast(`${activeCount} background downloads active`, "success");
                this.startBackgroundPoller();
              }
            }
          } catch (e) {}
        }
      } catch (e) {
        // Not logged in, silent fail
      } finally {
        this.isLoading = false;

        // Use a more coordinated icon refresher
        const refreshIcons = () => this.$nextTick(() => lucide.createIcons());

        this.$watch("currentTab", refreshIcons);
        this.$watch("books", refreshIcons);
        this.$watch("localBooks", refreshIcons);
        this.$watch("discoverBooks", refreshIcons);
        this.$watch("theme", refreshIcons);

        refreshIcons();
      }
    },
    async login() {
      this.auth.loading = true;
      this.auth.error = "";
      try {
        const res = await this.apiFetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: this.auth.email, password: this.auth.password }),
        });
        const data = await res.json();
        if (data.success) {
          this.user = data.user; // Update user state!
          if (this.isLoggedIn) {
            this.showToast("Already logged in with an active session.", "success");
          } else {
            this.isLoggedIn = true;
            this.showToast(`Welcome ${this.user.name}!`, "success");
          }
          this.fetchData();
        } else {
          const msg = typeof data.message === "object" ? JSON.stringify(data.message) : data.message;
          this.showToast(msg, "error");
        }
      } catch (e) {
        console.error(e);
        this.showToast(`Error: ${e.message}`, "error");
      } finally {
        this.auth.loading = false;
      }
    },

    async logout() {
      if (!confirm("Logout?")) return;
      try {
        await this.apiFetch("/api/logout", { method: "POST" });
      } catch (e) {}

      // Reset state instead of reload
      this.isLoggedIn = false;
      this.user = null;
      this.books = [];
      this.localBooks = [];
      this.currentTab = "shelf";
      this.toasts = [];
      this.showToast("Logged out successfully", "success");
    },

    async clearTemp() {
      if (!confirm("Clear temporary files? This will cancel pending downloads.")) return;
      try {
        const res = await this.apiFetch("/api/clear-temp", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          this.showToast(`Cleared ${data.count} temporary files`, "success");
          this.fetchTempSize();
        } else {
          this.showToast(data.message, "error");
        }
      } catch {
        this.showToast("Failed to clear temp", "error");
      }
    },

    toggleTheme() {
      this.theme = this.theme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", this.theme);
      localStorage.setItem("theme", this.theme);
    },
    async fetchTempSize() {
      try {
        const res = await this.apiFetch("/api/temp-size");
        const data = await res.json();
        if (data.success) {
          this.tempSize = data.size;
          this.cacheStats = {
            size: data.size,
            files: data.files,
            items: data.cacheItems,
          };
        }
      } catch {}
    },

    async fetchData(silent = false) {
      if (!silent) this.isLoading = true;
      try {
        const [res1, res2] = await Promise.all([this.apiFetch("/api/books"), this.apiFetch("/api/library")]);
        const d1 = await res1.json();
        const d2 = await res2.json();

        if (d1.success) {
          this.books = d1.books;
          this.user = d1.user;
        }
        if (d2.success) this.localBooks = d2.books;

        // Ensure cache stats are synced
        await this.fetchTempSize();
        this.$nextTick(() => lucide.createIcons());
      } finally {
        if (!silent) this.isLoading = false;
      }
    },

    async fetchLocal() {
      const res = await this.apiFetch("/api/library");
      const data = await res.json();
      if (data.success) {
        this.localBooks = data.books;
      }
    },

    stopBackgroundPoller() {
      if (this.poller) {
        clearInterval(this.poller);
        this.poller = null;
      }
    },

    async startBackgroundPoller() {
      if (this.poller) return;
      this.poller = setInterval(async () => {
        try {
          // Check active downloads status
          const res = await this.apiFetch("/api/downloads/active");
          const data = await res.json();
          if (data.success) {
            const activeCount = data.active;

            // If we have active downloads, or if we just finished them
            if (activeCount > 0 || Object.keys(this.downloads).length > 0) {
              // Update local progress
              if (data.jobs) {
                for (const job of data.jobs) {
                  this.downloads[job.bookId] = {
                    percentage: job.percentage,
                    status: job.status,
                  };
                }
              }

              // If downloads finished (0 active, but we had some locally)
              if (activeCount === 0 && Object.keys(this.downloads).length > 0) {
                this.fetchData(true); // Silent update on complete
                this.stopBackgroundPoller();
              }
            }
          }
        } catch (e) {
          console.error(e);
          this.stopBackgroundPoller();
        }
      }, 2000);
    },

    handleDiscoverInput() {
      if (!this.discoverQuery) {
        this.hasSearched = false;
        this.discoverBooks = [];
        clearTimeout(this.searchTimeout);
        return;
      }

      // Debounce logic
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.searchCatalog();
      }, 500); // 500ms debounce
    },

    setTab(tab) {
      this.currentTab = tab;
      this.mobileMenuOpen = false;
      this.searchQuery = "";
      if (tab === "local") this.fetchLocal();
      if (tab === "discover") {
        this.discoverQuery = "";
        this.discoverBooks = [];
        this.discoverOffset = 0;
        this.discoverTotal = 0;
        this.hasSearched = false;
      }
      this.$nextTick(() => lucide.createIcons());
    },

    async searchCatalog(isMore = false) {
      if (!this.discoverQuery) return;
      if (isMore && (this.discoverLoading || this.discoverBooks.length >= this.discoverTotal)) return;

      // Abort previous search if any
      if (this.searchAbortController) {
        this.searchAbortController.abort();
      }
      this.searchAbortController = new AbortController();

      this.discoverLoading = true;
      if (!isMore) {
        this.discoverOffset = 0;
        this.hasSearched = true;
      } else {
        this.discoverOffset += 25;
      }

      try {
        const res = await this.apiFetch(
          `/api/discover/search?q=${encodeURIComponent(this.discoverQuery)}&offset=${this.discoverOffset}`,
          { signal: this.searchAbortController.signal }
        );
        const data = await res.json();
        if (data.success) {
          const newBooks = (data.data || []).map((b) => ({ ...b, borrowing: false }));
          this.discoverBooks = isMore ? [...this.discoverBooks, ...newBooks] : newBooks;
          this.discoverTotal = data.meta?.total || this.discoverBooks.length;
        }
      } catch (e) {
        if (e.name === "AbortError") return;
        console.error("Search error:", e);
        this.showToast(isMore ? "Failed to load more results" : "Catalog search failed", "error");
      } finally {
        if (!isMore || (this.searchAbortController && !this.searchAbortController.signal.aborted)) {
          this.discoverLoading = false;
        }
        // Refresh stats as search results are cached
        this.fetchTempSize();
      }
    },

    async loadMoreDiscover() {
      return this.searchCatalog(true);
    },

    async borrowCatalogBook(bookId) {
      const book = this.discoverBooks.find((b) => b.id === bookId);
      if (book) book.borrowing = true;

      try {
        const res = await this.apiFetch("/api/discover/borrow", {
          method: "POST",
          body: JSON.stringify({ bookId }),
        });
        const data = await res.json();
        if (data.success && data.status !== 400) {
          this.showToast("Book borrowed successfully!", "success");
          this.fetchData(true); // Silent update
        } else {
          this.showToast(data.message || "Borrow failed", "error");
        }
      } catch (e) {
        this.showToast("Borrow request failed", "error");
      } finally {
        if (book) book.borrowing = false;
      }
    },

    async returnBook(borrowBookId) {
      if (!confirm("Return this book to the library? it will be removed from your shelf.")) return;

      try {
        const res = await this.apiFetch("/api/discover/return", {
          method: "POST",
          body: JSON.stringify({ borrowBookId }),
        });
        const data = await res.json();
        if (data.success) {
          this.showToast("Book returned successfully!", "success");
          this.fetchData(true); // Silent update
        } else {
          this.showToast(data.message || "Return failed", "error");
        }
      } catch (e) {
        this.showToast("Return request failed", "error");
      }
    },

    get filteredShelf() {
      let list = [...this.books];
      if (this.searchQuery) {
        const lower = this.searchQuery.toLowerCase();
        list = list.filter(
          (b) =>
            (b.book_title || "").toLowerCase().includes(lower) || (b.book_author || "").toLowerCase().includes(lower)
        );
      }
      return list;
    },

    get filteredLocal() {
      let list = [...this.localBooks];
      if (this.searchQuery) {
        const lower = this.searchQuery.toLowerCase();
        list = list.filter(
          (b) => (b.title || "").toLowerCase().includes(lower) || (b.book_author || "").toLowerCase().includes(lower)
        );
      }
      return list;
    },

    async startDownload(bookId) {
      this.downloads[bookId] = { percentage: 0, status: "Queued..." };
      this.showToast("Download added to queue", "success");
      this.fetchTempSize();

      try {
        const response = await this.apiFetch("/api/download/" + bookId, { method: "POST" });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = JSON.parse(line.substring(6));

              if (data.type === "progress") {
                this.downloads[bookId] = { percentage: data.percentage, status: data.status };
              } else if (data.type === "complete") {
                delete this.downloads[bookId];
                this.showToast("Download Complete!", "success");
                this.fetchData(true); // Silent update
                this.fetchTempSize();
                this.$nextTick(() => lucide.createIcons());
              } else if (data.type === "error") {
                const wasCanceled = this.downloads[bookId]?.manualCancel;
                delete this.downloads[bookId];
                if (!wasCanceled) {
                  this.showToast(data.message, "error");
                }
                this.fetchTempSize();
              }
            }
          }
        }
      } catch (e) {
        const wasCanceled = this.downloads[bookId]?.manualCancel;
        delete this.downloads[bookId];
        if (wasCanceled) {
          this.showToast("Download cancelled", "success");
        } else {
          this.showToast("Download failed", "error");
        }
        this.fetchTempSize();
      }
    },

    openFile(safeName, filename) {
      window.open(`/api/files/${safeName}/${filename}`, "_blank");
    },

    async openFolder(safeName) {
      await this.apiFetch(`/api/open-folder/${safeName}`, { method: "POST" });
    },

    async deleteBook(safeName) {
      if (!confirm("Delete this book?")) return;
      try {
        const res = await this.apiFetch(`/api/delete/${safeName}`, { method: "POST" });
        if (res.ok) {
          this.showToast("Book deleted", "success");
          this.fetchData(true); // Silent update
        }
      } catch {
        this.showToast("Delete failed", "error");
      }
    },

    showToast(message, type = "success") {
      const id = Date.now();
      let msg = message;
      if (typeof message === "object") {
        msg = message.message || message.error || JSON.stringify(message);
      }
      this.toasts.push({ id, message: String(msg), type });
      this.$nextTick(() => lucide.createIcons());
      setTimeout(() => {
        this.toasts = this.toasts.filter((t) => t.id !== id);
      }, 3000);
    },

    async abortDownload(bookId) {
      if (!confirm("Are you sure you want to stop this download?")) return;

      // Set manual flag immediately
      if (this.downloads[bookId]) {
        this.downloads[bookId].status = "Canceling...";
        this.downloads[bookId].manualCancel = true;
      }

      try {
        // The startDownload loop will handle the cancellation UI.
        const res = await this.apiFetch("/api/downloads/cancel/" + bookId, { method: "POST" });

        // If 404, backend doesn't know about it, so force clear local state
        if (res.status === 404) {
          delete this.downloads[bookId];
          this.fetchTempSize();
        }
      } catch (e) {
        // If cancellation fails, force clear if manual
        delete this.downloads[bookId];
        console.error("Cancel failed or force cleared", e);
      }
    },
  };
}
