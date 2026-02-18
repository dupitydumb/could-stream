# Custom Cloud Source Plugin for Audion

**Connect any cloud storage, personal server, or media library — no coding required.**

This plugin lets you define your own audio sources inside Audion. If you have music sitting on a file server, a NAS, a cloud bucket, or a media server, this plugin turns it into a fully playable, browseable library.

---

## Supported Source Types

| Type | Examples |
|------|---------|
| **HTTP File Server** | Nginx, Caddy, Apache with autoindex enabled |
| **WebDAV** | Nextcloud, ownCloud, Seafile, any WebDAV server |
| **Jellyfin / Emby** | Self-hosted Jellyfin or Emby media server |
| **Navidrome / Subsonic** | Navidrome, Airsonic, Funkwhale, Subsonic |
| **S3 / R2 / MinIO** | Amazon S3, Cloudflare R2, MinIO, any S3-compatible storage |
| **Custom JSON API** | Your own REST API server |
| **URL List** | Paste a list of direct audio URLs |

---

## Installation

1. Open Audion → **Settings → Plugins**
2. Click **Open Plugin Folder**
3. Copy the `custom-cloud-source` folder into the plugins directory
4. Restart Audion or click **Reload Plugins**
5. Enable the plugin

---

## Usage

1. Click **"My Sources"** in the player bar menu
2. Click **"Add Source"** and choose your source type
3. Fill in the connection details (URL, credentials, etc.)
4. Click **"Test Connection"** to verify it works
5. Click **"Add Source"** to save
6. Click **"Browse"** on any source to see your tracks
7. Click any track to **play it**, or click ♡ to **save it to your library**
8. Use **"Save All to Library"** to import everything at once

Once saved to your library, tracks will appear in Audion's main library and stream from your server on demand.

---

## How Each Source Type Works

### HTTP File Server
Point it at a directory listing page (Nginx/Apache/Caddy with autoindex). The plugin parses the HTML for audio file links and builds a track list. Supports Basic Auth.

**Example URL:** `https://music.myserver.com/library/`

### WebDAV / Nextcloud / ownCloud
Uses PROPFIND to list audio files in your WebDAV folder. Use an App Password instead of your main password for better security.

**Example URL:** `https://cloud.myserver.com/remote.php/dav/files/username/Music/`

### Jellyfin / Emby
Uses the Items API to fetch your full music library. You need:
- Your server URL
- An API key (Dashboard → API Keys)
- Your User ID (Admin → Users → click your username)

### Navidrome / Subsonic
Uses the Subsonic REST API's `search3` endpoint. Works with any Subsonic-compatible server. Username/password auth.

### S3 / R2 / MinIO
For public buckets, just provide the bucket URL. For private buckets, generate pre-signed URLs and paste the signature params into the "Auth Query Param" field. The plugin appends file object keys to the base URL.

### Custom JSON API
For your own server. Provide:
- A **tracks endpoint** that returns a JSON array: `[{id, title, artist, album, duration, cover_url}]`
- A **stream URL template** with `{id}` as a placeholder: `/stream/{id}`

### URL List
Paste raw audio URLs, one per line. The plugin derives track titles from filenames. Useful for quick imports from any source that gives you direct links.

---

## How Streaming Works

This plugin uses Audion's **stream resolver** system. When you save a track with a source like `custom-my-nas`, Audion stores only the metadata. At playback time, the resolver is called with the track's `external_id` and generates a fresh stream URL. This means:

- URLs never expire in your library (they're regenerated on demand)
- No audio data is cached — it always streams from your server
- You can update credentials in the plugin and all existing saved tracks adapt automatically

---

## Tips

- **Multiple sources**: You can add as many sources as you like. Each gets its own stream resolver with a unique `source_type` slug (e.g. `custom-my-nas`, `custom-work-server`).
- **Filtering**: The Browse view has a live filter bar — search by title, artist, or album.
- **Credentials are stored locally**: All config including passwords is stored in Audion's local plugin storage — it never leaves your machine.
- **For large libraries**: Use Jellyfin or Navidrome instead of HTTP index for better metadata (proper titles, artists, album art, duration).
