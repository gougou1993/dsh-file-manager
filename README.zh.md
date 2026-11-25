# 文件管理（dsh-file-manager）

一款运行在 DSH（DeepSeek Harness）中的工作区文件管理插件。左侧栏提供入口，可在中央面板浏览当前工作区的文件、预览与编辑文本，并进行基础的文件/文件夹增删改操作。

## 插件信息

- **包名**：`@oakzhong/dsh-file-manager`
- **版本**：1.0.5
- **入口**：左侧栏「文件管理」
- **类型**：Host + Client 双半部插件（bundle）

## 使用技术

| 层面 | 技术 |
|---|---|
| 插件框架 | DSH Cordis 作用域 bundle（`cordis.patch.yml`） |
| Host 半部 | ESM `apply(ctx)`，通过 `ctx.connection.fetch.register` 注册 7 条 API 路由 |
| 文件系统 | Node.js `fs/promises`（readdir/stat/readFile/writeFile/mkdir/rename/rm），零第三方依赖 |
| 路径安全 | `resolveRoot` + `inside()` 校验，所有操作限制在已注册工作区内 |
| HTTP 请求 | Client 用 `fetch` + `credentials: same-origin`，响应显式 UTF-8 解码避免中文乱码 |
| Client 半部 | `window.__ModuleLoader__.load` 注册，React 无 JSX（`React.createElement`） |
| UI 样式 | 组件内注入 `<style>`，使用 DSH 主题 token，独立滚动容器 |
| 国际化 | `ctx.locale.register / bind`，中英双语（zh / en） |

## 功能

### 1. 工作区浏览
- 顶部下拉切换已注册工作区
- 面包屑路径导航（根目录 / 各级目录），可点击跳转、上一级
- **搜索**：按名称模糊过滤当前目录下的文件/文件夹，方便快速定位
- **显示隐藏文件**：复选框控制是否显示 `.` 开头的文件/文件夹（默认隐藏）
- 文件列表显示名称、大小、修改时间；文件类型用图标区分
- 列表项过多时**左侧可独立滚动**，表头固定
- 自动跳过 `node_modules`、`.git` 等无关目录

### 2. 文件预览
- 点击文本文件显示内容，支持 UTF-8 / GBK 编码切换
- 二进制文件（图片/PDF/压缩包等）显示大小提示
- 底部统计行数、字符数

### 3. 文件编辑
- 文本文件可切换「编辑」模式，用 textarea 修改内容后保存
- 保存写回磁盘并刷新列表与预览

### 4. 文件与文件夹操作
- **新建文件夹**：在当前目录创建，带输入框
- **新建文件**：创建空文件并自动进入编辑模式（无扩展名自动补 `.txt`）
- **重命名**：文件名/文件夹名行内编辑，Enter 保存 / Esc 取消
- **删除**：文件与文件夹均可删除，需二次确认（文件夹递归删除，禁止删根目录）

## Host API 路由

所有路由前缀 `/api/dsh-file-manager/`：

| 路由 | 方法 | 说明 |
|---|---|---|
| `meta` | GET | 获取已注册工作区列表 |
| `list` | GET | 列出目录内容（root + path） |
| `read` | GET | 读取文本文件（支持 encoding 参数） |
| `mkdir` | POST | 新建文件夹（root + parent + name） |
| `write` | POST | 写入/创建文件（root + path + content） |
| `rename` | POST | 重命名（root + path + name） |
| `remove` | POST | 删除（root + path，目录递归） |

## 安全与限制

- 所有路径操作限制在已注册工作区根目录内，越界会被拒绝
- 单文件读取/写入上限 4MB
- macOS 上若工作区位于 `~/Documents` 等受保护目录，可能因系统 TCC 权限返回 EPERM；此时插件会提示到「系统设置 → 隐私与安全性 → 文件与文件夹」为 DSH 授权
- 响应统一带 `content-type: application/json; charset=utf-8`，Client 显式 UTF-8 解码，避免中文名称乱码

## 目录结构

```
dsh-file-manager/
├── package.json          # 清单（作用域包名）、bundle 配置、client 注入声明
├── cordis.patch.yml      # Loader 插入行
├── index.js              # Host 半部：7 条文件操作路由
├── client.js             # Client 半部：UI、文件列表、编辑、滚动、样式
├── locale/
│   ├── zh.json           # 中文显示元信息
│   └── en.json           # 英文显示元信息
├── icon.svg              # 插件图标
├── README.md             # 英文说明
└── README.zh.md          # 本文档（中文）
```

## 安装与使用

1. 通过插件管理器安装该 bundle（`install_bundle` 指向本目录）
2. 左侧栏点击「文件管理」
3. 选择工作区，浏览目录、点击文件预览
4. 用工具栏按钮新建文件/文件夹，用列表项右侧图标重命名或删除
