# 手动上传到 GitHub 并发布网站

项目已准备好 `.gitignore`、`.gitattributes`、MIT 许可、使用说明、问题反馈模板和 GitHub Pages 自动发布流程，使用 `main` 分支。此文档介绍首次上传与后续更新；实际发布状态请查看仓库的 Actions 和 Pages 页面。

下面按账号 `HelloLiHua`、仓库名 `House_Manage` 举例。使用其他账号或仓库名时，请替换上传命令中的地址，并修改 README 与 package.json 中的网站、仓库和问题反馈链接。

## 1. 创建空仓库

在 GitHub 登录后创建仓库：

- Repository name：`House_Manage`
- Description：`Roomly 空间预想：二维户型设计、家具布置与搬运路线碰撞检测`
- Visibility：`Public`
- 不勾选自动添加 README、.gitignore 或 License，项目已经包含这些文件。

如果同名仓库已经有内容，请先确认它就是本项目；不要强制覆盖已有提交。

## 2. 上传代码（以下两种方式任选一种）

### 方式 A：通过 Git 上传，适合后续持续更新

在项目文件夹打开 PowerShell，执行：

```powershell
git remote add origin https://github.com/HelloLiHua/House_Manage.git
git push -u origin main
```

按 Git 弹出的提示完成 GitHub 登录。上述命令使用已经准备好的本地提交，不需要再次执行 `git init`。

如果提示 `remote origin already exists`，先运行 `git remote -v` 核对地址；仅在地址确实填错时执行：

```powershell
git remote set-url origin https://github.com/HelloLiHua/House_Manage.git
git push -u origin main
```

### 方式 B：通过 GitHub 网页上传

本地 `outputs/Roomly-GitHub-upload.zip` 是整理后的源码包。先解压，再在仓库页面选择上传现有文件，将解压目录**内部的全部文件和文件夹**上传到仓库根目录。

- 必须包含 `.github` 文件夹，以及 `.gitignore`、`.gitattributes`、`.oxlintrc.json` 等以点开头的文件。
- `package.json` 和 `index.html` 应直接位于仓库根目录，不能额外套一层文件夹。
- 不要直接上传 ZIP 文件；上传的是解压后的内容。
- 使用 `main` 作为默认分支，与自动发布配置保持一致。
- 源码包已排除依赖目录、构建产物、本地工作文件和 `.git` 历史。

源码包对应这次准备好的版本。以后改动代码时，需要使用更新后的源码，或改用方式 A 上传。

## 3. 开启可直接访问的网站

1. 上传完成后，进入仓库 **Settings → Pages**。
2. 在 **Build and deployment → Source** 中选择 **GitHub Actions**。
3. 打开 **Actions**，选择 **Check and deploy Roomly**。如果首次运行因为尚未启用 Pages 而失败，启用后点击 **Re-run all jobs**；也可以通过 **Run workflow** 选择 `main` 手动运行。
4. 等待检查、构建和部署完成，全部显示成功后再打开网站。

按上述账号和仓库名部署成功后：

- 代码仓库：`https://github.com/HelloLiHua/House_Manage`
- 网站地址：`https://hellolihua.github.io/House_Manage/`

网站发布流程会自动检查代码、运行 18 项几何测试和 8 项浏览器测试，再生成并发布静态页面。上传源码后无需自行上传 `dist` 或 `node_modules`。项目网站的资源路径会根据仓库名自动设置。

## 4. 后续更新

采用方式 A 且首次上传成功后，在本地修改完成并检查通过，再执行：

```powershell
git add .
git commit -m "Describe this update"
git push
```

每次向 `main` 上传后，自动发布流程会重新运行，成功后网站更新。

## 已准备的文件

| 文件 | 用途 |
| --- | --- |
| `.gitignore` | 排除依赖、构建产物、工作文件和常见本地密钥文件 |
| `.gitattributes` | 统一文本换行，标识图片文件 |
| `LICENSE` | MIT 许可，允许使用、修改和再发布 |
| `README.md` | 功能、操作、限制和部署说明 |
| `CONTRIBUTING.md` | 参与开发与验证说明 |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | 问题反馈表单 |
| `.github/workflows/pages.yml` | 自动检查、构建和发布网站 |

网站方案保存在访问者自己的浏览器中。原本在本地预览地址保存的方案不会自动出现在公开网站上；需要先导出 JSON，再到新网站导入。

参考：[GitHub Pages 发布来源设置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。
