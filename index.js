/**
 * Host half of the file manager bundle.
 * Lists directories and reads text files inside registered workspaces.
 */
import { readFile, stat, readdir, writeFile, mkdir, rename, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep, extname, basename, dirname } from 'node:path'

export const name = 'dsh-file-manager'
export const inject = ['connection', 'workspaceRegistry']

const API = '/api/dsh-file-manager'
const MAX_READ = 4 * 1024 * 1024
const SKIP = new Set(['node_modules', '.git', '.svn', '.hg'])

class FsError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
function json(value, status = 200) {
  // Explicit charset prevents non-UTF-8 decoding of Chinese names in some WebViews.
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
function failure(error, fallback) {
  // macOS TCC blocks ~/Documents etc. with EPERM — surface an actionable hint.
  if (!(error instanceof FsError) && (error && (error.code === 'EPERM' || error.code === 'EACCES'))) {
    return json({ error: '没有权限访问该目录。请在「系统设置 → 隐私与安全性 → 文件与文件夹」中为 DSH 授予访问授权，然后重试。', code: error.code }, 403)
  }
  const message = error instanceof FsError ? error.message : fallback
  const status = error instanceof FsError ? error.status : 500
  return json({ error: message }, status)
}
function route(path, methods, fetch) {
  return { path: `${API}/${path}`, methods, requestBody: 'buffered', fetch }
}
async function readBody(request) {
  try { return JSON.parse((await request.text()) || '{}') }
  catch (_) { throw new FsError('请求内容不是合法的 JSON。') }
}
function inside(root, target) {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}
function resolveRoot(registry, requested) {
  const ws = registry.list()
  if (!ws.length) throw new FsError('还没有已注册的工作区。', 404)
  if (!requested) return ws[0].path
  const found = ws.find((w) => w.path === requested || w.id === requested)
  if (!found) throw new FsError('未找到该工作区。', 404)
  return found.path
}

export function apply(ctx) {
  ctx.effect(() => {
    const disposers = []
    const register = (entry) => {
      try {
        const dispose = ctx.connection.fetch.register(entry)
        if (typeof dispose === 'function') disposers.push(dispose)
      } catch (error) {
        console.warn(`[dsh-file-manager] route ${entry.path} rejected: ${(error && error.message) || error}`)
      }
    }

    register(route('meta', ['GET'], () => json({
      workspaces: ctx.workspaceRegistry.list().map((w) => ({ id: w.id, title: w.title, path: w.path })),
    })))

    register(route('list', ['GET'], async (request) => {
      try {
        const url = new URL(request.url)
        const root = resolveRoot(ctx.workspaceRegistry, url.searchParams.get('root') || '')
        const rel = url.searchParams.get('path') || ''
        const dir = resolve(join(root, rel))
        if (!inside(root, dir)) throw new FsError('目录不在工作区内。', 403)
        const entries = await readdir(dir, { withFileTypes: true })
        const list = await Promise.all(entries.map(async (e) => {
          if (SKIP.has(e.name)) return null
          const abs = join(dir, e.name)
          let size = 0
          let mtime = ''
          if (e.isFile()) {
            try { const s = await stat(abs); size = s.size; mtime = s.mtime.toISOString() } catch (_) {}
          }
          return {
            name: e.name,
            dir: e.isDirectory(),
            file: e.isFile(),
            ext: e.isFile() ? extname(e.name).toLowerCase() : '',
            size,
            mtime,
            path: relative(root, abs).split(sep).join('/'),
          }
        }))
        const items = list.filter(Boolean).sort((a, b) =>
          a.dir === b.dir ? a.name.localeCompare(b.name) : (a.dir ? -1 : 1))
        return json({ root, dir: relative(root, dir) || '', items })
      } catch (error) { return failure(error, '无法读取目录。') }
    }))

    register(route('read', ['GET'], async (request) => {
      try {
        const url = new URL(request.url)
        const root = resolveRoot(ctx.workspaceRegistry, url.searchParams.get('root') || '')
        const rel = url.searchParams.get('path') || ''
        if (!rel) throw new FsError('缺少文件路径。')
        const abs = resolve(join(root, rel))
        if (!inside(root, abs)) throw new FsError('文件不在工作区内。', 403)
        const info = await stat(abs)
        if (!info.isFile()) throw new FsError('目标不是文件。')
        if (info.size > MAX_READ) throw new FsError('文件过大，无法预览。', 413)
        const buf = await readFile(abs)
        const ext = extname(abs).toLowerCase()
        const binaryExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.zip', '.gz', '.exe', '.dylib', '.bin', '.ico'])
        if (binaryExts.has(ext)) return json({ binary: true, name: basename(abs), size: info.size })
        const encoding = url.searchParams.get('encoding') || 'utf-8'
        const label = encoding === 'gbk' ? 'gbk' : 'utf-8'
        let text
        try { text = new TextDecoder(label).decode(buf) }
        catch (_) { text = new TextDecoder('utf-8').decode(buf) }
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
        return json({ binary: false, text, name: basename(abs), size: info.size, ext })
      } catch (error) { return failure(error, '无法读取文件。') }
    }))

    // Create a directory inside the current workspace.
    register(route('mkdir', ['POST'], async (request) => {
      try {
        const body = await readBody(request)
        const root = resolveRoot(ctx.workspaceRegistry, body.root || '')
        const parent = body.parent || ''
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        if (!name) throw new FsError('请输入文件夹名称。')
        if (/[\/\\]/.test(name)) throw new FsError('名称不能包含斜杠。')
        const parentAbs = resolve(join(root, parent))
        if (!inside(root, parentAbs)) throw new FsError('目录不在工作区内。', 403)
        const target = join(parentAbs, name)
        if (!inside(root, target)) throw new FsError('目标不在工作区内。', 403)
        await mkdir(target, { recursive: false })
        return json({ ok: true, path: relative(root, target).split(sep).join('/') })
      } catch (error) {
        if (error && error.code === 'EEXIST') return failure(new FsError('文件夹已存在。'), '创建失败。')
        return failure(error, '创建文件夹失败。')
      }
    }))

    // Write text content to a file (create or overwrite).
    register(route('write', ['POST'], async (request) => {
      try {
        const body = await readBody(request)
        const root = resolveRoot(ctx.workspaceRegistry, body.root || '')
        const rel = body.path || ''
        if (!rel) throw new FsError('缺少文件路径。')
        const abs = resolve(join(root, rel))
        if (!inside(root, abs)) throw new FsError('文件不在工作区内。', 403)
        const content = typeof body.content === 'string' ? body.content : ''
        if (Buffer.byteLength(content, 'utf8') > MAX_READ) throw new FsError('内容过大。', 413)
        await mkdir(dirname(abs), { recursive: true })
        await writeFile(abs, content, 'utf8')
        return json({ ok: true, path: rel, bytes: Buffer.byteLength(content, 'utf8') })
      } catch (error) { return failure(error, '保存文件失败。') }
    }))

    // Rename a file or folder.
    register(route('rename', ['POST'], async (request) => {
      try {
        const body = await readBody(request)
        const root = resolveRoot(ctx.workspaceRegistry, body.root || '')
        const rel = body.path || ''
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        if (!rel) throw new FsError('缺少路径。')
        if (!name || /[\/\\]/.test(name)) throw new FsError('名称无效。')
        const from = resolve(join(root, rel))
        const to = resolve(join(dirname(from), name))
        if (!inside(root, from) || !inside(root, to)) throw new FsError('路径不在工作区内。', 403)
        if (from === to) throw new FsError('名称未改变。')
        await rename(from, to)
        return json({ ok: true, path: relative(root, to).split(sep).join('/') })
      } catch (error) { return failure(error, '重命名失败。') }
    }))

    // Delete a file or a folder (recursive).
    register(route('remove', ['POST'], async (request) => {
      try {
        const body = await readBody(request)
        const root = resolveRoot(ctx.workspaceRegistry, body.root || '')
        const rel = body.path || ''
        if (!rel) throw new FsError('缺少路径。')
        const abs = resolve(join(root, rel))
        if (!inside(root, abs)) throw new FsError('路径不在工作区内。', 403)
        if (abs === resolve(root)) throw new FsError('不能删除工作区根目录。')
        const isDir = (await stat(abs)).isDirectory()
        await rm(abs, { recursive: isDir, force: false })
        return json({ ok: true })
      } catch (error) { return failure(error, '删除失败。') }
    }))

    return () => {
      for (const dispose of disposers) {
        try {
          const result = dispose()
          if (result && typeof result.then === 'function') result.catch(() => {})
        } catch (_) {}
      }
    }
  }, 'dsh-file-manager: routes')
}
