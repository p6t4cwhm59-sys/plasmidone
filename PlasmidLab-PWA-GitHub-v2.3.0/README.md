# PlasmidLab PWA

这是用于 iPhone/iPad 主屏幕的质粒工具，支持 SnapGene `.dna`、GenBank、FASTA 和项目 JSON。

## 上传到 GitHub Pages

1. 登录 GitHub，点击右上角 `+`，选择 `New repository`。
2. 仓库名称可填 `plasmidlab`，选择 `Public`，创建仓库。
3. 在仓库首页点击 `Add file` -> `Upload files`。
4. 上传本文件夹中的全部文件，点击 `Commit changes`。
5. 打开仓库 `Settings` -> `Pages`。
6. 在 `Build and deployment` 中，将 `Source` 选为 `Deploy from a branch`。
7. `Branch` 选择 `main`，目录选择 `/(root)`，点击 `Save`。
8. 等待约 1-3 分钟，GitHub 会显示访问链接，通常为：
   `https://你的用户名.github.io/plasmidlab/`

## 安装到 iPhone/iPad

1. 必须使用 Safari 打开 GitHub Pages 链接。
2. 点击 Safari 的分享按钮。
3. 选择“添加到主屏幕”。
4. 以后始终点击主屏幕上的 `PlasmidLab` 图标运行。

## 导入和保存 `.dna`

1. 从主屏幕图标打开 PlasmidLab。
2. 点击“iPhone / iPad：选择 .dna / 质粒文件”。
3. 从“文件”App 选择 SnapGene `.dna` 文件。
4. 导入成功后，文件内容会自动保存到此 PWA 的 IndexedDB 质粒库。
5. 关闭并再次点击主屏幕图标，质粒仍会出现在质粒库中。

## 重要说明

- iOS 网页不能长期记住“文件”App 中的文件路径，也不能在后台反复读取该路径。
- 本程序采用正确的替代方式：第一次选择文件后，将质粒内容复制到 PWA 自己的设备数据库。
- 不要删除主屏幕图标、清除 Safari 网站数据，或更换 GitHub Pages 地址，否则 iOS 可能删除或隔离原质粒库。
- 建议定期使用“导出整个质粒库”制作备份。
