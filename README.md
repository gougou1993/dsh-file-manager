# File Manager (dsh-file-manager)

A workspace file manager plugin for DSH (DeepSeek Harness). It adds a left-sidebar entry with a central panel for browsing workspace files, previewing and editing text, and performing basic file/folder operations.

## Plugin Info

- **Package**: `@oakzhong/dsh-file-manager`
- **Version**: 1.0.5
- **Entry**: left sidebar "File Manager"
- **Type**: Host + Client dual-half plugin (bundle)

## Tech Stack

| Layer | Technology |
|---|---|
| Plugin framework | DSH Cordis scoped bundle (`cordis.patch.yml`) |
| Host half | ESM `apply(ctx)`, 7 API routes via `ctx.connection.fetch.register` |
| File system | Node.js `fs/promises` (readdir/stat/readFile/writeFile/mkdir/rename/rm), zero third-party deps |
| Path safety | `resolveRoot` + `inside()` validation, all operations confined to registered workspaces |
| HTTP | Client `fetch` + `credentials: same-origin`, explicit UTF-8 decoding to avoid Chinese garbling |
| Client half | `window.__ModuleLoader__.load`, React without JSX (`React.createElement`) |
| Styling | injected `<style>`, DSH theme tokens, independently scrolling list container |
| i18n | `ctx.locale.register / bind`, Chinese and English (zh / en) |

## Features

### 1. Workspace Browsing
- Dropdown to switch registered workspaces
- Breadcrumb navigation (root / each level), clickable to jump, plus "Up"
- **Search**: fuzzy-filter files/folders in the current directory by name for quick locating
- **Show hidden files**: checkbox to toggle `.`-prefixed files/folders (hidden by default)
- File list shows name, size, modified time; file types use icons
- Independently scrollable list for long directories, with a fixed header
- Automatically skips irrelevant directories such as `node_modules` and `.git`

### 2. File Preview
- Click a text file to view content, with UTF-8 / GBK encoding switch
- Binary files (images/PDF/archives) show a size hint
- Footer shows line and character counts

### 3. File Editing
- Text files can be switched to "Edit" mode with a textarea and saved
- Saving writes to disk and refreshes the list and preview

### 4. File & Folder Operations
- **New folder**: create in the current directory with an input box
- **New file**: create an empty file and enter edit mode automatically (`.txt` appended if no extension)
- **Rename**: inline edit of file/folder name, Enter to save / Esc to cancel
- **Delete**: files and folders can be deleted with confirmation (folders recursively; root cannot be deleted)

## Host API Routes

All routes are prefixed with `/api/dsh-file-manager/`:

| Route | Method | Description |
|---|---|---|
| `meta` | GET | list registered workspaces |
| `list` | GET | list directory contents (root + path) |
| `read` | GET | read a text file (encoding parameter supported) |
| `mkdir` | POST | create a folder (root + parent + name) |
| `write` | POST | write/create a file (root + path + content) |
| `rename` | POST | rename (root + path + name) |
| `remove` | POST | delete (root + path, recursive for directories) |

## Safety & Limits

- All path operations are confined to the registered workspace root; out-of-bounds requests are rejected
- Single file read/write is capped at 4MB
- On macOS, workspaces under `~/Documents` may return EPERM due to TCC privacy protection; the plugin then prompts to grant DSH access in "System Settings → Privacy & Security → Files and Folders"
- Responses always carry `content-type: application/json; charset=utf-8`, and the Client decodes UTF-8 explicitly to avoid Chinese-name garbling

## Directory Structure

```
dsh-file-manager/
├── package.json          # manifest (scoped name), bundle config, client injection
├── cordis.patch.yml      # loader insert row
├── index.js              # Host half: 7 file operation routes
├── client.js             # Client half: UI, file list, editing, scroll, styles
├── locale/
│   ├── zh.json           # Chinese display metadata
│   └── en.json           # English display metadata
├── icon.svg              # plugin icon
├── README.md             # this file (English)
└── README.zh.md          # Chinese documentation
```

## Installation & Usage

1. Install the bundle via the plugin manager (`install_bundle` pointing to this directory)
2. Click "File Manager" in the left sidebar
3. Select a workspace, browse directories, click a file to preview
4. Use the toolbar to create files/folders; use the row icons to rename or delete
