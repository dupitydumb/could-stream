// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM CLOUD SOURCE PLUGIN FOR AUDION
// ═══════════════════════════════════════════════════════════════════════════
//
// Lets users connect ANY cloud storage / personal server / media library
// as a streamable source inside Audion — without writing code.
//
// Supported source types the user can configure:
//   • Direct HTTP/HTTPS file server (nginx, caddy, Apache autoindex)
//   • WebDAV (Nextcloud, ownCloud, any WebDAV server)
//   • Amazon S3 / R2 / MinIO / any S3-compatible bucket (pre-signed URLs)
//   • Jellyfin / Emby (REST API)
//   • Navidrome / Subsonic (REST API)
//   • Generic JSON API (user defines the URL patterns)
//   • Plain URL list (user pastes a list of audio URLs)
//
// HOW IT WORKS:
//   1. User creates a "Source" via the settings panel (name, type, URL, auth)
//   2. Each source gets a unique source_type slug (e.g. "custom-my-nas")
//   3. A stream resolver is registered for that slug
//   4. User browses / imports tracks which are saved as external tracks
//   5. At playback time, the resolver fetches a fresh stream URL
//
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  "use strict";

  // ── Icons ────────────────────────────────────────────────────────────────
  const I = {
    cloud:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,
    plus:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    edit:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    trash:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
    play:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    heart:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    heartO:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    search:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    back:     `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`,
    check:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`,
    link:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    import:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    warning:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  };

  // ── Source type definitions ───────────────────────────────────────────────
  // Each type describes what config fields are needed and how to build URLs
  const SOURCE_TYPES = {
    http_index: {
      label: "HTTP File Server",
      description: "Nginx/Apache/Caddy directory listing. Scans HTML links to find audio files.",
      fields: [
        { key: "baseUrl",   label: "Server URL",         placeholder: "https://music.myserver.com/",  type: "text",     help: "URL of the directory index page" },
        { key: "username",  label: "Username (optional)", placeholder: "admin",                        type: "text",     help: "For HTTP Basic Auth" },
        { key: "password",  label: "Password (optional)", placeholder: "",                             type: "password", help: "For HTTP Basic Auth" },
      ],
      // externalId = full URL to the audio file
      buildStreamUrl: (cfg, externalId) => {
        if (cfg.username && cfg.password) {
          const u = new URL(externalId);
          u.username = cfg.username;
          u.password = cfg.password;
          return u.toString();
        }
        return externalId;
      },
      buildHeaders: (cfg) => {
        if (cfg.username && cfg.password) {
          return { "Authorization": "Basic " + btoa(cfg.username + ":" + cfg.password) };
        }
        return {};
      }
    },

    webdav: {
      label: "WebDAV / Nextcloud / ownCloud",
      description: "Any WebDAV server. Works with Nextcloud, ownCloud, Seafile, and more.",
      fields: [
        { key: "baseUrl",  label: "WebDAV URL",  placeholder: "https://cloud.myserver.com/remote.php/dav/files/username/Music/", type: "text",     help: "Full WebDAV path to your music folder" },
        { key: "username", label: "Username",     placeholder: "yourname",                                                          type: "text",     help: "" },
        { key: "password", label: "Password / App Token", placeholder: "",                                                          type: "password", help: "Use an App Password for better security" },
      ],
      buildStreamUrl: (cfg, externalId) => {
        // externalId is the relative path from baseUrl
        const base = cfg.baseUrl.replace(/\/$/, "");
        const u = new URL(`${base}/${externalId}`);
        u.username = cfg.username || "";
        u.password = cfg.password || "";
        return u.toString();
      },
      buildHeaders: (cfg) => ({
        "Authorization": "Basic " + btoa((cfg.username || "") + ":" + (cfg.password || ""))
      })
    },

    jellyfin: {
      label: "Jellyfin / Emby",
      description: "Stream from a Jellyfin or Emby media server using their REST API.",
      fields: [
        { key: "baseUrl", label: "Server URL",  placeholder: "https://jellyfin.myserver.com",  type: "text",     help: "Your Jellyfin/Emby server address" },
        { key: "apiKey",  label: "API Key",     placeholder: "your-api-key",                   type: "password", help: "Dashboard → API Keys → + (Jellyfin) or Admin → API Keys (Emby)" },
        { key: "userId",  label: "User ID",     placeholder: "abc123...",                       type: "text",     help: "Found in Admin → Users → click your user" },
      ],
      buildStreamUrl: (cfg, externalId) => {
        const base = cfg.baseUrl.replace(/\/$/, "");
        // externalId = Jellyfin Item ID
        return `${base}/Audio/${externalId}/universal?api_key=${cfg.apiKey}&UserId=${cfg.userId}&AudioCodec=mp3&TranscodingProtocol=http`;
      },
      buildHeaders: () => ({})
    },

    navidrome: {
      label: "Navidrome / Subsonic",
      description: "Any Subsonic-compatible server: Navidrome, Airsonic, Funkwhale, etc.",
      fields: [
        { key: "baseUrl",  label: "Server URL",  placeholder: "https://music.myserver.com",  type: "text",     help: "Your Navidrome/Subsonic server" },
        { key: "username", label: "Username",    placeholder: "admin",                        type: "text",     help: "" },
        { key: "password", label: "Password",    placeholder: "",                             type: "password", help: "" },
        { key: "salt",     label: "Salt (auto)", placeholder: "auto-generated",               type: "text",     help: "Leave blank — generated automatically for token auth" },
      ],
      buildStreamUrl: (cfg, externalId) => {
        const base = cfg.baseUrl.replace(/\/$/, "");
        const salt = cfg._salt || "audion";
        // Subsonic token auth: md5(password + salt)
        // We use a simplified approach — password auth is also accepted by most servers
        const params = new URLSearchParams({
          u: cfg.username,
          p: cfg.password,   // plain prefix is "enc:" for encoding, or just pass it
          v: "1.16.1",
          c: "audion",
          id: externalId,
          format: "mp3"
        });
        return `${base}/rest/stream?${params.toString()}`;
      },
      buildHeaders: () => ({})
    },

    s3: {
      label: "S3 / R2 / MinIO (Pre-signed URLs)",
      description: "Amazon S3, Cloudflare R2, MinIO, or any S3-compatible storage. You provide a pre-signed base URL and the plugin appends file keys.",
      fields: [
        { key: "baseUrl",   label: "Bucket Public/Pre-signed Base URL", placeholder: "https://my-bucket.s3.amazonaws.com/", type: "text", help: "Your bucket's public URL or CDN URL. Files will be appended to this base." },
        { key: "authParam", label: "Auth Query Param (optional)",        placeholder: "?X-Amz-Signature=abc&...",            type: "text", help: "If your bucket requires signed URLs, paste the signature params here. They'll be appended to each file URL." },
      ],
      buildStreamUrl: (cfg, externalId) => {
        const base = cfg.baseUrl.replace(/\/$/, "");
        const auth = cfg.authParam ? (cfg.authParam.startsWith("?") ? cfg.authParam : "?" + cfg.authParam) : "";
        return `${base}/${externalId}${auth}`;
      },
      buildHeaders: () => ({})
    },

    json_api: {
      label: "Custom JSON API",
      description: "Your own API server. You define how to fetch track lists and stream URLs using URL templates.",
      fields: [
        { key: "baseUrl",        label: "API Base URL",                    placeholder: "https://api.myserver.com/v1",    type: "text",     help: "Base URL for your API" },
        { key: "apiKey",         label: "API Key / Bearer Token (opt.)",  placeholder: "Bearer abc123...",                type: "password", help: "Sent as Authorization header" },
        { key: "tracksEndpoint", label: "Tracks List Endpoint",            placeholder: "/tracks",                         type: "text",     help: "Path to fetch track list. Should return [{id, title, artist, album, duration, cover_url}]" },
        { key: "streamEndpoint", label: "Stream URL Template",             placeholder: "/stream/{id}",                    type: "text",     help: "Use {id} as placeholder for track ID. Should return a redirect or audio file." },
      ],
      buildStreamUrl: (cfg, externalId) => {
        const base = cfg.baseUrl.replace(/\/$/, "");
        const endpoint = (cfg.streamEndpoint || "/stream/{id}").replace("{id}", encodeURIComponent(externalId));
        return `${base}${endpoint}`;
      },
      buildHeaders: (cfg) => {
        if (cfg.apiKey) return { "Authorization": cfg.apiKey };
        return {};
      }
    },

    url_list: {
      label: "URL List (paste links)",
      description: "Paste a list of direct audio URLs, one per line. Great for quick imports from any source.",
      fields: [
        { key: "urlList", label: "Audio URLs (one per line)", placeholder: "https://example.com/song1.mp3\nhttps://example.com/song2.flac", type: "textarea", help: "Direct links to audio files. Supports mp3, flac, ogg, m4a, wav, etc." },
        { key: "authHeader", label: "Auth Header (optional)", placeholder: "Bearer mytoken", type: "text", help: "Sent as Authorization header if your URLs require auth" },
      ],
      buildStreamUrl: (cfg, externalId) => externalId,  // externalId IS the URL
      buildHeaders: (cfg) => {
        if (cfg.authHeader) return { "Authorization": cfg.authHeader };
        return {};
      }
    }
  };

  const AUDIO_EXTENSIONS = /\.(mp3|flac|ogg|m4a|aac|wav|opus|wma|aiff|alac)(\?.*)?$/i;

  // ── Main plugin object ───────────────────────────────────────────────────
  const CustomCloudSource = {
    name: "Custom Cloud Source",
    api: null,

    // sources = array of { id, name, type, config, slug }
    // slug is the source_type used in Audion's library, e.g. "custom-my-nas"
    sources: [],

    // UI state
    isOpen: false,
    panel: null,
    currentView: "home",        // "home" | "add-source" | "edit-source" | "browse"
    editingSource: null,        // source being edited
    browsingSource: null,       // source being browsed
    browseItems: [],            // current browse results
    libraryTrackIds: new Set(), // external_ids already in library

    // ── Lifecycle ──────────────────────────────────────────────────────────
    async init(api) {
      console.log("[CustomCloud] Initializing...");
      this.api = api;

      await this.loadSources();
      this.registerAllResolvers();

      this.injectStyles();
      this.buildPanel();
      this.createPlayerBarButton();

      await this.refreshLibraryIndex();
      console.log(`[CustomCloud] Ready — ${this.sources.length} source(s) loaded`);
    },

    start() {},
    stop() { this.close(); },
    destroy() {
      this.close();
      document.getElementById("cc-styles")?.remove();
      document.getElementById("cc-panel")?.remove();
      document.getElementById("cc-overlay")?.remove();
      document.getElementById("cc-playerbar-btn")?.remove();
    },

    // ── Source persistence ─────────────────────────────────────────────────
    async loadSources() {
      if (!this.api?.storage?.get) return;
      try {
        const raw = await this.api.storage.get("cc-sources");
        if (raw) this.sources = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch (e) {
        console.warn("[CustomCloud] Could not load sources:", e);
      }
    },

    async saveSources() {
      if (!this.api?.storage?.set) return;
      try {
        await this.api.storage.set("cc-sources", JSON.stringify(this.sources));
      } catch (e) {
        console.error("[CustomCloud] Could not save sources:", e);
      }
    },

    // ── Stream resolvers ───────────────────────────────────────────────────
    // Each source gets its own resolver registered under its unique slug.
    // The resolver is called by Audion at playback time.
    registerAllResolvers() {
      for (const src of this.sources) {
        this.registerResolver(src);
      }
    },

    registerResolver(src) {
      if (!this.api?.stream?.registerResolver) return;
      const typeDef = SOURCE_TYPES[src.type];
      if (!typeDef) return;

      this.api.stream.registerResolver(src.slug, async (externalId, options) => {
        try {
          const url = typeDef.buildStreamUrl(src.config, externalId);
          console.log(`[CustomCloud][${src.name}] Resolving stream:`, url);
          return url;
        } catch (err) {
          console.error(`[CustomCloud][${src.name}] Resolve error:`, err);
          return null;
        }
      });

      console.log(`[CustomCloud] Resolver registered for source_type="${src.slug}"`);
    },

    // ── Library index ──────────────────────────────────────────────────────
    async refreshLibraryIndex() {
      if (!this.api?.library?.getTracks) return;
      try {
        const tracks = (await this.api.library.getTracks()) || [];
        this.libraryTrackIds = new Set(
          tracks
            .filter(t => t?.source_type?.startsWith("custom-"))
            .map(t => t.external_id)
        );
      } catch (e) {
        console.warn("[CustomCloud] Could not index library:", e);
      }
    },

    // ── Save a track to Audion library ─────────────────────────────────────
    async saveTrack(src, track) {
      if (!this.api?.library?.addExternalTrack) return false;
      if (this.libraryTrackIds.has(track.external_id)) return false;
      try {
        await this.api.library.addExternalTrack({
          title:       track.title   || "Unknown Track",
          artist:      track.artist  || "Unknown Artist",
          album:       track.album   || "",
          track_number: track.trackNum || 0,
          duration:    track.duration || 0,
          cover_url:   track.cover_url || "",
          source_type: src.slug,           // e.g. "custom-my-nas"
          external_id: track.external_id   // passed to resolver at playback
        });
        this.libraryTrackIds.add(track.external_id);
        return true;
      } catch (err) {
        console.error("[CustomCloud] Save track error:", err);
        return false;
      }
    },

    // ── Play a track immediately ───────────────────────────────────────────
    async playTrack(src, track) {
      if (!this.api?.player?.setTrack) return;
      try {
        await this.api.player.setTrack({
          title:       track.title   || "Unknown Track",
          artist:      track.artist  || "Unknown Artist",
          album:       track.album   || "",
          duration:    track.duration || 0,
          cover_url:   track.cover_url || "",
          source_type: src.slug,
          external_id: track.external_id
        });
      } catch (err) {
        console.error("[CustomCloud] Play error:", err);
        this.toast("Playback failed", true);
      }
    },

    // ── Browse / scan a source ─────────────────────────────────────────────
    // Returns array of { title, artist, album, duration, cover_url, external_id }
    // onProgress(state) = { folders, tracks, currentFolder, elapsed, perFolder }
    async scanSource(src, onProgress) {
      const typeDef = SOURCE_TYPES[src.type];
      if (!typeDef) throw new Error("Unknown source type");

      switch (src.type) {
        case "url_list":    return this.scanUrlList(src);
        case "http_index":  return this.scanHttpIndex(src, onProgress);
        case "webdav":      return this.scanWebDav(src, onProgress);
        case "jellyfin":    return this.scanJellyfin(src);
        case "navidrome":   return this.scanNavidrome(src);
        case "s3":          return this.scanS3(src);
        case "json_api":    return this.scanJsonApi(src);
        default:            throw new Error("Scan not supported for this type");
      }
    },

    async apiFetch(url, headers = {}) {
      const res = this.api.fetch
        ? await this.api.fetch(url, { headers })
        : await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res;
    },

    // URL List: parse the textarea content directly
    scanUrlList(src) {
      const lines = (src.config.urlList || "").split("\n").map(l => l.trim()).filter(Boolean);
      return lines.map(url => {
        const fileName = decodeURIComponent(url.split("/").pop().split("?")[0]);
        const name = fileName.replace(/\.[^.]+$/, "");
        return {
          title:       name,
          artist:      "Unknown Artist",
          album:       src.name,
          duration:    0,
          cover_url:   "",
          external_id: url   // the URL itself is the externalId
        };
      });
    },

    // ── Folder/filename metadata parser ───────────────────────────────────
    // Handles patterns like:
    //   "Artist - Album (Year) [Format] {Catalog}"  → artist + album + year
    //   "Artist - Album [Year]"                      → artist + album + year
    //   "Artist/Album/01 - Track.flac"               → track number + title
    //   "Artist/Album (Year)/01. Title.flac"         → full hierarchy
    //   "01 Title.mp3", "01 - Title.mp3"             → track num + title
    //   "Disc1/01-Title.flac"                        → disc-aware track num
    parseFolderMeta(fullUrl, baseUrl, fallbackAlbum = "") {
      const safeDecode = (s) => { try { return decodeURIComponent(s); } catch (_) { return s; } };
      // Get the relative path from base
      let rel = safeDecode(fullUrl.replace(baseUrl.replace(/\/$/, ""), "")).replace(/^\//, "");
      const parts = rel.split("/");
      const fileNameRaw = parts[parts.length - 1];
      const fileName = fileNameRaw.replace(/\.[^.]+$/, ""); // strip extension
      const folderParts = parts.slice(0, -1); // directories only

      // ── Parse folder path for artist / album / year ──────────────────────
      // Pattern: "Artist Name - Album Title (Year) [FORMAT] {Catalog}"
      // or just: "Artist - Album"
      // or:      "Artist/Album (Year)"
      // or:      "Album (Year) [FORMAT]"
      const folderAlbumRe = /^(.+?)\s*[-–]\s*(.+?)(?:\s*[\(\[]\s*(\d{4})\s*[\)\]])?(?:\s*[\[\(][^\]\)]*[\]\)])*\s*$/;
      const yearRe = /[\(\[]\s*(\d{4})\s*[\)\]]/;
      const formatRe = /[\[\(](FLAC|MP3|AAC|OGG|OPUS|WAV|AIFF|ALAC|DSD|MQA|320|256|128|Hi-Res|Lossless)[^\]\)]*[\]\)]/i;

      let artist = "Unknown Artist";
      let album = "";
      let year = "";

      // Walk folder parts from outermost in, looking for artist/album info
      for (let i = 0; i < folderParts.length; i++) {
        const part = folderParts[i];
        const m = part.match(folderAlbumRe);
        if (m) {
          // "Artist - Album (Year) [FLAC]" style
          const candidate_artist = m[1].trim();
          const candidate_album  = m[2].trim().replace(/\s*[\[\(][^\]\)]*[\]\)]\s*/g, "").trim();
          const candidate_year   = m[3] || (part.match(yearRe) || [])[1] || "";
          if (i === 0 && folderParts.length === 1) {
            // Single folder — treat as "Artist - Album"
            artist = candidate_artist;
            album  = candidate_album;
          } else if (i === 0) {
            // First folder is likely artist name
            artist = candidate_artist;
            album  = candidate_album || folderParts[1] || "";
          } else {
            // Deeper folder is likely album
            album = candidate_album;
          }
          if (candidate_year) year = candidate_year;
        } else {
          // No dash separator — folder is either artist (top) or album (deeper)
          const cleanPart = part.replace(/\s*[\[\(][^\]\)]*[\]\)]\s*/g, "").trim();
          const y = (part.match(yearRe) || [])[1];
          if (y) year = y;
          if (i === 0 && folderParts.length > 1) {
            artist = cleanPart || artist;
          } else if (i > 0 || folderParts.length === 1) {
            album = cleanPart || album;
          }
        }
      }

      // Fallback: if no album found, use deepest folder name (cleaned)
      if (!album && folderParts.length > 0) {
        const deepest = folderParts[folderParts.length - 1];
        album = deepest.replace(/\s*[\[\(][^\]\)]*[\]\)]\s*/g, "").replace(/\s*[-–]\s*.+$/, "").trim();
        if (!year) year = (deepest.match(yearRe) || [])[1] || "";
      }

      // ── Parse filename for track number + title ──────────────────────────
      // Patterns: "01 - Title", "01. Title", "1-Title", "01 Title", "D1T01 Title"
      // Also handle: "Artist - Title" when no folder structure
      let trackNum = 0;
      let title = fileName;

      // Disc-aware: D1T01, 1-01, etc.
      const discTrackRe = /^(?:d(?:isc|isk?)?\s*\d+\s*[_-]?\s*)?t?r?a?c?k?\s*(\d+)[_.\s-]+(.+)$/i;
      // Simple: "01 - Title" or "01. Title" or "01 Title"
      const trackRe = /^(\d{1,3})[_.\s-]+(.+)$/;

      const dtm = fileName.match(discTrackRe);
      const tm  = fileName.match(trackRe);

      if (dtm && dtm[2]) {
        trackNum = parseInt(dtm[1], 10);
        title = dtm[2].trim();
      } else if (tm && tm[2]) {
        trackNum = parseInt(tm[1], 10);
        title = tm[2].replace(/^[-_.\s]+/, "").trim();
      }

      // If title still contains "Artist - Title" with no folder artist, extract it
      if (artist === "Unknown Artist" && !folderParts.length) {
        const dashM = title.match(/^(.+?)\s+[-–]\s+(.+)$/);
        if (dashM) { artist = dashM[1].trim(); title = dashM[2].trim(); }
      }

      // Append year to album if we have it and it's not already there
      const albumWithYear = album && year && !album.includes(year)
        ? `${album} (${year})`
        : album;

      return {
        title:    title   || fileName || "Unknown Track",
        artist:   artist  || "Unknown Artist",
        album:    albumWithYear || fallbackAlbum || "",
        trackNum
      };
    },

    // HTTP Index: recursively crawl HTML directory listing for audio files
    async scanHttpIndex(src, onProgress) {
      const headers = SOURCE_TYPES.http_index.buildHeaders(src.config);
      const baseUrl = src.config.baseUrl.replace(/\/$/, "") + "/";

      const results = [];
      const visited = new Set();
      const startTime = Date.now();
      const folderTimes = []; // ms per folder, for ETA

      const emitProgress = (currentFolder) => {
        if (!onProgress) return;
        const elapsed = Date.now() - startTime;
        const avgPerFolder = folderTimes.length
          ? folderTimes.reduce((a, b) => a + b, 0) / folderTimes.length
          : 0;
        // pending = folders queued but not yet visited (approximation)
        const pending = Math.max(0, visited.size - folderTimes.length - 1);
        const eta = avgPerFolder > 0 ? Math.round((pending * avgPerFolder) / 1000) : null;
        onProgress({
          folders: folderTimes.length,
          tracks:  results.length,
          currentFolder,
          elapsed,
          eta
        });
      };

      const crawl = async (url) => {
        if (visited.has(url)) return;
        visited.add(url);

        const folderStart = Date.now();

        // Emit before fetch so UI shows current folder name
        const safeDecode = (s) => { try { return decodeURIComponent(s); } catch (_) { return s; } };
        const folderName = safeDecode(url.replace(baseUrl, "").replace(/\/$/, "").split("/").pop() || "/");
        emitProgress(folderName);

        let html;
        try {
          const res = await this.apiFetch(url, headers);
          html = await res.text();
        } catch (e) {
          console.warn("[CustomCloud] Could not fetch:", url, e.message);
          folderTimes.push(Date.now() - folderStart);
          return;
        }

        const audioLinks   = [];
        const folderLinks  = [];

        // Extract all hrefs — handle both href="..." and href='...'
        const re = /href=["']([^"'?#]*)["']/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
          const href = m[1].trim();
          if (!href || href === "/" || href === "../" || href === "./" || href.startsWith("?") || href.startsWith("#")) continue;

          // Build full URL safely
          let full;
          try {
            if (href.startsWith("http://") || href.startsWith("https://")) {
              full = href;
            } else if (href.startsWith("/")) {
              // Extract origin without new URL()
              const protoEnd = url.indexOf("//") + 2;
              const pathStart = url.indexOf("/", protoEnd);
              const origin = pathStart > 0 ? url.slice(0, pathStart) : url;
              full = origin + href;
            } else {
              full = url.replace(/\/$/, "") + "/" + href;
            }
          } catch (_) { continue; }

          // Normalize double slashes (keep protocol)
          full = full.replace(/([^:])\/\/+/g, "$1/");

          // Skip if it goes above our base
          if (!full.startsWith(baseUrl.replace(/\/$/, ""))) continue;

          if (AUDIO_EXTENSIONS.test(href)) {
            audioLinks.push(full);
          } else if (href.endsWith("/") || (!href.includes(".") && href !== "")) {
            // Likely a subdirectory
            if (!visited.has(full)) folderLinks.push(full);
          }
        }

        // Add audio files found at this level
        for (const audioUrl of audioLinks) {
          const meta = this.parseFolderMeta(audioUrl, baseUrl, src.name);
          results.push({
            title:       meta.title,
            artist:      meta.artist,
            album:       meta.album,
            trackNum:    meta.trackNum,
            duration:    0,
            cover_url:   "",
            external_id: audioUrl
          });
        }

        folderTimes.push(Date.now() - folderStart);
        emitProgress(folderName); // update track count after adding

        // Recurse into subdirectories (up to reasonable depth)
        const depth = (url.replace(baseUrl, "").match(/\//g) || []).length;
        if (depth < 8) {
          for (const folder of folderLinks) {
            await crawl(folder.endsWith("/") ? folder : folder + "/");
          }
        }
      };

      await crawl(baseUrl);

      // Sort by album, then track number, then title
      results.sort((a, b) => {
        const aAlb = (a.album || "").toLowerCase();
        const bAlb = (b.album || "").toLowerCase();
        if (aAlb !== bAlb) return aAlb.localeCompare(bAlb);
        if (a.trackNum !== b.trackNum) return (a.trackNum || 999) - (b.trackNum || 999);
        return (a.title || "").localeCompare(b.title || "");
      });

      return results;
    },

    // WebDAV: PROPFIND with Depth:infinity (falls back to recursive Depth:1)
    async scanWebDav(src) {
      const base = src.config.baseUrl.replace(/\/$/, "");
      const baseUrl = base + "/";
      const authHeaders = SOURCE_TYPES.webdav.buildHeaders(src.config);
      const propfindBody = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:getcontenttype/><d:resourcetype/></d:prop></d:propfind>`;

      const parseResponses = (xml, currentBase) => {
        const items = { audio: [], folders: [] };
        // Match <d:response> blocks
        const responseRe = /<(?:d:)?response[^>]*>([\s\S]*?)<\/(?:d:)?response>/gi;
        let rm;
        while ((rm = responseRe.exec(xml)) !== null) {
          const block = rm[1];
          const hrefM = block.match(/<(?:d:)?href[^>]*>([^<]+)<\/(?:d:)?href>/i);
          if (!hrefM) continue;
          const href = decodeURIComponent(hrefM[1].trim());

          // Determine if collection (folder) or file
          const isCollection = /<(?:d:)?collection\s*\/>/i.test(block);
          if (isCollection) {
            // Only recurse into subfolders (not the root itself)
            if (href !== new URL(base).pathname && href !== new URL(base).pathname + "/") {
              items.folders.push(href);
            }
          } else if (AUDIO_EXTENSIONS.test(href)) {
            items.audio.push(href);
          }
        }
        return items;
      };

      const hrefToFullUrl = (href) => {
        if (href.startsWith("http://") || href.startsWith("https://")) return href;
        const u = new URL(base);
        return `${u.origin}${href}`;
      };

      const results = [];
      const visited = new Set();

      const crawl = async (url, depth = "1") => {
        if (visited.has(url)) return;
        visited.add(url);

        let xml;
        try {
          const fetchFn = this.api?.fetch
            ? (u, opts) => this.api.fetch(u, opts)
            : (u, opts) => fetch(u, opts);
          const res = await fetchFn(url, {
            method: "PROPFIND",
            headers: { ...authHeaders, "Depth": depth, "Content-Type": "application/xml" },
            body: propfindBody
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          xml = await res.text();
        } catch (e) {
          console.warn("[CustomCloud] WebDAV PROPFIND failed:", url, e.message);
          // Fallback to HTTP index parsing for this path
          try {
            const fakeSrc = { ...src, config: { ...src.config, baseUrl: url } };
            const fallback = await this.scanHttpIndex(fakeSrc);
            results.push(...fallback);
          } catch {}
          return;
        }

        const { audio, folders } = parseResponses(xml, url);

        for (const href of audio) {
          const fullUrl = hrefToFullUrl(href);
          const meta = this.parseFolderMeta(fullUrl, baseUrl, src.name);
          // For WebDAV, externalId = relative path from baseUrl
          const rel = href.replace(new URL(base).pathname, "").replace(/^\//, "");
          results.push({
            title:    meta.title,
            artist:   meta.artist,
            album:    meta.album,
            trackNum: meta.trackNum,
            duration: 0, cover_url: "", external_id: rel
          });
        }

        // Recurse into subdirs
        for (const folderHref of folders) {
          const folderUrl = hrefToFullUrl(folderHref);
          const normalized = folderUrl.endsWith("/") ? folderUrl : folderUrl + "/";
          if (!visited.has(normalized)) await crawl(normalized, "1");
        }
      };

      // Try Depth:infinity first (faster, one request) — many servers support it
      let triedInfinity = false;
      try {
        const fetchFn = this.api?.fetch
          ? (u, opts) => this.api.fetch(u, opts)
          : (u, opts) => fetch(u, opts);
        const res = await fetchFn(baseUrl, {
          method: "PROPFIND",
          headers: { ...authHeaders, "Depth": "infinity", "Content-Type": "application/xml" },
          body: propfindBody
        });
        if (res.ok) {
          triedInfinity = true;
          const xml = await res.text();
          const { audio } = parseResponses(xml, baseUrl);
          if (audio.length > 0) {
            for (const href of audio) {
              const fullUrl = hrefToFullUrl(href);
              const meta = this.parseFolderMeta(fullUrl, baseUrl, src.name);
              const rel = href.replace(new URL(base).pathname, "").replace(/^\//, "");
              results.push({
                title: meta.title, artist: meta.artist, album: meta.album,
                trackNum: meta.trackNum, duration: 0, cover_url: "", external_id: rel
              });
            }
          }
        }
      } catch (_) {}

      // If infinity didn't work or returned nothing, fall back to recursive Depth:1
      if (!triedInfinity || results.length === 0) {
        await crawl(baseUrl, "1");
      }

      if (results.length === 0) {
        // Last resort: parse like an HTTP index page
        return this.scanHttpIndex(src);
      }

      // Sort by album → track number → title
      results.sort((a, b) => {
        const aAlb = (a.album || "").toLowerCase();
        const bAlb = (b.album || "").toLowerCase();
        if (aAlb !== bAlb) return aAlb.localeCompare(bAlb);
        if (a.trackNum !== b.trackNum) return (a.trackNum || 999) - (b.trackNum || 999);
        return (a.title || "").localeCompare(b.title || "");
      });

      return results;
    },

    // Jellyfin: use Items API
    async scanJellyfin(src) {
      const base = src.config.baseUrl.replace(/\/$/, "");
      const url = `${base}/Users/${src.config.userId}/Items?IncludeItemTypes=Audio&Recursive=true&Fields=ParentId,AlbumArtist,Album,RunTimeTicks&Limit=500&api_key=${src.config.apiKey}`;
      const res = await this.apiFetch(url);
      const data = await res.json();
      const items = data.Items || [];
      return items.map(item => ({
        title:       item.Name || "Unknown",
        artist:      (item.AlbumArtists?.[0]?.Name) || item.Artist || "Unknown Artist",
        album:       item.Album || "",
        duration:    item.RunTimeTicks ? Math.round(item.RunTimeTicks / 10_000_000) : 0,
        cover_url:   item.ImageTags?.Primary ? `${base}/Items/${item.Id}/Images/Primary?api_key=${src.config.apiKey}&width=300` : "",
        external_id: item.Id
      }));
    },

    // Navidrome / Subsonic: use getSongs API
    async scanNavidrome(src) {
      const base = src.config.baseUrl.replace(/\/$/, "");
      const params = new URLSearchParams({
        u: src.config.username,
        p: src.config.password,
        v: "1.16.1",
        c: "audion",
        f: "json"
      });
      const url = `${base}/rest/search3?query=&songCount=500&${params.toString()}`;
      const res = await this.apiFetch(url);
      const data = await res.json();
      const songs = data?.["subsonic-response"]?.searchResult3?.song || [];
      return songs.map(s => ({
        title:       s.title || "Unknown",
        artist:      s.artist || "Unknown Artist",
        album:       s.album || "",
        duration:    s.duration || 0,
        cover_url:   s.coverArt ? `${base}/rest/getCoverArt?id=${s.coverArt}&${params.toString()}&size=300` : "",
        external_id: s.id
      }));
    },

    // S3: cannot list bucket server-side without credentials. We parse the URL list field.
    scanS3(src) {
      // S3 public buckets expose XML listing at bucket root
      // For simplicity, treat like url_list (user should paste object keys or full URLs)
      if (src.config.urlList) return this.scanUrlList(src);
      return [];
    },

    // Generic JSON API
    async scanJsonApi(src) {
      const base = src.config.baseUrl.replace(/\/$/, "");
      const endpoint = src.config.tracksEndpoint || "/tracks";
      const headers = SOURCE_TYPES.json_api.buildHeaders(src.config);
      const res = await this.apiFetch(`${base}${endpoint}`, headers);
      const data = await res.json();
      const items = Array.isArray(data) ? data : (data.tracks || data.items || data.results || []);
      return items.map(item => ({
        title:       item.title || item.name || "Unknown",
        artist:      item.artist || item.artist_name || "Unknown Artist",
        album:       item.album || item.album_name || "",
        duration:    item.duration || 0,
        cover_url:   item.cover_url || item.artwork || item.image || "",
        external_id: String(item.id || item.key || item.url || "")
      }));
    },

    // ── Test a source connection ───────────────────────────────────────────
    async testSource(src) {
      try {
        const typeDef = SOURCE_TYPES[src.type];
        const headers = typeDef.buildHeaders ? typeDef.buildHeaders(src.config) : {};
        let testUrl = src.config.baseUrl || "";

        if (src.type === "jellyfin") {
          testUrl = `${src.config.baseUrl}/System/Info/Public`;
        } else if (src.type === "navidrome") {
          const p = new URLSearchParams({ u: src.config.username, p: src.config.password, v: "1.16.1", c: "audion", f: "json" });
          testUrl = `${src.config.baseUrl}/rest/ping?${p}`;
        } else if (src.type === "url_list") {
          // Parse first URL and try to HEAD it
          const first = (src.config.urlList || "").split("\n")[0]?.trim();
          if (!first) throw new Error("No URLs provided");
          testUrl = first;
        } else if (src.type === "json_api") {
          testUrl = `${src.config.baseUrl}${src.config.tracksEndpoint || "/tracks"}`;
        }

        if (!testUrl) throw new Error("No URL configured");

        const res = this.api.fetch
          ? await this.api.fetch(testUrl, { headers })
          : await fetch(testUrl, { headers, method: src.type === "url_list" ? "HEAD" : "GET" });

        return { ok: res.ok, status: res.status };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // ── Slug generator ─────────────────────────────────────────────────────
    makeSlug(name) {
      return "custom-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    },

    // ══════════════════════════════════════════════════════════════════════
    // UI
    // ══════════════════════════════════════════════════════════════════════

    injectStyles() {
      if (document.getElementById("cc-styles")) return;
      const s = document.createElement("style");
      s.id = "cc-styles";
      s.textContent = `
        /* ── Overlay & Panel ─────────────────────────────────────────── */
        #cc-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(5px);
          z-index: 10000;
          opacity: 0; visibility: hidden;
          transition: opacity 0.2s;
        }
        #cc-overlay.open { opacity: 1; visibility: visible; }

        #cc-panel {
          position: fixed;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%) scale(0.96);
          width: 720px; max-width: 95vw;
          max-height: 88vh;
          background: var(--bg-elevated, #181818);
          border: 1px solid var(--border-color, #333);
          border-radius: 14px;
          z-index: 10001;
          box-shadow: 0 24px 60px rgba(0,0,0,0.6);
          display: flex; flex-direction: column;
          overflow: hidden;
          opacity: 0; visibility: hidden;
          transition: all 0.22s cubic-bezier(0,0,0.2,1);
        }
        #cc-panel.open {
          opacity: 1; visibility: visible;
          transform: translate(-50%, -50%) scale(1);
        }

        /* ── Header ──────────────────────────────────────────────────── */
        .cc-header {
          display: flex; align-items: center; gap: 10px;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color, #2a2a2a);
          background: var(--bg-elevated, #181818);
          flex-shrink: 0;
        }
        .cc-header-title {
          font-size: 17px; font-weight: 700;
          color: var(--text-primary, #fff);
          flex: 1;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .cc-icon-btn {
          background: none; border: none;
          color: var(--text-secondary, #aaa);
          cursor: pointer; padding: 7px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s, color 0.15s;
          flex-shrink: 0;
        }
        .cc-icon-btn:hover {
          background: var(--bg-highlight, #2a2a2a);
          color: var(--text-primary, #fff);
        }

        /* ── Body ────────────────────────────────────────────────────── */
        .cc-body {
          flex: 1; overflow-y: auto;
          background: var(--bg-base, #111);
          overscroll-behavior-y: contain;
        }
        .cc-body::-webkit-scrollbar { width: 6px; }
        .cc-body::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }

        /* ── Home view ───────────────────────────────────────────────── */
        .cc-home-wrap { padding: 20px; }
        .cc-section-head {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 14px;
        }
        .cc-section-label {
          font-size: 11px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 1px;
          color: var(--text-secondary, #777);
        }
        .cc-btn-primary {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px;
          background: var(--accent-primary, #1a62b9);
          color: #fff; border: none;
          border-radius: 20px;
          font-size: 13px; font-weight: 600;
          cursor: pointer; transition: filter 0.15s, transform 0.1s;
        }
        .cc-btn-primary:hover { filter: brightness(1.15); transform: scale(1.03); }
        .cc-btn-secondary {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px;
          background: transparent;
          color: var(--text-secondary, #aaa);
          border: 1px solid var(--border-color, #333);
          border-radius: 20px;
          font-size: 12px; font-weight: 600;
          cursor: pointer; transition: border-color 0.15s, color 0.15s;
        }
        .cc-btn-secondary:hover {
          border-color: var(--accent-primary, #1a62b9);
          color: var(--text-primary, #fff);
        }
        .cc-btn-danger {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px;
          background: transparent;
          color: #e74c3c; border: 1px solid #e74c3c;
          border-radius: 20px; font-size: 12px; font-weight: 600;
          cursor: pointer; transition: background 0.15s;
        }
        .cc-btn-danger:hover { background: rgba(231,76,60,0.1); }

        /* Source cards */
        .cc-source-list { display: flex; flex-direction: column; gap: 10px; }
        .cc-source-card {
          background: var(--bg-elevated, #181818);
          border: 1px solid var(--border-color, #2a2a2a);
          border-radius: 10px;
          padding: 14px 16px;
          display: flex; align-items: center; gap: 14px;
          transition: border-color 0.15s;
        }
        .cc-source-card:hover { border-color: var(--bg-highlight, #444); }
        .cc-source-icon {
          width: 42px; height: 42px;
          border-radius: 10px;
          background: var(--bg-surface, #222);
          display: flex; align-items: center; justify-content: center;
          color: var(--accent-primary, #1a62b9);
          flex-shrink: 0;
          font-size: 20px;
        }
        .cc-source-info { flex: 1; overflow: hidden; }
        .cc-source-name {
          font-size: 15px; font-weight: 600;
          color: var(--text-primary, #fff);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .cc-source-meta {
          font-size: 12px; color: var(--text-secondary, #888);
          margin-top: 2px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .cc-source-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .cc-source-type-badge {
          font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.5px;
          padding: 3px 8px; border-radius: 12px;
          background: var(--bg-surface, #222);
          color: var(--text-secondary, #888);
        }

        /* Empty state */
        .cc-empty {
          text-align: center; padding: 60px 20px;
          color: var(--text-subdued, #555);
        }
        .cc-empty-icon { font-size: 48px; margin-bottom: 16px; }
        .cc-empty-title { font-size: 16px; font-weight: 600; color: var(--text-secondary, #777); margin-bottom: 8px; }
        .cc-empty-desc { font-size: 13px; line-height: 1.6; max-width: 320px; margin: 0 auto 20px; }

        /* ── Form view ───────────────────────────────────────────────── */
        .cc-form-wrap { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
        .cc-form-group { display: flex; flex-direction: column; gap: 6px; }
        .cc-form-label {
          font-size: 12px; font-weight: 600;
          color: var(--text-secondary, #aaa);
          text-transform: uppercase; letter-spacing: 0.5px;
        }
        .cc-form-input,
        .cc-form-textarea,
        .cc-form-select {
          padding: 10px 14px;
          background: var(--bg-surface, #1e1e1e);
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
          color: var(--text-primary, #fff);
          font-size: 14px; outline: none;
          transition: border-color 0.2s;
          font-family: inherit;
        }
        .cc-form-textarea {
          resize: vertical; min-height: 100px; line-height: 1.5;
        }
        .cc-form-select option { background: #1e1e1e; }
        .cc-form-input:focus,
        .cc-form-textarea:focus,
        .cc-form-select:focus {
          border-color: var(--accent-primary, #1a62b9);
        }
        .cc-form-help {
          font-size: 12px; color: var(--text-subdued, #666);
        }
        .cc-type-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 10px;
        }
        .cc-type-option {
          border: 2px solid var(--border-color, #2a2a2a);
          border-radius: 10px; padding: 12px;
          cursor: pointer; transition: border-color 0.15s, background 0.15s;
          background: var(--bg-elevated, #181818);
        }
        .cc-type-option:hover {
          border-color: var(--accent-primary, #1a62b9);
          background: var(--bg-surface, #1e1e1e);
        }
        .cc-type-option.selected {
          border-color: var(--accent-primary, #1a62b9);
          background: rgba(26,98,185,0.08);
        }
        .cc-type-option-name {
          font-size: 13px; font-weight: 600;
          color: var(--text-primary, #fff); margin-bottom: 4px;
        }
        .cc-type-option-desc {
          font-size: 11px; color: var(--text-subdued, #666); line-height: 1.4;
        }
        .cc-form-section-title {
          font-size: 14px; font-weight: 700;
          color: var(--text-primary, #fff);
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border-color, #2a2a2a);
          margin-bottom: 4px;
        }
        .cc-form-row { display: flex; gap: 10px; align-items: flex-end; }
        .cc-form-row .cc-form-group { flex: 1; }
        .cc-status-line {
          font-size: 13px; padding: 8px 12px;
          border-radius: 8px; margin-top: 4px;
          display: none;
        }
        .cc-status-line.ok { display: block; background: rgba(46,204,113,0.1); color: #2ecc71; }
        .cc-status-line.err { display: block; background: rgba(231,76,60,0.1); color: #e74c3c; }
        .cc-status-line.loading { display: block; background: rgba(255,255,255,0.05); color: var(--text-secondary,#aaa); }

        /* ── Browse view ─────────────────────────────────────────────── */
        .cc-browse-wrap { padding: 16px; }
        .cc-browse-toolbar {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 14px;
        }
        .cc-search-bar {
          flex: 1; display: flex; align-items: center;
          background: var(--bg-surface, #1e1e1e);
          border: 1px solid var(--border-color, #333);
          border-radius: 8px; padding: 0 12px; gap: 8px;
        }
        .cc-search-bar input {
          flex: 1; background: none; border: none; outline: none;
          color: var(--text-primary, #fff); font-size: 14px; padding: 9px 0;
        }
        .cc-track-list { display: flex; flex-direction: column; gap: 2px; }
        .cc-track-row {
          display: grid;
          grid-template-columns: 42px 1fr auto auto;
          align-items: center; gap: 10px;
          padding: 8px 6px;
          border-radius: 7px; cursor: pointer;
          transition: background 0.15s;
          border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .cc-track-row:hover { background: var(--bg-surface, #1e1e1e); }
        .cc-track-num {
          text-align: center; font-size: 12px;
          color: var(--text-subdued, #555);
          font-variant-numeric: tabular-nums;
        }
        .cc-track-row:hover .cc-track-num { display: none; }
        .cc-play-icon {
          display: none; justify-content: center; align-items: center;
          color: var(--text-primary, #fff);
        }
        .cc-track-row:hover .cc-play-icon { display: flex; }
        .cc-track-title-line {
          font-size: 14px; font-weight: 500;
          color: var(--text-primary, #fff);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .cc-track-sub {
          font-size: 12px; color: var(--text-secondary, #888);
          margin-top: 1px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .cc-track-dur {
          font-size: 12px; color: var(--text-subdued, #555);
          font-variant-numeric: tabular-nums;
        }
        .cc-track-save {
          background: none; border: none;
          color: var(--text-secondary, #888);
          cursor: pointer; padding: 4px;
          display: flex; align-items: center;
          transition: color 0.15s, transform 0.1s;
          opacity: 0;
        }
        .cc-track-row:hover .cc-track-save { opacity: 1; }
        .cc-track-save.saved { color: var(--accent-primary, #1a62b9) !important; opacity: 1 !important; }
        .cc-track-row .cc-track-save.saved { opacity: 1; }
        .cc-track-save:hover { color: var(--text-primary, #fff); transform: scale(1.15); }
        .cc-browse-stats {
          font-size: 12px; color: var(--text-subdued, #555);
          text-align: right; margin-bottom: 10px;
        }
        .cc-save-all-bar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 0; margin-bottom: 10px;
          border-bottom: 1px solid var(--border-color, #2a2a2a);
        }
        .cc-scanning-wrap {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 14px; padding: 60px 20px;
          color: var(--text-secondary, #888);
        }
        .cc-spinner {
          width: 32px; height: 32px;
          border: 3px solid var(--border-color, #333);
          border-top-color: var(--accent-primary, #1a62b9);
          border-radius: 50%;
          animation: cc-spin 0.7s linear infinite;
        }
        @keyframes cc-spin { to { transform: rotate(360deg); } }

        /* ── Progress bar ────────────────────────────────────────────── */
        .cc-progress-area {
          display: flex; flex-direction: column; gap: 8px;
          width: 100%; max-width: 340px;
        }
        .cc-progress-bar-track {
          width: 100%; height: 4px;
          background: var(--border-color, #2a2a2a);
          border-radius: 2px; overflow: hidden;
        }
        .cc-progress-bar-fill {
          height: 100%; width: 0%;
          background: var(--accent-primary, #1a62b9);
          border-radius: 2px;
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .cc-progress-stats {
          font-size: 12px; color: var(--text-secondary, #888);
          text-align: center; font-variant-numeric: tabular-nums;
        }
        .cc-progress-folder {
          font-size: 11px; color: var(--text-subdued, #555);
          text-align: center;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 340px;
        }

        /* ── Player bar button ───────────────────────────────────────── */
        .cc-playerbar-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 6px 14px; border-radius: 20px;
          border: 1px solid var(--border-color, #404040);
          background: transparent; color: #fff;
          cursor: pointer; font-size: 13px; font-weight: 600;
          transition: border-color 0.15s, background 0.15s, transform 0.1s;
        }
        .cc-playerbar-btn:hover {
          background: var(--bg-highlight, #2a2a2a);
          border-color: var(--accent-primary, #1a62b9);
          transform: scale(1.04);
        }

        /* ── Toast ───────────────────────────────────────────────────── */
        .cc-toast {
          position: fixed; bottom: 90px; left: 50%;
          transform: translateX(-50%);
          background: #222; color: #fff;
          padding: 10px 20px; border-radius: 8px;
          z-index: 10010; font-size: 13px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          opacity: 0; transition: opacity 0.25s;
          pointer-events: none; white-space: nowrap;
        }
        .cc-toast.err { background: #c0392b; }

        /* ── Mobile ──────────────────────────────────────────────────── */
        @media (max-width: 768px) {
          #cc-panel {
            width: 100vw; height: 100vh; max-height: 100vh;
            top: 0; left: 0; transform: none;
            border-radius: 0; border: none;
          }
          #cc-panel.open { transform: none; }
          .cc-type-grid { grid-template-columns: 1fr 1fr; }
          .cc-track-row { grid-template-columns: 32px 1fr auto auto; }
          .cc-track-save { opacity: 1; }
          .cc-form-row { flex-direction: column; }
          .cc-form-input, .cc-form-textarea, .cc-form-select { font-size: 16px; }
        }
      `;
      document.head.appendChild(s);
    },

    buildPanel() {
      const overlay = document.createElement("div");
      overlay.id = "cc-overlay";
      overlay.onclick = () => this.close();
      document.body.appendChild(overlay);

      const panel = document.createElement("div");
      panel.id = "cc-panel";
      panel.innerHTML = `
        <div class="cc-header">
          <button class="cc-icon-btn" id="cc-back-btn" style="display:none" title="Back">${I.back}</button>
          <div class="cc-header-title" id="cc-panel-title">My Cloud Sources</div>
          <button class="cc-icon-btn" id="cc-close-btn" title="Close" style="font-size:18px">✕</button>
        </div>
        <div class="cc-body" id="cc-body"></div>
      `;
      document.body.appendChild(panel);
      this.panel = panel;

      panel.querySelector("#cc-close-btn").onclick = () => this.close();
      panel.querySelector("#cc-back-btn").onclick = () => this.goBack();
    },

    createPlayerBarButton() {
      if (document.getElementById("cc-playerbar-btn")) return;
      const btn = document.createElement("button");
      btn.id = "cc-playerbar-btn";
      btn.className = "cc-playerbar-btn";
      btn.innerHTML = `${I.cloud}<span>My Sources</span>`;
      btn.onclick = () => this.open();
      this.api?.ui?.registerSlot?.("playerbar:menu", btn);
    },

    // ── Navigation ─────────────────────────────────────────────────────────
    open() {
      this.isOpen = true;
      document.getElementById("cc-overlay")?.classList.add("open");
      document.getElementById("cc-panel")?.classList.add("open");
      this.showHome();
    },

    close() {
      this.isOpen = false;
      document.getElementById("cc-overlay")?.classList.remove("open");
      document.getElementById("cc-panel")?.classList.remove("open");
    },

    setHeader(title, showBack) {
      document.getElementById("cc-panel-title").textContent = title;
      document.getElementById("cc-back-btn").style.display = showBack ? "flex" : "none";
    },

    goBack() {
      if (this.currentView === "browse") { this.showHome(); return; }
      if (this.currentView === "add-source" || this.currentView === "edit-source") { this.showHome(); return; }
      this.close();
    },

    // ── Home view ──────────────────────────────────────────────────────────
    showHome() {
      this.currentView = "home";
      this.editingSource = null;
      this.browsingSource = null;
      this.setHeader("My Cloud Sources", false);

      const body = document.getElementById("cc-body");

      if (this.sources.length === 0) {
        body.innerHTML = `
          <div class="cc-empty">
            <div class="cc-empty-icon">${I.cloud}</div>
            <div class="cc-empty-title">No sources yet</div>
            <div class="cc-empty-desc">
              Connect a cloud storage, personal server, or media library.
              Supports WebDAV, Jellyfin, Navidrome, HTTP file servers, S3, and more.
            </div>
            <button class="cc-btn-primary" id="cc-add-first">${I.plus} Add Your First Source</button>
          </div>
        `;
        body.querySelector("#cc-add-first").onclick = () => this.showAddSource();
        return;
      }

      body.innerHTML = `
        <div class="cc-home-wrap">
          <div class="cc-section-head">
            <span class="cc-section-label">${this.sources.length} source${this.sources.length > 1 ? 's' : ''}</span>
            <button class="cc-btn-primary" id="cc-add-source-btn">${I.plus} Add Source</button>
          </div>
          <div class="cc-source-list" id="cc-source-list"></div>
        </div>
      `;
      body.querySelector("#cc-add-source-btn").onclick = () => this.showAddSource();

      const list = body.querySelector("#cc-source-list");
      for (const src of this.sources) {
        const card = document.createElement("div");
        card.className = "cc-source-card";
        card.innerHTML = `
          <div class="cc-source-icon">${this.sourceEmoji(src.type)}</div>
          <div class="cc-source-info">
            <div class="cc-source-name">${this.esc(src.name)}</div>
            <div class="cc-source-meta">${this.esc(src.config.baseUrl || src.config.urlList?.split("\n")[0] || "")}</div>
          </div>
          <div class="cc-source-actions">
            <span class="cc-source-type-badge">${SOURCE_TYPES[src.type]?.label || src.type}</span>
            <button class="cc-btn-secondary" data-browse="${src.id}">${I.import} Browse</button>
            <button class="cc-icon-btn" data-edit="${src.id}" title="Edit">${I.edit}</button>
            <button class="cc-icon-btn" data-del="${src.id}" title="Delete" style="color:#e74c3c">${I.trash}</button>
          </div>
        `;
        list.appendChild(card);
      }

      list.addEventListener("click", e => {
        const browseId = e.target.closest("[data-browse]")?.dataset.browse;
        const editId = e.target.closest("[data-edit]")?.dataset.edit;
        const delId = e.target.closest("[data-del]")?.dataset.del;
        if (browseId) { const s = this.sources.find(x => x.id === browseId); if (s) this.showBrowse(s); }
        if (editId)   { const s = this.sources.find(x => x.id === editId);   if (s) this.showEditSource(s); }
        if (delId)    { this.deleteSource(delId); }
      });
    },

    sourceEmoji(type) {
      const map = {
        http_index: "🌐", webdav: "☁️", jellyfin: "🎬",
        navidrome: "🎵", s3: "🪣", json_api: "⚙️", url_list: "🔗"
      };
      return map[type] || "📂";
    },

    // ── Add / Edit Source form ─────────────────────────────────────────────
    showAddSource() {
      this.currentView = "add-source";
      this.editingSource = null;
      this.setHeader("Add Source", true);
      this.renderSourceForm(null);
    },

    showEditSource(src) {
      this.currentView = "edit-source";
      this.editingSource = src;
      this.setHeader(`Edit: ${src.name}`, true);
      this.renderSourceForm(src);
    },

    renderSourceForm(src) {
      const body = document.getElementById("cc-body");
      const selectedType = src?.type || Object.keys(SOURCE_TYPES)[0];

      body.innerHTML = `<div class="cc-form-wrap" id="cc-form-inner"></div>`;
      const form = body.querySelector("#cc-form-inner");
      this.renderFormContent(form, src, selectedType);
    },

    renderFormContent(form, src, selectedType) {
      const typeDef = SOURCE_TYPES[selectedType];
      const isEdit = !!src;

      form.innerHTML = `
        <!-- Step 1: Name -->
        <div>
          <div class="cc-form-section-title">1. Name your source</div>
          <div class="cc-form-group" style="margin-top:12px">
            <label class="cc-form-label">Source Name</label>
            <input class="cc-form-input" id="cc-f-name" type="text"
              placeholder="My NAS, Home Server, Work Cloud..."
              value="${this.esc(src?.name || '')}">
          </div>
        </div>

        <!-- Step 2: Type -->
        <div>
          <div class="cc-form-section-title">2. Choose source type</div>
          <div class="cc-type-grid" id="cc-type-grid" style="margin-top:12px">
            ${Object.entries(SOURCE_TYPES).map(([key, def]) => `
              <div class="cc-type-option ${key === selectedType ? 'selected' : ''}" data-type="${key}">
                <div class="cc-type-option-name">${def.label}</div>
                <div class="cc-type-option-desc">${def.description}</div>
              </div>
            `).join("")}
          </div>
        </div>

        <!-- Step 3: Connection fields (dynamic) -->
        <div id="cc-dyn-fields">
          <div class="cc-form-section-title">3. Connection details</div>
          <div id="cc-fields-inner" style="margin-top:12px; display:flex; flex-direction:column; gap:14px;">
            ${this.renderFields(typeDef.fields, src?.config || {})}
          </div>
        </div>

        <!-- Test + Save -->
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center">
          <button class="cc-btn-secondary" id="cc-test-btn">${I.check} Test Connection</button>
          <button class="cc-btn-primary" id="cc-save-btn">${isEdit ? 'Save Changes' : `${I.plus} Add Source`}</button>
          ${isEdit ? `<button class="cc-btn-danger" id="cc-del-btn">${I.trash} Delete Source</button>` : ""}
        </div>
        <div class="cc-status-line" id="cc-form-status"></div>
      `;

      // Type selector
      form.querySelectorAll(".cc-type-option").forEach(opt => {
        opt.onclick = () => {
          const newType = opt.dataset.type;
          form.querySelectorAll(".cc-type-option").forEach(o => o.classList.remove("selected"));
          opt.classList.add("selected");
          // Re-render just the fields section
          const fieldsInner = document.getElementById("cc-fields-inner");
          fieldsInner.innerHTML = this.renderFields(SOURCE_TYPES[newType].fields, src?.config || {});
        };
      });

      // Test
      form.querySelector("#cc-test-btn").onclick = async () => {
        const tempSrc = this.collectFormData(form, src?.id);
        if (!tempSrc) return;
        const status = document.getElementById("cc-form-status");
        status.className = "cc-status-line loading";
        status.textContent = "Testing connection...";
        const result = await this.testSource(tempSrc);
        if (result.ok) {
          status.className = "cc-status-line ok";
          status.textContent = `✓ Connection successful (HTTP ${result.status})`;
        } else {
          status.className = "cc-status-line err";
          status.textContent = `✕ Failed: ${result.error || `HTTP ${result.status}`}`;
        }
      };

      // Save
      form.querySelector("#cc-save-btn").onclick = () => {
        const tempSrc = this.collectFormData(form, src?.id);
        if (!tempSrc) return;
        if (src) {
          // Update existing
          const idx = this.sources.findIndex(s => s.id === src.id);
          if (idx >= 0) this.sources[idx] = tempSrc;
        } else {
          this.sources.push(tempSrc);
          this.registerResolver(tempSrc);
        }
        this.saveSources();
        this.toast(`${src ? 'Updated' : 'Added'}: ${tempSrc.name}`);
        this.showHome();
      };

      // Delete (edit mode)
      form.querySelector("#cc-del-btn")?.addEventListener("click", () => {
        if (src) { this.deleteSource(src.id); }
      });
    },

    renderFields(fields, existing) {
      return fields.map(f => {
        const val = this.esc(existing[f.key] || "");
        if (f.type === "textarea") {
          return `
            <div class="cc-form-group">
              <label class="cc-form-label">${f.label}</label>
              <textarea class="cc-form-textarea" id="cc-field-${f.key}" placeholder="${this.esc(f.placeholder)}">${val}</textarea>
              ${f.help ? `<span class="cc-form-help">${f.help}</span>` : ""}
            </div>`;
        }
        return `
          <div class="cc-form-group">
            <label class="cc-form-label">${f.label}</label>
            <input class="cc-form-input" id="cc-field-${f.key}" type="${f.type}" placeholder="${this.esc(f.placeholder)}" value="${val}">
            ${f.help ? `<span class="cc-form-help">${f.help}</span>` : ""}
          </div>`;
      }).join("");
    },

    collectFormData(form, existingId) {
      const name = document.getElementById("cc-f-name")?.value.trim();
      if (!name) { this.toast("Please enter a name", true); return null; }

      const selectedType = form.querySelector(".cc-type-option.selected")?.dataset.type;
      if (!selectedType) { this.toast("Please select a source type", true); return null; }

      const typeDef = SOURCE_TYPES[selectedType];
      const config = {};
      for (const f of typeDef.fields) {
        const el = document.getElementById(`cc-field-${f.key}`);
        if (el) config[f.key] = el.value.trim();
      }

      return {
        id:     existingId || `src-${Date.now()}`,
        name,
        type:   selectedType,
        slug:   this.makeSlug(name),
        config
      };
    },

    deleteSource(id) {
      this.sources = this.sources.filter(s => s.id !== id);
      this.saveSources();
      this.toast("Source removed");
      this.showHome();
    },

    // ── Browse view ────────────────────────────────────────────────────────
    async showBrowse(src) {
      this.currentView = "browse";
      this.browsingSource = src;
      this.setHeader(`Browse: ${src.name}`, true);

      const body = document.getElementById("cc-body");
      const isRecursive = src.type === "http_index" || src.type === "webdav";

      body.innerHTML = `
        <div class="cc-scanning-wrap">
          <div class="cc-spinner"></div>
          <div id="cc-scan-label" style="font-size:15px; font-weight:600;">Scanning ${this.esc(src.name)}…</div>
          <div id="cc-scan-sub" style="font-size:12px; color:var(--text-subdued,#555); margin-top:2px;">
            ${isRecursive ? "Crawling folders…" : "Fetching track list from your server"}
          </div>
          ${isRecursive ? `
          <div class="cc-progress-area" style="width:100%; max-width:340px; margin-top:16px;">
            <div class="cc-progress-bar-track">
              <div class="cc-progress-bar-fill" id="cc-prog-fill"></div>
            </div>
            <div class="cc-progress-stats" id="cc-prog-stats">Starting…</div>
            <div class="cc-progress-folder" id="cc-prog-folder"></div>
          </div>` : ""}
        </div>
      `;

      // Live progress updater for recursive scans
      let lastFolderCount = 0;
      const onProgress = isRecursive ? (state) => {
        const statsEl  = document.getElementById("cc-prog-stats");
        const folderEl = document.getElementById("cc-prog-folder");
        const fillEl   = document.getElementById("cc-prog-fill");
        if (!statsEl) return;

        // Animate the indeterminate bar based on folder count (no end known yet)
        // Each folder wiggles bar forward; cap at 90% until done
        if (fillEl) {
          const pct = Math.min(90, state.folders * 4);
          fillEl.style.width = pct + "%";
        }

        const elapsed = Math.round(state.elapsed / 1000);
        let etaStr = "";
        if (state.eta !== null && state.eta > 1) {
          etaStr = ` · ~${state.eta}s left`;
        }

        statsEl.textContent = `${state.folders} folder${state.folders !== 1 ? "s" : ""} · ${state.tracks} track${state.tracks !== 1 ? "s" : ""} found · ${elapsed}s elapsed${etaStr}`;

        if (folderEl && state.currentFolder && state.currentFolder !== "/") {
          folderEl.textContent = `📂 ${state.currentFolder}`;
        }

        lastFolderCount = state.folders;
      } : null;

      try {
        const tracks = await this.scanSource(src, onProgress);

        // Snap bar to 100%
        const fillEl = document.getElementById("cc-prog-fill");
        if (fillEl) { fillEl.style.width = "100%"; fillEl.style.transition = "width 0.3s ease"; }

        // Brief pause so user sees 100% before switching view
        if (isRecursive) await new Promise(r => setTimeout(r, 350));

        this.browseItems = tracks;
        this.renderBrowse(src, tracks);
      } catch (err) {
        body.innerHTML = `
          <div class="cc-empty">
            <div style="color:#e74c3c; margin-bottom:10px">${I.warning}</div>
            <div class="cc-empty-title">Could not scan source</div>
            <div class="cc-empty-desc" style="color:#e74c3c">${err.message}</div>
            <button class="cc-btn-secondary" id="cc-edit-source-btn">${I.edit} Edit Source Settings</button>
          </div>
        `;
        body.querySelector("#cc-edit-source-btn").onclick = () => this.showEditSource(src);
      }
    },

    renderBrowse(src, tracks, filter = "") {
      const body = document.getElementById("cc-body");
      const filtered = filter
        ? tracks.filter(t =>
            t.title.toLowerCase().includes(filter) ||
            t.artist.toLowerCase().includes(filter) ||
            (t.album || "").toLowerCase().includes(filter))
        : tracks;

      const newInLibrary = filtered.filter(t => !this.libraryTrackIds.has(t.external_id)).length;

      body.innerHTML = `
        <div class="cc-browse-wrap">
          <div class="cc-browse-toolbar">
            <div class="cc-search-bar">
              ${I.search}
              <input type="text" id="cc-browse-search" placeholder="Filter tracks…" value="${this.esc(filter)}">
            </div>
          </div>

          <div class="cc-save-all-bar">
            <span class="cc-browse-stats">
              ${filtered.length} track${filtered.length !== 1 ? 's' : ''}
              ${newInLibrary > 0 ? ` · <span style="color:var(--accent-primary,#1a62b9)">${newInLibrary} new</span>` : ' · all in library'}
            </span>
            <button class="cc-btn-primary" id="cc-save-all-btn">${I.import} Save All to Library</button>
          </div>

          <div class="cc-track-list" id="cc-track-list">
            ${filtered.map((t, i) => this.renderBrowseTrackRow(t, i + 1)).join("")}
          </div>

          ${filtered.length === 0 ? `<div class="cc-empty" style="padding:40px"><div class="cc-empty-title">No matches</div></div>` : ""}
        </div>
      `;

      // Search filter
      document.getElementById("cc-browse-search").addEventListener("input", e => {
        this.renderBrowse(src, tracks, e.target.value.toLowerCase().trim());
      });

      // Save all
      document.getElementById("cc-save-all-btn").addEventListener("click", async () => {
        await this.saveAllVisible(src, filtered);
      });

      // Track row interactions
      document.getElementById("cc-track-list").addEventListener("click", async e => {
        const row = e.target.closest(".cc-track-row");
        if (!row) return;
        const idx = parseInt(row.dataset.idx, 10);
        const track = filtered[idx];
        if (!track) return;

        const saveBtn = e.target.closest(".cc-track-save");
        if (saveBtn) {
          e.stopPropagation();
          if (saveBtn.classList.contains("saved")) return;
          const ok = await this.saveTrack(src, track);
          if (ok) {
            saveBtn.classList.add("saved");
            saveBtn.innerHTML = I.heart;
            saveBtn.title = "In library";
            this.toast(`Saved: ${track.title}`);
          }
          return;
        }
        // Play
        await this.playTrack(src, track);
      });
    },

    renderBrowseTrackRow(track, num) {
      const saved = this.libraryTrackIds.has(track.external_id);
      const dur = track.duration ? this.fmtDur(track.duration) : "";
      const sub = [track.artist, track.album].filter(Boolean).join(" · ");
      const idx = num - 1;
      // Prefer the parsed track number from file metadata over the list row index
      const displayNum = track.trackNum || num;
      return `
        <div class="cc-track-row" data-idx="${idx}">
          <div style="position:relative; width:32px; display:flex; align-items:center; justify-content:center;">
            <span class="cc-track-num">${displayNum}</span>
            <span class="cc-play-icon">${I.play}</span>
          </div>
          <div style="overflow:hidden">
            <div class="cc-track-title-line">${this.esc(track.title)}</div>
            ${sub ? `<div class="cc-track-sub">${this.esc(sub)}</div>` : ""}
          </div>
          <span class="cc-track-dur">${dur}</span>
          <button class="cc-track-save ${saved ? 'saved' : ''}" title="${saved ? 'In library' : 'Save to library'}">
            ${saved ? I.heart : I.heartO}
          </button>
        </div>
      `;
    },

    async saveAllVisible(src, tracks) {
      const btn = document.getElementById("cc-save-all-btn");
      if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
      let saved = 0;
      for (const t of tracks) {
        const ok = await this.saveTrack(src, t);
        if (ok) saved++;
      }
      await this.refreshLibraryIndex();
      // Re-render with updated state
      this.renderBrowse(src, this.browseItems, document.getElementById("cc-browse-search")?.value.toLowerCase().trim() || "");
      if (saved > 0) this.toast(`Saved ${saved} track${saved > 1 ? 's' : ''} to library`);
      else this.toast("All tracks already in library");
    },

    // ── Utilities ──────────────────────────────────────────────────────────
    fmtDur(sec) {
      if (!sec || isNaN(sec)) return "";
      const m = Math.floor(sec / 60);
      const s = Math.round(sec % 60);
      return `${m}:${s.toString().padStart(2, "0")}`;
    },

    esc(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },

    toast(msg, isErr = false) {
      const el = document.createElement("div");
      el.className = `cc-toast${isErr ? " err" : ""}`;
      el.textContent = msg;
      document.body.appendChild(el);
      requestAnimationFrame(() => (el.style.opacity = "1"));
      setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 3000);
    }
  };

  // Register with Audion
  if (typeof Audion !== "undefined" && Audion.register) {
    Audion.register(CustomCloudSource);
  } else {
    window.CustomCloudSource = CustomCloudSource;
    window.AudionPlugin = CustomCloudSource;
  }
})();