# strftime.

一个极简的 C `strftime` 格式化交互页面。

- 分解 `%[E|O]S`，按年份、月份、日期、星期、时刻、时区、组合和字符分类，悬停查看说明、当前结果和读取的 `struct tm` 成员。
- 格式化串、`struct tm` 成员和输出按同一套类别着色，组合说明符展开后逐段着色。
- 编辑格式化串与 `struct tm` 的各个成员，实时显示结果。成员用 C 常量填写，留空即为 0，`tm_zone` 填字符串字面量或 `NULL`。`0b` 前缀和数字分隔符 `'` 是 C23 新增的常量写法，`%Ob`、`%OB` 是 C23 新增的转换说明。

## 本地运行

页面源码位于 `dist/`，使用原生 HTML、CSS 和 JavaScript，无需安装依赖或构建。

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory dist
```

打开 <http://127.0.0.1:4173/>。

## 检查

使用 Node.js 运行格式化、日历周数、错误路径和静态资源检查：

```sh
node check.mjs
```

格式化逻辑在浏览器内运行，遵循 C23 的 `"C"` 区域设置；实现定义的部分按 x86-64 Linux（glibc，`TZ=UTC`）处理，`%z` 和 `%Z` 读取 glibc 与 POSIX.1-2024 的扩展成员 `tm_gmtoff`、`tm_zone`，它们不属于 ISO C。转换说明不合标准、所读成员超出正常范围时会显示错误提示。它用于交互学习，具体 C 环境的行为请以该环境为准。

## 部署

推送到 `main` 后，GitHub Actions 检查代码并将 `dist/` 部署到 GitHub Pages；也可手动触发工作流。

## 许可证

[MIT](LICENSE) © 2026 Minsecrus
