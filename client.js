/**
 * Client half of the file manager bundle.
 * Left sidebar entry + panel: workspace file browser with breadcrumb navigation
 * and a text preview pane.
 */
window.__ModuleLoader__.load({
  id: 'dsh-file-manager',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useMemo } = React

    const NS = 'dsh-file-manager'
    const PANEL_ID = 'file-manager'
    const STYLE_ID = 'dsh-file-manager/css'
    const API = '/api/dsh-file-manager'

    const zh = {
      title: '文件管理', subtitle: '浏览当前工作区的文件，点击文件预览内容。',
      workspace: '工作区', files: '文件', refresh: '刷新', up: '上一级',
      name: '名称', size: '大小', modified: '修改时间',
      noWorkspace: '还没有已注册的工作区。请先在左侧栏打开一个项目目录。',
      emptyDir: '这个目录是空的。', selectFile: '选择一个文件进行预览。',
      binary: '二进制文件，无法文本预览。', encoding: '编码',
      line: '{n} 行', chars: '{n} 字符', listFailed: '无法读取文件列表。',
      readFailed: '无法读取文件。', root: '根目录', back: '返回',
      openNew: '新窗口打开',
      newFolder: '新建文件夹', folderName: '文件夹名称', create: '创建',
      edit: '编辑', save: '保存', cancel: '取消', saved: '已保存',
      confirmOverwrite: '确定保存覆盖该文件？', newFile: '新建文件', fileName: '文件名',
      rename: '重命名', delete: '删除', confirmDelFolder: '确定删除该文件夹及其全部内容？',
      confirmDelFile: '确定删除该文件？', renameFolder: '文件夹新名称',
    }
    const en = {
      title: 'File manager', subtitle: 'Browse files in the current workspace and preview them.',
      workspace: 'Workspace', files: 'Files', refresh: 'Refresh', up: 'Up',
      name: 'Name', size: 'Size', modified: 'Modified',
      noWorkspace: 'No registered workspace yet. Open a project folder from the left sidebar first.',
      emptyDir: 'This directory is empty.', selectFile: 'Select a file to preview it.',
      binary: 'Binary file — text preview unavailable.', encoding: 'Encoding',
      line: '{n} lines', chars: '{n} chars', listFailed: 'Failed to list directory.',
      readFailed: 'Failed to read file.', root: 'Root', back: 'Back',
      openNew: 'Open in new tab',
      newFolder: 'New folder', folderName: 'Folder name', create: 'Create',
      edit: 'Edit', save: 'Save', cancel: 'Cancel', saved: 'Saved',
      confirmOverwrite: 'Overwrite this file?', newFile: 'New file', fileName: 'File name',
      rename: 'Rename', delete: 'Delete', confirmDelFolder: 'Delete this folder and all its contents?',
      confirmDelFile: 'Delete this file?', renameFolder: 'New folder name',
    }
    let t = (k) => (zh[k] || k)
    const fmt = (s, v) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : ''))
    function humanSize(n) {
      const x = Number(n) || 0
      if (x < 1024) return x + ' B'
      if (x < 1024 * 1024) return (x / 1024).toFixed(1) + ' KB'
      return (x / 1024 / 1024).toFixed(1) + ' MB'
    }
    function timeStr(s) { if (!s) return ''; try { return new Date(s).toLocaleString() } catch (_) { return '' } }

    async function api(path, body) {
      const res = await fetch(API + path, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      let data = null
      try {
        // Decode explicitly as UTF-8 to avoid locale-dependent Chinese name garbling.
        const buf = await res.arrayBuffer()
        data = JSON.parse(new TextDecoder('utf-8').decode(buf))
      } catch (_) {}
      if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status))
      return data
    }

    function SidebarIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 20
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true,
        style: { opacity: props.active ? 1 : 0.82 },
      },
        h('path', { d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' })
      )
    }

    const FILE_ICON = {
      folder: '📁', '.json': '📋', '.md': '📝', '.txt': '📄', '.js': '🟨', '.ts': '🔷',
      '.py': '🐍', '.html': '🌐', '.css': '🎨', '.png': '🖼️', '.jpg': '🖼️', '.pdf': '📕',
      '.yml': '⚙️', '.yaml': '⚙️', '.sh': '💻', '.csv': '📊', '.log': '📜',
    }
    function iconFor(item) {
      if (item.dir) return FILE_ICON.folder
      return FILE_ICON[item.ext] || '📄'
    }

    function FilePanel({ ctx }) {
      const [workspaces, setWorkspaces] = useState([])
      const [root, setRoot] = useState('')
      const [dir, setDir] = useState('')
      const [items, setItems] = useState([])
      const [selected, setSelected] = useState('')
      const [file, setFile] = useState(null)
      const [encoding, setEncoding] = useState('utf-8')
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState('')
      const [showNewFolder, setShowNewFolder] = useState(false)
      const [newFolderName, setNewFolderName] = useState('')
      const [showNewFile, setShowNewFile] = useState(false)
      const [newFileName, setNewFileName] = useState('')
      const [editing, setEditing] = useState(false)
      const [editContent, setEditContent] = useState('')
      const [msg, setMsg] = useState('')
      const [renaming, setRenaming] = useState('')
      const [renameValue, setRenameValue] = useState('')

      const loadDir = useCallback(async (r, d) => {
        if (!r) { setItems([]); return }
        setBusy(true); setErr('')
        try {
          const params = '?root=' + encodeURIComponent(r) + '&path=' + encodeURIComponent(d || '')
          const data = await api('/list' + params)
          setDir(data.dir || '')
          setItems(data.items || [])
        } catch (e) { setErr(e.message || t('listFailed')) }
        finally { setBusy(false) }
      }, [])

      useEffect(() => {
        api('/meta').then((m) => {
          const ws = m.workspaces || []
          setWorkspaces(ws)
          if (ws.length) { setRoot(ws[0].path); loadDir(ws[0].path, '') }
        }).catch((e) => setErr(e.message))
      }, [loadDir])

      const openFile = useCallback(async (path, enc) => {
        if (!root) return
        setSelected(path); setErr('')
        try {
          const params = '?root=' + encodeURIComponent(root) + '&path=' + encodeURIComponent(path) + '&encoding=' + encodeURIComponent(enc || encoding)
          const data = await api('/read' + params)
          setFile(data)
          setEditContent(data.binary ? '' : (data.text || ''))
          setEditing(false)
          setMsg('')
        } catch (e) { setErr(e.message || t('readFailed')); setFile(null) }
      }, [root, encoding])

      const onItemClick = useCallback((item) => {
        if (item.dir) {
          setSelected(''); setFile(null)
          loadDir(root, item.path)
        } else openFile(item.path)
      }, [root, loadDir, openFile])

      const goUp = useCallback(() => {
        const parts = dir.split('/').filter(Boolean)
        parts.pop()
        setSelected(''); setFile(null); setEditing(false)
        loadDir(root, parts.join('/'))
      }, [dir, root, loadDir])

      const createFolder = useCallback(async () => {
        const name = newFolderName.trim()
        if (!name || !root) return
        setBusy(true); setErr('')
        try {
          await api('/mkdir', { root, parent: dir, name })
          setShowNewFolder(false); setNewFolderName('')
          await loadDir(root, dir)
        } catch (e) { setErr(e.message) }
        finally { setBusy(false) }
      }, [newFolderName, root, dir, loadDir])

      const createFile = useCallback(async () => {
        let name = newFileName.trim()
        if (!name || !root) return
        if (!/\.[^.]+$/.test(name)) name += '.txt'
        const path = dir ? dir + '/' + name : name
        setBusy(true); setErr('')
        try {
          await api('/write', { root, path, content: '' })
          setShowNewFile(false); setNewFileName('')
          await loadDir(root, dir)
          setSelected(path)
          setFile({ binary: false, text: '', name, size: 0, ext: name.slice(name.lastIndexOf('.')) })
          setEditContent(''); setEditing(true); setMsg('')
        } catch (e) { setErr(e.message) }
        finally { setBusy(false) }
      }, [newFileName, root, dir, loadDir])

      const startEdit = useCallback(() => {
        if (!file || file.binary) return
        setEditContent(file.text || '')
        setEditing(true); setMsg('')
      }, [file])

      const saveFile = useCallback(async () => {
        if (!selected || !root) return
        setBusy(true); setErr('')
        try {
          const r = await api('/write', { root, path: selected, content: editContent })
          setFile((f) => f ? { ...f, text: editContent, size: r.bytes } : f)
          setEditing(false)
          setMsg(t('saved'))
          await loadDir(root, dir)
        } catch (e) { setErr(e.message) }
        finally { setBusy(false) }
      }, [selected, root, editContent, loadDir, dir])

      const startRename = useCallback((item) => {
        setRenaming(item.path)
        setRenameValue(item.name)
      }, [])
      const commitRename = useCallback(async () => {
        const path = renaming
        const name = renameValue.trim()
        if (!path || !name || !root) { setRenaming(''); return }
        setBusy(true); setErr('')
        try {
          const r = await api('/rename', { root, path, name })
          setRenaming('')
          if (selected === path) setSelected(r.path)
          await loadDir(root, dir)
        } catch (e) { setErr(e.message); setRenaming('') }
        finally { setBusy(false) }
      }, [renaming, renameValue, root, selected, loadDir, dir])

      const deleteItem = useCallback(async (item) => {
        if (!root) return
        if (!window.confirm(item.dir ? t('confirmDelFolder') : t('confirmDelFile'))) return
        setBusy(true); setErr('')
        try {
          await api('/remove', { root, path: item.path })
          if (selected === item.path || (item.dir && selected.indexOf(item.path + '/') === 0)) {
            setSelected(''); setFile(null); setEditing(false)
          }
          await loadDir(root, dir)
        } catch (e) { setErr(e.message) }
        finally { setBusy(false) }
      }, [root, selected, loadDir, dir])

      const crumbs = useMemo(() => {
        const parts = dir.split('/').filter(Boolean)
        const out = [{ label: t('root'), path: '' }]
        let acc = ''
        for (const p of parts) { acc = acc ? acc + '/' + p : p; out.push({ label: p, path: acc }) }
        return out
      }, [dir])

      const changeEncoding = useCallback((enc) => {
        setEncoding(enc)
        if (selected && file && !file.binary) openFile(selected, enc)
      }, [selected, file, openFile])

      const goBack = useCallback(() => {
        const layout = ctx && ctx.layout
        if (!layout || typeof layout.selectPanel !== 'function') return
        try { layout.selectPanel(null) } catch (_) {
          try { layout.selectPanel('conversation') } catch (_) {}
        }
      }, [ctx])

      return h('div', { className: 'dshFm-root' },
        h('div', { className: 'dshFm-head' },
          h('div', null,
            h('div', { className: 'dshFm-title' }, t('title')),
            h('div', { className: 'dshFm-sub' }, t('subtitle'))
          ),
          h('button', { type: 'button', className: 'dshFm-back', onClick: goBack }, '‹ ' + t('back'))
        ),
        err ? h('div', { className: 'dshFm-err' }, err) : null,
        h('div', { className: 'dshFm-bar' },
          h('span', null, t('workspace') + '：'),
          h('select', {
            className: 'dshFm-select', value: root,
            onChange: (e) => { setRoot(e.target.value); setSelected(''); setFile(null); loadDir(e.target.value, '') },
          }, workspaces.map((w) => h('option', { key: w.id, value: w.path }, w.title || w.path))),
          h('button', { type: 'button', className: 'dshFm-btn', disabled: busy || !root, onClick: goUp }, '↑ ' + t('up')),
          h('button', { type: 'button', className: 'dshFm-btn', disabled: busy || !root, onClick: () => loadDir(root, dir) }, t('refresh')),
          h('button', { type: 'button', className: 'dshFm-btn dshFm-btnNew' + (showNewFolder ? ' dshFm-btnActive' : ''), disabled: busy || !root, onClick: () => { setShowNewFile(false); setShowNewFolder((v) => !v) } }, '📁+ ' + t('newFolder')),
          h('button', { type: 'button', className: 'dshFm-btn dshFm-btnNewAlt' + (showNewFile ? ' dshFm-btnActive' : ''), disabled: busy || !root, onClick: () => { setShowNewFolder(false); setShowNewFile((v) => !v) } }, '📄+ ' + t('newFile'))
        ),
        showNewFolder
          ? h('div', { className: 'dshFm-newRow' },
              h('input', {
                className: 'dshFm-input', value: newFolderName, placeholder: t('folderName'),
                onChange: (e) => setNewFolderName(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') createFolder() },
              }),
              h('button', { type: 'button', className: 'dshFm-btn dshFm-btnPrimary', disabled: !newFolderName.trim(), onClick: createFolder }, t('create')),
              h('button', { type: 'button', className: 'dshFm-btn', onClick: () => setShowNewFolder(false) }, t('cancel'))
            )
          : showNewFile
            ? h('div', { className: 'dshFm-newRow' },
                h('input', {
                  className: 'dshFm-input', value: newFileName, placeholder: t('fileName'),
                  onChange: (e) => setNewFileName(e.target.value),
                  onKeyDown: (e) => { if (e.key === 'Enter') createFile() },
                }),
                h('button', { type: 'button', className: 'dshFm-btn dshFm-btnPrimary', disabled: !newFileName.trim(), onClick: createFile }, t('create')),
                h('button', { type: 'button', className: 'dshFm-btn', onClick: () => setShowNewFile(false) }, t('cancel'))
              )
            : null,
        h('div', { className: 'dshFm-crumbs' },
          crumbs.map((c, i) =>
            h('span', { key: i },
              i > 0 ? h('span', { className: 'dshFm-sep' }, ' / ') : null,
              h('button', { type: 'button', className: 'dshFm-crumb', onClick: () => { setSelected(''); setFile(null); loadDir(root, c.path) } }, c.label)
            )
          )
        ),
        h('div', { className: 'dshFm-cols' },
          h('div', { className: 'dshFm-col dshFm-list' },
            h('div', { className: 'dshFm-listHead' },
              h('span', null, t('name')), h('span', null, t('size')), h('span', null, t('modified'))
            ),
            h('div', { className: 'dshFm-scroll' },
              items.length === 0
                ? h('div', { className: 'dshFm-note' }, workspaces.length ? t('emptyDir') : t('noWorkspace'))
                : items.map((item) =>
                  h('div', {
                    key: item.path,
                    className: 'dshFm-item' + (selected === item.path ? ' dshFm-itemOn' : ''),
                    onClick: () => { if (renaming !== item.path) onItemClick(item) },
                  },
                    renaming === item.path
                      ? h('input', {
                          className: 'dshFm-input dshFm-renameInput', value: renameValue, autoFocus: true,
                          onClick: (e) => e.stopPropagation(),
                          onChange: (e) => setRenameValue(e.target.value),
                          onBlur: commitRename,
                          onKeyDown: (e) => {
                            if (e.key === 'Enter') { e.preventDefault(); commitRename() }
                            else if (e.key === 'Escape') setRenaming('')
                          },
                        })
                      : h('span', { className: 'dshFm-name' }, h('span', { className: 'dshFm-ico' }, iconFor(item)), ' ', item.name),
                    h('span', { className: 'dshFm-size' }, item.dir ? '—' : humanSize(item.size)),
                    h('span', { className: 'dshFm-time' }, timeStr(item.mtime)),
                    h('span', { className: 'dshFm-itemActions' },
                      h('button', { type: 'button', className: 'dshFm-mini', title: t('rename'), onClick: (e) => { e.stopPropagation(); startRename(item) } }, '✎'),
                      h('button', { type: 'button', className: 'dshFm-mini dshFm-miniDel', title: t('delete'), onClick: (e) => { e.stopPropagation(); deleteItem(item) } }, '×')
                    )
                  )
                )
            )
          ),
          h('div', { className: 'dshFm-col dshFm-preview' },
            h('div', { className: 'dshFm-toolbar' },
              h('span', { className: 'dshFm-cardTitle' }, selected || t('selectFile')),
              selected && file && !file.binary && !editing
                ? h('select', { className: 'dshFm-select', value: encoding, onChange: (e) => changeEncoding(e.target.value) },
                    h('option', { value: 'utf-8' }, 'UTF-8'),
                    h('option', { value: 'gbk' }, 'GBK'))
                : null,
              selected && file && !file.binary
                ? (editing
                    ? h('div', { style: { display: 'flex', gap: 6 } },
                        h('button', { type: 'button', className: 'dshFm-btn dshFm-btnPrimary', disabled: busy, onClick: saveFile }, t('save')),
                        h('button', { type: 'button', className: 'dshFm-btn', onClick: () => setEditing(false) }, t('cancel')))
                    : h('button', { type: 'button', className: 'dshFm-btn dshFm-btnEdit', onClick: startEdit }, t('edit')))
                : null,
              msg ? h('span', { className: 'dshFm-msg' }, msg) : null
            ),
            !selected
              ? h('div', { className: 'dshFm-note dshFm-center' }, t('selectFile'))
              : file && file.binary
                ? h('div', { className: 'dshFm-note dshFm-center' }, t('binary') + ' (' + humanSize(file.size) + ')')
                : file
                  ? (editing
                      ? h('textarea', {
                          className: 'dshFm-content dshFm-editor', value: editContent, spellCheck: false,
                          onChange: (e) => setEditContent(e.target.value),
                        })
                      : h('pre', { className: 'dshFm-content' }, file.text))
                  : h('div', { className: 'dshFm-note dshFm-center' }, t('readFailed'))
          )
        ),
        h('div', { className: 'dshFm-foot' },
          h('span', null, fmt(t('line'), { n: file && !file.binary ? (file.text || '').split('\n').length : 0 })),
          h('span', null, fmt(t('chars'), { n: file && !file.binary ? (file.text || '').length : 0 }))
        )
      )
    }

    function apply(ctx) {
      ctx.effect(() => installStyles(), 'dsh-file-manager: styles')
      if (ctx.locale !== undefined) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-file-manager: dictionaries')
        t = ctx.locale.bind(NS)
      }
      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 30, label: () => t('title'), locale: NS,
      }, SidebarIcon)), 'dsh-file-manager: sidebar entry')
      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: PANEL_ID, locale: NS,
      }, (props) => h(FilePanel, { ctx }))), 'dsh-file-manager: panel')
    }

    function installStyles() {
      if (typeof document === 'undefined') return () => {}
      const existing = document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]')
      if (existing) return () => {}
      const style = document.createElement('style')
      style.dataset.plugin = NS
      style.dataset.pluginCss = STYLE_ID
      style.textContent = `
.dshFm-root{display:flex;flex-direction:column;height:100%;box-sizing:border-box;padding:16px 18px 18px;gap:10px;overflow:hidden;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
.dshFm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex:0 0 auto}
.dshFm-title{font-size:20px;font-weight:700;line-height:1.3}
.dshFm-sub{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:3px}
.dshFm-back{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;padding:5px 11px;border-radius:8px;cursor:pointer;font-family:inherit;white-space:nowrap}
.dshFm-err{font-size:11px;color:var(--dsw-alias-state-error-primary);flex:0 0 auto}
.dshFm-bar{display:flex;align-items:center;gap:8px;font-size:12px;flex:0 0 auto;flex-wrap:wrap}
.dshFm-btn{padding:6px 11px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap}
.dshFm-btn:hover{border-color:var(--dsw-alias-brand-primary)}
.dshFm-btn:disabled{opacity:.45;cursor:not-allowed}
.dshFm-btnSm{padding:4px 8px;font-size:11px}
.dshFm-btnNew{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);border-color:transparent;font-weight:600}
.dshFm-btnNewAlt{background:transparent;color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);font-weight:600}
.dshFm-btnNewAlt:hover{background:var(--dsw-alias-bg-layer-2)}
.dshFm-btnActive{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary);filter:brightness(1.1)}
.dshFm-btnEdit{color:var(--dsw-alias-brand-primary)}
.dshFm-btnPrimary{background:#2e7d32;color:#fff;border-color:transparent}
.dshFm-msg{font-size:11px;color:var(--dsw-alias-state-success-primary)}
.dshFm-newRow{display:flex;gap:6px;align-items:center;flex:0 0 auto;padding:6px 0}
.dshFm-newRow .dshFm-input{flex:1 1 auto}
.dshFm-input{padding:6px 9px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;outline:none;font-family:inherit;min-width:0}
.dshFm-input:focus{border-color:var(--dsw-alias-brand-primary)}
.dshFm-editor{resize:none;outline:none;white-space:pre;overflow:auto}
.dshFm-editor:focus{border-color:var(--dsw-alias-brand-primary)}
.dshFm-select{padding:6px 9px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;outline:none;font-family:inherit;max-width:220px}
.dshFm-crumbs{display:flex;align-items:center;flex-wrap:wrap;font-size:11px;flex:0 0 auto}
.dshFm-crumb{border:0;background:transparent;color:var(--dsw-alias-brand-primary);cursor:pointer;font-size:11px;padding:2px 3px;font-family:inherit}
.dshFm-sep{color:var(--dsw-alias-label-secondary)}
.dshFm-cols{display:grid;grid-template-columns:minmax(260px,1fr) minmax(0,1.1fr);gap:12px;flex:1 1 auto;min-height:0}
.dshFm-col{display:flex;flex-direction:column;gap:8px;min-height:0;overflow:hidden}
.dshFm-list{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:8px;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.dshFm-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
.dshFm-listHead{display:grid;grid-template-columns:1fr 66px 96px 44px;gap:6px;padding:4px 8px;font-size:10.5px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.dshFm-item{display:grid;grid-template-columns:1fr 66px 96px 44px;gap:6px;align-items:center;padding:7px 8px;border-radius:7px;font-size:12px;cursor:pointer;overflow:hidden;flex:0 0 auto;min-height:28px}
.dshFm-item:hover{background:var(--dsw-alias-bg-layer-2)}
.dshFm-itemOn{background:var(--dsw-alias-bg-layer-2);outline:1px solid var(--dsw-alias-brand-primary)}
.dshFm-itemActions{display:flex;gap:2px;align-items:center;justify-content:flex-end}
.dshFm-mini{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;padding:2px 4px;border-radius:5px;font-family:inherit}
.dshFm-mini:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dshFm-miniDel:hover{color:var(--dsw-alias-state-error-primary)}
.dshFm-renameInput{width:100%;padding:3px 5px;font-size:12px}
.dshFm-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshFm-ico{flex:0 0 auto}
.dshFm-size,.dshFm-time{font-size:10.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshFm-note{font-size:12px;color:var(--dsw-alias-label-secondary);padding:8px;line-height:1.6;overflow:auto;flex:0 0 auto}
.dshFm-center{flex:1 1 auto;display:flex;align-items:center;justify-content:center;text-align:center}
.dshFm-preview{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:10px}
.dshFm-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px}
.dshFm-cardTitle{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.dshFm-content{flex:1 1 auto;min-height:0;overflow:auto;margin:0;padding:12px;border-radius:8px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-all}
.dshFm-foot{display:flex;gap:16px;flex:0 0 auto;font-size:11px;color:var(--dsw-alias-label-secondary)}
@media(max-width:900px){.dshFm-cols{grid-template-columns:1fr;overflow-y:auto}.dshFm-col{overflow:visible}}
`
      document.head.appendChild(style)
      return () => { style.remove() }
    }

    return { inject: ['slots', 'locale', 'layout'], apply }
  },
})
