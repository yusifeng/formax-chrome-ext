# Formax 安装引导

Formax 由本地运行时、Chrome 扩展、MCP Server 和 Skill 组成。按下面步骤安装后，本地 agent 就可以通过 Formax 控制 Chrome。

## 1. 安装 Formax 本地运行时

在终端运行 Formax 官方安装命令。安装命令会在正式发布前补充。

安装脚本会自动完成：

- 下载最新的 Formax runtime。
- 安装到 `~/.formax`。
- 配置 Chrome Native Messaging Host。
- 创建 MCP Server 启动入口。
- 安装 Formax Skill。

安装完成后，本地会生成这些稳定路径：

```text
~/.formax/bin/formax-browser-mcp
~/.formax/bin/formax-doctor
~/.formax/bin/formax-uninstall
~/.formax/skills/formax-browser/SKILL.md
```

## 2. 安装 Chrome 扩展

打开 Chrome Web Store 安装 Formax：

[Formax Chrome Extension](https://chromewebstore.google.com/detail/dchkbbjmkheilkmencpckilhmmcppdne)

安装后：

1. 打开 `chrome://extensions`。
2. 确认 Formax 已启用。
3. 如果 Formax 已经打开，点击 reload。
4. 点击浏览器工具栏里的 Formax 图标。
5. 状态应显示 `Connected`。

如果没有显示 `Connected`，先运行：

```bash
~/.formax/bin/formax-doctor
```

然后根据输出提示处理，必要时重启 Chrome。

## 3. 配置 MCP Server

在支持 MCP 的客户端里添加 Formax MCP Server。

示例配置：

```json
{
  "mcpServers": {
    "formax-browser": {
      "command": "/Users/<你的用户名>/.formax/bin/formax-browser-mcp"
    }
  }
}
```

Linux 用户通常使用：

```json
{
  "mcpServers": {
    "formax-browser": {
      "command": "/home/<你的用户名>/.formax/bin/formax-browser-mcp"
    }
  }
}
```

配置后重启你的 MCP 客户端。

Formax MCP Server 会提供这些工具：

```text
js
js_add_node_module_dir
js_reset
```

浏览器能力会通过 Formax browser runtime 在 `js` 环境中使用。

## 4. 安装 Skill

Formax 安装脚本会把 Skill 安装到：

```text
~/.formax/skills/formax-browser/SKILL.md
```

如果你的 agent 支持配置 Skill，请添加这个文件。

如果你的 agent 不支持独立 Skill，可以把该文件内容作为浏览器控制相关的项目说明或系统提示使用。

## 更新

重新运行 Formax 官方安装命令即可更新。

更新后 reload Chrome 里的 Formax 扩展。

## 卸载

运行：

```bash
~/.formax/bin/formax-uninstall
```

然后从 Chrome 中移除 Formax 扩展。
